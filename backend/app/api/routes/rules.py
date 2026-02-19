from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project
from app.api.routes.projects import get_project_with_access
from app.schemas.rules import RuleResponse, RulePinRequest, RuleSearchRequest
from app.services.rules import get_pinned_rules, search_rules, pin_rule, unpin_rule
import uuid

router = APIRouter(prefix="/projects/{project_id}/rules", tags=["rules"])


async def _get_project_slug(project_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(select(Project.slug).where(Project.id == project_id))
    slug = result.scalar_one_or_none()
    if not slug:
        raise HTTPException(status_code=404, detail="Project not found")
    return slug


@router.get("", response_model=list[RuleResponse])
async def list_rules(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    slug = await _get_project_slug(project_id, db)
    try:
        rules = await get_pinned_rules(slug)
        return rules
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Recall unavailable: {e}")


@router.post("/pin", response_model=dict)
async def pin_memory_as_rule(
    project_id: uuid.UUID,
    req: RulePinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    try:
        result = await pin_rule(req.memory_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Recall unavailable: {e}")


@router.delete("/{memory_id}/pin", status_code=204)
async def unpin_rule_endpoint(
    project_id: uuid.UUID,
    memory_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    try:
        await unpin_rule(memory_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Recall unavailable: {e}")


@router.post("/search", response_model=list[RuleResponse])
async def search_rules_endpoint(
    project_id: uuid.UUID,
    req: RuleSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    slug = await _get_project_slug(project_id, db)
    try:
        results = await search_rules(slug, req.query, req.limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Recall unavailable: {e}")
