import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class KnowledgeEntity(Base):
    __tablename__ = "knowledge_entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # concept, technology, decision, component
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # ltree path
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    embedding = mapped_column(Vector(1024), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # canvas, idea, manual
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_knowledge_entities_project_type", "project_id", "entity_type"),
    )


class KnowledgeRelation(Base):
    __tablename__ = "knowledge_relations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(50), nullable=False)  # depends_on, uses, implements, relates_to
    weight: Mapped[float | None] = mapped_column(default=1.0)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_knowledge_relations_project", "project_id"),
        Index("ix_knowledge_relations_source", "source_id"),
        Index("ix_knowledge_relations_target", "target_id"),
    )
