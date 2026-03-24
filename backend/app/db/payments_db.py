"""Supabase query functions for the payments domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).
Hard Rule 9: fee is ALWAYS computed server-side; this module never reads a
             fee value from any client-supplied payload.

Tables touched:
  payment_transactions  — payment records per session
  tutoring_sessions     — slot conflict check + load cap check
  tutor_profiles        — max_weekly_hours for load cap
  workload              — confirmed hours per week (upserted on payment success)
"""

import logging
from datetime import date, timedelta

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_TX_COLS = "id, session_id, amount, status, provider_transaction_id, created_at"


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# payment_transactions
# ---------------------------------------------------------------------------

def create_payment_transaction(session_id: str, amount: float) -> dict:
    """Insert a payment_transaction row with status=pending."""
    try:
        result = (
            supabase.table("payment_transactions")
            .insert({"session_id": session_id, "amount": amount, "status": "pending"})
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            # supabase-py v2 insert may not return data; fetch by session_id
            fetch = (
                supabase.table("payment_transactions")
                .select(_TX_COLS)
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_payment_transaction", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_payment_transaction", exc) from exc


def get_transaction_by_id(transaction_id: str) -> dict | None:
    """Return a payment_transaction by id."""
    try:
        result = (
            supabase.table("payment_transactions")
            .select(_TX_COLS)
            .eq("id", transaction_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_transaction_by_id", exc) from exc


def get_payment_by_session(session_id: str) -> dict | None:
    """Return the most recent payment_transaction for a session."""
    try:
        result = (
            supabase.table("payment_transactions")
            .select(_TX_COLS)
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None
    except Exception as exc:
        raise _db_error("get_payment_by_session", exc) from exc


def update_payment_status(
    transaction_id: str,
    status: str,
    provider_transaction_id: str | None = None,
) -> dict:
    try:
        updates: dict = {"status": status}
        if provider_transaction_id:
            updates["provider_transaction_id"] = provider_transaction_id
        supabase.table("payment_transactions").update(updates).eq("id", transaction_id).execute()
        row = get_transaction_by_id(transaction_id)
        if row is None:
            raise NotFoundError("Payment transaction not found.")
        return row
    except NotFoundError:
        raise
    except Exception as exc:
        raise _db_error("update_payment_status", exc) from exc


# ---------------------------------------------------------------------------
# Slot conflict check (SRS 2.9.2)
# ---------------------------------------------------------------------------

def count_conflicting_confirmed_sessions(
    tutor_id: str,
    scheduled_at: str,
    exclude_session_id: str,
) -> int:
    """Count confirmed sessions for the tutor at the exact same scheduled_at.

    Returns > 0 if a conflict exists (another session already occupies that slot).
    """
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id", count="exact")
            .eq("tutor_id", tutor_id)
            .eq("scheduled_at", scheduled_at)
            .eq("status", "confirmed")
            .neq("id", exclude_session_id)
            .execute()
        )
        return result.count or 0
    except Exception as exc:
        raise _db_error("count_conflicting_confirmed_sessions", exc) from exc


# ---------------------------------------------------------------------------
# Load cap check (SRS 2.9.2)
# ---------------------------------------------------------------------------

def get_tutor_max_weekly_hours(tutor_id: str) -> int:
    """Fetch max_weekly_hours from tutor_profiles."""
    try:
        result = (
            supabase.table("tutor_profiles")
            .select("max_weekly_hours")
            .eq("user_id", tutor_id)
            .maybe_single()
            .execute()
        )
        if result is not None and result.data is not None:
            return int(result.data.get("max_weekly_hours") or 10)
        return 10  # safe default
    except Exception as exc:
        raise _db_error("get_tutor_max_weekly_hours", exc) from exc


def get_confirmed_hours_for_week(tutor_id: str, week_start: str) -> float:
    """Return the tutor's confirmed_hours for a given ISO week."""
    try:
        result = (
            supabase.table("workload")
            .select("confirmed_hours")
            .eq("tutor_id", tutor_id)
            .eq("week_start", week_start)
            .maybe_single()
            .execute()
        )
        if result is not None and result.data is not None:
            return float(result.data.get("confirmed_hours") or 0)
        return 0.0
    except Exception as exc:
        raise _db_error("get_confirmed_hours_for_week", exc) from exc


# ---------------------------------------------------------------------------
# Workload upsert (called after payment succeeds)
# ---------------------------------------------------------------------------

def add_workload_hours(tutor_id: str, week_start: str, hours: int) -> None:
    """Add confirmed hours to the tutor's workload row for the given week.

    Uses an upsert: if no row exists for that week, creates one.
    If a row exists, increments confirmed_hours.
    """
    try:
        # Fetch current value first (Supabase Python client lacks atomic increment)
        current = get_confirmed_hours_for_week(tutor_id, week_start)
        new_hours = current + hours
        supabase.table("workload").upsert(
            {
                "tutor_id": tutor_id,
                "week_start": week_start,
                "confirmed_hours": new_hours,
            },
            on_conflict="tutor_id,week_start",
        ).execute()
    except AppError:
        raise
    except Exception as exc:
        raise _db_error("add_workload_hours", exc) from exc


def week_start_for_date(dt: date) -> str:
    """Return the ISO Monday-based week start date for a given date."""
    return (dt - timedelta(days=dt.weekday())).isoformat()
