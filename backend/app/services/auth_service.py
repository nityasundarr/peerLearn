"""Business logic for the auth module.

Responsibilities:
  - Orchestrate DB calls (auth_db) and security helpers
  - Token generation and expiry
  - Email dispatch (SMTP if configured, stdout log in dev)
  - Rate-limit enforcement is handled in the route layer before calling here

Hard rules applied:
  Rule 1  — email domain validated by Pydantic before reaching service
  Rule 6  — DB errors surface as AppError from auth_db; never re-wrapped raw
  Rule 7  — rate limit checked in route handler
"""

import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db import auth_db

logger = logging.getLogger(__name__)

# Token TTLs
_VERIFICATION_TOKEN_TTL_HOURS: int = 24
_RESET_TOKEN_TTL_HOURS: int = 1          # SRS: 1hr expiry for reset links

# SRS 2.1.2: lock after 5 consecutive failed attempts
_MAX_FAILED_ATTEMPTS: int = 5


# ---------------------------------------------------------------------------
# UC-1.1  Register
# ---------------------------------------------------------------------------

def register_user(
    full_name: str,
    email: str,
    password: str,
    preferred_language: str,
) -> None:
    """Create an inactive user account and send a verification email.

    Raises ConflictError if the email is already registered.
    """
    existing = auth_db.get_user_by_email(email)
    if existing:
        raise ConflictError("An account with this email address already exists.")

    pw_hash = hash_password(password)

    user = auth_db.create_user(
        full_name=full_name,
        email=email,
        preferred_language=preferred_language,
    )

    auth_db.create_user_credentials(
        user_id=user["id"],
        password_hash=pw_hash,
    )

    token, expires_at = _generate_verification_token()
    auth_db.create_email_verification(
        user_id=user["id"],
        token=token,
        expires_at=expires_at,
    )

    _send_verification_email(
        to_email=email,
        full_name=full_name,
        token=token,
    )


# ---------------------------------------------------------------------------
# UC-1.2  Verify email
# ---------------------------------------------------------------------------

def verify_email(token: str) -> None:
    """Validate the token and activate the user account.

    Raises UnprocessableError if the token is invalid or expired.
    """
    record = auth_db.get_valid_verification_token(token)
    if not record:
        raise UnprocessableError(
            "This verification link is invalid or has expired. "
            "Please request a new verification email."
        )

    auth_db.mark_verification_token_used(record["id"])
    auth_db.activate_user(record["user_id"])


# ---------------------------------------------------------------------------
# UC-1.3 / UC-1.6  Resend verification
# ---------------------------------------------------------------------------

def resend_verification(email: str) -> None:
    """Invalidate previous tokens, issue a new one, and send the email.

    Always returns silently when the email is not found or already verified
    to prevent user enumeration.  The route layer has already applied the
    rate limit before calling this function.
    """
    user = auth_db.get_user_by_email(email)

    # Silent return — do not reveal whether the email exists
    if not user:
        return

    # Silent return — user already active; they should just log in
    if user.get("is_active"):
        return

    # Invalidate all pending tokens and issue a fresh one
    auth_db.invalidate_user_verification_tokens(user["id"])

    token, expires_at = _generate_verification_token()
    auth_db.create_email_verification(
        user_id=user["id"],
        token=token,
        expires_at=expires_at,
    )

    _send_verification_email(
        to_email=email,
        full_name=user["full_name"],
        token=token,
    )


# ---------------------------------------------------------------------------
# UC-1.4  Login
# ---------------------------------------------------------------------------

