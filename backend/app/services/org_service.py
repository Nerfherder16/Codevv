from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization, OrgMembership, OrgRole, OrgMemberStatus
from app.models.project import Project, ProjectMember
from app.models.user import User


async def create_org(
    name: str,
    slug: str,
    owner: User,
    claude_auth_mode: str = "oauth_per_user",
    default_persona: str = "creator",
    auto_add_to_projects: bool = True,
    claude_subscription_type: str | None = None,
    db: AsyncSession = None,
) -> Organization:
    """Create a new organization and add the owner as an active member."""
    org = Organization(
        name=name,
        slug=slug,
        owner_id=owner.id,
        claude_auth_mode=claude_auth_mode,
        default_persona=default_persona,
        auto_add_to_projects=auto_add_to_projects,
        claude_subscription_type=claude_subscription_type,
    )
    db.add(org)
    await db.flush()  # get org.id

    # Add owner as active member
    membership = OrgMembership(
        org_id=org.id,
        user_id=owner.id,
        role=OrgRole.owner,
        default_persona=default_persona,
        status=OrgMemberStatus.active,
        joined_at=datetime.now(timezone.utc),
    )
    db.add(membership)
    await db.commit()
    await db.refresh(org)
    return org


async def get_user_orgs(user_id: uuid.UUID, db: AsyncSession) -> list[Organization]:
    """Get all orgs where user is an active member."""
    result = await db.execute(
        select(Organization)
        .join(OrgMembership, OrgMembership.org_id == Organization.id)
        .where(
            OrgMembership.user_id == user_id,
            OrgMembership.status == OrgMemberStatus.active,
        )
        .order_by(Organization.created_at)
    )
    return list(result.scalars().all())


async def get_org(org_id: uuid.UUID, db: AsyncSession) -> Organization | None:
    """Get org by ID."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    return result.scalar_one_or_none()


async def get_org_by_slug(slug: str, db: AsyncSession) -> Organization | None:
    """Get org by slug."""
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


async def get_membership(org_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> OrgMembership | None:
    """Get a user's membership in an org."""
    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == org_id,
            OrgMembership.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def invite_member(
    org: Organization,
    email: str,
    role: str,
    persona: str,
    invited_by: User,
    db: AsyncSession,
) -> OrgMembership:
    """Create an invite OrgMembership with a token."""
    # Check if already invited/active
    existing = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == org.id,
            OrgMembership.invite_email == email,
        )
    )
    existing_membership = existing.scalar_one_or_none()
    if existing_membership:
        # Re-issue token (overwrite)
        existing_membership.invite_token = str(uuid.uuid4())
        await db.commit()
        await db.refresh(existing_membership)
        return existing_membership

    token = str(uuid.uuid4())
    membership = OrgMembership(
        org_id=org.id,
        user_id=None,
        role=OrgRole(role) if role in [r.value for r in OrgRole] else OrgRole.member,
        default_persona=persona,
        status=OrgMemberStatus.invited,
        invite_email=email,
        invite_token=token,
        invited_by=invited_by.id,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return membership


async def get_invite_by_token(token: str, db: AsyncSession) -> OrgMembership | None:
    """Get invite membership by token. Only returns if status is 'invited'."""
    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.invite_token == token,
            OrgMembership.status == OrgMemberStatus.invited,
        )
    )
    return result.scalar_one_or_none()


async def accept_invite(
    membership: OrgMembership,
    user: User,
    db: AsyncSession,
) -> OrgMembership:
    """Accept an invite: activate membership and optionally auto-add to projects."""
    membership.status = OrgMemberStatus.active
    membership.user_id = user.id
    membership.joined_at = datetime.now(timezone.utc)
    await db.flush()

    # Load org to check auto_add_to_projects
    org = await get_org(membership.org_id, db)
    if org and org.auto_add_to_projects:
        await _auto_add_to_projects(org, user, membership.default_persona, db)

    await db.commit()
    await db.refresh(membership)
    return membership


async def _auto_add_to_projects(
    org: Organization,
    user: User,
    persona: str,
    db: AsyncSession,
) -> None:
    """Add user to all org projects they aren't already a member of."""
    from app.models.project import ProjectRole, ProjectPersona
    # Get all org projects
    result = await db.execute(
        select(Project).where(Project.org_id == org.id)
    )
    projects = list(result.scalars().all())

    for project in projects:
        # Check if already a member
        existing = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user.id,
            )
        )
        if existing.scalar_one_or_none():
            continue
        # Add as editor with specified persona
        persona_value = ProjectPersona(persona) if persona in [p.value for p in ProjectPersona] else ProjectPersona.creator
        member = ProjectMember(
            project_id=project.id,
            user_id=user.id,
            role=ProjectRole.editor,
            persona=persona_value,
        )
        db.add(member)
    # No commit here — caller commits


async def create_personal_org(user: User, db: AsyncSession) -> Organization:
    """Auto-create a personal workspace org for a user."""
    # Derive slug from email prefix
    email_prefix = user.email.split("@")[0].lower()
    slug_base = re.sub(r"[^a-z0-9-]", "-", email_prefix) + "-personal"
    slug_base = re.sub(r"-+", "-", slug_base).strip("-")

    # Ensure uniqueness
    slug = slug_base
    counter = 1
    while await get_org_by_slug(slug, db):
        slug = f"{slug_base}-{counter}"
        counter += 1

    name = f"{user.display_name}'s Workspace"
    org = await create_org(
        name=name,
        slug=slug,
        owner=user,
        claude_auth_mode="oauth_per_user",
        default_persona="developer",
        auto_add_to_projects=False,
        db=db,
    )
    user.personal_org_id = org.id
    await db.commit()
    return org
