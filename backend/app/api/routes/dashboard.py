"""FastAPI route handlers for /dashboard/*.

All routes require a valid Bearer JWT.
Hard Rule 2: user_id derived from get_current_user — never from request body.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.notification import DashboardBadgesResponse, DashboardSummaryResponse
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ---------------------------------------------------------------------------
# UC-2.1  GET /dashboard/summary
# ---------------------------------------------------------------------------

@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Session counts, next upcoming sessions, and pending actions",
)
async def get_summary(
    user_id: Annotated[str, Depends(get_current_user)],
) -> DashboardSummaryResponse:
    return dashboard_service.get_summary(user_id)


# ---------------------------------------------------------------------------
# UC-2.1  GET /dashboard/badges
# ---------------------------------------------------------------------------

@router.get(
    "/badges",
    response_model=DashboardBadgesResponse,
    summary="Tab badge counts: unread notifications, messages, and tutoring actions",
)
async def get_badges(
    user_id: Annotated[str, Depends(get_current_user)],
) -> DashboardBadgesResponse:
    return dashboard_service.get_badges(user_id)
