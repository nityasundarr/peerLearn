"""FastAPI route handlers for /users/*.

All routes require a valid Bearer JWT.
Hard Rule 2: user_id is always obtained from get_current_user — never from
             the request body or URL path for self-service operations.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import (
    UpdatePrivacyRequest,
    UpdateProfileRequest,
    UserPrivacyResponse,
    UserProfileResponse,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# UC-2.2  GET /users/me
# ---------------------------------------------------------------------------

@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Return the authenticated user's public profile",
)
async def get_me(
    user_id: Annotated[str, Depends(get_current_user)],
) -> UserProfileResponse:
    return user_service.get_profile(user_id)


# ---------------------------------------------------------------------------
# UC-2.2  PATCH /users/me
# ---------------------------------------------------------------------------

@router.patch(
    "/me",
    response_model=UserProfileResponse,
    summary="Update full_name and/or preferred_language (partial update)",
)
async def patch_me(
    body: UpdateProfileRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> UserProfileResponse:
    return user_service.update_profile(user_id, body)


# ---------------------------------------------------------------------------
# UC-2.2  GET /users/me/privacy
# ---------------------------------------------------------------------------

@router.get(
    "/me/privacy",
    response_model=UserPrivacyResponse,
    summary="Return the authenticated user's privacy and notification preferences",
)
async def get_privacy(
    user_id: Annotated[str, Depends(get_current_user)],
) -> UserPrivacyResponse:
    return user_service.get_privacy(user_id)


# ---------------------------------------------------------------------------
# UC-2.2  PATCH /users/me/privacy
# ---------------------------------------------------------------------------

@router.patch(
    "/me/privacy",
    response_model=UserPrivacyResponse,
    summary="Update privacy and/or notification preferences (partial update)",
)
async def patch_privacy(
    body: UpdatePrivacyRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> UserPrivacyResponse:
    return user_service.update_privacy(user_id, body)
