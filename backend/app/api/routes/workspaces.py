import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    TerminalSessionCreate,
    TerminalSessionResponse,
    TerminalModeUpdate,
)
from app.api.routes.projects import get_project_with_access
from app.services import workspace as ws_service
from app.services import terminal as term_service

router = APIRouter(prefix="/projects/{project_id}/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(
    project_id: uuid.UUID,
    req: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    try:
        workspace = await ws_service.create_workspace(
            project_id, user.id, req.scope, db
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return WorkspaceResponse.model_validate(workspace)


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    workspaces = await ws_service.list_workspaces(project_id, db)
    return [WorkspaceResponse.model_validate(w) for w in workspaces]


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    workspace = await ws_service.get_workspace(workspace_id, db)
    if not workspace or workspace.project_id != project_id:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return WorkspaceResponse.model_validate(workspace)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    workspace = await ws_service.get_workspace(workspace_id, db)
    if not workspace or workspace.project_id != project_id:
        raise HTTPException(status_code=404, detail="Workspace not found")
    try:
        await ws_service.stop_workspace(workspace_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{workspace_id}/heartbeat", status_code=204)
async def workspace_heartbeat(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    await ws_service.heartbeat(workspace_id, db)


# --- Terminal Sessions ---


@router.post(
    "/{workspace_id}/terminals",
    response_model=TerminalSessionResponse,
    status_code=201,
)
async def create_terminal(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    req: TerminalSessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    try:
        session = await term_service.create_session(workspace_id, user.id, req.mode, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TerminalSessionResponse.model_validate(session)


@router.get(
    "/{workspace_id}/terminals",
    response_model=list[TerminalSessionResponse],
)
async def list_terminals(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    sessions = await term_service.list_sessions(workspace_id, db)
    return [TerminalSessionResponse.model_validate(s) for s in sessions]


@router.patch(
    "/{workspace_id}/terminals/{terminal_id}",
    response_model=TerminalSessionResponse,
)
async def update_terminal_mode(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    terminal_id: uuid.UUID,
    req: TerminalModeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    try:
        session = await term_service.set_mode(terminal_id, user.id, req.mode, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return TerminalSessionResponse.model_validate(session)
