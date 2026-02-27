import secrets
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import get_settings
from app.models.project_invite import ProjectInvite, InviteStatus
from app.models.project import Project, ProjectMember, ProjectRole
from app.models.user import User
from app.services.email import send_invite_email
import structlog

logger = structlog.get_logger()
settings = get_settings()


async def create_invite(
    project: Project,
    email: str,
    role: str,
    inviter: User,
    db: AsyncSession,
) -> ProjectInvite:
    # Check for existing pending invite
    existing = await db.execute(
        select(ProjectInvite).where(
            ProjectInvite.project_id == project.id,
            ProjectInvite.email == email,
            ProjectInvite.status == InviteStatus.pending,
        )
    )
    if existing.scalar_one_or_none():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400, detail="Pending invite already exists for this email"
        )

    # Check if user is already a member
    existing_member = await db.execute(
        select(ProjectMember)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project.id, User.email == email)
    )
    if existing_member.scalar_one_or_none():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400, detail="User is already a member of this project"
        )

    token = secrets.token_urlsafe(48)
    invite = ProjectInvite(
        id=uuid.uuid4(),
        project_id=project.id,
        email=email,
        role=role,
        token=token,
        invited_by=inviter.id,
        expires_at=datetime.now(timezone.utc)
        + timedelta(hours=settings.invite_token_expire_hours),
    )
    db.add(invite)
    await db.flush()

    await send_invite_email(email, project.name, inviter.display_name, token)
    logger.info("invite.created", project=project.name, email=email, token=token)
    return invite


async def accept_invite(token: str, user: User, db: AsyncSession) -> ProjectInvite:
    result = await db.execute(select(ProjectInvite).where(ProjectInvite.token == token))
    invite = result.scalar_one_or_none()
    if not invite:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Invite not found")

    if invite.status != InviteStatus.pending:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Invite is {invite.status.value}")

    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = InviteStatus.expired
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Invite has expired")

    # Add user as project member
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=invite.project_id,
        user_id=user.id,
        role=ProjectRole(invite.role),
    )
    db.add(member)

    invite.status = InviteStatus.accepted
    invite.accepted_by = user.id
    invite.accepted_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info("invite.accepted", project_id=str(invite.project_id), user=user.email)
    return invite


async def list_pending(project_id: uuid.UUID, db: AsyncSession) -> list[ProjectInvite]:
    result = await db.execute(
        select(ProjectInvite)
        .where(
            ProjectInvite.project_id == project_id,
            ProjectInvite.status == InviteStatus.pending,
        )
        .order_by(ProjectInvite.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_invite(invite_id: uuid.UUID, db: AsyncSession) -> ProjectInvite:
    result = await db.execute(
        select(ProjectInvite).where(ProjectInvite.id == invite_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Invite not found")

    if invite.status != InviteStatus.pending:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Can only revoke pending invites")

    invite.status = InviteStatus.revoked
    await db.flush()
    logger.info("invite.revoked", invite_id=str(invite_id))
    return invite
