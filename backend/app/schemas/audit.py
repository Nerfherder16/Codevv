from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.audit import AuditStatus


class AuditSection(BaseModel):
    name: str
    items: list[dict] = []
    score: int = 0
    notes: str | None = None


class AuditReportCreate(BaseModel):
    title: str
    sections: list[str] = [
        "architecture",
        "code_generation",
        "deployment",
        "ideas",
        "knowledge",
    ]


class AuditReportResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    report_json: dict | None = None
    status: AuditStatus
    generated_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
