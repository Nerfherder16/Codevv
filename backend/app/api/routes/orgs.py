from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.claude_credential import ClaudeCredential
from app.models.organization import Organization, OrgMembership, OrgRole
from app.models.user import User
from app.schemas.org import (
    InviteCreate,
    InviteDetail,
    OrgCreate,
    OrgMemberResponse,
    OrgResponse,
    OrgUpdate,
)
from app.services.org_service import (
    accept_invite,
    create_org,
    get_invite_by_token,
    get_membership,
    get_org,
    get_org_by_slug,
    get_user_orgs,
    invite_member,
)

# Two routers: one for literal-path routes (no /{org_id} conflict), one for param routes.
# Both share the same prefix — they are registered separately in main.py
# but we merge them here by using a single router and careful ordering.
router = APIRouter(tags=["organizations"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _org_to_response(org: Organization) -> dict:
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "owner_id": str(org.owner_id),
        "claude_auth_mode": org.claude_auth_mode,
        "claude_subscription_type": org.claude_subscription_type,
        "auto_add_to_projects": org.auto_add_to_projects,
        "default_persona": org.default_persona,
        "created_at": org.created_at.isoformat(),
    }


def _member_to_response(m: OrgMembership, user: User | None = None) -> dict:
    return {
        "id": str(m.id),
        "user_id": str(m.user_id) if m.user_id else None,
        "invite_email": m.invite_email,
        "display_name": user.display_name if user else None,
        "email": user.email if user else m.invite_email,
        "role": m.role.value,
        "default_persona": m.default_persona,
        "status": m.status.value,
        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
    }


def _require_admin(membership: OrgMembership | None) -> None:
    if not membership or membership.status.value != "active":
        raise HTTPException(403, "Not a member of this org")
    if membership.role.value not in ("owner", "admin"):
        raise HTTPException(403, "Admin or owner role required")


def _require_owner(membership: OrgMembership | None) -> None:
    if not membership or membership.status.value != "active":
        raise HTTPException(403, "Not a member of this org")
    if membership.role.value != "owner":
        raise HTTPException(403, "Owner role required")


# ---------------------------------------------------------------------------
# LITERAL ROUTES — must be defined before /{org_id} routes
# ---------------------------------------------------------------------------


@router.post("", response_model=OrgResponse, status_code=201)
async def create_organization(
    body: OrgCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new organization. The caller becomes the owner."""
    existing = await get_org_by_slug(body.slug, db)
    if existing:
        raise HTTPException(status_code=409, detail="Slug already taken")
    org = await create_org(
        name=body.name,
        slug=body.slug,
        owner=current_user,
        claude_auth_mode=body.claude_auth_mode,
        default_persona=body.default_persona,
        auto_add_to_projects=body.auto_add_to_projects,
        claude_subscription_type=body.claude_subscription_type,
        db=db,
    )
    return _org_to_response(org)


@router.get("/me", response_model=list[OrgResponse])
async def list_my_orgs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all orgs where the caller is an active member."""
    orgs = await get_user_orgs(current_user.id, db)
    return [_org_to_response(o) for o in orgs]


@router.get("/invites/{token}", response_model=InviteDetail)
async def get_invite_details(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns invite details without requiring auth."""
    membership = await get_invite_by_token(token, db)
    if not membership:
        raise HTTPException(status_code=404, detail="Invite not found or expired")
    org = await get_org(membership.org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")

    invited_by_name: str | None = None
    if membership.invited_by:
        result = await db.execute(select(User).where(User.id == membership.invited_by))
        inviter = result.scalar_one_or_none()
        invited_by_name = inviter.display_name if inviter else None

    return InviteDetail(
        org_name=org.name,
        org_slug=org.slug,
        invite_email=membership.invite_email or "",
        role=membership.role.value,
        persona=membership.default_persona,
        invited_by_name=invited_by_name,
    )


@router.post("/invites/{token}/accept")
async def accept_invite_endpoint(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an org invite. Auth required."""
    membership = await get_invite_by_token(token, db)
    if not membership:
        raise HTTPException(status_code=404, detail="Invite not found or expired")

    updated = await accept_invite(membership, current_user, db)
    user_result = await db.execute(select(User).where(User.id == updated.user_id))
    user = user_result.scalar_one_or_none()
    return _member_to_response(updated, user)


# ---------------------------------------------------------------------------
# /{org_id} ROUTES — param routes after literal routes
# ---------------------------------------------------------------------------


@router.get("/{org_id}", response_model=OrgResponse)
async def get_org_detail(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get org detail. Caller must be an active member."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    m = await get_membership(org_id, current_user.id, db)
    if not m or m.status.value != "active":
        raise HTTPException(status_code=403, detail="Not a member of this org")
    return _org_to_response(org)


@router.patch("/{org_id}", response_model=OrgResponse)
async def update_org(
    org_id: uuid.UUID,
    body: OrgUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update org settings. Admin or owner only."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    m = await get_membership(org_id, current_user.id, db)
    _require_admin(m)

    if body.name is not None:
        org.name = body.name
    if body.claude_auth_mode is not None:
        org.claude_auth_mode = body.claude_auth_mode
    if body.claude_subscription_type is not None:
        org.claude_subscription_type = body.claude_subscription_type
    if body.auto_add_to_projects is not None:
        org.auto_add_to_projects = body.auto_add_to_projects
    if body.default_persona is not None:
        org.default_persona = body.default_persona

    await db.commit()
    await db.refresh(org)
    return _org_to_response(org)


@router.delete("/{org_id}", status_code=204)
async def delete_org(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an org. Owner only."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    m = await get_membership(org_id, current_user.id, db)
    _require_owner(m)

    await db.delete(org)
    await db.commit()


@router.post("/{org_id}/invite")
async def invite_member_endpoint(
    org_id: uuid.UUID,
    body: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a user by email. Admin or owner only."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    m = await get_membership(org_id, current_user.id, db)
    _require_admin(m)

    membership = await invite_member(
        org=org,
        email=body.email,
        role=body.role,
        persona=body.persona,
        invited_by=current_user,
        db=db,
    )
    return {
        "id": str(membership.id),
        "invite_email": membership.invite_email,
        "invite_token": membership.invite_token,
        "role": membership.role.value,
        "status": membership.status.value,
    }


@router.get("/{org_id}/members", response_model=list[OrgMemberResponse])
async def list_members(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all members of an org. Caller must be an active member."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    m = await get_membership(org_id, current_user.id, db)
    if not m or m.status.value != "active":
        raise HTTPException(status_code=403, detail="Not a member of this org")

    result = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == org_id)
    )
    memberships = list(result.scalars().all())

    # Batch-load users for memberships that have a user_id
    user_ids = [mem.user_id for mem in memberships if mem.user_id]
    users_by_id: dict[uuid.UUID, User] = {}
    if user_ids:
        user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in user_result.scalars().all():
            users_by_id[u.id] = u

    return [
        _member_to_response(mem, users_by_id.get(mem.user_id) if mem.user_id else None)
        for mem in memberships
    ]


@router.patch("/{org_id}/members/{member_id}")
async def update_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's role or persona. Admin or owner only."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    caller_m = await get_membership(org_id, current_user.id, db)
    _require_admin(caller_m)

    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.id == member_id,
            OrgMembership.org_id == org_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    # Only owner can promote/demote to owner or change another owner
    if target.role == OrgRole.owner or body.get("role") == "owner":
        _require_owner(caller_m)

    if "role" in body:
        try:
            target.role = OrgRole(body["role"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid role: {body['role']}")
    if "default_persona" in body:
        target.default_persona = body["default_persona"]

    await db.commit()
    await db.refresh(target)

    user: User | None = None
    if target.user_id:
        user_result = await db.execute(select(User).where(User.id == target.user_id))
        user = user_result.scalar_one_or_none()
    return _member_to_response(target, user)


@router.delete("/{org_id}/members/{member_id}", status_code=204)
async def remove_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member. Admin or owner only. Cannot remove the org owner."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    caller_m = await get_membership(org_id, current_user.id, db)
    _require_admin(caller_m)

    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.id == member_id,
            OrgMembership.org_id == org_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == OrgRole.owner:
        raise HTTPException(status_code=400, detail="Cannot remove the org owner")

    await db.delete(target)
    await db.commit()


@router.get("/{org_id}/claude-status")
async def get_claude_status(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check Claude subscription status for the org context."""
    org = await get_org(org_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    m = await get_membership(org_id, current_user.id, db)
    if not m or m.status.value != "active":
        raise HTTPException(status_code=403, detail="Not a member of this org")

    result = await db.execute(
        select(ClaudeCredential).where(ClaudeCredential.user_id == current_user.id)
    )
    cred = result.scalar_one_or_none()
    connected = cred is not None
    return {
        "connected": connected,
        "valid": connected,
        "reason": None if connected else "not_connected",
        "subscription": cred.subscription_type if cred else None,
    }
