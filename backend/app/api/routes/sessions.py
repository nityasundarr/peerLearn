"""FastAPI route handlers for /sessions/*.

All routes require a valid Bearer JWT.
Hard Rule 2: user_id from get_current_user — never from body.
State machine transitions enforced in session_service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import get_current_user
from app.models.session import (
    CancelSessionBody,
    ConfirmSlotBody,
    ConfirmVenueBody,
    CreateSessionBody,
    ProposeSlotsBody,
    SessionResponse,
)
from app.services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# UC-3.4  POST /sessions  (create — tutee selects tutor)
# ---------------------------------------------------------------------------

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=SessionResponse,
    summary="Create a session by selecting a tutor from recommendations (UC-3.4)",
)
async def create_session(
    body: CreateSessionBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.create_session(user_id, body)


# ---------------------------------------------------------------------------
# SRS 2.11  GET /sessions
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[SessionResponse],
    summary="List sessions with optional role and status filters (SRS 2.11)",
)
async def list_sessions(
    user_id: Annotated[str, Depends(get_current_user)],
    role: Annotated[str | None, Query(description="tutee | tutor")] = None,
    status_filter: Annotated[
        str | None,
        Query(alias="status", description="upcoming | pending | past | cancelled"),
    ] = None,
) -> list[SessionResponse]:
    return session_service.list_sessions(user_id, role, status_filter)


# ---------------------------------------------------------------------------
# SRS 2.11  GET /sessions/{id}
# ---------------------------------------------------------------------------

@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Get full session detail (SRS 2.11)",
)
async def get_session(
    session_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.get_session(session_id, user_id)


# ---------------------------------------------------------------------------
# UC-4.5  POST /sessions/{id}/accept
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/accept",
    response_model=SessionResponse,
    summary="Tutor accepts → tutor_accepted, opens messaging channel (UC-4.5)",
)
async def accept_session(
    session_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.accept_session(session_id, user_id)


# ---------------------------------------------------------------------------
# UC-4.6  POST /sessions/{id}/decline
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/decline",
    response_model=SessionResponse,
    summary="Tutor declines → cancelled, notifies tutee (UC-4.6)",
)
async def decline_session(
    session_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.decline_session(session_id, user_id)


# ---------------------------------------------------------------------------
# UC-4.7  POST /sessions/{id}/propose-slots
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/propose-slots",
    response_model=SessionResponse,
    summary="Tutor proposes time slots for tutee to confirm (UC-4.7)",
)
async def propose_slots(
    session_id: str,
    body: ProposeSlotsBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.propose_slots(session_id, user_id, body)


# ---------------------------------------------------------------------------
# UC-5.2  POST /sessions/{id}/confirm-slot
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/confirm-slot",
    response_model=SessionResponse,
    summary="Tutee confirms one time slot → pending_confirmation (UC-5.2)",
)
async def confirm_slot(
    session_id: str,
    body: ConfirmSlotBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.confirm_slot(session_id, user_id, body)


# ---------------------------------------------------------------------------
# UC-3.7 / SRS 2.9.4  POST /sessions/{id}/cancel
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/cancel",
    response_model=SessionResponse,
    summary="Cancel session from any active state; sets messaging read-only (SRS 2.9.4)",
)
async def cancel_session(
    session_id: str,
    body: CancelSessionBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.cancel_session(session_id, user_id, body)


# ---------------------------------------------------------------------------
# UC-5.3 / UC-5.4  POST /sessions/{id}/venue
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/venue",
    response_model=SessionResponse,
    summary="Confirm selected or manual venue (UC-5.3, UC-5.4)",
)
async def set_venue(
    session_id: str,
    body: ConfirmVenueBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> SessionResponse:
    return session_service.set_venue(session_id, user_id, body)
