from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.pipeline import AgentRun, RunStatus, AgentType
from app.schemas.pipeline import (
    AgentRunCreate,
    AgentRunResponse,
    AgentRunDetailResponse,
    AgentFindingResponse,
)
from app.api.routes.projects import get_project_with_access
from app.services.pipeline import create_run
import uuid

router = APIRouter(prefix="/projects/{project_id}/pipeline", tags=["pipeline"])


def _build_run_response(run: AgentRun) -> AgentRunResponse:
    return AgentRunResponse(
        id=run.id,
        project_id=run.project_id,
        agent_type=run.agent_type,
        status=run.status,
        input_json=run.input_json,
        output_json=run.output_json,
        error_message=run.error_message,
        started_at=run.started_at,
        completed_at=run.completed_at,
        created_by=run.created_by,
        created_at=run.created_at,
        findings_count=len(run.findings) if run.findings else 0,
    )


@router.get("", response_model=list[AgentRunResponse])
async def list_runs(
    project_id: uuid.UUID,
    agent_type: AgentType | None = None,
    status: RunStatus | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    query = (
        select(AgentRun)
        .where(AgentRun.project_id == project_id)
        .options(selectinload(AgentRun.findings))
    )
    if agent_type:
        query = query.where(AgentRun.agent_type == agent_type)
    if status:
        query = query.where(AgentRun.status == status)

    result = await db.execute(query.order_by(AgentRun.created_at.desc()))
    runs = result.scalars().unique().all()
    return [_build_run_response(r) for r in runs]


@router.post("", response_model=AgentRunResponse, status_code=201)
async def trigger_run(
    project_id: uuid.UUID,
    req: AgentRunCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    run = await create_run(project_id, req.agent_type, req.input_json, user.id, db)
    return _build_run_response(run)


@router.get("/{run_id}", response_model=AgentRunDetailResponse)
async def get_run(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(AgentRun)
        .where(AgentRun.id == run_id, AgentRun.project_id == project_id)
        .options(selectinload(AgentRun.findings))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")

    base = _build_run_response(run)
    return AgentRunDetailResponse(
        **base.model_dump(),
        findings=[AgentFindingResponse.model_validate(f) for f in run.findings],
    )


@router.post("/{run_id}/cancel", status_code=204)
async def cancel_run(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == run_id, AgentRun.project_id == project_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    if run.status not in (RunStatus.queued, RunStatus.running):
        raise HTTPException(
            status_code=400, detail="Can only cancel queued or running runs"
        )
    run.status = RunStatus.cancelled
    await db.flush()
