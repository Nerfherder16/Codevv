from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.redis import get_redis
from app.models.user import User
from app.models.project import ProjectRole
from app.models.scaffold import ScaffoldJob, ScaffoldStatus
from app.schemas.scaffold import ScaffoldRequest, ScaffoldApproval, ScaffoldResponse
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/scaffold", tags=["scaffold"])


@router.post("", response_model=ScaffoldResponse, status_code=201)
async def create_scaffold_job(
    project_id: uuid.UUID,
    req: ScaffoldRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)

    job = ScaffoldJob(
        id=uuid.uuid4(),
        project_id=project_id,
        canvas_id=req.canvas_id,
        component_ids=[str(cid) for cid in req.component_ids],
        status=ScaffoldStatus.pending,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    # Enqueue ARQ job
    redis = await get_redis()
    await redis.rpush("arq:queue", f"scaffold:{job.id}")

    return ScaffoldResponse.model_validate(job)


@router.get("", response_model=list[ScaffoldResponse])
async def list_scaffold_jobs(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(ScaffoldJob)
        .where(ScaffoldJob.project_id == project_id)
        .order_by(ScaffoldJob.created_at.desc())
    )
    return [ScaffoldResponse.model_validate(j) for j in result.scalars().all()]


@router.get("/{job_id}", response_model=ScaffoldResponse)
async def get_scaffold_job(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(ScaffoldJob).where(ScaffoldJob.id == job_id, ScaffoldJob.project_id == project_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Scaffold job not found")
    return ScaffoldResponse.model_validate(job)


@router.post("/{job_id}/approve", response_model=ScaffoldResponse)
async def approve_scaffold(
    project_id: uuid.UUID,
    job_id: uuid.UUID,
    req: ScaffoldApproval,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(ScaffoldJob).where(ScaffoldJob.id == job_id, ScaffoldJob.project_id == project_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Scaffold job not found")
    if job.status != ScaffoldStatus.review:
        raise HTTPException(status_code=400, detail=f"Job is in {job.status} state, not review")

    job.status = ScaffoldStatus.approved if req.approved else ScaffoldStatus.rejected
    await db.flush()
    return ScaffoldResponse.model_validate(job)
