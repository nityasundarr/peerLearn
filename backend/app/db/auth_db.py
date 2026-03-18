"""Supabase query functions for the auth domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions are caught here, logged, and re-raised as AppError(500)
             so internal DB details never reach the client.

Tables touched: users, user_credentials, email_verifications,
                password_resets, audit_logs
"""

import logging
from datetime import datetime

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# users table
# ---------------------------------------------------------------------------

def get_user_by_email(email: str) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .select("*")
            .eq("email", email)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def get_user_by_id(user_id: str) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .select("*")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def create_user(
    full_name: str,
    email: str,
    preferred_language: str,
) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .insert(
                {
                    "full_name": full_name,
                    "email": email,
                    "preferred_language": preferred_language,
                    "is_active": False,
                    "is_locked": False,
                    "failed_attempts": 0,
                    "roles": [],
                }
            )
            .execute()
        )
        if result is None:
            return None
        return result.data[0]
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def activate_user(user_id: str) -> None:
    try:
        supabase.table("users").update({"is_active": True}).eq("id", user_id).execute()
    except Exception as exc:
        raise _db_error("activate_user", exc) from exc


# ---------------------------------------------------------------------------
# user_credentials table
# ---------------------------------------------------------------------------

def create_user_credentials(user_id: str, password_hash: str) -> None:
    try:
        supabase.table("user_credentials").insert(
            {"user_id": user_id, "password_hash": password_hash}
        ).execute()
    except Exception as exc:
        raise _db_error("create_user_credentials", exc) from exc


def get_credentials_by_user_id(user_id: str) -> dict | None:
    try:
        result = (
            supabase.table("user_credentials")
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# email_verifications table
# ---------------------------------------------------------------------------

def create_email_verification(
    user_id: str,
    token: str,
    expires_at: datetime,
) -> None:
    try:
        supabase.table("email_verifications").insert(
            {
                "user_id": user_id,
                "token": token,
                "expires_at": expires_at.isoformat(),
            }
        ).execute()
    except Exception as exc:
        raise _db_error("create_email_verification", exc) from exc


def get_valid_verification_token(token: str) -> dict | None:
    """Return the token record only if it is unused and not yet expired."""
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        result = (
            supabase.table("email_verifications")
            .select("*")
            .eq("token", token)
            .is_("used_at", "null")
            .gt("expires_at", now_iso)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def mark_verification_token_used(token_id: str) -> None:
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        (
            supabase.table("email_verifications")
            .update({"used_at": now_iso})
            .eq("id", token_id)
            .execute()
        )
    except Exception as exc:
        raise _db_error("mark_verification_token_used", exc) from exc


def invalidate_user_verification_tokens(user_id: str) -> None:
    """Mark all unused verification tokens for a user as used."""
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        (
            supabase.table("email_verifications")
            .update({"used_at": now_iso})
            .eq("user_id", user_id)
            .is_("used_at", "null")
            .execute()
        )
    except Exception as exc:
        raise _db_error("invalidate_user_verification_tokens", exc) from exc


# ---------------------------------------------------------------------------
# users table — login state helpers
# ---------------------------------------------------------------------------

def set_failed_attempts(user_id: str, count: int) -> None:
    """Set the failed_attempts counter to an explicit value."""
    try:
        supabase.table("users").update({"failed_attempts": count}).eq("id", user_id).execute()
    except Exception as exc:
        raise _db_error("set_failed_attempts", exc) from exc


def lock_user(user_id: str) -> None:
    """Lock the account after exceeding the max failed-login threshold."""
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        supabase.table("users").update(
            {"is_locked": True, "locked_at": now_iso}
        ).eq("id", user_id).execute()
    except Exception as exc:
        raise _db_error("lock_user", exc) from exc


def unlock_user(user_id: str) -> None:
    """Unlock the account and clear the failure counter (on password reset)."""
    try:
        supabase.table("users").update(
            {"is_locked": False, "locked_at": None, "failed_attempts": 0}
        ).eq("id", user_id).execute()
    except Exception as exc:
        raise _db_error("unlock_user", exc) from exc


# ---------------------------------------------------------------------------
# user_credentials table — password updates
# ---------------------------------------------------------------------------

def update_password_hash(user_id: str, password_hash: str) -> None:
    try:
        supabase.table("user_credentials").update(
            {"password_hash": password_hash}
        ).eq("user_id", user_id).execute()
    except Exception as exc:
        raise _db_error("update_password_hash", exc) from exc


# ---------------------------------------------------------------------------
# password_resets table
# ---------------------------------------------------------------------------

def create_password_reset(user_id: str, token: str, expires_at: datetime) -> None:
    try:
        supabase.table("password_resets").insert(
            {
                "user_id": user_id,
                "token": token,
                "expires_at": expires_at.isoformat(),
            }
        ).execute()
    except Exception as exc:
        raise _db_error("create_password_reset", exc) from exc


def get_valid_password_reset_token(token: str) -> dict | None:
    """Return the record only if unused and not yet expired."""
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        result = (
            supabase.table("password_resets")
            .select("*")
            .eq("token", token)
            .is_("used_at", "null")
            .gt("expires_at", now_iso)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data
    except Exception as exc:
        logger.error("DB error: %s", exc)
        return None


def mark_password_reset_used(token_id: str) -> None:
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        supabase.table("password_resets").update(
            {"used_at": now_iso}
        ).eq("id", token_id).execute()
    except Exception as exc:
        raise _db_error("mark_password_reset_used", exc) from exc


def invalidate_user_password_resets(user_id: str) -> None:
    """Mark all unused password reset tokens for a user as used."""
    try:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        (
            supabase.table("password_resets")
            .update({"used_at": now_iso})
            .eq("user_id", user_id)
            .is_("used_at", "null")
            .execute()
        )
    except Exception as exc:
        raise _db_error("invalidate_user_password_resets", exc) from exc


# ---------------------------------------------------------------------------
# audit_logs table
# ---------------------------------------------------------------------------

def create_audit_log(
    email: str,
    event_type: str,
    outcome: str,
    ip_address: str | None = None,
    user_id: str | None = None,
    failure_reason: str | None = None,
) -> None:
    """Write one sign-in audit record.  user_id is NULL for unknown emails."""
    try:
        supabase.table("audit_logs").insert(
            {
                "user_id": user_id,
                "email": email,
                "ip_address": ip_address,
                "event_type": event_type,
                "outcome": outcome,
                "failure_reason": failure_reason,
            }
        ).execute()
    except Exception as exc:
        # Audit log failure must not interrupt the auth flow — log only
        logger.error("Audit log write failed: %s", exc)
