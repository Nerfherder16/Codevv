"""Session management routes — Phase 5."""

import uuid
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.session import Session, SessionMember, SessionType, SessionStatus, SessionMemberRole, generate_join_code
from app.api.routes.projects import get_project_with_access

# -------------------------------------------------------------------
# Routers
# -------------------------------------------------------------------

router = APIRouter(prefix="/projects/{project_id}/sessions", tags=["sessions"])
join_router = APIRouter(prefix="/sessions", tags=["sessions"])


# -------------------------------------------------------------------
# Pydantic models
# -------------------------------------------------------------------

class SessionCreate(BaseModel):
    session_type: SessionType
    canvas_id: Optional[uuid.UUID] = None
    workspace_id: Optional[uuid.UUID] = None
    livekit_room_name: Optional[str] = None


class JoinRequest(BaseModel):
    mode: str = "collaborate"  # "present" | "draw" | "collaborate"


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def _member_out(m: SessionMember) -> dict:
    return {
        "id": str(m.id),
        "user_id": str(m.user_id),
        "role": m.role.value,
        "joined_at": m.joined_at.isoformat(),
    }


def _session_out(s: Session) -> dict:
    return {
        "id": str(s.id),
        "project_id": str(s.project_id),
        "session_type": s.session_type.value,
        "status": s.status.value,
        "canvas_id": str(s.canvas_id) if s.canvas_id else None,
        "workspace_id": str(s.workspace_id) if s.workspace_id else None,
        "livekit_room_name": s.livekit_room_name,
        "yjs_room": s.yjs_room,
        "host_user_id": str(s.host_user_id),
        "join_code": s.join_code,
        "created_at": s.created_at.isoformat(),
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "members": [_member_out(m) for m in s.members],
    }


async def _get_session_or_404(session_id: uuid.UUID, project_id: uuid.UUID, db: AsyncSession) -> Session:
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.project_id == project_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# -------------------------------------------------------------------
# Project-scoped routes
# -------------------------------------------------------------------

@router.post("", status_code=201)
async def create_session(
    project_id: uuid.UUID,
    req: SessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    session = Session(
        project_id=project_id,
        session_type=req.session_type,
        canvas_id=req.canvas_id,
        workspace_id=req.workspace_id,
        livekit_room_name=req.livekit_room_name,
        host_user_id=user.id,
        join_code=generate_join_code(),
    )
    db.add(session)
    await db.flush()  # get session.id

    # Set yjs_room based on type
    if req.session_type == SessionType.canvas and req.canvas_id:
        session.yjs_room = f"canvas:{req.canvas_id}:session:{session.id}"
    else:
        session.yjs_room = f"session:{session.id}"

    # Add host as first member
    host_member = SessionMember(
        session_id=session.id,
        user_id=user.id,
        role=SessionMemberRole.host,
    )
    db.add(host_member)
    await db.commit()
    await db.refresh(session, ["members"])

    return _session_out(session)


@router.get("")
async def list_sessions(
    project_id: uuid.UUID,
    include_ended: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    q = select(Session).where(Session.project_id == project_id)
    if not include_ended:
        q = q.where(Session.status == SessionStatus.active)
    q = q.order_by(Session.created_at.desc())
    result = await db.execute(q)
    sessions = result.scalars().all()
    for s in sessions:
        await db.refresh(s, ["members"])
    return [_session_out(s) for s in sessions]


@router.get("/{session_id}")
async def get_session(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    session = await _get_session_or_404(session_id, project_id, db)
    await db.refresh(session, ["members"])
    return _session_out(session)


@router.post("/{session_id}/join", status_code=200)
async def join_session(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    req: JoinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    session = await _get_session_or_404(session_id, project_id, db)

    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=400, detail="Session has ended")

    existing = await db.execute(
        select(SessionMember).where(
            SessionMember.session_id == session_id,
            SessionMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        await db.refresh(session, ["members"])
        return _session_out(session)

    role = SessionMemberRole.viewer if req.mode == "present" else SessionMemberRole.participant
    member = SessionMember(
        session_id=session.id,
        user_id=user.id,
        role=role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(session, ["members"])
    return _session_out(session)


@router.post("/{session_id}/end", status_code=200)
async def end_session(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    session = await _get_session_or_404(session_id, project_id, db)

    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=400, detail="Session already ended")

    if session.host_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the host can end the session")

    session.status = SessionStatus.ended
    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session, ["members"])
    return _session_out(session)


# -------------------------------------------------------------------
# Join-code routes (no project_id in path)
# -------------------------------------------------------------------

@join_router.get("/join/{code}")
async def resolve_join_code(
    code: str,
    mode: str = "collaborate",
    db: AsyncSession = Depends(get_db),
):
    """Resolve a join code. No auth required for 'present' mode."""
    result = await db.execute(
        select(Session).where(Session.join_code == code)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid join code")
    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=400, detail="Session has ended")

    viewer_token = None
    if mode == "present":
        viewer_token = secrets.token_urlsafe(32)

    return {
        "session_id": str(session.id),
        "project_id": str(session.project_id),
        "session_type": session.session_type.value,
        "status": session.status.value,
        "yjs_room": session.yjs_room,
        "livekit_room_name": session.livekit_room_name,
        "join_code": session.join_code,
        "viewer_token": viewer_token,
    }


@join_router.post("/join/{code}", status_code=200)
async def join_by_code(
    code: str,
    req: JoinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a session using a join code. Auth required."""
    result = await db.execute(
        select(Session).where(Session.join_code == code)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid join code")
    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=400, detail="Session has ended")

    existing = await db.execute(
        select(SessionMember).where(
            SessionMember.session_id == session.id,
            SessionMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        await db.refresh(session, ["members"])
        return _session_out(session)

    role = SessionMemberRole.viewer if req.mode == "present" else SessionMemberRole.participant
    member = SessionMember(
        session_id=session.id,
        user_id=user.id,
        role=role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(session, ["members"])
    return _session_out(session)
