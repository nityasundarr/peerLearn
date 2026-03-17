"""Supabase query functions for the tutor profile domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  tutor_profiles           — profile core fields
  tutor_topics             — normalised (tutor_id, subject, topic) rows
  weekly_availability      — (tutor_id, day_of_week, hour_slot) slots
  tutor_reliability_metrics — seeded at profile creation for matching engine
  users                    — role assignment (add "tutor" to roles[])

Topics and availability use a replace-on-write pattern:
  delete all rows for the tutor, then bulk-insert the new set.
  This keeps the DB logic simple and avoids diff-based updates.
"""

import logging

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_PROFILE_COLS = (
    "user_id, academic_levels, subjects, planning_areas, "
    "accessibility_capabilities, accessibility_notes, "
    "max_weekly_hours, is_active_mode, created_at, updated_at"
)


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# tutor_profiles
# ---------------------------------------------------------------------------

def get_profile(tutor_id: str) -> dict | None:
    try:
        result = (
            supabase.table("tutor_profiles")
            .select(_PROFILE_COLS)
            .eq("user_id", tutor_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_profile", exc) from exc


def profile_exists(tutor_id: str) -> bool:
    try:
        result = (
            supabase.table("tutor_profiles")
            .select("user_id", count="exact")
            .eq("user_id", tutor_id)
            .execute()
        )
        return (result.count or 0) > 0
    except Exception as exc:
        raise _db_error("profile_exists", exc) from exc


def create_profile(tutor_id: str, data: dict) -> dict:
    """Insert a new tutor_profiles row. Returns the created row."""
    try:
        payload = {"user_id": tutor_id, **data}
        result = (
            supabase.table("tutor_profiles")
            .insert(payload)
            .select(_PROFILE_COLS)
            .execute()
        )
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_profile", exc) from exc


def update_profile(tutor_id: str, data: dict) -> dict:
    """Full replacement of profile fields (PUT semantics). Returns updated row."""
    try:
        result = (
            supabase.table("tutor_profiles")
            .update(data)
            .eq("user_id", tutor_id)
            .select(_PROFILE_COLS)
            .execute()
        )
        return result.data[0]
    except Exception as exc:
        raise _db_error("update_profile", exc) from exc


def set_active_mode(tutor_id: str, is_active: bool) -> dict:
    """Toggle is_active_mode. Returns the updated profile row."""
    try:
        result = (
            supabase.table("tutor_profiles")
            .update({"is_active_mode": is_active})
            .eq("user_id", tutor_id)
            .select(_PROFILE_COLS)
            .execute()
        )
        return result.data[0]
    except Exception as exc:
        raise _db_error("set_active_mode", exc) from exc


# ---------------------------------------------------------------------------
# tutor_topics
# ---------------------------------------------------------------------------

def get_topics(tutor_id: str) -> list[dict]:
    try:
        result = (
            supabase.table("tutor_topics")
            .select("subject, topic")
            .eq("tutor_id", tutor_id)
            .order("subject")
            .order("topic")
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_topics", exc) from exc


def replace_topics(tutor_id: str, topics: list[dict]) -> None:
    """Delete all existing topics for the tutor and insert the new set.

    topics: list of {"subject": str, "topic": str}
    No-op insert when topics list is empty (just deletes).
    """
    try:
        # Step 1: clear all existing topics
        supabase.table("tutor_topics").delete().eq("tutor_id", tutor_id).execute()

        # Step 2: insert new topics (skip if empty)
        if topics:
            rows = [
                {"tutor_id": tutor_id, "subject": t["subject"], "topic": t["topic"]}
                for t in topics
            ]
            supabase.table("tutor_topics").insert(rows).execute()
    except Exception as exc:
        raise _db_error("replace_topics", exc) from exc


# ---------------------------------------------------------------------------
# weekly_availability
# ---------------------------------------------------------------------------

def get_availability(tutor_id: str) -> list[dict]:
    try:
        result = (
            supabase.table("weekly_availability")
            .select("day_of_week, hour_slot")
            .eq("tutor_id", tutor_id)
            .order("day_of_week")
            .order("hour_slot")
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_availability", exc) from exc


def replace_availability(tutor_id: str, slots: list[dict]) -> None:
    """Delete all existing availability slots and insert the new set.

    slots: list of {"day_of_week": int, "hour_slot": int}
    """
    try:
        supabase.table("weekly_availability").delete().eq("tutor_id", tutor_id).execute()

        if slots:
            rows = [
                {
                    "tutor_id": tutor_id,
                    "day_of_week": s["day_of_week"],
                    "hour_slot": s["hour_slot"],
                }
                for s in slots
            ]
            supabase.table("weekly_availability").insert(rows).execute()
    except Exception as exc:
        raise _db_error("replace_availability", exc) from exc


# ---------------------------------------------------------------------------
# users — role assignment (SRS 2.2.1)
# ---------------------------------------------------------------------------

def assign_tutor_role(user_id: str) -> None:
    """Add "tutor" to users.roles if not already present.

    Fetch-then-update because Supabase's Python client has no atomic
    array-append operator.  Race condition risk is negligible here since
    a user triggers this at most once (profile creation).
    """
    try:
        result = (
            supabase.table("users")
            .select("roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not result.data:
            return
        current: list[str] = result.data.get("roles") or []
        if "tutor" not in current:
            supabase.table("users").update(
                {"roles": current + ["tutor"]}
            ).eq("id", user_id).execute()
    except Exception as exc:
        raise _db_error("assign_tutor_role", exc) from exc


# ---------------------------------------------------------------------------
# tutor_reliability_metrics — seeded at profile creation
# ---------------------------------------------------------------------------

def init_reliability_metrics(tutor_id: str) -> None:
    """Upsert the reliability metrics row with default values.

    Called once at profile creation so the matching engine always finds
    a row for any active tutor.
    """
    try:
        supabase.table("tutor_reliability_metrics").upsert(
            {
                "tutor_id": tutor_id,
                "total_sessions": 0,
                "no_shows": 0,
                "avg_rating": 0,
                "score": 100,
            }
        ).execute()
    except Exception as exc:
        raise _db_error("init_reliability_metrics", exc) from exc
