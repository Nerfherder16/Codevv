from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime
from app.models.project import ProjectRole, ProjectPersona


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    org_id: Optional[uuid.UUID] = None


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
    persona: ProjectPersona = ProjectPersona.creator
    joined_at: datetime


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    archived: bool
    org_id: uuid.UUID | None = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    members: list[MemberResponse] = []
