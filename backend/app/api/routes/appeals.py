"""FastAPI route handlers for /appeals/*.

User routes  — require get_current_user
Admin routes — require get_admin_user (403 if not admin)

Hard Rule 2: user_id and admin_id from JWT dep.
Appeal deadline enforcement: settings.APPEAL_WINDOW_DAYS (enforced in appeal_service).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_admin_user, get_current_user
from app.models.complaint import (
    AppealDetailResponse,
    AppealResponse,
    DecideAppealBody,
    SubmitAppealBody,
)
from app.services import appeal_service

router = APIRouter(prefix="/appeals", tags=["appeals"])


# ---------------------------------------------------------------------------
# UC-7.2  POST /appeals  (authenticated user)
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=AppealResponse,
    summary=(
        "Submit an appeal against a disciplinary record; "
        "deadline enforced from settings.APPEAL_WINDOW_DAYS (UC-7.2, SRS 2.10.6)"
    ),
)
async def submit_appeal(
    body: SubmitAppealBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> AppealResponse:
    return appeal_service.submit_appeal(user_id, body)


# ---------------------------------------------------------------------------
# UC-7.4  GET /appeals  (admin only)
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[AppealResponse],
    summary="Admin: list appeals, optionally filtered by status (UC-7.4)",
)
async def list_appeals(
    admin_id: Annotated[str, Depends(get_admin_user)],
    status: Annotated[str | None, Query(description="pending|upheld|modified|revoked")] = "pending",
) -> list[AppealResponse]:
    return appeal_service.list_appeals(status)


# ---------------------------------------------------------------------------
# UC-7.4  GET /appeals/{id}  (admin only)
# ---------------------------------------------------------------------------

@router.get(
    "/{appeal_id}",
    response_model=AppealDetailResponse,
    summary="Admin: full appeal detail with linked disciplinary record (UC-7.4)",
)
async def get_appeal(
    appeal_id: str,
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> AppealDetailResponse:
    return appeal_service.get_appeal_detail(appeal_id)


# ---------------------------------------------------------------------------
# UC-7.4  PATCH /appeals/{id}  (admin only)
# ---------------------------------------------------------------------------

@router.patch(
    "/{appeal_id}",
    response_model=AppealResponse,
    summary="Admin: decide appeal outcome (upheld|modified|revoked), notify user (UC-7.4)",
)
async def decide_appeal(
    appeal_id: str,
    body: DecideAppealBody,
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> AppealResponse:
    return appeal_service.decide_appeal(appeal_id, body)
