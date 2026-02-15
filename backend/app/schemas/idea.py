from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.idea import IdeaStatus


class IdeaCreate(BaseModel):
    title: str
    description: str
    category: str | None = None


class IdeaUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: IdeaStatus | None = None
    category: str | None = None


class IdeaVoteRequest(BaseModel):
    value: int  # +1 or -1


class IdeaCommentCreate(BaseModel):
    content: str


class CommentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class IdeaResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str
    status: IdeaStatus
    category: str | None
    feasibility_score: float | None
    feasibility_reason: str | None
    vote_count: int = 0
    comment_count: int = 0
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IdeaDetailResponse(IdeaResponse):
    comments: list[CommentResponse] = []


class IdeaSearchRequest(BaseModel):
    query: str
    limit: int = 20
