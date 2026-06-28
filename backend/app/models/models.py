"""
SQLAlchemy models for HomeReady.
One table per core domain — keep it lean for MVP.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column

from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base
import enum


class JourneyStage(str, enum.Enum):
    READINESS = "readiness"
    EVALUATION = "evaluation"
    OFFER = "offer"
    LEGAL = "legal"
    EXCHANGE = "exchange"
    HOMEOWNER = "homeowner"


class StageStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


# ── Journey (one per user, tracks stage progress) ─────────────────────────
class Journey(Base):
    __tablename__ = "journeys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # Supabase auth UUID, no FK
    current_stage: Mapped[JourneyStage] = mapped_column(
        Enum(JourneyStage), default=JourneyStage.READINESS
    )
    stage_statuses: Mapped[dict] = mapped_column(JSON, default=dict)
    journey_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Checklist items (post-completion tasks) ───────────────────────────────
class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # Supabase auth UUID, no FK
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), default="")
    deadline_days: Mapped[int] = mapped_column(Integer, nullable=True)  # days after completion date
    is_complete: Mapped[bool] = mapped_column(default=False)
    stage: Mapped[JourneyStage] = mapped_column(Enum(JourneyStage))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str] = mapped_column(String(32), default="admin")


# ── Saved properties (shortlist) ──────────────────────────────────────────
class SavedProperty(Base):
    __tablename__ = "saved_properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # Supabase auth UUID, no FK
    rightmove_url: Mapped[str] = mapped_column(String(500), nullable=True)
    address: Mapped[str] = mapped_column(String(500), nullable=True)
    postcode: Mapped[str] = mapped_column(String(20), nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=True)
    property_type: Mapped[str] = mapped_column(String(64), nullable=True)
    bedrooms: Mapped[int] = mapped_column(Integer, nullable=True)
    days_on_market: Mapped[int] = mapped_column(Integer, nullable=True)
    trust_score: Mapped[int] = mapped_column(Integer, nullable=True)
    red_flag_count: Mapped[int] = mapped_column(Integer, default=0)
    green_flag_count: Mapped[int] = mapped_column(Integer, default=0)
    decoded_result: Mapped[dict] = mapped_column(JSON, nullable=True)
    notes: Mapped[str] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
