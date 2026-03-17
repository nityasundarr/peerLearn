"""FastAPI route handlers for /tutor-profile/*.

All routes require a valid Bearer JWT.
Hard Rule 2: user_id is always derived from get_current_user — never from
             the request body or URL path.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import get_current_user
from app.models.tutor_profile import (
    AvailabilityRequest,
    AvailabilityResponse,
    SetModeRequest,
    TutorProfileRequest,
    TutorProfileResponse,
)
from app.services import tutor_profile_service

router = APIRouter(prefix="/tutor-profile", tags=["tutor-profile"])


# ---------------------------------------------------------------------------
# UC-4.1  POST /tutor-profile
# ---------------------------------------------------------------------------

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=TutorProfileResponse,
    summary=(
        "Create a tutor profile, assign the tutor role, and seed reliability metrics "
        "(UC-4.1, SRS 2.2.2)"
    ),
)
async def create_tutor_profile(
    body: TutorProfileRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutorProfileResponse:
    return tutor_profile_service.create_profile(user_id, body)


# ---------------------------------------------------------------------------
# UC-4.1  GET /tutor-profile
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=TutorProfileResponse,
    summary="Return the authenticated tutor's profile (UC-4.1)",
)
async def get_tutor_profile(
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutorProfileResponse:
    return tutor_profile_service.get_profile(user_id)


# ---------------------------------------------------------------------------
# UC-4.1  PUT /tutor-profile
# ---------------------------------------------------------------------------

@router.put(
    "",
    response_model=TutorProfileResponse,
    summary="Full replacement of the tutor profile and topics (UC-4.1)",
)
async def update_tutor_profile(
    body: TutorProfileRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutorProfileResponse:
    return tutor_profile_service.update_profile(user_id, body)


# ---------------------------------------------------------------------------
# UC-4.3  PATCH /tutor-profile/mode
# ---------------------------------------------------------------------------

@router.patch(
    "/mode",
    response_model=TutorProfileResponse,
    summary="Activate or deactivate tutor mode (UC-4.3, SRS 2.2.2)",
)
async def set_tutor_mode(
    body: SetModeRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutorProfileResponse:
    return tutor_profile_service.set_mode(user_id, body)


# ---------------------------------------------------------------------------
# UC-4.2  GET /tutor-profile/availability
# ---------------------------------------------------------------------------

@router.get(
    "/availability",
    response_model=AvailabilityResponse,
    summary="Return the weekly availability grid (UC-4.2)",
)
async def get_availability(
    user_id: Annotated[str, Depends(get_current_user)],
) -> AvailabilityResponse:
    return tutor_profile_service.get_availability(user_id)


# ---------------------------------------------------------------------------
# UC-4.2  PUT /tutor-profile/availability
# ---------------------------------------------------------------------------

@router.put(
    "/availability",
    response_model=AvailabilityResponse,
    summary="Replace the weekly availability grid (UC-4.2)",
)
async def update_availability(
    body: AvailabilityRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> AvailabilityResponse:
    return tutor_profile_service.update_availability(user_id, body)
