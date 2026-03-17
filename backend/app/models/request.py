"""Pydantic v2 request/response schemas for the tutee requests module.

Hard Rule 4: field_validator (@classmethod), ConfigDict.
Hard Rule 2: user_id (tutee_id) always from the JWT — never in request bodies.

SRS 2.2.3 field rules:
  academic_level   — single select from VALID_ACADEMIC_LEVELS
  subjects         — non-empty, each free_text validated (1-100 chars)
  topics           — non-empty, each free_text validated
  planning_areas   — non-empty, each free_text validated
  time_slots       — at least 1, each with ISO date + hour_slot 0-23
  duration_hours   — must be 1, 2, or 4
  urgency_category — assignment_due | exam_soon | general_study
  accessibility_notes — optional, max 256 chars
"""

from datetime import date as DateType
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.utils.validators import validate_free_text

VALID_ACADEMIC_LEVELS: frozenset[str] = frozenset(
    {"Primary", "Secondary", "Junior College", "Polytechnic", "ITE", "University"}
)


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

class TimeSlotInput(BaseModel):
    """One requested time slot: a specific date + hour."""
    model_config = ConfigDict(str_strip_whitespace=True)

    date: str       # ISO format: "YYYY-MM-DD"
    hour_slot: int  # 0–23

    @field_validator("date")
    @classmethod
    def _date(cls, v: str) -> str:
        try:
            DateType.fromisoformat(v)
        except ValueError:
            raise ValueError("date must be in YYYY-MM-DD format.")
        return v

    @field_validator("hour_slot")
    @classmethod
    def _hour(cls, v: int) -> int:
        if not 0 <= v <= 23:
            raise ValueError("hour_slot must be between 0 and 23.")
        return v


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CreateRequestBody(BaseModel):
    """POST /requests — create a new tutoring request (SRS 2.2.3)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    academic_level: str
    subjects: list[str]
    topics: list[str]
    planning_areas: list[str]
    accessibility_needs: list[str] = []
    accessibility_notes: str | None = None
    time_slots: list[TimeSlotInput]
    duration_hours: Literal[1, 2, 4]
    urgency_category: Literal["assignment_due", "exam_soon", "general_study"]

    @field_validator("academic_level")
    @classmethod
    def _academic_level(cls, v: str) -> str:
        if v not in VALID_ACADEMIC_LEVELS:
            raise ValueError(
                f"academic_level must be one of: {sorted(VALID_ACADEMIC_LEVELS)}."
            )
        return v

    @field_validator("subjects")
    @classmethod
    def _subjects(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one subject must be provided.")
        return [validate_free_text(s, max_len=100) for s in v]

    @field_validator("topics")
    @classmethod
    def _topics(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one topic must be provided.")
        return [validate_free_text(t, max_len=100) for t in v]

    @field_validator("planning_areas")
    @classmethod
    def _planning_areas(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one planning area must be provided.")
        return [validate_free_text(a, max_len=100) for a in v]

    @field_validator("time_slots")
    @classmethod
    def _time_slots(cls, v: list[TimeSlotInput]) -> list[TimeSlotInput]:
        if not v:
            raise ValueError("At least one time slot must be provided.")
        return v

    @field_validator("accessibility_notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        if len(v) > 256:
            raise ValueError("accessibility_notes must be at most 256 characters.")
        return v


class BroadenRequestBody(BaseModel):
    """PATCH /requests/{id} — broaden search criteria (UC-3.6, SRS 2.3).

    All fields optional; only send what needs to be broadened.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    subjects: list[str] | None = None
    topics: list[str] | None = None
    planning_areas: list[str] | None = None
    time_slots: list[TimeSlotInput] | None = None
    duration_hours: Literal[1, 2, 4] | None = None
    urgency_category: Literal["assignment_due", "exam_soon", "general_study"] | None = None

    @field_validator("subjects")
    @classmethod
    def _subjects(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("subjects cannot be empty if provided.")
        return [validate_free_text(s, max_len=100) for s in v]

    @field_validator("topics")
    @classmethod
    def _topics(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("topics cannot be empty if provided.")
        return [validate_free_text(t, max_len=100) for t in v]

    @field_validator("planning_areas")
    @classmethod
    def _planning_areas(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("planning_areas cannot be empty if provided.")
        return [validate_free_text(a, max_len=100) for a in v]


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class LearningNeedItem(BaseModel):
    urgency_level: str
    unfulfilled_count: int


class TutoringRequestResponse(BaseModel):
    """Returned by GET/POST/PATCH /requests and GET /requests/{id}."""
    request_id: str
    tutee_id: str
    academic_level: str
    subjects: list[str]
    topics: list[str]
    planning_areas: list[str]
    accessibility_needs: list[str]
    accessibility_notes: str | None
    time_slots: list[dict]
    duration_hours: int
    urgency_category: str
    urgency_level: str
    status: str
    learning_need: LearningNeedItem | None
    created_at: str

    @classmethod
    def from_db(
        cls,
        row: dict,
        need_row: dict | None = None,
    ) -> "TutoringRequestResponse":
        need = None
        if need_row:
            need = LearningNeedItem(
                urgency_level=need_row.get("urgency_level", "normal"),
                unfulfilled_count=need_row.get("unfulfilled_count", 0),
            )
        return cls(
            request_id=row["id"],
            tutee_id=row.get("tutee_id", ""),
            academic_level=row.get("academic_level", ""),
            subjects=row.get("subjects") or [],
            topics=row.get("topics") or [],
            planning_areas=row.get("planning_areas") or [],
            accessibility_needs=row.get("accessibility_needs") or [],
            accessibility_notes=row.get("accessibility_notes"),
            time_slots=row.get("time_slots") or [],
            duration_hours=row.get("duration_hours", 1),
            urgency_category=row.get("urgency_category", ""),
            urgency_level=row.get("urgency_level", "normal"),
            status=row.get("status", "open"),
            learning_need=need,
            created_at=str(row.get("created_at", "")),
        )


class IncomingRequestItem(BaseModel):
    """Returned by GET /tutor/requests/incoming — tutor-facing view."""
    session_id: str
    request_id: str | None
    academic_level: str
    subjects: list[str]
    topics: list[str]
    planning_areas: list[str]
    time_slots: list[dict]
    duration_hours: int
    urgency_level: str
    created_at: str
