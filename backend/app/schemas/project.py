from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.project import ProjectRole


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    archived: bool | None = None


class ProjectMemberAdd(BaseModel):
    email: str
    role: ProjectRole = ProjectRole.editor


class MemberResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    email: str
    role: ProjectRole
    joined_at: datetime


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    archived: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    members: list[MemberResponse] = []
