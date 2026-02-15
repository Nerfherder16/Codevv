from pydantic import BaseModel
import uuid
from datetime import datetime


class RoomCreate(BaseModel):
    name: str
    canvas_id: uuid.UUID | None = None


class RoomResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    canvas_id: uuid.UUID | None
    name: str
    livekit_room_name: str
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class RoomTokenResponse(BaseModel):
    token: str
    room_name: str
    url: str
