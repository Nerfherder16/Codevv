from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class OrgCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=200, pattern=r"^[a-z0-9-]+$")
    claude_auth_mode: str = "oauth_per_user"
    claude_subscription_type: str | None = None
    default_persona: str = "creator"
    auto_add_to_projects: bool = True


class OrgUpdate(BaseModel):
    name: str | None = None
    claude_auth_mode: str | None = None
    claude_subscription_type: str | None = None
    auto_add_to_projects: bool | None = None
    default_persona: str | None = None


class OrgResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    owner_id: str
    claude_auth_mode: str
    claude_subscription_type: str | None
    auto_add_to_projects: bool
    default_persona: str
    created_at: str


class OrgMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    invite_email: str | None
    display_name: str | None = None
    email: str | None = None
    role: str
    default_persona: str
    status: str
    joined_at: str | None


class InviteCreate(BaseModel):
    email: str = Field(pattern=r"^[\w.+-]+@[\w-]+\.\w+$")
    role: str = "member"
    persona: str = "creator"


class InviteDetail(BaseModel):
    org_name: str
    org_slug: str
    invite_email: str
    role: str
    persona: str
    invited_by_name: str | None
