"""WebSocket event stream — authenticated per-user pub/sub."""

import uuid
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.security import decode_token
from app.models.project import ProjectMember
from app.models.organization import OrgMembership, OrgMemberStatus
from app.services.events import get_redis

router = APIRouter(tags=["events"])


async def _get_user_channels(user_id: uuid.UUID, db: AsyncSession) -> list[str]:
    channels = [f"user:{user_id}"]

    # Project channels
    proj_rows = await db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    )
    for (project_id,) in proj_rows.all():
        channels.append(f"project:{project_id}")

    # Org channels
    org_rows = await db.execute(
        select(OrgMembership.org_id).where(
            OrgMembership.user_id == user_id,
            OrgMembership.status == OrgMemberStatus.active,
        )
    )
    for (org_id,) in org_rows.all():
        channels.append(f"org:{org_id}")

    return channels


@router.websocket("/ws/events")
async def event_stream(
    websocket: WebSocket,
    token: str = Query(...),
):
    # Auth
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload.get("sub", ""))
    except Exception:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    async with async_session() as db:
        channels = await _get_user_channels(user_id, db)

    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(*channels)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        await pubsub.unsubscribe(*channels)
        await pubsub.aclose()
