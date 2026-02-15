import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
import enum


class ScaffoldStatus(str, enum.Enum):
    pending = "pending"
    generating = "generating"
    review = "review"
    approved = "approved"
    rejected = "rejected"
    failed = "failed"


class ScaffoldJob(Base):
    __tablename__ = "scaffold_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    canvas_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("canvases.id"), nullable=False)
    component_ids: Mapped[list] = mapped_column(JSON, nullable=False)  # list of component UUIDs
    spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # LLM-generated spec
    generated_files: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {path: content}
    status: Mapped[ScaffoldStatus] = mapped_column(SAEnum(ScaffoldStatus), default=ScaffoldStatus.pending)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
