import uuid
from arq import create_pool
from arq.connections import RedisSettings
from app.core.config import get_settings
from app.core.database import async_session
from app.services.scaffold import run_scaffold_job
from app.services.feasibility import score_idea_feasibility
import structlog

logger = structlog.get_logger()
settings = get_settings()


async def scaffold_worker(ctx, job_id: str):
    logger.info("scaffold_worker.start", job_id=job_id)
    async with async_session() as db:
        await run_scaffold_job(uuid.UUID(job_id), db)
    logger.info("scaffold_worker.done", job_id=job_id)


async def feasibility_worker(ctx, idea_id: str):
    logger.info("feasibility_worker.start", idea_id=idea_id)
    async with async_session() as db:
        await score_idea_feasibility(uuid.UUID(idea_id), db)
    logger.info("feasibility_worker.done", idea_id=idea_id)


async def deploy_worker(ctx, job_id: str):
    logger.info("deploy_worker.start", job_id=job_id)
    # Placeholder - will be implemented in Phase 7
    logger.info("deploy_worker.done", job_id=job_id)


class WorkerSettings:
    functions = [scaffold_worker, feasibility_worker, deploy_worker]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
