"""Pydantic v2 request and response schemas for the auth module.

Hard Rule 4: use field_validator (classmethod), model_config = ConfigDict(...).
Hard Rule 1: every email field runs validate_edu_sg_email.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.utils.validators import (
    validate_edu_sg_email,
    validate_full_name,
    validate_password,
)

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str
    email: str
    password: str
    preferred_language: Literal["English", "Chinese", "Malay", "Tamil"]

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, v: str) -> str:
        return validate_full_name(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validate_edu_sg_email(v)

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password(v)


class VerifyEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str


class ResendVerificationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validate_edu_sg_email(v)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        # Hard Rule 1: validate domain on every email-accepting endpoint
        return validate_edu_sg_email(v)

    # NOTE: password rules are NOT validated on login — only on register/reset.
    # An incorrect password produces a 401, not a 422.


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validate_edu_sg_email(v)


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _new_password(cls, v: str) -> str:
        return validate_password(v)


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _new_password(cls, v: str) -> str:
        return validate_password(v)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    refresh_token: str


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class MessageResponse(BaseModel):
    """Generic single-message response body."""
    message: str


class RegisterResponse(BaseModel):
    """Response returned after successful registration."""
    message: str


class TokenResponse(BaseModel):
    """Returned on successful login — tokens + minimal user context."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    preferred_language: str
    roles: list[str]


class AccessTokenResponse(BaseModel):
    """Returned on token refresh — new access token only."""
    access_token: str
    token_type: str = "bearer"
