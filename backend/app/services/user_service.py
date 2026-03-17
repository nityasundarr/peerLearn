"""Business logic for the users module.

Hard Rule 2: user_id always comes from the JWT dep — never from request bodies.
Hard Rule 6: DB errors surfaced as AppError from users_db; not re-wrapped here.
"""

from app.core.errors import NotFoundError, UnprocessableError
from app.db import users_db
from app.models.user import (
    UpdatePrivacyRequest,
    UpdateProfileRequest,
    UserPrivacyResponse,
    UserProfileResponse,
)


# ---------------------------------------------------------------------------
# UC-2.2  Profile
# ---------------------------------------------------------------------------

def get_profile(user_id: str) -> UserProfileResponse:
    """Fetch and return the public profile for the authenticated user."""
    row = users_db.get_user_profile(user_id)
    if not row:
        raise NotFoundError("User profile not found.")
    return UserProfileResponse.from_db(row)


def update_profile(user_id: str, body: UpdateProfileRequest) -> UserProfileResponse:
    """Apply partial updates to full_name and/or preferred_language.

    Only fields explicitly sent in the request body are written to the DB.
    Raises UnprocessableError if the body contains no updatable fields.
    """
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise UnprocessableError(
            "Request body must include at least one of: full_name, preferred_language."
        )

    row = users_db.update_user_profile(user_id, updates)
    return UserProfileResponse.from_db(row)


# ---------------------------------------------------------------------------
# UC-2.2  Privacy / notification preferences
# ---------------------------------------------------------------------------

def get_privacy(user_id: str) -> UserPrivacyResponse:
    """Fetch privacy and notification preferences for the authenticated user.

    Missing columns (before migration) default to True in the response model
    so the feature is opt-out rather than opt-in.
    """
    row = users_db.get_user_privacy(user_id)
    if not row:
        raise NotFoundError("User not found.")
    return UserPrivacyResponse.from_db(row)


def update_privacy(user_id: str, body: UpdatePrivacyRequest) -> UserPrivacyResponse:
    """Apply partial updates to privacy/notification preferences.

    SRS UC-2.3: notify_admin_alerts is mandatory; the request model does not
    expose it as writable, but we defensively strip it from the update payload
    here in case a future model change accidentally includes it.

    Raises UnprocessableError if the body contains no updatable fields.
    """
    updates = body.model_dump(exclude_unset=True)

    # Hard enforce: mandatory alert flag is never written to False
    updates.pop("notify_admin_alerts", None)

    if not updates:
        raise UnprocessableError(
            "Request body must include at least one privacy or notification preference."
        )

    row = users_db.update_user_privacy(user_id, updates)
    return UserPrivacyResponse.from_db(row)
