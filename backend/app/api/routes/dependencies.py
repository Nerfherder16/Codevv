from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.api.routes.projects import get_project_with_access
from app.schemas.dependencies import (
    DependencyGraphResponse,
    ImpactAnalysisResponse,
    CycleResponse,
)
from app.services.dependencies import (
    build_dependency_graph,
    detect_cycles,
    calculate_impact,
)
import uuid

router = APIRouter(prefix="/projects/{project_id}/dependencies", tags=["dependencies"])


@router.get("", response_model=DependencyGraphResponse)
async def get_dependency_graph(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    graph = await build_dependency_graph(project_id, db)
    return graph


@router.get("/{component_id}/impact", response_model=ImpactAnalysisResponse)
async def get_impact_analysis(
    project_id: uuid.UUID,
    component_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    graph = await build_dependency_graph(project_id, db)
    result = await calculate_impact(component_id, graph["nodes"], graph["edges"])
    return result


@router.get("/cycles", response_model=CycleResponse)
async def get_cycles(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    graph = await build_dependency_graph(project_id, db)
    cycles = detect_cycles(graph["nodes"], graph["edges"])
    return {"cycles": cycles, "has_cycles": len(cycles) > 0}
