from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.scaffold import ScaffoldStatus


class ScaffoldRequest(BaseModel):
    canvas_id: uuid.UUID
    component_ids: list[uuid.UUID]


class ScaffoldApproval(BaseModel):
    approved: bool


class ScaffoldResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    canvas_id: uuid.UUID
    component_ids: list
    status: ScaffoldStatus
    spec_json: dict | None
    generated_files: dict | None
    error_message: str | None
    created_by: uuid.UUID
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
