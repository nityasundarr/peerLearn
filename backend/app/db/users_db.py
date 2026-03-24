"""Supabase query functions for the users domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched: users

Privacy/notification columns required in Supabase (add via migration):
  show_full_name         bool  DEFAULT true
  show_planning_area     bool  DEFAULT true
  notify_session_updates bool  DEFAULT true
  notify_payment         bool  DEFAULT true
  notify_tutor_response  bool  DEFAULT true
  notify_admin_alerts    bool  DEFAULT true   -- mandatory, cannot be disabled
"""

import logging

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# Columns returned for public profile — excludes security-state fields
_PROFILE_COLUMNS = (
    "id, full_name, email, preferred_language, roles, is_active, created_at"
)

# Columns returned for privacy/notification preferences
_PRIVACY_COLUMNS = (
    "show_full_name, show_planning_area, "
    "notify_session_updates, notify_payment, "
    "notify_tutor_response, notify_admin_alerts"
)


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

def get_user_full_names(user_ids: list[str]) -> dict[str, str]:
    """Batch-fetch full_name for a list of user IDs. Returns {user_id: full_name}."""
    if not user_ids:
        return {}
    try:
        result = (
            supabase.table("users")
            .select("id, full_name")
            .in_("id", user_ids)
            .execute()
        )
        if result is None or result.data is None:
            return {}
        return {r["id"]: r.get("full_name", "") or "" for r in result.data}
    except Exception as exc:
        logger.error("DB error in get_user_full_names: %s", exc)
        return {}


def get_user_profile(user_id: str) -> dict | None:
    """Return public profile fields for a user. Excludes lock/failure state."""
    try:
        result = (
            supabase.table("users")
            .select(_PROFILE_COLUMNS)
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def update_user_profile(user_id: str, updates: dict) -> dict | None:
    """Apply a partial update to full_name and/or preferred_language.

    Returns the updated profile row.
    Caller must pass only the fields that changed (use model_dump(exclude_unset=True)).
    """
    try:
        supabase.table("users").update(updates).eq("id", user_id).execute()
        return get_user_profile(user_id)
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Privacy / notification preferences
# ---------------------------------------------------------------------------

def get_user_privacy(user_id: str) -> dict | None:
    """Return privacy and notification preference flags for a user."""
    try:
        result = (
            supabase.table("users")
            .select(_PRIVACY_COLUMNS)
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def update_user_privacy(user_id: str, updates: dict) -> dict | None:
    """Apply a partial update to privacy/notification preference flags.

    Returns the updated preference row.
    """
    try:
        supabase.table("users").update(updates).eq("id", user_id).execute()
        return get_user_privacy(user_id)
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None
