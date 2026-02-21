import uuid
from datetime import datetime, timezone

import aiodocker
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.workspace import Workspace

logger = structlog.get_logger()
settings = get_settings()

_docker: aiodocker.Docker | None = None


async def get_docker() -> aiodocker.Docker:
    global _docker
    if _docker is None:
        _docker = aiodocker.Docker()
    return _docker


async def _allocate_port(db: AsyncSession) -> int:
    """Find the lowest unused port in the configured range.
    Checks both DB records and actual Docker containers.
    """
    result = await db.execute(
        select(Workspace.port).where(Workspace.status.in_(["starting", "running"]))
    )
    used = {row[0] for row in result.all()}

    # Also check Docker for containers actually binding ports
    try:
        docker = await get_docker()
        containers = await docker.containers.list(all=True)
        for c in containers:
            info = c._container  # noqa: SLF001
            ports = info.get("Ports", [])
            for p in ports:
                if isinstance(p, dict) and p.get("PublicPort"):
                    used.add(p["PublicPort"])
    except Exception:
        pass  # fall back to DB-only check

    for port in range(settings.workspace_port_start, settings.workspace_port_end + 1):
        if port not in used:
            return port
    raise RuntimeError("No available workspace ports")


async def create_workspace(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    scope: str,
    db: AsyncSession,
) -> Workspace:
    port = await _allocate_port(db)
    ws_id = uuid.uuid4()

    workspace = Workspace(
        id=ws_id,
        project_id=project_id,
        user_id=user_id,
        port=port,
        status="starting",
        scope=scope,
    )
    db.add(workspace)
    await db.flush()

    docker = await get_docker()
    config = {
        "Image": settings.workspace_image,
        "ExposedPorts": {"8443/tcp": {}},
        "HostConfig": {
            "PortBindings": {"8443/tcp": [{"HostPort": str(port)}]},
            "Binds": [f"codevv-ws-{ws_id}:/config/workspace"],
        },
        "Env": [
            "PUID=1000",
            "PGID=1000",
            "TZ=America/New_York",
            "PASSWORD=",
            "CS_DISABLE_PROXY=1",
            "DEFAULT_WORKSPACE=/config/workspace",
        ],
    }

    container_name = f"codevv-ws-{ws_id}"
    try:
        container = await docker.containers.create_or_replace(
            name=container_name, config=config
        )
        await container.start()

        # Connect to compose network so backend can proxy by container name
        try:
            network = await docker.networks.get("codevv_default")
            await network.connect({"Container": container_name})
        except Exception as e:
            logger.warning("workspace.network_connect_failed", error=str(e))

        info = await container.show()
        workspace.container_id = info["Id"][:12]
        workspace.status = "running"
        logger.info(
            "workspace.started",
            workspace_id=str(ws_id),
            port=port,
            container=workspace.container_id,
        )
    except Exception as e:
        workspace.status = "stopped"
        logger.error("workspace.start_failed", error=str(e))
        # Clean up the created container so it doesn't hold the port
        try:
            stale = await docker.containers.get(container_name)
            await stale.delete(force=True)
        except Exception:
            pass
        raise

    await db.flush()
    return workspace


async def stop_workspace(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise ValueError("Workspace not found")

    workspace.status = "stopping"
    await db.flush()

    if workspace.container_id:
        docker = await get_docker()
        try:
            container = await docker.containers.get(f"codevv-ws-{workspace_id}")
            await container.stop()
            await container.delete(force=True)
            logger.info("workspace.stopped", workspace_id=str(workspace_id))
        except aiodocker.exceptions.DockerError as e:
            logger.warning("workspace.stop_error", error=str(e))

    workspace.status = "stopped"
    workspace.container_id = None
    await db.flush()
    return workspace


async def get_workspace(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> Workspace | None:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    return result.scalar_one_or_none()


async def list_workspaces(
    project_id: uuid.UUID,
    db: AsyncSession,
) -> list[Workspace]:
    result = await db.execute(
        select(Workspace)
        .where(Workspace.project_id == project_id)
        .order_by(Workspace.created_at.desc())
    )
    return list(result.scalars().all())


async def heartbeat(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if workspace:
        workspace.last_activity = datetime.now(timezone.utc)
        await db.flush()


async def cleanup_idle(db: AsyncSession) -> int:
    """Stop workspaces that have been idle beyond the timeout. Returns count stopped."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=settings.workspace_idle_timeout_min
    )
    result = await db.execute(
        select(Workspace).where(
            Workspace.status == "running",
            Workspace.last_activity < cutoff,
        )
    )
    idle = list(result.scalars().all())
    for ws in idle:
        try:
            await stop_workspace(ws.id, db)
        except Exception as e:
            logger.error("cleanup.stop_failed", workspace_id=str(ws.id), error=str(e))
    return len(idle)
