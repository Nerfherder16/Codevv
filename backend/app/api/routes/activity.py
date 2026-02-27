"""Activity feed endpoints."""

import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.activity import Activity
from app.api.routes.projects import get_project_with_access

router = APIRouter(prefix="/projects/{project_id}/activity", tags=["activity"])


class ActivityResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    actor_id: Optional[uuid.UUID]
    actor_name: Optional[str]
    action: str
    entity_type: str
    entity_id: str
    entity_name: Optional[str]
    details: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivitySummaryResponse(BaseModel):
    total: int
    by_type: dict[str, int]
    by_action: dict[str, int]


@router.get("", response_model=list[ActivityResponse])
async def list_activity(
    project_id: uuid.UUID,
    entity_type: Optional[str] = Query(default=None),
    actor_id: Optional[uuid.UUID] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    q = (
        select(Activity, User)
        .outerjoin(User, Activity.actor_id == User.id)
        .where(Activity.project_id == project_id)
    )

    if entity_type:
        q = q.where(Activity.entity_type == entity_type)
    if actor_id:
        q = q.where(Activity.actor_id == actor_id)

    q = q.order_by(desc(Activity.created_at)).offset(offset).limit(limit)
    rows = await db.execute(q)

    results = []
    for activity, actor in rows.all():
        results.append(
            ActivityResponse(
                id=activity.id,
                project_id=activity.project_id,
                actor_id=activity.actor_id,
                actor_name=actor.display_name if actor else None,
                action=activity.action,
                entity_type=activity.entity_type,
                entity_id=activity.entity_id,
                entity_name=activity.entity_name,
                details=activity.details,
                created_at=activity.created_at,
            )
        )
    return results


@router.get("/summary", response_model=ActivitySummaryResponse)
async def activity_summary(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    rows = await db.execute(
        select(Activity.entity_type, Activity.action, func.count())
        .where(Activity.project_id == project_id)
        .group_by(Activity.entity_type, Activity.action)
    )

    by_type: dict[str, int] = {}
    by_action: dict[str, int] = {}
    total = 0
    for entity_type, action, count in rows.all():
        by_type[entity_type] = by_type.get(entity_type, 0) + count
        by_action[action] = by_action.get(action, 0) + count
        total += count

    return ActivitySummaryResponse(total=total, by_type=by_type, by_action=by_action)
