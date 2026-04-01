"""Pydantic v2 schemas for the sessions module.

Hard Rule 2: user IDs always from JWT — never in request bodies.
Hard Rule 10: venue lat/lng never in any response model.
"""

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CreateSessionBody(BaseModel):
    """POST /sessions — tutee selects a tutor from recommendations (UC-3.4)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    request_id: str
    tutor_id: str


class TimeSlotInput(BaseModel):
    """One proposed time slot — POST /sessions/{id}/propose-slots body item."""

    model_config = ConfigDict(str_strip_whitespace=True)

    date: str
    hour_slot: int

    @field_validator("hour_slot")
    @classmethod
    def _hour(cls, v: int) -> int:
        if not 0 <= v <= 23:
            raise ValueError("hour_slot must be between 0 and 23.")
        return v


class ProposeSlotsBody(BaseModel):
    """POST /sessions/{id}/propose-slots — tutor proposes slots (UC-4.7)."""

    model_config = ConfigDict(extra="ignore")

    proposed_slots: list[TimeSlotInput]

    @field_validator("proposed_slots")
    @classmethod
    def _proposed_slots(cls, v: list[TimeSlotInput]) -> list[TimeSlotInput]:
        if not v:
            raise ValueError("At least one slot must be proposed.")
        return v

    @property
    def slots(self) -> list[dict]:
        """Alias for session_service / DB layer (expects list[dict])."""
        return [s.model_dump() for s in self.proposed_slots]


class ConfirmSlotBody(BaseModel):
    """POST /sessions/{id}/confirm-slot — tutee confirms one slot (UC-5.2)."""

    date: str       # YYYY-MM-DD
    hour_slot: int  # 0–23

    @field_validator("hour_slot")
    @classmethod
    def _hour(cls, v: int) -> int:
        if not 0 <= v <= 23:
            raise ValueError("hour_slot must be between 0 and 23.")
        return v


class CancelSessionBody(BaseModel):
    """POST /sessions/{id}/cancel."""
    model_config = ConfigDict(str_strip_whitespace=True)

    reason: str | None = None


class ConfirmVenueBody(BaseModel):
    """POST /sessions/{id}/venue — set venue (UC-5.3, UC-5.4)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    venue_id: str | None = None
    venue_manual: str | None = None

    @field_validator("venue_manual")
    @classmethod
    def _manual(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 200:
            raise ValueError("Manual venue description must be 200 characters or fewer.")
        return v


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class SessionResponse(BaseModel):
    """Full session detail — returned by GET /sessions/{id}, GET /sessions, and all mutations."""
    id: str  # Session UUID (alias for session_id — critical for frontend Accept button)
    session_id: str
    request_id: str | None
    tutee_id: str
    tutor_id: str
    status: str
    duration_hours: int
    academic_level: str
    venue_id: str | None
    venue_manual: str | None
    scheduled_at: str | None
    proposed_slots: list[dict]
    cancel_reason: str | None
    created_at: str
    updated_at: str
    # Venue details resolved from venues table (venue_id sessions only)
    venue_name: str | None = None
    venue_address: str | None = None
    # Optional fields from joined tutoring_requests and users (list_sessions)
    tutee_name: str | None = None
    subjects: list[str] | None = None
    topics: list[str] | None = None
    time_slots: list[dict] | None = None
    urgency_category: str | None = None
    planning_areas: list[str] | None = None
    accessibility_notes: str | None = None

    @classmethod
    def from_db(cls, row: dict) -> "SessionResponse":
        sid = row.get("id") or row.get("session_id", "")
        return cls(
            id=sid,
            session_id=sid,
            request_id=row.get("request_id"),
            tutee_id=row.get("tutee_id", ""),
            tutor_id=row.get("tutor_id", ""),
            status=row.get("status", ""),
            duration_hours=row.get("duration_hours", 1),
            academic_level=row.get("academic_level", ""),
            venue_id=row.get("venue_id"),
            venue_manual=row.get("venue_manual"),
            scheduled_at=str(row["scheduled_at"]) if row.get("scheduled_at") else None,
            proposed_slots=row.get("proposed_slots") or [],
            cancel_reason=row.get("cancel_reason"),
            created_at=str(row.get("created_at", "")),
            updated_at=str(row.get("updated_at", "")),
            venue_name=row.get("venue_name"),
            venue_address=row.get("venue_address"),
            tutee_name=row.get("tutee_name"),
            subjects=row.get("subjects"),
            topics=row.get("topics"),
            time_slots=row.get("time_slots"),
            urgency_category=row.get("urgency_category"),
            planning_areas=row.get("planning_areas"),
            accessibility_notes=row.get("accessibility_notes"),
        )
