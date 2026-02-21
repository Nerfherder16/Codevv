import uuid
from datetime import datetime
from pydantic import BaseModel


class WorkspaceCreate(BaseModel):
    project_id: uuid.UUID
    scope: str = "project"


class WorkspaceResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    port: int
    status: str
    scope: str
    last_activity: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class TerminalSessionCreate(BaseModel):
    workspace_id: uuid.UUID
    mode: str = "collaborative"


class TerminalSessionResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    tmux_session: str
    owner_id: uuid.UUID
    mode: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TerminalModeUpdate(BaseModel):
    mode: str
