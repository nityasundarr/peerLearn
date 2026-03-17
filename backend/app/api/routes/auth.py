"""FastAPI route handlers for /auth/*.

Handler responsibilities:
  - Deserialise request body (Pydantic handles validation + 422 automatically)
  - Apply rate limiting where required (Hard Rule 7)
  - Delegate all logic to auth_service
  - Return a clean response model

Hard Rule 6: DB exceptions are already converted to AppError by auth_db;
             this layer does not need additional try/except.
"""

from fastapi import APIRouter, Depends, Request, status

from app.core.deps import get_current_user
from app.models.auth import (
    AccessTokenResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from app.services import auth_service
from app.utils.rate_limiter import check_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# UC-1.1  POST /auth/register
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegisterResponse,
    summary="Create a new user account (inactive until email verified)",
)
async def register(body: RegisterRequest) -> RegisterResponse:
    auth_service.register_user(
        full_name=body.full_name,
        email=body.email,
        password=body.password,
        preferred_language=body.preferred_language,
    )
    return RegisterResponse(
        message=(
            "Account created successfully. "
            "Please check your email to verify your account before logging in."
        )
    )


# ---------------------------------------------------------------------------
# UC-1.2  POST /auth/verify-email
# ---------------------------------------------------------------------------

@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Activate account using the token from the verification email",
)
async def verify_email(body: VerifyEmailRequest) -> MessageResponse:
    auth_service.verify_email(token=body.token)
    return MessageResponse(
        message="Email verified successfully. You can now log in."
    )


# ---------------------------------------------------------------------------
# UC-1.3 / UC-1.6  POST /auth/resend-verification
# ---------------------------------------------------------------------------

@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    summary="Request a new verification email (rate-limited: 3 per hour per email)",
)
async def resend_verification(body: ResendVerificationRequest) -> MessageResponse:
    # Hard Rule 7: rate limit before any DB or email work
    check_rate_limit(body.email)

    auth_service.resend_verification(email=body.email)

    # Generic message regardless of outcome — prevents email enumeration
    return MessageResponse(
        message=(
            "If this email address is registered and not yet verified, "
            "a new verification link has been sent."
        )
    )


# ---------------------------------------------------------------------------
# UC-1.4  POST /auth/login
# ---------------------------------------------------------------------------

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Sign in and receive JWT access + refresh tokens",
)
async def login(body: LoginRequest, request: Request) -> TokenResponse:
    # Extract client IP for the audit log (may be None in tests)
    ip_address: str | None = request.client.host if request.client else None

    result = auth_service.login_user(
        email=body.email,
        password=body.password,
        ip_address=ip_address,
    )
    return TokenResponse(**result)


# ---------------------------------------------------------------------------
# UC-1.5a  POST /auth/forgot-password
# ---------------------------------------------------------------------------

@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request a password reset email (rate-limited: 3 per hour per email)",
)
async def forgot_password(body: ForgotPasswordRequest) -> MessageResponse:
    # Hard Rule 7: rate limit before any DB or email work
    check_rate_limit(body.email)

    auth_service.forgot_password(email=body.email)

    # Generic — never reveal whether the email is registered
    return MessageResponse(
        message=(
            "If this email is registered and verified, "
            "a password reset link has been sent."
        )
    )


# ---------------------------------------------------------------------------
# UC-1.5b  POST /auth/reset-password
# ---------------------------------------------------------------------------

@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Set a new password using a valid reset token",
)
async def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    auth_service.reset_password(
        token=body.token,
        new_password=body.new_password,
    )
    return MessageResponse(
        message="Password reset successfully. You can now log in with your new password."
    )


# ---------------------------------------------------------------------------
# POST /auth/change-password  (authenticated)
# ---------------------------------------------------------------------------

@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change password when already logged in (requires current password)",
)
async def change_password(
    body: ChangePasswordRequest,
    user_id: str = Depends(get_current_user),
) -> MessageResponse:
    # Hard Rule 2: user_id from JWT dep — never from body
    auth_service.change_password(
        user_id=user_id,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return MessageResponse(message="Password changed successfully.")


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------

@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Exchange a valid refresh token for a new access token",
)
async def refresh(body: RefreshRequest) -> AccessTokenResponse:
    new_access_token = auth_service.refresh_access_token(
        refresh_token_str=body.refresh_token,
    )
    return AccessTokenResponse(access_token=new_access_token)
