"""Pydantic v2 schemas for the ratings module.

SRS 2.9.4.5.3.3: review_text max 500 chars, charset [A-Za-z0-9 \\-'].
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.utils.validators import validate_free_text


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class RecordOutcomeBody(BaseModel):
    """PATCH /sessions/{id}/outcome — each party self-reports their attendance."""
    outcome: Literal["attended", "no_show"]


class SubmitRatingBody(BaseModel):
    """POST /sessions/{id}/rating — tutee rates the session (UC-6.5)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    stars: int
    standout_traits: list[str] = []
    review_text: str | None = None
    is_anonymous: bool = False

    @field_validator("stars")
    @classmethod
    def _stars(cls, v: int) -> int:
        if not 1 <= v <= 5:
            raise ValueError("stars must be between 1 and 5.")
        return v

    @field_validator("review_text")
    @classmethod
    def _review(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        # SRS 2.9.4.5.3.3: [A-Za-z0-9 \-'], 1–500 chars
        return validate_free_text(v.strip(), max_len=500)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class RatingResponse(BaseModel):
    """Returned by POST /sessions/{id}/rating and GET /sessions/{id}/rating."""
    rating_id: str
    session_id: str
    tutor_id: str
    tutee_id: str
    stars: int
    standout_traits: list[str]
    review_text: str | None
    is_anonymous: bool
    created_at: str

    @classmethod
    def from_db(cls, rating_row: dict, review_row: dict | None) -> "RatingResponse":
        return cls(
            rating_id=rating_row["id"],
            session_id=rating_row.get("session_id", ""),
            tutor_id=rating_row.get("tutor_id", ""),
            tutee_id=rating_row.get("tutee_id", ""),
            stars=rating_row.get("stars", 0),
            standout_traits=rating_row.get("standout_traits") or [],
            review_text=review_row.get("review_text") if review_row else None,
            is_anonymous=rating_row.get("is_anonymous", False),
            created_at=str(rating_row.get("created_at", "")),
        )


class OutcomeResponse(BaseModel):
    """Returned by PATCH /sessions/{id}/outcome."""
    session_id: str
    status: str
    outcome_tutor: str | None
    outcome_tutee: str | None
    refund_status: str | None   # full_refund | partial_refund | no_refund | disputed | None
    message: str | None
