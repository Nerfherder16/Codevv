import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Enum as SAEnum
from app.core.database import Base


class RuleEnforcement(str, enum.Enum):
    mandatory = "mandatory"  # Must be followed
    recommended = "recommended"  # Should be followed
    advisory = "advisory"  # Nice to have


class RuleScope(str, enum.Enum):
    architecture = "architecture"
    compliance = "compliance"
    security = "security"
    financial = "financial"
    operational = "operational"
    coding = "coding"


class BusinessRule(Base):
    __tablename__ = "business_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    enforcement: Mapped[RuleEnforcement] = mapped_column(
        SAEnum(RuleEnforcement), default=RuleEnforcement.recommended
    )
    scope: Mapped[RuleScope] = mapped_column(SAEnum(RuleScope), nullable=False)

    # Versioning
    version: Mapped[int] = mapped_column(default=1)
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Recall sync reference
    recall_memory_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
