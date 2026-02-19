from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.compliance import CheckCategory, CheckStatus


class ChecklistCreate(BaseModel):
    name: str
    description: str | None = None


class CheckCreate(BaseModel):
    title: str
    description: str | None = None
    category: CheckCategory


class CheckUpdate(BaseModel):
    status: CheckStatus | None = None
    evidence_url: str | None = None
    notes: str | None = None
    assigned_to: uuid.UUID | None = None


class CheckResponse(BaseModel):
    id: uuid.UUID
    checklist_id: uuid.UUID
    title: str
    description: str | None = None
    category: CheckCategory
    status: CheckStatus
    evidence_url: str | None = None
    notes: str | None = None
    assigned_to: uuid.UUID | None = None
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None = None
    created_by: uuid.UUID
    created_at: datetime
    checks_count: int = 0
    pass_rate: float = 0.0

    model_config = {"from_attributes": True}


class ChecklistDetailResponse(ChecklistResponse):
    checks: list[CheckResponse] = []


class LaunchReadinessResponse(BaseModel):
    overall_score: float
    category_scores: dict[str, float]
    blockers: list[CheckResponse]
    total: int
    passed: int
    failed: int
