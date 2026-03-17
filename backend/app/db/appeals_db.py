"""Supabase query functions for the appeals domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  penalty_appeals       — user's appeal against a disciplinary_record
  disciplinary_records  — read-only from this module (writes in complaints_db)
"""

import logging

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_APPEAL_COLS = (
    "id, disciplinary_record_id, user_id, appeal_text, status, "
    "outcome_notes, decided_at, submitted_at"
)
_RECORD_COLS = (
    "id, user_id, complaint_id, penalty_type, issued_at, appeal_deadline"
)


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# disciplinary_records — read-only here
# ---------------------------------------------------------------------------

def get_disciplinary_record_by_id(record_id: str) -> dict | None:
    try:
        result = (
            supabase.table("disciplinary_records")
            .select(_RECORD_COLS)
            .eq("id", record_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_disciplinary_record_by_id", exc) from exc


def get_disciplinary_record_for_user(record_id: str, user_id: str) -> dict | None:
    """Ownership-scoped fetch — user can only appeal their own records."""
    try:
        result = (
            supabase.table("disciplinary_records")
            .select(_RECORD_COLS)
            .eq("id", record_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_disciplinary_record_for_user", exc) from exc


# ---------------------------------------------------------------------------
# penalty_appeals
# ---------------------------------------------------------------------------

def create_appeal(
    disciplinary_record_id: str,
    user_id: str,
    appeal_text: str,
) -> dict:
    try:
        result = (
            supabase.table("penalty_appeals")
            .insert(
                {
                    "disciplinary_record_id": disciplinary_record_id,
                    "user_id": user_id,
                    "appeal_text": appeal_text,
                    "status": "pending",
                }
            )
            .select(_APPEAL_COLS)
            .execute()
        )
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_appeal", exc) from exc


def get_appeal_by_id(appeal_id: str) -> dict | None:
    try:
        result = (
            supabase.table("penalty_appeals")
            .select(_APPEAL_COLS)
            .eq("id", appeal_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_appeal_by_id", exc) from exc


def existing_appeal_for_record(disciplinary_record_id: str) -> dict | None:
    """Return an existing appeal for a record (prevents duplicate appeals)."""
    try:
        result = (
            supabase.table("penalty_appeals")
            .select(_APPEAL_COLS)
            .eq("disciplinary_record_id", disciplinary_record_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("existing_appeal_for_record", exc) from exc


def list_appeals(status_filter: str | None = None) -> list[dict]:
    """Admin: list all appeals, optionally filtered by status."""
    try:
        query = (
            supabase.table("penalty_appeals")
            .select(_APPEAL_COLS)
            .order("submitted_at", desc=True)
        )
        if status_filter:
            query = query.eq("status", status_filter)
        result = query.execute()
        return result.data or []
    except Exception as exc:
        raise _db_error("list_appeals", exc) from exc


def decide_appeal(
    appeal_id: str,
    outcome: str,
    outcome_notes: str | None,
    decided_at: str,
) -> dict:
    """Admin records a decision on a pending appeal."""
    try:
        result = (
            supabase.table("penalty_appeals")
            .update(
                {
                    "status": outcome,
                    "outcome_notes": outcome_notes,
                    "decided_at": decided_at,
                }
            )
            .eq("id", appeal_id)
            .select(_APPEAL_COLS)
            .execute()
        )
        if not result.data:
            raise NotFoundError("Appeal not found.")
        return result.data[0]
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("decide_appeal", exc) from exc
