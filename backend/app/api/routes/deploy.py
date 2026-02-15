from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.redis import get_redis
from app.models.user import User
from app.models.project import ProjectRole
from app.models.deploy import Environment, DeployJob, DeployStatus
from app.schemas.deploy import (
    EnvironmentCreate, EnvironmentUpdate, EnvironmentResponse,
    DeployRequest, DeployJobResponse, GenerateComposeRequest,
)
from app.api.routes.projects import get_project_with_access
from app.services.compose_gen import generate_compose_from_canvas
import uuid
import asyncio
import json

router = APIRouter(prefix="/projects/{project_id}/deploy", tags=["deploy"])


# --- Environments ---

@router.post("/environments", response_model=EnvironmentResponse, status_code=201)
async def create_environment(
    project_id: uuid.UUID,
    req: EnvironmentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    env = Environment(
        id=uuid.uuid4(),
        project_id=project_id,
        name=req.name,
        config_json=req.config_json,
    )
    db.add(env)
    await db.flush()
    return EnvironmentResponse.model_validate(env)


@router.get("/environments", response_model=list[EnvironmentResponse])
async def list_environments(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(Environment).where(Environment.project_id == project_id)
    )
    return [EnvironmentResponse.model_validate(e) for e in result.scalars().all()]


@router.patch("/environments/{env_id}", response_model=EnvironmentResponse)
async def update_environment(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    req: EnvironmentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(Environment).where(Environment.id == env_id, Environment.project_id == project_id)
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    if req.name is not None:
        env.name = req.name
    if req.config_json is not None:
        env.config_json = req.config_json
    if req.compose_yaml is not None:
        env.compose_yaml = req.compose_yaml
    await db.flush()
    return EnvironmentResponse.model_validate(env)


# --- Compose Generation ---

@router.post("/generate-compose", response_model=EnvironmentResponse)
async def generate_compose(
    project_id: uuid.UUID,
    req: GenerateComposeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    compose_yaml = await generate_compose_from_canvas(req.canvas_id, db)

    # Find or create environment
    result = await db.execute(
        select(Environment).where(
            Environment.project_id == project_id, Environment.name == req.environment_name
        )
    )
    env = result.scalar_one_or_none()
    if not env:
        env = Environment(
            id=uuid.uuid4(),
            project_id=project_id,
            name=req.environment_name,
        )
        db.add(env)
    env.compose_yaml = compose_yaml
    await db.flush()
    return EnvironmentResponse.model_validate(env)


# --- Deploy Jobs ---

@router.post("/jobs", response_model=DeployJobResponse, status_code=201)
async def start_deploy(
    project_id: uuid.UUID,
    req: DeployRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)

    job = DeployJob(
        id=uuid.uuid4(),
        environment_id=req.environment_id,
        status=DeployStatus.pending,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    # Enqueue
    redis = await get_redis()
    await redis.rpush("arq:queue", f"deploy:{job.id}")

    return DeployJobResponse.model_validate(job)


@router.get("/jobs/{job_id}", response_model=DeployJobResponse)
async def get_deploy_job(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(select(DeployJob).where(DeployJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Deploy job not found")
    return DeployJobResponse.model_validate(job)


@router.get("/jobs/{job_id}/logs")
async def stream_deploy_logs(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    redis = await get_redis()

    async def event_generator():
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"deploy:logs:{job_id}")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if data == "__DONE__":
                        yield {"event": "done", "data": ""}
                        break
                    yield {"event": "log", "data": data}
        finally:
            await pubsub.unsubscribe()

    return EventSourceResponse(event_generator())
