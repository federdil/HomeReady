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


# ── Schools (reference data, loaded from the DfE GIAS bulk file) ──────────
# Held locally rather than queried live: the public schools APIs the previous
# implementation used have both been withdrawn, and the bulk file is the only
# reliable source. Positions are British National Grid metres, which makes a
# radius query a plain bounding box plus Pythagoras — no PostGIS needed.
class School(Base):
    __tablename__ = "schools"

    urn: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    postcode: Mapped[str] = mapped_column(String(16), nullable=True)
    phase: Mapped[str] = mapped_column(String(64), nullable=True)
    establishment_type: Mapped[str] = mapped_column(String(128), nullable=True)
    easting: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    northing: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    local_authority: Mapped[str] = mapped_column(String(128), nullable=True)
    # GIAS carries no Ofsted judgement; left null until a rating source is
    # wired in, and rendered as "not available" rather than guessed.
    ofsted_rating: Mapped[str] = mapped_column(String(64), nullable=True)


# ── Cached external signals ───────────────────────────────────────────────
class SignalCache(Base):
    __tablename__ = "signal_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Saved properties (shortlist) ──────────────────────────────────────────
class Persona(Base):
    """Who the buyer is and what they are optimising for.

    Captured once, then used to weight every property assessment. Weights and
    workplaces are JSON because they are always read and written as a whole and
    their shape is expected to keep moving.
    """
    __tablename__ = "personas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(120), default="My search")
    preset_key: Mapped[str] = mapped_column(String(64), nullable=True)

    price_min: Mapped[int] = mapped_column(Integer, nullable=True)
    price_max: Mapped[int] = mapped_column(Integer, nullable=True)
    deposit: Mapped[int] = mapped_column(Integer, nullable=True)

    min_bedrooms: Mapped[int] = mapped_column(Integer, default=1)
    needs_outdoor_space: Mapped[bool] = mapped_column(default=False)
    needs_parking: Mapped[bool] = mapped_column(default=False)
    # Built forms from app/services/property_style.py: ["flat", "terraced"].
    # Empty means no preference, which is not the same as preferring nothing.
    property_types: Mapped[list] = mapped_column(JSON, default=list)
    # Architectural periods from the same module: ["victorian", "new_build"].
    preferred_periods: Mapped[list] = mapped_column(JSON, default=list)
    min_lease_years: Mapped[int] = mapped_column(Integer, nullable=True)

    # {"commute": 90, "safety": 60, ...} on a 0-100 scale.
    weights: Mapped[dict] = mapped_column(JSON, default=dict)
    # [{"label","postcode","latitude","longitude","max_minutes","modes"}]
    workplaces: Mapped[list] = mapped_column(JSON, default=list)
    # The parts of London the buyer already wants to live in, which is a
    # different question from where they have to travel to:
    # [{"label","postcode","latitude","longitude","district"}]
    preferred_areas: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


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

    # ── Map + scoring ──────────────────────────────────────────────────────
    latitude: Mapped[float] = mapped_column(nullable=True)
    longitude: Mapped[float] = mapped_column(nullable=True)
    # Full Signal-shaped enrichment payload, so the UI can render provenance
    # and "no data" states without a second round trip.
    enrichment: Mapped[dict] = mapped_column(JSON, nullable=True)
    persona_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    # False once Rightmove reports the listing gone (sold, let, or withdrawn).
    is_active: Mapped[bool] = mapped_column(default=True)
    fit_score: Mapped[int] = mapped_column(Integer, nullable=True)
    # Share of the persona's total weight that had data behind it.
    fit_coverage: Mapped[int] = mapped_column(Integer, nullable=True)