def login_user(
    email: str,
    password: str,
    ip_address: str | None,
) -> dict:
    """Authenticate a user and return JWT tokens + user context.

    Raises HTTP 401 with specific messages per SRS 2.1.2:
      - account locked          → show lock message + recovery hint
      - email not verified      → show unverified message
      - wrong password / not found → generic "Invalid email or password"

    Always writes an audit log row regardless of outcome.
    """
    user = auth_db.get_user_by_email(email)

    # --- user not found: log + generic error (don't reveal non-existence) ---
    if not user:
        auth_db.create_audit_log(
            email=email,
            event_type="login_failure",
            outcome="failure",
            ip_address=ip_address,
            failure_reason="user_not_found",
        )
        raise NotFoundError("Invalid email or password.")

    user_id = user["id"]

    # --- account locked ---
    if user.get("is_locked"):
        auth_db.create_audit_log(
            email=email, event_type="login_failure", outcome="failure",
            ip_address=ip_address, user_id=user_id, failure_reason="locked",
        )
        raise UnprocessableError(
            "Your account has been locked after too many failed login attempts. "
            "Please reset your password using 'Forgot Password' to unlock your account."
        )

    # --- email not verified ---
    if not user.get("is_active"):
        auth_db.create_audit_log(
            email=email, event_type="login_failure", outcome="failure",
            ip_address=ip_address, user_id=user_id, failure_reason="unverified",
        )
        raise UnprocessableError(
            "Your email address has not been verified. "
            "Please check your inbox or request a new verification email."
        )

    # --- password check ---
    creds = auth_db.get_credentials_by_user_id(user_id)
    if not creds or not verify_password(password, creds["password_hash"]):
        # Increment failed attempts; lock if threshold reached
        current_count = user.get("failed_attempts") or 0
        new_count = current_count + 1
        auth_db.set_failed_attempts(user_id, new_count)
        if new_count >= _MAX_FAILED_ATTEMPTS:
            auth_db.lock_user(user_id)

        auth_db.create_audit_log(
            email=email, event_type="login_failure", outcome="failure",
            ip_address=ip_address, user_id=user_id, failure_reason="wrong_password",
        )
        raise NotFoundError("Invalid email or password.")

    # --- success: reset counter, issue tokens, write audit log ---
    auth_db.set_failed_attempts(user_id, 0)

    roles: list[str] = user.get("roles") or []
    access_token = create_access_token(
        subject=user_id,
        extra_claims={"roles": roles, "email": email},
    )
    refresh_token = create_refresh_token(subject=user_id)

    auth_db.create_audit_log(
        email=email, event_type="login_success", outcome="success",
        ip_address=ip_address, user_id=user_id,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": user_id,
        "email": user["email"],
        "full_name": user["full_name"],
        "preferred_language": user["preferred_language"],
        "roles": roles,
    }


# ---------------------------------------------------------------------------
# UC-1.5a  Forgot password
# ---------------------------------------------------------------------------

def forgot_password(email: str) -> None:
    """Generate a 1-hour password reset token and email it.

    Always returns silently — never reveals whether the email is registered.
    Rate limiting is enforced in the route layer before calling here.
    Only sends to accounts that exist and are active (prevents bypass of
    email verification via the reset flow).
    """
    user = auth_db.get_user_by_email(email)
    if not user:
        return

    # Require an active account — prevents using reset to bypass verification
    if not user.get("is_active"):
        return

    auth_db.invalidate_user_password_resets(user["id"])

    token, expires_at = _generate_reset_token()
    auth_db.create_password_reset(
        user_id=user["id"],
        token=token,
        expires_at=expires_at,
    )

    _send_password_reset_email(
        to_email=email,
        full_name=user["full_name"],
        token=token,
    )


# ---------------------------------------------------------------------------
# UC-1.5b  Reset password
# ---------------------------------------------------------------------------

