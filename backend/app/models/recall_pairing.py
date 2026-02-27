from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base
from datetime import datetime, timezone
import uuid


class RecallPairing(Base):
    __tablename__ = "recall_pairings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recall_url: Mapped[str] = mapped_column(String(500), nullable=False)
    instance_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    pairing_token: Mapped[str] = mapped_column(String(500), nullable=False)
    client_name: Mapped[str] = mapped_column(String(100), default="codevv")
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
