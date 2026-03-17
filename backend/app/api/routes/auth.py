"""FastAPI route handlers for /auth/*.

Handler responsibilities:
  - Deserialise request body (Pydantic handles validation + 422 automatically)
  - Apply rate limiting where required (Hard Rule 7)
  - Delegate all logic to auth_service
  - Return a clean response model

Hard Rule 6: DB exceptions are already converted to AppError by auth_db;
             this layer does not need additional try/except.
"""

from fastapi import APIRouter, status

from app.models.auth import (
    MessageResponse,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
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
