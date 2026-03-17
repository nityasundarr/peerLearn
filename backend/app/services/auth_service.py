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
from app.core.errors import ConflictError, UnprocessableError
from app.core.security import hash_password
from app.db import auth_db

logger = logging.getLogger(__name__)

# Verification token valid for 24 hours
_VERIFICATION_TOKEN_TTL_HOURS: int = 24


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
# Internal helpers
# ---------------------------------------------------------------------------

def _generate_verification_token() -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=_VERIFICATION_TOKEN_TTL_HOURS
    )
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
