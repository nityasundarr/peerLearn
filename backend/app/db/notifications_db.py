"""Supabase query functions for the notifications domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Table: notifications
  id, user_id, type, title, content, is_read, is_mandatory, created_at
"""

import logging

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_COLUMNS = "id, user_id, type, title, content, is_read, is_mandatory, created_at"


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def get_notifications(
    user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Return a page of notifications for a user, ordered newest first.

    Returns (rows, total_count).
    """
    try:
        result = (
            supabase.table("notifications")
            .select(_COLUMNS, count="exact")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return (result.data if result is not None and result.data is not None else []), (result.count if result is not None and result.count is not None else 0)
    except Exception as exc:
        raise _db_error("get_notifications", exc) from exc


def get_notification_by_id(notification_id: str, user_id: str) -> dict | None:
    """Return a single notification, only if it belongs to user_id."""
    try:
        result = (
            supabase.table("notifications")
            .select(_COLUMNS)
            .eq("id", notification_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_notification_by_id", exc) from exc


def get_unread_count(user_id: str) -> int:
    """Return the number of unread notifications for a user."""
    try:
        result = (
            supabase.table("notifications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("is_read", False)
            .execute()
        )
        return result.count if result is not None and result.count is not None else 0
    except Exception as exc:
        raise _db_error("get_unread_count", exc) from exc


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

def mark_notification_read(notification_id: str, user_id: str) -> dict:
    """Mark a single notification as read. Ownership enforced via user_id filter.

    Raises NotFoundError if the notification does not exist for this user.
    Returns the updated row.
    """
    if not notification_id or notification_id == "undefined":
        logger.warning("mark_notification_read called with invalid id: %s", notification_id)
        raise NotFoundError("Notification not found.")
    try:
        supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).eq("user_id", user_id).execute()
        row = get_notification_by_id(notification_id, user_id)
        if row is None:
            raise NotFoundError("Notification not found.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("mark_notification_read", exc) from exc


def create_notification(
    user_id: str,
    notification_type: str,
    title: str,
    content: str,
    is_mandatory: bool = False,
) -> None:
    """Insert a notification row.  Failures are logged but not re-raised —
    a notification write failure must never interrupt the triggering action.
    """
    try:
        supabase.table("notifications").insert(
            {
                "user_id": user_id,
                "type": notification_type,
                "title": title,
                "content": content,
                "is_read": False,
                "is_mandatory": is_mandatory,
            }
        ).execute()
    except Exception as exc:
        logger.error("create_notification failed for user %s: %s", user_id, exc)


def mark_all_read(user_id: str) -> int:
    """Mark all unread notifications for a user as read.

    Returns the number of rows updated.
    """
    try:
        count_before = get_unread_count(user_id)
        supabase.table("notifications").update({"is_read": True}).eq("user_id", user_id).eq("is_read", False).execute()
        return count_before
    except Exception as exc:
        raise _db_error("mark_all_read", exc) from exc
