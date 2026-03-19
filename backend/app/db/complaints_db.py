"""Supabase query functions for the complaints domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  complaints           — reporter submits a complaint about a session
  complaint_actions    — admin records actions taken on a complaint
  disciplinary_records — penalty issued to a user following an action
  users                — admin user lookup (for notifications)
"""

import logging

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_COMPLAINT_COLS = (
    "id, reporter_id, session_id, category, description, status, created_at"
)
_ACTION_COLS = "id, complaint_id, admin_id, action, notes, created_at"
_RECORD_COLS = (
    "id, user_id, complaint_id, penalty_type, issued_at, appeal_deadline"
)


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# complaints
# ---------------------------------------------------------------------------

def create_complaint(
    reporter_id: str,
    session_id: str,
    category: str,
    description: str,
) -> dict:
    try:
        result = (
            supabase.table("complaints")
            .insert(
                {
                    "reporter_id": reporter_id,
                    "session_id": session_id,
                    "category": category,
                    "description": description,
                    "status": "open",
                }
            )
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("complaints")
                .select(_COMPLAINT_COLS)
                .eq("reporter_id", reporter_id)
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_complaint", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_complaint", exc) from exc


def get_complaint_by_id(complaint_id: str) -> dict | None:
    try:
        result = (
            supabase.table("complaints")
            .select(_COMPLAINT_COLS)
            .eq("id", complaint_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_complaint_by_id", exc) from exc


def get_complaint_by_id_for_reporter(complaint_id: str, reporter_id: str) -> dict | None:
    """Ownership-scoped fetch — reporter can only see their own complaints."""
    try:
        result = (
            supabase.table("complaints")
            .select(_COMPLAINT_COLS)
            .eq("id", complaint_id)
            .eq("reporter_id", reporter_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_complaint_by_id_for_reporter", exc) from exc


def list_complaints(status_filter: str | None = None) -> list[dict]:
    """Admin: list all complaints, optionally filtered by status."""
    try:
        query = (
            supabase.table("complaints")
            .select(_COMPLAINT_COLS)
            .order("created_at", desc=True)
        )
        if status_filter:
            query = query.eq("status", status_filter)
        result = query.execute()
        return result.data or []
    except Exception as exc:
        raise _db_error("list_complaints", exc) from exc


def update_complaint_status(complaint_id: str, new_status: str) -> dict:
    try:
        result = (
            supabase.table("complaints")
            .update({"status": new_status})
            .eq("id", complaint_id)
            .select(_COMPLAINT_COLS)
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            raise NotFoundError("Complaint not found.")
        return result.data[0]
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("update_complaint_status", exc) from exc


# ---------------------------------------------------------------------------
# complaint_actions
# ---------------------------------------------------------------------------

def create_complaint_action(
    complaint_id: str,
    admin_id: str,
    action: str,
    notes: str | None,
) -> dict:
    try:
        result = (
            supabase.table("complaint_actions")
            .insert(
                {
                    "complaint_id": complaint_id,
                    "admin_id": admin_id,
                    "action": action,
                    "notes": notes,
                }
            )
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("complaint_actions")
                .select(_ACTION_COLS)
                .eq("complaint_id", complaint_id)
                .eq("admin_id", admin_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_complaint_action", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_complaint_action", exc) from exc


def list_complaint_actions(complaint_id: str) -> list[dict]:
    try:
        result = (
            supabase.table("complaint_actions")
            .select(_ACTION_COLS)
            .eq("complaint_id", complaint_id)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("list_complaint_actions", exc) from exc


# ---------------------------------------------------------------------------
# disciplinary_records
# ---------------------------------------------------------------------------

def create_disciplinary_record(
    user_id: str,
    complaint_id: str,
    penalty_type: str,
    appeal_deadline: str,  # ISO timestamptz string
) -> dict:
    try:
        result = (
            supabase.table("disciplinary_records")
            .insert(
                {
                    "user_id": user_id,
                    "complaint_id": complaint_id,
                    "penalty_type": penalty_type,
                    "appeal_deadline": appeal_deadline,
                }
            )
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("disciplinary_records")
                .select(_RECORD_COLS)
                .eq("user_id", user_id)
                .eq("complaint_id", complaint_id)
                .order("issued_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_disciplinary_record", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_disciplinary_record", exc) from exc


def get_disciplinary_records_by_complaint(complaint_id: str) -> list[dict]:
    try:
        result = (
            supabase.table("disciplinary_records")
            .select(_RECORD_COLS)
            .eq("complaint_id", complaint_id)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_disciplinary_records_by_complaint", exc) from exc


def get_disciplinary_record_by_id(record_id: str) -> dict | None:
    try:
        result = (
            supabase.table("disciplinary_records")
            .select(_RECORD_COLS)
            .eq("id", record_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_disciplinary_record_by_id", exc) from exc


# ---------------------------------------------------------------------------
# Admin user lookup (for notifications)
# ---------------------------------------------------------------------------

def get_admin_user_ids() -> list[str]:
    """Return a list of user_ids that hold the 'admin' role."""
    try:
        result = (
            supabase.table("users")
            .select("id")
            .contains("roles", ["admin"])
            .execute()
        )
        return [r["id"] for r in (result.data if result is not None and result.data is not None else [])]
    except Exception as exc:
        logger.warning("Failed to fetch admin user IDs: %s", exc)
        return []
