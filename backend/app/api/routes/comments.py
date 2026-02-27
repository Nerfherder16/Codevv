"""Comment and Reference routes — polymorphic, project-scoped."""

import uuid
import re
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.comment import Comment, Reference
from app.models.project import ProjectMember
from app.api.routes.projects import get_project_with_access
from app.services.activity import log_activity
from app.services.events import user_event

router = APIRouter(prefix="/projects/{project_id}", tags=["comments"])


# ─── Schemas ─────────────────────────────────────────────────────────────────


class CommentCreate(BaseModel):
    entity_type: str
    entity_id: str
    body: str


class CommentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    entity_type: str
    entity_id: str
    author_id: uuid.UUID
    author_name: Optional[str]
    body: str
    mentioned_user_ids: Optional[list[str]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReferenceCreate(BaseModel):
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    relation: Optional[str] = None


class ReferenceResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    relation: Optional[str]
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Comment routes ───────────────────────────────────────────────────────────


@router.post("/comments", response_model=CommentResponse, status_code=201)
async def create_comment(
    project_id: uuid.UUID,
    req: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    # Resolve @mentions — look for @word patterns, match against project member display names
    mentioned_ids: list[str] = []
    handles = re.findall(r"@(\w+)", req.body)
    if handles:
        member_rows = await db.execute(
            select(User)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project_id)
        )
        members = member_rows.scalars().all()
        for handle in handles:
            for m in members:
                name_slug = m.display_name.lower().replace(" ", "")
                if handle.lower() in name_slug and str(m.id) != str(user.id):
                    mentioned_ids.append(str(m.id))
                    break

    comment = Comment(
        project_id=project_id,
        entity_type=req.entity_type,
        entity_id=req.entity_id,
        author_id=user.id,
        body=req.body,
        mentioned_user_ids=mentioned_ids if mentioned_ids else None,
    )
    db.add(comment)
    await db.flush()

    try:
        await log_activity(
            project_id=project_id,
            actor_id=user.id,
            action="commented",
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            db=db,
        )
        # Notify mentioned users
        for uid_str in mentioned_ids:
            await user_event(
                uuid.UUID(uid_str),
                "comment.mention",
                {
                    "comment_id": str(comment.id),
                    "entity_type": req.entity_type,
                    "entity_id": req.entity_id,
                    "project_id": str(project_id),
                    "actor_name": user.display_name,
                },
                user.id,
            )
    except Exception:
        pass

    return CommentResponse(
        id=comment.id,
        project_id=comment.project_id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        author_id=comment.author_id,
        author_name=user.display_name,
        body=comment.body,
        mentioned_user_ids=comment.mentioned_user_ids,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/comments", response_model=list[CommentResponse])
async def list_comments(
    project_id: uuid.UUID,
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    rows = await db.execute(
        select(Comment, User)
        .outerjoin(User, Comment.author_id == User.id)
        .where(
            Comment.project_id == project_id,
            Comment.entity_type == entity_type,
            Comment.entity_id == entity_id,
        )
        .order_by(Comment.created_at)
    )

    return [
        CommentResponse(
            id=c.id,
            project_id=c.project_id,
            entity_type=c.entity_type,
            entity_id=c.entity_id,
            author_id=c.author_id,
            author_name=author.display_name if author else None,
            body=c.body,
            mentioned_user_ids=c.mentioned_user_ids,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c, author in rows.all()
    ]


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    project_id: uuid.UUID,
    comment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    res = await db.execute(
        select(Comment).where(
            Comment.id == comment_id, Comment.project_id == project_id
        )
    )
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.delete(comment)


# ─── Reference routes ─────────────────────────────────────────────────────────


@router.post("/references", response_model=ReferenceResponse, status_code=201)
async def create_reference(
    project_id: uuid.UUID,
    req: ReferenceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    ref = Reference(
        project_id=project_id,
        source_type=req.source_type,
        source_id=req.source_id,
        target_type=req.target_type,
        target_id=req.target_id,
        relation=req.relation,
        created_by=user.id,
    )
    db.add(ref)
    await db.flush()
    return ReferenceResponse.model_validate(ref)


@router.get("/references", response_model=list[ReferenceResponse])
async def list_references(
    project_id: uuid.UUID,
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    rows = await db.execute(
        select(Reference).where(
            Reference.project_id == project_id,
            (
                (Reference.source_type == entity_type)
                & (Reference.source_id == entity_id)
            )
            | (
                (Reference.target_type == entity_type)
                & (Reference.target_id == entity_id)
            ),
        )
    )
    return [ReferenceResponse.model_validate(r) for r in rows.scalars().all()]


@router.delete("/references/{reference_id}", status_code=204)
async def delete_reference(
    project_id: uuid.UUID,
    reference_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    res = await db.execute(
        select(Reference).where(
            Reference.id == reference_id, Reference.project_id == project_id
        )
    )
    ref = res.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    await db.delete(ref)
