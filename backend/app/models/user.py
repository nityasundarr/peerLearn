"""Pydantic v2 request and response schemas for the users module.

Hard Rule 4: field_validator (@classmethod), ConfigDict.
Hard Rule 2: user_id is always derived from the JWT — never in request bodies.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.utils.validators import validate_full_name


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class UpdateProfileRequest(BaseModel):
    """PATCH /users/me — all fields optional for partial updates.

    Use model_dump(exclude_unset=True) in the service to send only the
    fields the caller explicitly included in the request body.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = None
    preferred_language: Literal["English", "Chinese", "Malay", "Tamil"] | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_full_name(v)


class UpdatePrivacyRequest(BaseModel):
    """PATCH /users/me/privacy — all fields optional for partial updates.

    SRS UC-2.2: notify_admin_alerts is mandatory and cannot be disabled.
    The service enforces this; the model accepts the field to avoid a
    confusing 422 if the client sends it.
    """
    model_config = ConfigDict()

    show_full_name: bool | None = None
    show_planning_area: bool | None = None
    notify_session_updates: bool | None = None
    notify_payment: bool | None = None
    notify_tutor_response: bool | None = None
    # notify_admin_alerts intentionally omitted — not writable by users


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class UserProfileResponse(BaseModel):
    """Returned by GET /users/me and PATCH /users/me."""
    user_id: str
    full_name: str
    email: str
    preferred_language: str
    roles: list[str]
    is_active: bool
    created_at: str

    @classmethod
    def from_db(cls, row: dict) -> "UserProfileResponse":
        """Map a Supabase users row to this response model.

        The DB uses 'id'; we expose it as 'user_id' to match the JWT claim name.
        """
        return cls(
            user_id=row["id"],
            full_name=row["full_name"],
            email=row["email"],
            preferred_language=row["preferred_language"],
            roles=row.get("roles") or [],
            is_active=row.get("is_active", False),
            created_at=str(row.get("created_at", "")),
        )


class UserPrivacyResponse(BaseModel):
    """Returned by GET /users/me/privacy and PATCH /users/me/privacy.

    Missing DB columns default to True so the feature is opt-out rather than
    opt-in — no preference row ever silently disables alerts.
    """
    show_full_name: bool = True
    show_planning_area: bool = True
    notify_session_updates: bool = True
    notify_payment: bool = True
    notify_tutor_response: bool = True
    notify_admin_alerts: bool = True  # always True; mandatory per SRS UC-2.3

    @classmethod
    def from_db(cls, row: dict) -> "UserPrivacyResponse":
        return cls(
            show_full_name=row.get("show_full_name") if row.get("show_full_name") is not None else True,
            show_planning_area=row.get("show_planning_area") if row.get("show_planning_area") is not None else True,
            notify_session_updates=row.get("notify_session_updates") if row.get("notify_session_updates") is not None else True,
            notify_payment=row.get("notify_payment") if row.get("notify_payment") is not None else True,
            notify_tutor_response=row.get("notify_tutor_response") if row.get("notify_tutor_response") is not None else True,
            notify_admin_alerts=True,  # always True regardless of stored value
        )
