"""Supabase query functions for the admin analytics domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

All aggregation (GROUP BY, COUNT, AVG) is performed in Python on the
raw rows returned here, because the Supabase Python client has no
aggregate-query builder.

Tables touched (read-only):
  users, tutor_profiles, tutor_topics, tutoring_requests, tutoring_sessions,
  workload, tutor_reliability_metrics, complaints

Tables touched (read + write):
  admin_weights — scoring weights GET/PUT
"""

import logging

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# User / registration stats
# ---------------------------------------------------------------------------

def count_total_users() -> int:
    try:
        result = supabase.table("users").select("id", count="exact").execute()
        return result.count or 0
    except Exception as exc:
        raise _db_error("count_total_users", exc) from exc


def get_recent_registrations(limit: int = 5) -> list[dict]:
    try:
        result = (
            supabase.table("users")
            .select("id, full_name, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_recent_registrations", exc) from exc


# ---------------------------------------------------------------------------
# Tutor stats
# ---------------------------------------------------------------------------

def get_all_tutor_profiles() -> list[dict]:
    """Fetch all tutor_profiles with workload-relevant fields."""
    try:
        result = (
            supabase.table("tutor_profiles")
            .select(
                "user_id, subjects, planning_areas, academic_levels, "
                "max_weekly_hours, is_active_mode"
            )
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_all_tutor_profiles", exc) from exc


def get_tutor_reliability_metrics() -> list[dict]:
    try:
        result = (
            supabase.table("tutor_reliability_metrics")
            .select("tutor_id, total_sessions, no_shows, avg_rating, score")
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_tutor_reliability_metrics", exc) from exc


def get_current_week_workload() -> list[dict]:
    """Return all workload rows for the current ISO week."""
    from datetime import date, timedelta
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    try:
        result = (
            supabase.table("workload")
            .select("tutor_id, confirmed_hours")
            .eq("week_start", week_start)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_current_week_workload", exc) from exc


# ---------------------------------------------------------------------------
# Request / demand stats
# ---------------------------------------------------------------------------

def get_requests_in_range(start_date: str, end_date: str) -> list[dict]:
    """Fetch tutoring_requests created within a date range."""
    try:
        result = (
            supabase.table("tutoring_requests")
            .select(
                "id, tutee_id, academic_level, subjects, topics, "
                "planning_areas, urgency_category, urgency_level, "
                "status, created_at"
            )
            .gte("created_at", f"{start_date}T00:00:00Z")
            .lte("created_at", f"{end_date}T23:59:59Z")
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_requests_in_range", exc) from exc


def count_pending_requests() -> int:
    try:
        result = (
            supabase.table("tutoring_requests")
            .select("id", count="exact")
            .eq("status", "open")
            .execute()
        )
        return result.count or 0
    except Exception as exc:
        raise _db_error("count_pending_requests", exc) from exc


# ---------------------------------------------------------------------------
# Session stats
# ---------------------------------------------------------------------------

def get_sessions_in_range(start_date: str, end_date: str) -> list[dict]:
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select(
                "id, tutee_id, tutor_id, status, academic_level, "
                "duration_hours, created_at"
            )
            .gte("created_at", f"{start_date}T00:00:00Z")
            .lte("created_at", f"{end_date}T23:59:59Z")
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_sessions_in_range", exc) from exc


def count_sessions_this_week() -> int:
    from datetime import date, timedelta
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id", count="exact")
            .gte("created_at", f"{week_start}T00:00:00Z")
            .execute()
        )
        return result.count or 0
    except Exception as exc:
        raise _db_error("count_sessions_this_week", exc) from exc


def get_recent_sessions(limit: int = 5) -> list[dict]:
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id, tutee_id, tutor_id, status, academic_level, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_recent_sessions", exc) from exc


# ---------------------------------------------------------------------------
# Complaint stats
# ---------------------------------------------------------------------------

def get_recent_complaints(limit: int = 5) -> list[dict]:
    try:
        result = (
            supabase.table("complaints")
            .select("id, reporter_id, category, status, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_recent_complaints", exc) from exc


# ---------------------------------------------------------------------------
# Admin weights — write
# ---------------------------------------------------------------------------

def save_admin_weights(weights: dict[str, float]) -> list[dict]:
    """Upsert all scoring weights in a single bulk operation.

    Uses ON CONFLICT on component_name to update existing rows.
    Returns the updated rows.
    """
    try:
        rows = [
            {"component_name": k, "weight_value": v}
            for k, v in weights.items()
        ]
        result = (
            supabase.table("admin_weights")
            .upsert(rows, on_conflict="component_name")
            .select("component_name, weight_value, updated_at")
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("save_admin_weights", exc) from exc
