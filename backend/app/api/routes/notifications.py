"""FastAPI route handlers for /notifications/*.

All routes require a valid Bearer JWT.
Hard Rule 2: user_id derived from get_current_user dep — never from body.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.auth import MessageResponse
from app.models.notification import NotificationItem, NotificationsListResponse
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# UC-2.3  GET /notifications
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=NotificationsListResponse,
    summary="Return paginated notifications for the authenticated user",
)
async def list_notifications(
    user_id: Annotated[str, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100, description="Max items per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Number of items to skip")] = 0,
) -> NotificationsListResponse:
    return notification_service.list_notifications(
        user_id=user_id,
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# UC-2.3  PATCH /notifications/{id}
# ---------------------------------------------------------------------------

@router.patch(
    "/{notification_id}",
    response_model=NotificationItem,
    summary="Mark a single notification as read",
)
async def mark_notification_read(
    notification_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> NotificationItem:
    return notification_service.mark_read(
        notification_id=notification_id,
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# UC-2.3  POST /notifications/read-all
# ---------------------------------------------------------------------------

@router.post(
    "/read-all",
    response_model=MessageResponse,
    summary="Mark all notifications as read for the authenticated user",
)
async def mark_all_read(
    user_id: Annotated[str, Depends(get_current_user)],
) -> MessageResponse:
    updated = notification_service.mark_all_read(user_id)
    return MessageResponse(message=f"{updated} notification(s) marked as read.")
