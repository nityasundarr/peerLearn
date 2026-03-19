"""Pydantic v2 request and response schemas for the tutor profile module.

Hard Rule 4: field_validator (@classmethod), ConfigDict.
Hard Rule 2: user_id always derived from the JWT — never in request bodies.

SRS 2.2.2 field rules:
  academic_levels  — non-empty subset of VALID_ACADEMIC_LEVELS
  subjects         — non-empty, each [A-Za-z0-9 \\-'], 1-100 chars
  topics           — list of {subject, topic}; topic validated same as subject
  planning_areas   — non-empty, same free-text validation
  max_weekly_hours — one of {2, 3, 5, 8, 10}
  accessibility_notes — optional, 1–100 chars
  day_of_week      — 0 (Sun) … 6 (Sat)
  hour_slot        — 0 … 23
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.validators import validate_free_text

# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------

VALID_ACADEMIC_LEVELS: frozenset[str] = frozenset(
    {"Primary", "Secondary", "Junior College", "Polytechnic", "ITE", "University"}
)

VALID_MAX_WEEKLY_HOURS: frozenset[int] = frozenset({2, 3, 5, 8, 10})


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

class TopicInput(BaseModel):
    """One (subject, topic) pair inside a create/update request."""
    model_config = ConfigDict(str_strip_whitespace=True)

    subject: str
    topic: str

    @field_validator("subject", "topic")
    @classmethod
    def _text(cls, v: str) -> str:
        return validate_free_text(v, max_len=100)


class TopicItem(BaseModel):
    """One (subject, topic) pair in a response."""
    subject: str
    topic: str


class AvailabilitySlot(BaseModel):
    """One (day_of_week, hour_slot) pair — used in both requests and responses."""

    day_of_week: int  # 0=Sunday … 6=Saturday
    hour_slot: int    # 0=midnight … 23=11 PM

    @field_validator("day_of_week")
    @classmethod
    def _day(cls, v: int) -> int:
        if not 0 <= v <= 6:
            raise ValueError("day_of_week must be between 0 (Sun) and 6 (Sat).")
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

class TutorProfileRequest(BaseModel):
    """Body for POST /tutor-profile and PUT /tutor-profile.

    All fields are mandatory (SRS 2.2.2 — profile cannot be submitted with
    missing mandatory fields).
    Accepts tutor_topics (frontend) as alias for topics.
    """
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    academic_levels: list[str]
    subjects: list[str]
    topics: list[TopicInput] = Field(alias="tutor_topics")
    planning_areas: list[str]
    accessibility_capabilities: list[str] = []
    accessibility_notes: str | None = None
    max_weekly_hours: int
    is_active_mode: bool = False

    @field_validator("academic_levels")
    @classmethod
    def _academic_levels(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one academic level must be selected.")
        invalid = [lvl for lvl in v if lvl not in VALID_ACADEMIC_LEVELS]
        if invalid:
            raise ValueError(
                f"Invalid academic levels: {invalid}. "
                f"Must be one of: {sorted(VALID_ACADEMIC_LEVELS)}."
            )
        return list(dict.fromkeys(v))  # deduplicate, preserve order

    @field_validator("subjects")
    @classmethod
    def _subjects(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one subject must be provided.")
        return [validate_free_text(s, max_len=100) for s in v]

    @field_validator("planning_areas")
    @classmethod
    def _planning_areas(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one planning area must be provided.")
        return [validate_free_text(a, max_len=100) for a in v]

    @field_validator("accessibility_capabilities")
    @classmethod
    def _accessibility(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v]

    @field_validator("accessibility_notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        return validate_free_text(v.strip(), max_len=100)

    @field_validator("max_weekly_hours")
    @classmethod
    def _max_hours(cls, v: int) -> int:
        if v not in VALID_MAX_WEEKLY_HOURS:
            raise ValueError(
                f"max_weekly_hours must be one of: {sorted(VALID_MAX_WEEKLY_HOURS)}."
            )
        return v


class SetModeRequest(BaseModel):
    """Body for PATCH /tutor-profile/mode."""
    is_active_mode: bool


class AvailabilityRequest(BaseModel):
    """Body for PUT /tutor-profile/availability."""
    slots: list[AvailabilitySlot]


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class TutorProfileResponse(BaseModel):
    """Returned by GET /tutor-profile, POST /tutor-profile, PUT /tutor-profile,
    and PATCH /tutor-profile/mode.
    """
    user_id: str
    academic_levels: list[str]
    subjects: list[str]
    topics: list[TopicItem]
    planning_areas: list[str]
    accessibility_capabilities: list[str]
    accessibility_notes: str | None
    max_weekly_hours: int
    is_active_mode: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_db(
        cls,
        profile_row: dict,
        topic_rows: list[dict],
    ) -> "TutorProfileResponse":
        return cls(
            user_id=profile_row["user_id"],
            academic_levels=profile_row.get("academic_levels") or [],
            subjects=profile_row.get("subjects") or [],
            topics=[
                TopicItem(subject=t["subject"], topic=t["topic"])
                for t in topic_rows
            ],
            planning_areas=profile_row.get("planning_areas") or [],
            accessibility_capabilities=profile_row.get("accessibility_capabilities") or [],
            accessibility_notes=profile_row.get("accessibility_notes"),
            max_weekly_hours=profile_row.get("max_weekly_hours", 5),
            is_active_mode=profile_row.get("is_active_mode", False),
            created_at=str(profile_row.get("created_at", "")),
            updated_at=str(profile_row.get("updated_at", "")),
        )


class AvailabilityResponse(BaseModel):
    """Returned by GET /tutor-profile/availability and PUT /tutor-profile/availability."""
    slots: list[AvailabilitySlot]

    @classmethod
    def from_db(cls, rows: list[dict]) -> "AvailabilityResponse":
        return cls(
            slots=[
                AvailabilitySlot(
                    day_of_week=r["day_of_week"],
                    hour_slot=r["hour_slot"],
                )
                for r in rows
            ]
        )
