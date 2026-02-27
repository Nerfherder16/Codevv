import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, create_access_token, get_current_user
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.project_invite import ProjectInvite, InviteStatus
from app.schemas.invite import (
    InviteCreate,
    InviteResponse,
    InviteAcceptRequest,
    InviteAcceptWithRegisterRequest,
    InviteInfo,
)
from app.schemas.auth import TokenResponse
from app.services import invite as invite_service
import structlog

logger = structlog.get_logger()
router = APIRouter(tags=["invites"])


async def _get_project_as_owner(
    project_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member or member.role.value != "owner":
        raise HTTPException(
            status_code=403, detail="Only project owners can manage invites"
        )

    return project


@router.post("/projects/{project_id}/invites", response_model=InviteResponse)
async def create_invite(
    project_id: uuid.UUID,
    req: InviteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_as_owner(project_id, user, db)
    invite = await invite_service.create_invite(project, req.email, req.role, user, db)
    return InviteResponse(
        id=invite.id,
        project_id=invite.project_id,
        project_name=project.name,
        email=invite.email,
        role=invite.role,
        status=invite.status.value,
        invited_by_name=user.display_name,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
    )


@router.get("/projects/{project_id}/invites", response_model=list[InviteResponse])
async def list_invites(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_as_owner(project_id, user, db)
    invites = await invite_service.list_pending(project_id, db)
    return [
        InviteResponse(
            id=inv.id,
            project_id=inv.project_id,
            project_name=project.name,
            email=inv.email,
            role=inv.role,
            status=inv.status.value,
            invited_by_name=user.display_name,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
        )
        for inv in invites
    ]


@router.delete("/invites/{invite_id}", status_code=200)
async def revoke_invite(
    invite_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectInvite).where(ProjectInvite.id == invite_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    await _get_project_as_owner(invite.project_id, user, db)
    await invite_service.revoke_invite(invite_id, db)
    return {"message": "Invite revoked"}


@router.get("/invites/mine", response_model=list[InviteResponse])
async def my_invites(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return pending invites addressed to the current user's email."""
    result = await db.execute(
        select(ProjectInvite).where(
            ProjectInvite.email == user.email,
            ProjectInvite.status == InviteStatus.pending,
            ProjectInvite.expires_at > datetime.now(timezone.utc),
        )
    )
    invites = result.scalars().all()

    responses = []
    for inv in invites:
        proj = (
            await db.execute(select(Project).where(Project.id == inv.project_id))
        ).scalar_one()
        inviter = (
            await db.execute(select(User).where(User.id == inv.invited_by))
        ).scalar_one()
        responses.append(
            InviteResponse(
                id=inv.id,
                project_id=inv.project_id,
                project_name=proj.name,
                email=inv.email,
                role=inv.role,
                status=inv.status.value,
                invited_by_name=inviter.display_name,
                created_at=inv.created_at,
                expires_at=inv.expires_at,
            )
        )
    return responses


@router.get("/invites/by-token/{token}", response_model=InviteInfo)
async def get_invite_by_token(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ProjectInvite).where(ProjectInvite.token == token))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    # Load project and inviter
    project_result = await db.execute(
        select(Project).where(Project.id == invite.project_id)
    )
    project = project_result.scalar_one()

    inviter_result = await db.execute(select(User).where(User.id == invite.invited_by))
    inviter = inviter_result.scalar_one()

    is_expired = (
        invite.expires_at < datetime.now(timezone.utc)
        or invite.status != InviteStatus.pending
    )

    return InviteInfo(
        project_name=project.name,
        inviter_name=inviter.display_name,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        is_expired=is_expired,
    )


@router.post("/invites/accept")
async def accept_invite(
    req: InviteAcceptRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invite = await invite_service.accept_invite(req.token, user, db)
    return {"message": "Invite accepted", "project_id": str(invite.project_id)}


@router.post("/invites/{invite_id}/accept")
async def accept_invite_by_id(
    invite_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an invite by ID (for logged-in users viewing their pending invites)."""
    result = await db.execute(
        select(ProjectInvite).where(ProjectInvite.id == invite_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.email != user.email:
        raise HTTPException(status_code=403, detail="This invite is not for you")

    accepted = await invite_service.accept_invite(invite.token, user, db)
    return {"message": "Invite accepted", "project_id": str(accepted.project_id)}


@router.post("/invites/accept-register", response_model=TokenResponse)
async def accept_invite_with_register(
    req: InviteAcceptWithRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    # Get the invite first to know the email
    result = await db.execute(
        select(ProjectInvite).where(ProjectInvite.token == req.token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.status != InviteStatus.pending:
        raise HTTPException(status_code=400, detail=f"Invite is {invite.status.value}")
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = InviteStatus.expired
        raise HTTPException(status_code=400, detail="Invite has expired")

    # Check if email already registered
    existing = await db.execute(select(User).where(User.email == invite.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Email already registered. Please log in and accept the invite.",
        )

    # Register the user
    new_user = User(
        id=uuid.uuid4(),
        email=invite.email,
        display_name=req.display_name,
        password_hash=hash_password(req.password),
    )
    db.add(new_user)
    await db.flush()

    # Accept the invite
    await invite_service.accept_invite(req.token, new_user, db)

    token = create_access_token(str(new_user.id), new_user.email)
    return TokenResponse(access_token=token)
