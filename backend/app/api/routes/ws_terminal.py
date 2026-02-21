import asyncio
import uuid

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session
from app.core.security import decode_token
from app.models.terminal_session import TerminalSession
from app.models.workspace import Workspace
from app.services import terminal as term_service

logger = structlog.get_logger()
settings = get_settings()

router = APIRouter()


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _verify_ws_token(token: str) -> uuid.UUID:
    """Decode JWT and return user_id. Raises on invalid token."""
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Invalid token")
    return uuid.UUID(user_id)


@router.websocket("/ws/terminal/{session_id}")
async def terminal_ws(
    ws: WebSocket,
    session_id: str,
    token: str = Query(...),
):
    try:
        user_id = await _verify_ws_token(token)
    except Exception:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()

    sid = uuid.UUID(session_id)
    redis = await _get_redis()
    channel = f"terminal:{session_id}"

    async with async_session() as db:
        result = await db.execute(
            select(TerminalSession).where(TerminalSession.id == sid)
        )
        session = result.scalar_one_or_none()
        if not session:
            await ws.close(code=4004, reason="Session not found")
            return

        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == session.workspace_id)
        )
        workspace = ws_result.scalar_one_or_none()
        if not workspace or workspace.status != "running":
            await ws.close(code=4004, reason="Workspace not running")
            return

        # Send initial terminal state
        try:
            initial = await term_service.read_output(session, workspace)
            await ws.send_text(initial)
        except Exception as e:
            logger.warning("terminal.initial_read_failed", error=str(e))

    # Background: poll tmux output and publish to Redis
    async def output_poller():
        last_output = ""
        try:
            while True:
                async with async_session() as poll_db:
                    s_result = await poll_db.execute(
                        select(TerminalSession).where(TerminalSession.id == sid)
                    )
                    sess = s_result.scalar_one_or_none()
                    w_result = await poll_db.execute(
                        select(Workspace).where(Workspace.id == session.workspace_id)
                    )
                    ws_obj = w_result.scalar_one_or_none()
                    if not sess or not ws_obj:
                        break
                    try:
                        output = await term_service.read_output(sess, ws_obj)
                        if output != last_output:
                            last_output = output
                            await redis.publish(channel, output)
                    except Exception:
                        break
                await asyncio.sleep(0.2)
        except asyncio.CancelledError:
            pass

    poller_task = asyncio.create_task(output_poller())

    # Subscribe to Redis for output broadcasts
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    async def redis_listener():
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await ws.send_text(message["data"])
        except (asyncio.CancelledError, WebSocketDisconnect):
            pass
        finally:
            await pubsub.unsubscribe(channel)

    listener_task = asyncio.create_task(redis_listener())

    try:
        while True:
            data = await ws.receive_text()
            # Reload session mode from DB for each input
            async with async_session() as input_db:
                s_result = await input_db.execute(
                    select(TerminalSession).where(TerminalSession.id == sid)
                )
                sess = s_result.scalar_one_or_none()
                w_result = await input_db.execute(
                    select(Workspace).where(Workspace.id == session.workspace_id)
                )
                ws_obj = w_result.scalar_one_or_none()
                if sess and ws_obj:
                    await term_service.send_input(sess, ws_obj, data, user_id)
    except WebSocketDisconnect:
        pass
    finally:
        poller_task.cancel()
        listener_task.cancel()
        await redis.aclose()
