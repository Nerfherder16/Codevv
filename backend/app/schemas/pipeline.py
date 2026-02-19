from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.pipeline import AgentType, RunStatus, FindingSeverity


class AgentRunCreate(BaseModel):
    agent_type: AgentType
    input_json: dict | None = None


class AgentFindingResponse(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    severity: FindingSeverity
    title: str
    description: str | None = None
    file_path: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentRunResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    agent_type: AgentType
    status: RunStatus
    input_json: dict | None = None
    output_json: dict | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_by: uuid.UUID
    created_at: datetime
    findings_count: int = 0

    model_config = {"from_attributes": True}


class AgentRunDetailResponse(AgentRunResponse):
    findings: list[AgentFindingResponse] = []
