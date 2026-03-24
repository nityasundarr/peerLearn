"""Pydantic v2 schemas for complaints and appeals.

SRS 2.10.5 / 2.10.6 field rules:
  description / appeal_text: [A-Za-z0-9 \\-'], 1–500 chars
  category: misconduct | no_show | payment | other
  penalty_type: warning | suspension | ban
  appeal outcome: upheld | modified | revoked
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.utils.validators import validate_free_text


# ---------------------------------------------------------------------------
# Complaint request models
# ---------------------------------------------------------------------------

class SubmitComplaintBody(BaseModel):
    """POST /complaints (UC-7.1, SRS 2.10.5)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    session_id: str
    category: Literal["misconduct", "no_show", "payment", "other"]
    description: str

    @field_validator("description")
    @classmethod
    def _description(cls, v: str) -> str:
        return validate_free_text(v.strip(), max_len=500)


class RecordActionBody(BaseModel):
    """POST /complaints/{id}/action — admin records action + issues penalty (UC-7.3)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    action: str                                          # description of action taken
    notes: str | None = None
    affected_user_id: str                                # user receiving the penalty
    penalty_type: Literal["warning", "suspension", "ban"]
    update_status: Literal["open", "under_review", "resolved", "dismissed"] = "under_review"


# ---------------------------------------------------------------------------
# Appeal request models
# ---------------------------------------------------------------------------

class SubmitAppealBody(BaseModel):
    """POST /appeals (UC-7.2, SRS 2.10.6)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    disciplinary_record_id: str
    appeal_text: str

    @field_validator("appeal_text")
    @classmethod
    def _appeal_text(cls, v: str) -> str:
        return validate_free_text(v.strip(), max_len=500)


class DecideAppealBody(BaseModel):
    """PATCH /appeals/{id} — admin decides outcome (UC-7.4)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    outcome: Literal["upheld", "modified", "revoked"]
    outcome_notes: str | None = None


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class ComplaintResponse(BaseModel):
    complaint_id: str
    reporter_id: str
    session_id: str
    category: str
    description: str
    status: str
    created_at: str

    @classmethod
    def from_db(cls, row: dict) -> "ComplaintResponse":
        return cls(
            complaint_id=row["id"],
            reporter_id=row.get("reporter_id", ""),
            session_id=row.get("session_id", ""),
            category=row.get("category", ""),
            description=row.get("description", ""),
            status=row.get("status", "open"),
            created_at=str(row.get("created_at", "")),
        )


class ComplaintActionItem(BaseModel):
    action_id: str
    admin_id: str
    action: str
    notes: str | None
    created_at: str

    @classmethod
    def from_db(cls, row: dict) -> "ComplaintActionItem":
        return cls(
            action_id=row["id"],
            admin_id=row.get("admin_id", ""),
            action=row.get("action", ""),
            notes=row.get("notes"),
            created_at=str(row.get("created_at", "")),
        )


class DisciplinaryRecordItem(BaseModel):
    record_id: str
    user_id: str
    penalty_type: str
    issued_at: str
    appeal_deadline: str

    @classmethod
    def from_db(cls, row: dict) -> "DisciplinaryRecordItem":
        return cls(
            record_id=row["id"],
            user_id=row.get("user_id", ""),
            penalty_type=row.get("penalty_type", ""),
            issued_at=str(row.get("issued_at", "")),
            appeal_deadline=str(row.get("appeal_deadline", "")),
        )


class ComplaintDetailResponse(BaseModel):
    """GET /complaints/{id} — full detail for admin (UC-7.3)."""
    complaint: ComplaintResponse
    actions: list[ComplaintActionItem]
    disciplinary_records: list[DisciplinaryRecordItem]
    session_info: dict | None          # basic session fields (no lat/lng)
    recent_messages: list[dict]        # up to 20 most recent channel messages


class AppealResponse(BaseModel):
    appeal_id: str
    disciplinary_record_id: str
    user_id: str
    appeal_text: str
    status: str
    outcome_notes: str | None
    decided_at: str | None
    submitted_at: str

    @classmethod
    def from_db(cls, row: dict) -> "AppealResponse":
        return cls(
            appeal_id=row["id"],
            disciplinary_record_id=row.get("disciplinary_record_id", ""),
            user_id=row.get("user_id", ""),
            appeal_text=row.get("appeal_text", ""),
            status=row.get("status", "pending"),
            outcome_notes=row.get("outcome_notes"),
            decided_at=str(row["decided_at"]) if row.get("decided_at") else None,
            submitted_at=str(row.get("submitted_at", "")),
        )


class AppealDetailResponse(BaseModel):
    """GET /appeals/{id} — full detail for admin (UC-7.4)."""
    appeal: AppealResponse
    disciplinary_record: DisciplinaryRecordItem
