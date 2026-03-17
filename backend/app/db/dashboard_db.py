"""Supabase query functions for the dashboard domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  tutoring_sessions   — session counts, upcoming sessions, pending actions
  messaging_channels  — channel IDs for unread message count
  session_messages    — unread message count

These are read-only aggregation queries used only by the dashboard endpoints.
Domain-specific write operations live in their own db modules (sessions_db,
messaging_db, etc.) added in later phases.
"""

import logging

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# Status values grouped by dashboard tab
_PENDING_STATUSES = [
    "pending_tutor_selection",
    "tutor_accepted",
    "pending_confirmation",
]
_COMPLETED_STATUSES = ["completed_attended", "completed_no_show"]
_UPCOMING_STATUSES = ["confirmed"]
_CANCELLED_STATUSES = ["cancelled"]

# Status values that require the user to take action
_ACTION_STATUSES = [
    "pending_tutor_selection",  # tutor: accept/decline
    "tutor_accepted",            # tutee: confirm time slot
    "pending_confirmation",      # tutee: pay
]


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Session counts
# ---------------------------------------------------------------------------

def count_sessions_by_group(user_id: str) -> dict[str, int]:
    """Return session counts grouped into upcoming/pending/completed/cancelled.

    A user is included if they appear as either tutee_id or tutor_id.
    """
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id, status", count="exact")
            .or_(f"tutee_id.eq.{user_id},tutor_id.eq.{user_id}")
            .execute()
        )
        rows = result.data or []

        counts: dict[str, int] = {
            "upcoming": 0,
            "pending": 0,
            "completed": 0,
            "cancelled": 0,
        }
        for row in rows:
            s = row.get("status", "")
            if s in _UPCOMING_STATUSES:
                counts["upcoming"] += 1
            elif s in _PENDING_STATUSES:
                counts["pending"] += 1
            elif s in _COMPLETED_STATUSES:
                counts["completed"] += 1
            elif s in _CANCELLED_STATUSES:
                counts["cancelled"] += 1
        return counts
    except Exception as exc:
        raise _db_error("count_sessions_by_group", exc) from exc


# ---------------------------------------------------------------------------
# Upcoming sessions
# ---------------------------------------------------------------------------

def get_upcoming_sessions(user_id: str, limit: int = 3) -> list[dict]:
    """Return the next N confirmed sessions for the user, soonest first."""
    try:
        from datetime import datetime, timezone

        now_iso = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("tutoring_sessions")
            .select("id, status, tutee_id, tutor_id, academic_level, scheduled_at")
            .or_(f"tutee_id.eq.{user_id},tutor_id.eq.{user_id}")
            .in_("status", _UPCOMING_STATUSES)
            .gte("scheduled_at", now_iso)
            .order("scheduled_at", desc=False)
            .limit(limit)
            .execute()
        )
        rows = result.data or []
        # Tag each row with the user's role in the session
        for row in rows:
            row["role"] = "tutee" if row.get("tutee_id") == user_id else "tutor"
        return rows
    except Exception as exc:
        raise _db_error("get_upcoming_sessions", exc) from exc


# ---------------------------------------------------------------------------
# Pending actions
# ---------------------------------------------------------------------------

def get_pending_actions(user_id: str) -> list[dict]:
    """Return sessions that require action from the current user.

    Action types:
      respond_to_request — tutor: session in pending_tutor_selection
      confirm_slot       — tutee: session in tutor_accepted
      awaiting_payment   — tutee: session in pending_confirmation
    """
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id, status, tutee_id, tutor_id, academic_level")
            .or_(f"tutee_id.eq.{user_id},tutor_id.eq.{user_id}")
            .in_("status", _ACTION_STATUSES)
            .execute()
        )
        rows = result.data or []

        actions: list[dict] = []
        for row in rows:
            status = row.get("status", "")
            is_tutee = row.get("tutee_id") == user_id
            is_tutor = row.get("tutor_id") == user_id

            if status == "pending_tutor_selection" and is_tutor:
                actions.append({
                    "type": "respond_to_request",
                    "session_id": row["id"],
                    "description": "A tutee is waiting for your response to their request.",
                })
            elif status == "tutor_accepted" and is_tutee:
                actions.append({
                    "type": "confirm_slot",
                    "session_id": row["id"],
                    "description": "Your tutor has proposed time slots. Please confirm one.",
                })
            elif status == "pending_confirmation" and is_tutee:
                actions.append({
                    "type": "awaiting_payment",
                    "session_id": row["id"],
                    "description": "Your session is confirmed. Complete payment to lock it in.",
                })
        return actions
    except Exception as exc:
        raise _db_error("get_pending_actions", exc) from exc


# ---------------------------------------------------------------------------
# Badge counts
# ---------------------------------------------------------------------------

def count_unread_messages(user_id: str) -> int:
    """Count unread messages in all session channels the user is part of.

    Performed in three Supabase queries:
      1. Get session IDs where user is tutee or tutor
      2. Get channel IDs for those sessions
      3. Count unread messages in those channels not sent by the user
    """
    try:
        # Step 1: session IDs
        sessions_result = (
            supabase.table("tutoring_sessions")
            .select("id")
            .or_(f"tutee_id.eq.{user_id},tutor_id.eq.{user_id}")
            .execute()
        )
        session_ids = [r["id"] for r in (sessions_result.data or [])]
        if not session_ids:
            return 0

        # Step 2: channel IDs
        channels_result = (
            supabase.table("messaging_channels")
            .select("id")
            .in_("session_id", session_ids)
            .execute()
        )
        channel_ids = [r["id"] for r in (channels_result.data or [])]
        if not channel_ids:
            return 0

        # Step 3: unread message count (sender ≠ current user)
        messages_result = (
            supabase.table("session_messages")
            .select("id", count="exact")
            .in_("channel_id", channel_ids)
            .neq("sender_id", user_id)
            .eq("is_read", False)
            .execute()
        )
        return messages_result.count or 0
    except Exception as exc:
        raise _db_error("count_unread_messages", exc) from exc


def count_pending_tutoring(user_id: str) -> int:
    """Count sessions that currently require the user's attention.

    This is the badge count for the "Tutoring" tab in DashboardLayout.
    Includes both incoming requests (tutor) and sessions awaiting action (tutee).
    """
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id", count="exact")
            .or_(f"tutee_id.eq.{user_id},tutor_id.eq.{user_id}")
            .in_("status", _ACTION_STATUSES)
            .execute()
        )
        return result.count or 0
    except Exception as exc:
        raise _db_error("count_pending_tutoring", exc) from exc
