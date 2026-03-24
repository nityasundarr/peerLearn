"""FastAPI route handlers for /sessions/{id}/messages.

Placed in a dedicated router to keep sessions.py focused on state transitions.
Hard Rule 8: contact info stripping enforced in messaging_service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.message import MessageItem, MessageListResponse, SendMessageBody
from app.services import messaging_service

router = APIRouter(prefix="/sessions", tags=["messaging"])


# ---------------------------------------------------------------------------
# UC-5.1  GET /sessions/{id}/messages
# ---------------------------------------------------------------------------

@router.get(
    "/{session_id}/messages",
    response_model=MessageListResponse,
    summary="Fetch message history for a session (UC-5.1, SRS 2.6)",
)
async def get_messages(
    session_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MessageListResponse:
    return messaging_service.get_messages(session_id, user_id, limit=limit, offset=offset)


# ---------------------------------------------------------------------------
# UC-5.1  POST /sessions/{id}/messages
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/messages",
    response_model=MessageItem,
    summary=(
        "Send a message; contact info stripped; blocked if channel is read-only "
        "(UC-5.1, SRS 2.6)"
    ),
)
async def send_message(
    session_id: str,
    body: SendMessageBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> MessageItem:
    return messaging_service.send_message(session_id, user_id, body)
