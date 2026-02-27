from pydantic import BaseModel, EmailStr, Field
import uuid
from datetime import datetime


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="editor", pattern="^(owner|editor|viewer)$")


class InviteResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    email: str
    role: str
    status: str
    invited_by_name: str
    created_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class InviteAcceptRequest(BaseModel):
    token: str


class InviteAcceptWithRegisterRequest(BaseModel):
    token: str
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=128)


class InviteInfo(BaseModel):
    project_name: str
    inviter_name: str
    email: str
    role: str
    expires_at: datetime
    is_expired: bool


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)
