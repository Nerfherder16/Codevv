from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.canvas import Canvas, CanvasComponent
from app.schemas.canvas import (
    CanvasCreate, CanvasUpdate, ComponentCreate,
    CanvasResponse, CanvasDetailResponse, ComponentResponse,
)
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/canvases", tags=["canvases"])


@router.post("", response_model=CanvasResponse, status_code=201)
async def create_canvas(
    project_id: uuid.UUID,
    req: CanvasCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    canvas_id = uuid.uuid4()
    canvas = Canvas(
        id=canvas_id,
        project_id=project_id,
        name=req.name,
        yjs_doc_id=f"canvas-{canvas_id}",
        created_by=user.id,
    )
    db.add(canvas)
    await db.flush()
    return CanvasResponse(
        id=canvas.id, project_id=canvas.project_id, name=canvas.name,
        yjs_doc_id=canvas.yjs_doc_id, created_by=canvas.created_by,
        created_at=canvas.created_at, updated_at=canvas.updated_at,
    )


@router.get("", response_model=list[CanvasResponse])
async def list_canvases(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(Canvas)
        .where(Canvas.project_id == project_id)
        .options(selectinload(Canvas.components))
    )
    canvases = result.scalars().all()
    return [
        CanvasResponse(
            id=c.id, project_id=c.project_id, name=c.name,
            yjs_doc_id=c.yjs_doc_id, created_by=c.created_by,
            created_at=c.created_at, updated_at=c.updated_at,
            component_count=len(c.components),
        )
        for c in canvases
    ]


@router.get("/{canvas_id}", response_model=CanvasDetailResponse)
async def get_canvas(
    project_id: uuid.UUID,
    canvas_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(Canvas)
        .where(Canvas.id == canvas_id, Canvas.project_id == project_id)
        .options(selectinload(Canvas.components))
    )
    canvas = result.scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return CanvasDetailResponse(
        id=canvas.id, project_id=canvas.project_id, name=canvas.name,
        yjs_doc_id=canvas.yjs_doc_id, created_by=canvas.created_by,
        created_at=canvas.created_at, updated_at=canvas.updated_at,
        tldraw_snapshot=canvas.tldraw_snapshot,
        components=[ComponentResponse.model_validate(c) for c in canvas.components],
        component_count=len(canvas.components),
    )


@router.patch("/{canvas_id}", response_model=CanvasResponse)
async def update_canvas(
    project_id: uuid.UUID,
    canvas_id: uuid.UUID,
    req: CanvasUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(Canvas).where(Canvas.id == canvas_id, Canvas.project_id == project_id)
    )
    canvas = result.scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")
    if req.name is not None:
        canvas.name = req.name
    if req.tldraw_snapshot is not None:
        canvas.tldraw_snapshot = req.tldraw_snapshot
    await db.flush()
    return CanvasResponse(
        id=canvas.id, project_id=canvas.project_id, name=canvas.name,
        yjs_doc_id=canvas.yjs_doc_id, created_by=canvas.created_by,
        created_at=canvas.created_at, updated_at=canvas.updated_at,
    )


@router.post("/{canvas_id}/components", response_model=ComponentResponse, status_code=201)
async def add_component(
    project_id: uuid.UUID,
    canvas_id: uuid.UUID,
    req: ComponentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(Canvas).where(Canvas.id == canvas_id, Canvas.project_id == project_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Canvas not found")

    component = CanvasComponent(
        id=uuid.uuid4(),
        canvas_id=canvas_id,
        shape_id=req.shape_id,
        name=req.name,
        component_type=req.component_type,
        tech_stack=req.tech_stack,
        description=req.description,
        metadata_json=req.metadata_json,
    )
    db.add(component)
    await db.flush()
    return ComponentResponse.model_validate(component)
