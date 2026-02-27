"""Business rules — Postgres-backed, Recall-synced."""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.business_rule import BusinessRule, RuleEnforcement, RuleScope
from app.api.routes.projects import get_project_with_access
from app.services.activity import log_activity

router = APIRouter(prefix="/projects/{project_id}/rules", tags=["rules"])


class RuleCreate(BaseModel):
    title: str
    description: str
    rationale: Optional[str] = None
    enforcement: RuleEnforcement = RuleEnforcement.recommended
    scope: RuleScope


class RuleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    rationale: Optional[str] = None
    enforcement: Optional[RuleEnforcement] = None
    scope: Optional[RuleScope] = None
    active: Optional[bool] = None


def _rule_out(r: BusinessRule) -> dict:
    return {
        "id": str(r.id),
        "project_id": str(r.project_id),
        "title": r.title,
        "description": r.description,
        "rationale": r.rationale,
        "enforcement": r.enforcement.value,
        "scope": r.scope.value,
        "version": r.version,
        "supersedes_id": str(r.supersedes_id) if r.supersedes_id else None,
        "active": r.active,
        "recall_memory_id": r.recall_memory_id,
        "created_by": str(r.created_by),
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
    }


async def _sync_to_recall(rule: BusinessRule, project_slug: str) -> str | None:
    """Sync rule to Recall as a pinned semantic memory. Returns memory ID."""
    try:
        from app.services.recall import _recall_post

        domain = f"codevv:{project_slug}"
        content = (
            f"[{rule.enforcement.value.upper()}] {rule.title}\n\n{rule.description}"
        )
        if rule.rationale:
            content += f"\n\nRationale: {rule.rationale}"
        result = await _recall_post(
            "/memory/store",
            json={
                "content": content,
                "domain": domain,
                "memory_type": "semantic",
                "tags": [
                    f"rule_id:{rule.id}",
                    f"scope:{rule.scope.value}",
                    f"enforcement:{rule.enforcement.value}",
                    "type:business_rule",
                    "importance:high",
                ],
                "metadata": {"rule_id": str(rule.id), "scope": rule.scope.value},
            },
        )
        return result.get("id")
    except Exception:
        return None


@router.get("")
async def list_rules(
    project_id: uuid.UUID,
    scope: Optional[str] = None,
    enforcement: Optional[str] = None,
    active_only: bool = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    q = select(BusinessRule).where(BusinessRule.project_id == project_id)
    if active_only:
        q = q.where(BusinessRule.active == True)  # noqa: E712
    if scope:
        try:
            q = q.where(BusinessRule.scope == RuleScope(scope))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid scope: {scope}")
    if enforcement:
        try:
            q = q.where(BusinessRule.enforcement == RuleEnforcement(enforcement))
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"Invalid enforcement: {enforcement}"
            )
    q = q.order_by(BusinessRule.created_at.desc())
    result = await db.execute(q)
    return [_rule_out(r) for r in result.scalars().all()]


@router.post("", status_code=201)
async def create_rule(
    project_id: uuid.UUID,
    req: RuleCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(project_id, user, db)
    project_slug = project.slug

    rule = BusinessRule(
        project_id=project_id,
        title=req.title,
        description=req.description,
        rationale=req.rationale,
        enforcement=req.enforcement,
        scope=req.scope,
        created_by=user.id,
    )
    db.add(rule)
    await db.flush()

    # Sync to Recall
    mem_id = await _sync_to_recall(rule, project_slug)
    if mem_id:
        rule.recall_memory_id = mem_id

    await db.commit()

    try:
        await log_activity(
            project_id=project_id,
            actor_id=user.id,
            action="created",
            entity_type="business_rule",
            entity_id=str(rule.id),
            entity_name=rule.title,
            db=db,
        )
    except Exception:
        pass

    return _rule_out(rule)


@router.get("/{rule_id}")
async def get_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(BusinessRule).where(
            BusinessRule.id == rule_id, BusinessRule.project_id == project_id
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Include version history
    history_result = await db.execute(
        select(BusinessRule).where(BusinessRule.supersedes_id == rule_id)
    )
    newer = history_result.scalars().all()

    out = _rule_out(rule)
    out["newer_versions"] = [_rule_out(r) for r in newer]
    return out


@router.patch("/{rule_id}")
async def update_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    req: RuleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(BusinessRule).where(
            BusinessRule.id == rule_id, BusinessRule.project_id == project_id
        )
    )
    old_rule = result.scalar_one_or_none()
    if not old_rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Create a new version, supersede the old
    new_rule = BusinessRule(
        project_id=project_id,
        title=req.title if req.title is not None else old_rule.title,
        description=req.description
        if req.description is not None
        else old_rule.description,
        rationale=req.rationale if req.rationale is not None else old_rule.rationale,
        enforcement=req.enforcement
        if req.enforcement is not None
        else old_rule.enforcement,
        scope=req.scope if req.scope is not None else old_rule.scope,
        version=old_rule.version + 1,
        supersedes_id=old_rule.id,
        active=req.active if req.active is not None else old_rule.active,
        created_by=user.id,
    )
    old_rule.active = False
    db.add(new_rule)
    await db.flush()

    mem_id = await _sync_to_recall(new_rule, project.slug)
    if mem_id:
        new_rule.recall_memory_id = mem_id

    await db.commit()
    return _rule_out(new_rule)


@router.delete("/{rule_id}", status_code=204)
async def deactivate_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(BusinessRule).where(
            BusinessRule.id == rule_id, BusinessRule.project_id == project_id
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.active = False
    await db.commit()
