"""FastAPI route handlers for /requests/* and /tutor/requests/*.

All routes require a valid Bearer JWT.
Hard Rule 2: tutee_id always derived from get_current_user — never from body.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import get_current_user
from app.models.request import (
    BroadenRequestBody,
    CreateRequestBody,
    IncomingRequestItem,
    TutoringRequestResponse,
)
from app.services import request_service

router = APIRouter(tags=["requests"])


# ---------------------------------------------------------------------------
# UC-3.1 / UC-3.2  POST /requests
# ---------------------------------------------------------------------------

@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    response_model=TutoringRequestResponse,
    summary="Create a tutoring request, assign tutee role, compute urgency (UC-3.1, UC-3.2)",
)
async def create_request(
    body: CreateRequestBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutoringRequestResponse:
    return request_service.create_request(user_id, body)


# ---------------------------------------------------------------------------
# UC-3.1  GET /requests
# ---------------------------------------------------------------------------

@router.get(
    "/requests",
    response_model=list[TutoringRequestResponse],
    summary="List all tutoring requests for the authenticated tutee (UC-3.1)",
)
async def list_requests(
    user_id: Annotated[str, Depends(get_current_user)],
) -> list[TutoringRequestResponse]:
    return request_service.list_requests(user_id)


# ---------------------------------------------------------------------------
# UC-3.1  GET /requests/{id}
# ---------------------------------------------------------------------------

@router.get(
    "/requests/{request_id}",
    response_model=TutoringRequestResponse,
    summary="Get a single tutoring request (must be owner) (UC-3.1)",
)
async def get_request(
    request_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutoringRequestResponse:
    return request_service.get_request(request_id, user_id)


# ---------------------------------------------------------------------------
# UC-3.6  PATCH /requests/{id}
# ---------------------------------------------------------------------------

@router.patch(
    "/requests/{request_id}",
    response_model=TutoringRequestResponse,
    summary="Broaden search criteria and escalate urgency (UC-3.6, SRS 2.3)",
)
async def broaden_request(
    request_id: str,
    body: BroadenRequestBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutoringRequestResponse:
    return request_service.broaden_request(request_id, user_id, body)


# ---------------------------------------------------------------------------
# UC-3.7  DELETE /requests/{id}
# ---------------------------------------------------------------------------

@router.delete(
    "/requests/{request_id}",
    response_model=TutoringRequestResponse,
    summary="Cancel a tutoring request (UC-3.7)",
)
async def cancel_request(
    request_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> TutoringRequestResponse:
    return request_service.cancel_request(request_id, user_id)


# ---------------------------------------------------------------------------
# UC-4.4  GET /tutor/requests/incoming
# ---------------------------------------------------------------------------

@router.get(
    "/tutor/requests/incoming",
    response_model=list[IncomingRequestItem],
    summary="List pending incoming requests for the authenticated tutor (UC-4.4)",
)
async def get_incoming_requests(
    user_id: Annotated[str, Depends(get_current_user)],
) -> list[IncomingRequestItem]:
    return request_service.get_incoming_requests(user_id)