def reset_password(token: str, new_password: str) -> None:
    """Validate the reset token, update the password, and unlock the account.

    Raises UnprocessableError if the token is invalid or expired.
    """
    record = auth_db.get_valid_password_reset_token(token)
    if not record:
        raise UnprocessableError(
            "This password reset link is invalid or has expired. "
            "Please request a new reset email."
        )

    user_id = record["user_id"]
    new_hash = hash_password(new_password)

    auth_db.update_password_hash(user_id, new_hash)
    auth_db.mark_password_reset_used(record["id"])

    # SRS: successful password reset unlocks the account
    auth_db.unlock_user(user_id)

    auth_db.create_audit_log(
        email="",   # email not in the token record; route can pass it if needed
        event_type="password_reset",
        outcome="success",
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Change password (authenticated)
# ---------------------------------------------------------------------------

def change_password(
    user_id: str,
    current_password: str,
    new_password: str,
) -> None:
    """Verify the current password server-side, then update to the new one.

    Raises UnprocessableError if current_password is wrong.
    Hard Rule 2: user_id comes from the JWT dep, never from the request body.
    """
    creds = auth_db.get_credentials_by_user_id(user_id)
    if not creds or not verify_password(current_password, creds["password_hash"]):
        raise UnprocessableError("Current password is incorrect.")

    new_hash = hash_password(new_password)
    auth_db.update_password_hash(user_id, new_hash)

    auth_db.create_audit_log(
        email="",
        event_type="password_changed",
        outcome="success",
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Refresh access token
# ---------------------------------------------------------------------------

def refresh_access_token(refresh_token_str: str) -> str:
    """Validate a refresh token and issue a new short-lived access token.

    Raises UnprocessableError if the token is invalid, expired, wrong type,
    or belongs to a locked / inactive account.
    """
    from jwt.exceptions import InvalidTokenError  # local import avoids circular at module level

    try:
        payload = decode_token(refresh_token_str)
    except InvalidTokenError:
        raise UnprocessableError("Invalid or expired refresh token.")

    if payload.get("type") != "refresh":
        raise UnprocessableError("Invalid or expired refresh token.")

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise UnprocessableError("Invalid or expired refresh token.")

    user = auth_db.get_user_by_id(user_id)
    if not user or not user.get("is_active") or user.get("is_locked"):
        raise UnprocessableError("Invalid or expired refresh token.")

    roles: list[str] = user.get("roles") or []
    return create_access_token(
        subject=user_id,
        extra_claims={"roles": roles, "email": user["email"]},
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _generate_verification_token() -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=_VERIFICATION_TOKEN_TTL_HOURS
    )
    return token, expires_at


def _generate_reset_token() -> tuple[str, datetime]:
    """SRS: 1-hour expiry for password reset links."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=_RESET_TOKEN_TTL_HOURS)
    return token, expires_at


def _send_verification_email(to_email: str, full_name: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    subject = "Verify your PeerLearn account"

    text_body = (
        f"Hi {full_name},\n\n"
        f"Please verify your email address by clicking the link below:\n\n"
        f"{verify_url}\n\n"
        f"This link expires in {_VERIFICATION_TOKEN_TTL_HOURS} hours.\n\n"
        f"If you did not create a PeerLearn account, you can safely ignore this email.\n\n"
        f"— The PeerLearn Team"
    )

    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#1c1917;">
  <div style="background:#1a5f4a;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;">PeerLearn</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e7e5e4;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="color:#1c1917;margin-top:0;">Verify your email address</h2>
    <p style="color:#57534e;">Hi {full_name},</p>
    <p style="color:#57534e;">
      Click the button below to verify your email address and activate your PeerLearn account.
    </p>
    <a href="{verify_url}"
       style="display:inline-block;padding:14px 28px;background:#1a5f4a;color:#fff;
              text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;">
      Verify Email Address
    </a>
    <p style="color:#a8a29e;font-size:13px;margin-top:24px;">
      This link expires in {_VERIFICATION_TOKEN_TTL_HOURS} hours. If you did not create a PeerLearn
      account, you can safely ignore this email.
    </p>
    <p style="color:#a8a29e;font-size:12px;word-break:break-all;">
      Or copy this link: {verify_url}
    </p>
  </div>
</body>
</html>"""

    if not settings.SMTP_HOST:
        # Development mode: print to stdout instead of sending
        logger.info(
            "[DEV EMAIL] To: %s | Subject: %s | Verify URL: %s",
            to_email,
            subject,
            verify_url,
        )
        return

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
    except smtplib.SMTPException as exc:
        # Log but do not fail the request — user can resend
        logger.error("Failed to send verification email to %s: %s", to_email, exc)


def _send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    subject = "Reset your PeerLearn password"

    text_body = (
        f"Hi {full_name},\n\n"
        f"We received a request to reset your PeerLearn password.\n\n"
        f"Click the link below to choose a new password:\n\n"
        f"{reset_url}\n\n"
        f"This link expires in {_RESET_TOKEN_TTL_HOURS} hour. "
        f"If you did not request a password reset, you can safely ignore this email.\n\n"
        f"— The PeerLearn Team"
    )

    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#1c1917;">
  <div style="background:#1a5f4a;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;">PeerLearn</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e7e5e4;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="color:#1c1917;margin-top:0;">Reset your password</h2>
    <p style="color:#57534e;">Hi {full_name},</p>
    <p style="color:#57534e;">
      Click the button below to choose a new password for your PeerLearn account.
    </p>
    <a href="{reset_url}"
       style="display:inline-block;padding:14px 28px;background:#1a5f4a;color:#fff;
              text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;">
      Reset Password
    </a>
    <p style="color:#a8a29e;font-size:13px;margin-top:24px;">
      This link expires in {_RESET_TOKEN_TTL_HOURS} hour. If you did not request a password
      reset, you can safely ignore this email — your password will not change.
    </p>
    <p style="color:#a8a29e;font-size:12px;word-break:break-all;">
      Or copy this link: {reset_url}
    </p>
  </div>
</body>
</html>"""

    if not settings.SMTP_HOST:
        logger.info(
            "[DEV EMAIL] To: %s | Subject: %s | Reset URL: %s",
            to_email, subject, reset_url,
        )
        return

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
    except smtplib.SMTPException as exc:
        logger.error("Failed to send password reset email to %s: %s", to_email, exc)
