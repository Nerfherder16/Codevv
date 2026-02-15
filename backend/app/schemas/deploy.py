from pydantic import BaseModel
import uuid
from datetime import datetime
from app.models.deploy import DeployStatus


class EnvironmentCreate(BaseModel):
    name: str
    config_json: dict | None = None


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    config_json: dict | None = None
    compose_yaml: str | None = None


class EnvironmentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    config_json: dict | None
    compose_yaml: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeployRequest(BaseModel):
    environment_id: uuid.UUID


class DeployJobResponse(BaseModel):
    id: uuid.UUID
    environment_id: uuid.UUID
    status: DeployStatus
    logs: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class GenerateComposeRequest(BaseModel):
    canvas_id: uuid.UUID
    environment_name: str = "dev"
