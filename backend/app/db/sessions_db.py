"""Supabase query functions for the sessions domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Table: tutoring_sessions
  id, request_id, tutee_id, tutor_id, status, duration_hours, academic_level,
  venue_id, venue_manual, scheduled_at, fee, outcome_tutor, outcome_tutee,
  created_at, updated_at

Schema additions required (add via Supabase migration before running):
  ALTER TABLE tutoring_sessions ADD COLUMN proposed_slots jsonb DEFAULT '[]';
  ALTER TABLE tutoring_sessions ADD COLUMN cancel_reason text;

State machine status values:
  pending_tutor_selection | tutor_accepted | pending_confirmation |
  confirmed | completed_attended | completed_no_show | cancelled
"""

import logging
from datetime import datetime, timezone

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_SESSION_COLS = (
    "id, request_id, tutee_id, tutor_id, status, duration_hours, academic_level, "
    "venue_id, venue_manual, scheduled_at, proposed_slots, cancel_reason, fee, "
    "outcome_tutor, outcome_tutee, created_at, updated_at"
)

_STATUS_GROUPS: dict[str, list[str]] = {
    "upcoming":  ["confirmed"],
    "pending":   ["pending_tutor_selection", "tutor_accepted", "pending_confirmation"],
    "past":      ["completed_attended", "completed_no_show"],
    "cancelled": ["cancelled"],
}


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_session(
    request_id: str,
    tutee_id: str,
    tutor_id: str,
    academic_level: str,
    duration_hours: int,
) -> dict:
    """Create a new session in pending_tutor_selection state."""
    try:
        payload = {
            "tutee_id": tutee_id,
            "tutor_id": tutor_id,
            "academic_level": academic_level,
            "duration_hours": duration_hours,
            "status": "pending_tutor_selection",
            "proposed_slots": [],
        }
        if request_id:
            payload["request_id"] = str(request_id)
        result = supabase.table("tutoring_sessions").insert(payload).execute()
        if result is None or not result.data or len(result.data) == 0:
            # supabase-py v2 insert may not return data; fetch by tutee_id + tutor_id
            fetch = (
                supabase.table("tutoring_sessions")
                .select(_SESSION_COLS)
                .eq("tutee_id", tutee_id)
                .eq("tutor_id", tutor_id)
                .eq("status", "pending_tutor_selection")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_session", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_session", exc) from exc


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_session(session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select(_SESSION_COLS)
            .eq("id", session_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_session", exc) from exc


def get_session_for_participant(session_id: str, user_id: str) -> dict | None:
    """Return session only if user_id is the tutee OR the tutor."""
    row = get_session(session_id)
    if not row:
        return None
    if row.get("tutee_id") == user_id or row.get("tutor_id") == user_id:
        return row
    return None


def list_sessions(
    user_id: str,
    role: str | None = None,
    status_group: str | None = None,
) -> list[dict]:
    """List sessions for a user, optionally filtered by role and status group.

    role: 'tutee' | 'tutor' | None (both)
    status_group: 'upcoming' | 'pending' | 'past' | 'cancelled' | None (all)
    """
    try:
        query = supabase.table("tutoring_sessions").select(_SESSION_COLS)

        if role == "tutee":
            query = query.eq("tutee_id", user_id)
        elif role == "tutor":
            query = query.eq("tutor_id", user_id)
        else:
            # User may be tutee or tutor — fetch both and deduplicate
            query = query.or_(f"tutee_id.eq.{user_id},tutor_id.eq.{user_id}")

        if status_group and status_group in _STATUS_GROUPS:
            statuses = _STATUS_GROUPS[status_group]
            query = query.in_("status", statuses)

            # For 'upcoming': only sessions scheduled in the future
            if status_group == "upcoming":
                now_iso = datetime.now(timezone.utc).isoformat()
                query = query.gte("scheduled_at", now_iso)

        result = query.order("created_at", desc=True).execute()
        return result.data if result is not None and result.data is not None else []
    except Exception as exc:
        raise _db_error("list_sessions", exc) from exc


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

def update_status(session_id: str, new_status: str) -> dict:
    """Set status to new_status. Service layer must validate the transition."""
    try:
        supabase.table("tutoring_sessions").update({"status": new_status}).eq("id", session_id).execute()
        row = get_session(session_id)
        if not row:
            raise NotFoundError("Session not found.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("update_status", exc) from exc


def set_cancel_reason(session_id: str, reason: str | None) -> None:
    try:
        supabase.table("tutoring_sessions").update(
            {"cancel_reason": reason}
        ).eq("id", session_id).execute()
    except Exception as exc:
        raise _db_error("set_cancel_reason", exc) from exc


# ---------------------------------------------------------------------------
# Proposed slots (stored as JSONB)
# ---------------------------------------------------------------------------

def set_proposed_slots(session_id: str, slots: list[dict]) -> dict:
    """Overwrite the proposed_slots JSONB array."""
    try:
        result = (
            supabase.table("tutoring_sessions")
            .update({"proposed_slots": slots})
            .eq("id", session_id)
            .select(_SESSION_COLS)
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            raise NotFoundError("Session not found.")
        return result.data[0]
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("set_proposed_slots", exc) from exc


def confirm_slot(session_id: str, scheduled_at: str) -> dict:
    """Set scheduled_at and transition status to pending_confirmation."""
    try:
        supabase.table("tutoring_sessions").update(
            {"scheduled_at": scheduled_at, "status": "pending_confirmation"}
        ).eq("id", session_id).execute()
        row = get_session(session_id)
        if not row:
            raise NotFoundError("Session not found.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("confirm_slot", exc) from exc


# ---------------------------------------------------------------------------
# Outcome recording (Phase 6 — UC-6.3, UC-6.4)
# ---------------------------------------------------------------------------

def set_outcome_field(session_id: str, field: str, value: str) -> dict:
    """Set outcome_tutor or outcome_tutee to 'attended' or 'no_show'."""
    if field not in {"outcome_tutor", "outcome_tutee"}:
        raise AppError(422, "Invalid outcome field.")
    try:
        supabase.table("tutoring_sessions").update({field: value}).eq("id", session_id).execute()
        row = get_session(session_id)
        if not row:
            raise NotFoundError("Session not found.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("set_outcome_field", exc) from exc


def finalize_outcome(session_id: str, new_status: str) -> dict:
    """Set status to a terminal outcome state (completed_attended | completed_no_show)."""
    try:
        result = (
            supabase.table("tutoring_sessions")
            .update({"status": new_status})
            .eq("id", session_id)
            .select(_SESSION_COLS)
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            raise NotFoundError("Session not found.")
        return result.data[0]
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("finalize_outcome", exc) from exc


# ---------------------------------------------------------------------------
# Payment confirmation (Phase 6 — UC-6.1)
# ---------------------------------------------------------------------------

def lock_fee_and_confirm(session_id: str, fee: float) -> dict:
    """Lock the computed fee and set status = confirmed.

    Hard Rule 9: fee is ALWAYS computed server-side — never from client input.
    """
    try:
        supabase.table("tutoring_sessions").update({"fee": fee, "status": "confirmed"}).eq("id", session_id).execute()
        row = get_session(session_id)
        if not row:
            raise NotFoundError("Session not found.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("lock_fee_and_confirm", exc) from exc


# ---------------------------------------------------------------------------
# Venue
# ---------------------------------------------------------------------------

def set_venue(
    session_id: str,
    venue_id: str | None = None,
    venue_manual: str | None = None,
) -> dict:
    """Attach a venue (from DB) or a manual venue description to the session."""
    try:
        updates: dict = {}
        if venue_id is not None:
            updates["venue_id"] = venue_id
            updates["venue_manual"] = None
        elif venue_manual is not None:
            updates["venue_manual"] = venue_manual
            updates["venue_id"] = None
        else:
            raise AppError(422, "Either venue_id or venue_manual must be provided.")

        supabase.table("tutoring_sessions").update(updates).eq("id", session_id).execute()
        row = get_session(session_id)
        if not row:
            raise NotFoundError("Session not found.")
        return row
    except (AppError, NotFoundError):
        raise
    except Exception as exc:
        raise _db_error("set_venue", exc) from exc
