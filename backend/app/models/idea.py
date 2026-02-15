import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Float, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from app.core.database import Base
import enum


class IdeaStatus(str, enum.Enum):
    draft = "draft"
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"
    implemented = "implemented"


class Idea(Base):
    __tablename__ = "ideas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[IdeaStatus] = mapped_column(SAEnum(IdeaStatus), default=IdeaStatus.draft)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    feasibility_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    feasibility_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding = mapped_column(Vector(1024), nullable=True)  # bge-large = 1024 dims
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    project: Mapped["Project"] = relationship(back_populates="ideas")
    votes: Mapped[list["IdeaVote"]] = relationship(back_populates="idea", cascade="all, delete-orphan")
    comments: Mapped[list["IdeaComment"]] = relationship(back_populates="idea", cascade="all, delete-orphan")


class IdeaVote(Base):
    __tablename__ = "idea_votes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    idea_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ideas.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    value: Mapped[int] = mapped_column(Integer, nullable=False)  # +1 or -1
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    idea: Mapped["Idea"] = relationship(back_populates="votes")


class IdeaComment(Base):
    __tablename__ = "idea_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    idea_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ideas.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    idea: Mapped["Idea"] = relationship(back_populates="comments")
