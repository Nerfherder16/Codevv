import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.terminal_session import TerminalSession
from app.models.workspace import Workspace
from app.services.workspace import get_docker

logger = structlog.get_logger()


async def _exec_in_container(container_name: str, cmd: list[str]) -> str:
    """Run a command inside a container, return stdout."""
    docker = await get_docker()
    container = await docker.containers.get(container_name)
    exec_obj = await container.exec(cmd=cmd)
    async with exec_obj.start() as stream:
        output = await stream.read_out()
        return output.data.decode() if output else ""


async def create_session(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    mode: str,
    db: AsyncSession,
) -> TerminalSession:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace or workspace.status != "running":
        raise ValueError("Workspace not running")

    session_id = uuid.uuid4()
    tmux_name = f"term-{session_id.hex[:8]}"
    container_name = f"codevv-ws-{workspace_id}"

    await _exec_in_container(
        container_name,
        ["tmux", "new-session", "-d", "-s", tmux_name, "-x", "200", "-y", "50"],
    )

    session = TerminalSession(
        id=session_id,
        workspace_id=workspace_id,
        tmux_session=tmux_name,
        owner_id=user_id,
        mode=mode,
    )
    db.add(session)
    await db.flush()

    logger.info(
        "terminal.created",
        session_id=str(session_id),
        workspace_id=str(workspace_id),
        tmux=tmux_name,
    )
    return session


async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession,
) -> TerminalSession | None:
    result = await db.execute(
        select(TerminalSession).where(TerminalSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> list[TerminalSession]:
    result = await db.execute(
        select(TerminalSession)
        .where(TerminalSession.workspace_id == workspace_id)
        .order_by(TerminalSession.created_at.desc())
    )
    return list(result.scalars().all())


async def set_mode(
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    mode: str,
    db: AsyncSession,
) -> TerminalSession:
    session = await get_session(session_id, db)
    if not session:
        raise ValueError("Terminal session not found")
    if session.owner_id != user_id:
        raise PermissionError("Only the session owner can change mode")
    session.mode = mode
    await db.flush()
    return session


async def send_input(
    session: TerminalSession,
    workspace: Workspace,
    data: str,
    user_id: uuid.UUID,
) -> None:
    if session.mode == "readonly" and session.owner_id != user_id:
        return
    container_name = f"codevv-ws-{workspace.id}"
    await _exec_in_container(
        container_name,
        ["tmux", "send-keys", "-t", session.tmux_session, data],
    )


async def read_output(
    session: TerminalSession,
    workspace: Workspace,
) -> str:
    container_name = f"codevv-ws-{workspace.id}"
    return await _exec_in_container(
        container_name,
        ["tmux", "capture-pane", "-t", session.tmux_session, "-p", "-S", "-100"],
    )
