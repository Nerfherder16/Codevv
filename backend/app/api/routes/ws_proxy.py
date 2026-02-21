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
    logger.info("ws_proxy.connect", workspace_id=str(workspace_id), path=path)

    # Read requested subprotocol from client (if any)
    proto_header = ws.headers.get("sec-websocket-protocol", "")
    subprotocols = [p.strip() for p in proto_header.split(",") if p.strip()]
    chosen = subprotocols[0] if subprotocols else None

    logger.info("ws_proxy.handshake", subprotocols=subprotocols)
    await ws.accept(subprotocol=chosen)

    target = f"ws://codevv-ws-{workspace_id}:8443/{path}"
    qs = str(ws.query_params)
    if qs:
        target += f"?{qs}"

    # Set Origin to match the target Host so code-server's ensureOrigin()
    # CSRF check passes. Without this, Origin mismatch → 403 → WS 1006.
    upstream_host = f"codevv-ws-{workspace_id}:8443"

    logger.info("ws_proxy.upstream", target=target)

    try:
        async with websockets.connect(
            target,
            max_size=2**24,  # 16MB — VS Code can send large messages
            ping_interval=30,
            ping_timeout=20,
            origin=f"http://{upstream_host}",
            additional_headers={"Host": upstream_host},
            subprotocols=subprotocols if subprotocols else None,
        ) as upstream:
            logger.info("ws_proxy.upstream_connected")

            async def client_to_upstream():
                try:
                    while True:
                        msg = await ws.receive()
                        if msg.get("text") is not None:
                            await upstream.send(msg["text"])
                        elif msg.get("bytes") is not None:
                            await upstream.send(msg["bytes"])
                except (WebSocketDisconnect, RuntimeError) as e:
                    logger.info("ws_proxy.client_disconnected", reason=str(e))

            async def upstream_to_client():
                try:
                    async for msg in upstream:
                        if isinstance(msg, str):
                            await ws.send_text(msg)
                        else:
                            await ws.send_bytes(msg)
                except websockets.exceptions.ConnectionClosed as e:
                    logger.info("ws_proxy.upstream_closed", reason=str(e))

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(client_to_upstream()),
                    asyncio.create_task(upstream_to_client()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
    except websockets.exceptions.InvalidStatusCode as e:
        logger.warning(
            "ws_proxy.upstream_rejected",
            status=e.status_code,
            workspace_id=str(workspace_id),
        )
    except Exception as e:
        logger.warning("ws_proxy.error", error=str(e), type=type(e).__name__)
    finally:
        logger.info("ws_proxy.done", workspace_id=str(workspace_id))
        try:
            await ws.close()
        except Exception:
            pass
