"""Supabase query functions for the messaging domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).
Hard Rule 8: contact info stripping is done in messaging_service BEFORE insert.

Tables:
  messaging_channels — one per session; is_readonly toggles after terminal state
  session_messages   — individual messages within a channel
"""

import logging

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_CHANNEL_COLS = "id, session_id, is_readonly, is_suspended, created_at"
_MESSAGE_COLS = "id, channel_id, sender_id, content, sent_at, is_read"


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# messaging_channels
# ---------------------------------------------------------------------------

def create_channel(session_id: str) -> dict:
    """Create a messaging channel for a session (called at accept time, UC-4.5)."""
    try:
        result = (
            supabase.table("messaging_channels")
            .insert({"session_id": session_id, "is_readonly": False, "is_suspended": False})
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("messaging_channels")
                .select(_CHANNEL_COLS)
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_channel", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_channel", exc) from exc


def get_channel_by_session(session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("messaging_channels")
            .select(_CHANNEL_COLS)
            .eq("session_id", session_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_channel_by_session", exc) from exc


def set_channel_readonly(channel_id: str, is_readonly: bool) -> None:
    """Make channel read-only after session completes or is cancelled (SRS 2.6)."""
    try:
        supabase.table("messaging_channels").update(
            {"is_readonly": is_readonly}
        ).eq("id", channel_id).execute()
    except Exception as exc:
        raise _db_error("set_channel_readonly", exc) from exc


# ---------------------------------------------------------------------------
# session_messages
# ---------------------------------------------------------------------------

def get_messages(
    channel_id: str,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Return a page of messages (oldest first) and the total count."""
    try:
        result = (
            supabase.table("session_messages")
            .select(_MESSAGE_COLS, count="exact")
            .eq("channel_id", channel_id)
            .order("sent_at", desc=False)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return (result.data if result is not None and result.data is not None else []), (result.count if result is not None and result.count is not None else 0)
    except Exception as exc:
        raise _db_error("get_messages", exc) from exc


def create_message(channel_id: str, sender_id: str, content: str) -> dict:
    """Insert one message.  Content must already have contact info stripped."""
    try:
        result = (
            supabase.table("session_messages")
            .insert(
                {
                    "channel_id": channel_id,
                    "sender_id": sender_id,
                    "content": content,
                    "is_read": False,
                }
            )
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("session_messages")
                .select(_MESSAGE_COLS)
                .eq("channel_id", channel_id)
                .eq("sender_id", sender_id)
                .order("sent_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_message", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_message", exc) from exc
