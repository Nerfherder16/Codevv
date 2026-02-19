from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectRole
from app.models.idea import Idea, IdeaStatus, IdeaVote, IdeaComment
from app.schemas.idea import (
    IdeaCreate,
    IdeaUpdate,
    IdeaVoteRequest,
    IdeaCommentCreate,
    IdeaResponse,
    IdeaDetailResponse,
    CommentResponse,
    IdeaSearchRequest,
)
from app.api.routes.projects import get_project_with_access
from app.services.embedding import get_embedding
import uuid

router = APIRouter(prefix="/projects/{project_id}/ideas", tags=["ideas"])


def build_idea_response(idea: Idea) -> IdeaResponse:
    return IdeaResponse(
        id=idea.id,
        project_id=idea.project_id,
        title=idea.title,
        description=idea.description,
        status=idea.status,
        category=idea.category,
        feasibility_score=idea.feasibility_score,
        feasibility_reason=idea.feasibility_reason,
        vote_count=sum(v.value for v in idea.votes),
        comment_count=len(idea.comments),
        created_by=idea.created_by,
        created_at=idea.created_at,
        updated_at=idea.updated_at,
    )


@router.post("", response_model=IdeaResponse, status_code=201)
async def create_idea(
    project_id: uuid.UUID,
    req: IdeaCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    idea = Idea(
        id=uuid.uuid4(),
        project_id=project_id,
        title=req.title,
        description=req.description,
        category=req.category,
        created_by=user.id,
    )
    # Generate embedding
    try:
        embedding = await get_embedding(f"{req.title}\n{req.description}")
        idea.embedding = embedding
    except Exception:
        pass  # Embedding is optional

    db.add(idea)
    await db.flush()

    # Auto-propagate to knowledge graph
    from app.services.knowledge import auto_propagate_entity

    try:
        await auto_propagate_entity(
            project_id=project_id,
            name=req.title,
            entity_type="idea",
            properties={"description": req.description, "category": req.category},
            db=db,
            source_type="idea",
            source_id=idea.id,
        )
    except Exception:
        pass  # Knowledge propagation is best-effort

    idea.votes = []
    idea.comments = []
    return build_idea_response(idea)


@router.get("", response_model=list[IdeaResponse])
async def list_ideas(
    project_id: uuid.UUID,
    status: IdeaStatus | None = None,
    category: str | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    query = (
        select(Idea)
        .where(Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    if status:
        query = query.where(Idea.status == status)
    if category:
        query = query.where(Idea.category == category)
    if q:
        query = query.where(
            Idea.title.ilike(f"%{q}%") | Idea.description.ilike(f"%{q}%")
        )

    result = await db.execute(query.order_by(Idea.created_at.desc()))
    ideas = result.scalars().unique().all()
    return [build_idea_response(i) for i in ideas]


@router.get("/{idea_id}", response_model=IdeaDetailResponse)
async def get_idea(
    project_id: uuid.UUID,
    idea_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    result = await db.execute(
        select(Idea)
        .where(Idea.id == idea_id, Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    base = build_idea_response(idea)
    return IdeaDetailResponse(
        **base.model_dump(),
        comments=[CommentResponse.model_validate(c) for c in idea.comments],
    )


@router.patch("/{idea_id}", response_model=IdeaResponse)
async def update_idea(
    project_id: uuid.UUID,
    idea_id: uuid.UUID,
    req: IdeaUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role=ProjectRole.editor)
    result = await db.execute(
        select(Idea)
        .where(Idea.id == idea_id, Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")

    if req.title is not None:
        idea.title = req.title
    if req.description is not None:
        idea.description = req.description
    if req.status is not None:
        idea.status = req.status
    if req.category is not None:
        idea.category = req.category

    # Re-embed if text changed
    if req.title is not None or req.description is not None:
        try:
            idea.embedding = await get_embedding(f"{idea.title}\n{idea.description}")
        except Exception:
            pass

    await db.flush()
    return build_idea_response(idea)


@router.post("/{idea_id}/vote", status_code=204)
async def vote_idea(
    project_id: uuid.UUID,
    idea_id: uuid.UUID,
    req: IdeaVoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    if req.value not in (1, -1):
        raise HTTPException(status_code=400, detail="Vote must be +1 or -1")

    # Upsert vote
    result = await db.execute(
        select(IdeaVote).where(IdeaVote.idea_id == idea_id, IdeaVote.user_id == user.id)
    )
    vote = result.scalar_one_or_none()
    if vote:
        vote.value = req.value
    else:
        db.add(
            IdeaVote(id=uuid.uuid4(), idea_id=idea_id, user_id=user.id, value=req.value)
        )
    await db.flush()


@router.post("/{idea_id}/comments", response_model=CommentResponse, status_code=201)
async def add_comment(
    project_id: uuid.UUID,
    idea_id: uuid.UUID,
    req: IdeaCommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    comment = IdeaComment(
        id=uuid.uuid4(),
        idea_id=idea_id,
        user_id=user.id,
        content=req.content,
    )
    db.add(comment)
    await db.flush()
    return CommentResponse.model_validate(comment)


@router.post("/search", response_model=list[IdeaResponse])
async def semantic_search_ideas(
    project_id: uuid.UUID,
    req: IdeaSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    try:
        query_embedding = await get_embedding(req.query)
    except Exception:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")

    result = await db.execute(
        select(Idea)
        .where(Idea.project_id == project_id, Idea.embedding.isnot(None))
        .order_by(Idea.embedding.cosine_distance(query_embedding))
        .limit(req.limit)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    ideas = result.scalars().unique().all()
    return [build_idea_response(i) for i in ideas]
