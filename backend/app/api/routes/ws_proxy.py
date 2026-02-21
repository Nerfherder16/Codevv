"""Reverse proxy for code-server workspace containers.

Routes code-server HTTP/WS traffic through the backend so the
iframe works behind HTTPS reverse proxies without mixed-content issues.

Auth is not enforced per-request — workspace UUIDs are unguessable
and code-server auth is disabled (PASSWORD=""). The Codevv UI
only reveals workspace URLs to authenticated users.
"""

import asyncio
import uuid

import httpx
import structlog
import websockets
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

logger = structlog.get_logger()
router = APIRouter()


def _target_base(workspace_id: uuid.UUID) -> str:
    return f"http://codevv-ws-{workspace_id}:8443"


_HOP_BY_HOP = frozenset(
    {"host", "connection", "transfer-encoding", "keep-alive", "upgrade"}
)


@router.api_route(
    "/workspace-proxy/{workspace_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy_http(request: Request, workspace_id: uuid.UUID, path: str):
    target = f"{_target_base(workspace_id)}/{path}"
    if request.query_params:
        target += f"?{request.query_params}"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as client:
        upstream = await client.request(
            method=request.method,
            url=target,
            headers=headers,
            content=body,
            follow_redirects=False,
        )

    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
    )


@router.websocket("/workspace-proxy/{workspace_id}/{path:path}")
async def proxy_ws(ws: WebSocket, workspace_id: uuid.UUID, path: str):
    await ws.accept()

    target = f"ws://codevv-ws-{workspace_id}:8443/{path}"
    qs = str(ws.query_params)
    if qs:
        target += f"?{qs}"

    try:
        async with websockets.connect(target, max_size=2**22) as upstream:

            async def client_to_upstream():
                try:
                    while True:
                        msg = await ws.receive()
                        if msg.get("text") is not None:
                            await upstream.send(msg["text"])
                        elif msg.get("bytes") is not None:
                            await upstream.send(msg["bytes"])
                except (WebSocketDisconnect, RuntimeError):
                    pass

            async def upstream_to_client():
                try:
                    async for msg in upstream:
                        if isinstance(msg, str):
                            await ws.send_text(msg)
                        else:
                            await ws.send_bytes(msg)
                except websockets.exceptions.ConnectionClosed:
                    pass

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(client_to_upstream()),
                    asyncio.create_task(upstream_to_client()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
    except Exception as e:
        logger.warning("ws_proxy.error", error=str(e))
    finally:
        try:
            await ws.close()
        except Exception:
            pass
