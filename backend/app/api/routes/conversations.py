import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.schemas.conversation import (
    ConversationResponse,
    ConversationDetailResponse,
    ConversationMessageResponse,
    ConversationRename,
)
from app.api.routes.projects import get_project_with_access

router = APIRouter(
    prefix="/projects/{project_id}/conversations", tags=["conversations"]
)


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List conversations for the current user in this project, newest first."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.project_id == project_id,
            Conversation.user_id == user.id,
        )
        .order_by(Conversation.updated_at.desc())
    )
    conversations = result.scalars().all()
    return [ConversationResponse.model_validate(c) for c in conversations]



@router.get("/shared")
async def list_shared_conversations(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all shared conversations in the project (from any team member)."""
    from app.models.project import ProjectMember

    r = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member")

    r = await db.execute(
        select(Conversation)
        .where(
            Conversation.project_id == project_id,
            Conversation.shared == True,  # noqa: E712
        )
        .order_by(Conversation.shared_at.desc())
    )
    conversations = r.scalars().all()

    return [
        {
            "id": str(c.id),
            "title": c.title or "Untitled",
            "shared_at": c.shared_at.isoformat() if c.shared_at else None,
            "shared_by": str(c.shared_by) if c.shared_by else None,
            "user_id": str(c.user_id),
            "message_count": c.message_count,
        }
        for c in conversations
    ]


@router.patch("/{conversation_id}/share")
async def share_conversation(
    project_id: uuid.UUID,
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle shared status of a conversation."""
    from datetime import datetime, timezone

    r = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.project_id == project_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = r.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.shared = not conv.shared
    if conv.shared:
        conv.shared_at = datetime.now(timezone.utc)
        conv.shared_by = current_user.id
    else:
        conv.shared_at = None
        conv.shared_by = None

    await db.flush()

    if conv.shared:
        try:
            from app.services.activity import log_activity
            await log_activity(
                project_id=project_id,
                actor_id=current_user.id,
                action="shared",
                entity_type="conversation",
                entity_id=str(conversation_id),
                entity_name=conv.title or "Untitled conversation",
                db=db,
            )
        except Exception:
            pass

    return {
        "id": str(conv.id),
        "shared": conv.shared,
        "shared_at": conv.shared_at.isoformat() if conv.shared_at else None,
    }


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    project_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a conversation with all its messages."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.project_id == project_id,
            Conversation.user_id == user.id,
        )
        .options(selectinload(Conversation.messages))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    msgs = [ConversationMessageResponse.model_validate(m) for m in conv.messages]
    return ConversationDetailResponse(
        id=str(conv.id),
        project_id=str(conv.project_id),
        user_id=str(conv.user_id),
        title=conv.title,
        model=conv.model,
        message_count=conv.message_count,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=msgs,
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def rename_conversation(
    project_id: uuid.UUID,
    conversation_id: uuid.UUID,
    body: ConversationRename,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a conversation."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.project_id == project_id,
            Conversation.user_id == user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    conv.title = body.title.strip()[:200]
    await db.flush()
    return ConversationResponse.model_validate(conv)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    project_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.project_id == project_id,
            Conversation.user_id == user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    await db.delete(conv)
    await db.flush()
