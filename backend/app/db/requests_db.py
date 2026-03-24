"""Supabase query functions for the tutee requests domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  tutoring_requests — core request fields
  learning_needs    — urgency + unfulfilled history derived from requests
  users             — tutee role assignment (SRS 2.2.1)
  tutoring_sessions — read-only here; used for GET /tutor/requests/incoming
                      (no sessions_db module yet in Phase 4)
"""

import logging

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_REQUEST_COLS = (
    "id, tutee_id, academic_level, subjects, topics, planning_areas, "
    "accessibility_needs, accessibility_notes, time_slots, duration_hours, "
    "urgency_category, urgency_level, status, created_at"
)

_NEED_COLS = "id, request_id, urgency_level, unfulfilled_count, created_at"


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# tutoring_requests
# ---------------------------------------------------------------------------

def create_request(tutee_id: str, data: dict) -> dict | None:
    """Insert a new tutoring_request row and return it."""
    try:
        payload = {"tutee_id": tutee_id, **data}
        result = (
            supabase.table("tutoring_requests")
            .insert(payload)
            .execute()
        )
        if result is None or not result.data:
            return None
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_request", exc) from exc


def get_request_by_id(request_id: str) -> dict | None:
    try:
        result = (
            supabase.table("tutoring_requests")
            .select(_REQUEST_COLS)
            .eq("id", request_id)
            .maybe_single()
            .execute()
        )
        if result is None or result.data is None:
            return None
        return result.data
    except Exception as exc:
        raise _db_error("get_request_by_id", exc) from exc


def get_request_by_id_and_tutee(request_id: str, tutee_id: str) -> dict | None:
    """Ownership-scoped fetch — returns None if the request belongs to someone else."""
    try:
        result = (
            supabase.table("tutoring_requests")
            .select(_REQUEST_COLS)
            .eq("id", request_id)
            .eq("tutee_id", tutee_id)
            .maybe_single()
            .execute()
        )
        if result is None or result.data is None:
            return None
        return result.data
    except Exception as exc:
        raise _db_error("get_request_by_id_and_tutee", exc) from exc


def list_requests_by_tutee(tutee_id: str) -> list[dict]:
    try:
        result = (
            supabase.table("tutoring_requests")
            .select(_REQUEST_COLS)
            .eq("tutee_id", tutee_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data if result is not None and result.data is not None else []
    except Exception as exc:
        raise _db_error("list_requests_by_tutee", exc) from exc


def update_request(request_id: str, tutee_id: str, data: dict) -> dict:
    """Partial update — only updates the fields present in data."""
    try:
        supabase.table("tutoring_requests").update(data).eq("id", request_id).eq("tutee_id", tutee_id).execute()
        row = get_request_by_id_and_tutee(request_id, tutee_id)
        if row is None:
            raise NotFoundError("Request not found or access denied.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("update_request", exc) from exc


def cancel_request(request_id: str, tutee_id: str) -> dict:
    """Set status = cancelled. Returns the updated row."""
    try:
        row = get_request_by_id_and_tutee(request_id, tutee_id)
        if row is None or row.get("status") != "open":
            raise NotFoundError(
                "Request not found, already cancelled, or access denied."
            )
        supabase.table("tutoring_requests").update({"status": "cancelled"}).eq("id", request_id).eq("tutee_id", tutee_id).eq("status", "open").execute()
        return get_request_by_id_and_tutee(request_id, tutee_id)
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("cancel_request", exc) from exc


# ---------------------------------------------------------------------------
# learning_needs
# ---------------------------------------------------------------------------

def create_learning_need(request_id: str, urgency_level: str) -> dict | None:
    try:
        result = (
            supabase.table("learning_needs")
            .insert(
                {"request_id": request_id, "urgency_level": urgency_level, "unfulfilled_count": 0}
            )
            .execute()
        )
        if result is None or not result.data:
            return None
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_learning_need", exc) from exc


def get_learning_need(request_id: str) -> dict | None:
    try:
        result = (
            supabase.table("learning_needs")
            .select(_NEED_COLS)
            .eq("request_id", request_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_learning_need", exc) from exc


def increment_unfulfilled_count(request_id: str) -> None:
    """Increment the unfulfilled_count when a tutee broadens their criteria.

    SRS 2.3: unfulfilled_count feeds back into urgency computation.
    """
    try:
        result = (
            supabase.table("learning_needs")
            .select("unfulfilled_count")
            .eq("request_id", request_id)
            .maybe_single()
            .execute()
        )
        if result is None or not result.data:
            return
        current = result.data.get("unfulfilled_count") or 0
        supabase.table("learning_needs").update(
            {"unfulfilled_count": current + 1}
        ).eq("request_id", request_id).execute()
    except Exception as exc:
        raise _db_error("increment_unfulfilled_count", exc) from exc


def count_prior_unfulfilled(tutee_id: str) -> int:
    """Count previously cancelled or unmatched requests for urgency computation."""
    try:
        result = (
            supabase.table("tutoring_requests")
            .select("id", count="exact")
            .eq("tutee_id", tutee_id)
            .eq("status", "cancelled")
            .execute()
        )
        if result is None:
            return 0
        return result.count if result.count is not None else 0
    except Exception as exc:
        raise _db_error("count_prior_unfulfilled", exc) from exc


# ---------------------------------------------------------------------------
# users — role assignment (SRS 2.2.1)
# ---------------------------------------------------------------------------

def assign_tutee_role(user_id: str) -> None:
    """Add "tutee" to users.roles if not already present."""
    try:
        result = (
            supabase.table("users")
            .select("roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None or result.data is None:
            return
        current: list[str] = result.data.get("roles") or []
        if "tutee" not in current:
            supabase.table("users").update(
                {"roles": current + ["tutee"]}
            ).eq("id", user_id).execute()
    except Exception as exc:
        raise _db_error("assign_tutee_role", exc) from exc


# ---------------------------------------------------------------------------
# tutoring_sessions — incoming requests for tutors (UC-4.4)
# Note: no sessions_db module yet in Phase 4; this minimal query lives here.
# ---------------------------------------------------------------------------

_SESSION_COLS_FOR_INCOMING = (
    "id, request_id, tutee_id, tutor_id, academic_level, status, created_at"
)


def get_incoming_sessions_for_tutor(tutor_id: str) -> list[dict]:
    """Return sessions in pending_tutor_selection state for the given tutor."""
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select(_SESSION_COLS_FOR_INCOMING)
            .eq("tutor_id", tutor_id)
            .eq("status", "pending_tutor_selection")
            .order("created_at", desc=True)
            .execute()
        )
        if result is None or result.data is None:
            return []
        return result.data
    except Exception as exc:
        raise _db_error("get_incoming_sessions_for_tutor", exc) from exc


def get_requests_by_ids(request_ids: list[str]) -> list[dict]:
    """Batch-fetch requests by a list of IDs (used to enrich incoming sessions)."""
    if not request_ids:
        return []
    try:
        result = (
            supabase.table("tutoring_requests")
            .select(_REQUEST_COLS)
            .in_("id", request_ids)
            .execute()
        )
        if result is None or result.data is None:
            return []
        return result.data
    except Exception as exc:
        raise _db_error("get_requests_by_ids", exc) from exc
