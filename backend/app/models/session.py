import enum
import uuid
import secrets
import string
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Enum as SAEnum

from app.core.database import Base


class SessionType(str, enum.Enum):
    canvas = "canvas"
    workspace = "workspace"


class SessionStatus(str, enum.Enum):
    active = "active"
    ended = "ended"


class SessionMemberRole(str, enum.Enum):
    host = "host"
    participant = "participant"
    viewer = "viewer"


def generate_join_code() -> str:
    chars = string.ascii_uppercase + string.digits
    code = ''.join(secrets.choice(chars) for _ in range(4))
    return f"CANVAS-{code}"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    session_type: Mapped[SessionType] = mapped_column(SAEnum(SessionType, name="sessiontype"), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(SAEnum(SessionStatus, name="sessionstatus"), default=SessionStatus.active)

    canvas_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("canvases.id"), nullable=True)
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    livekit_room_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    yjs_room: Mapped[str | None] = mapped_column(String(200), nullable=True)

    host_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    join_code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)

    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list["SessionMember"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class SessionMember(Base):
    __tablename__ = "session_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role: Mapped[SessionMemberRole] = mapped_column(SAEnum(SessionMemberRole, name="sessionmemberrole"), default=SessionMemberRole.participant)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session: Mapped["Session"] = relationship(back_populates="members")
