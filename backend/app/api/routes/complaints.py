"""FastAPI route handlers for /complaints/*.

User routes  — require get_current_user (any authenticated user)
Admin routes — require get_admin_user (403 if not admin)

Hard Rule 2: reporter_id and admin_id from JWT dep, never from body.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_admin_user, get_current_user
from app.models.complaint import (
    ComplaintDetailResponse,
    ComplaintResponse,
    RecordActionBody,
    SubmitComplaintBody,
)
from app.services import complaint_service

router = APIRouter(prefix="/complaints", tags=["complaints"])


# ---------------------------------------------------------------------------
# UC-7.1  POST /complaints  (authenticated user)
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=ComplaintResponse,
    summary="Submit a complaint about a session (UC-7.1, SRS 2.10.5)",
)
async def submit_complaint(
    body: SubmitComplaintBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> ComplaintResponse:
    return complaint_service.submit_complaint(user_id, body)


# ---------------------------------------------------------------------------
# UC-7.3  GET /complaints  (admin only)
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[ComplaintResponse],
    summary="Admin: list all complaints, filterable by status (UC-7.3)",
)
async def list_complaints(
    admin_id: Annotated[str, Depends(get_admin_user)],
    status: Annotated[str | None, Query(description="open|under_review|resolved|dismissed")] = None,
) -> list[ComplaintResponse]:
    return complaint_service.list_complaints(status)


# ---------------------------------------------------------------------------
# UC-7.3  GET /complaints/{id}  (admin only)
# ---------------------------------------------------------------------------

@router.get(
    "/{complaint_id}",
    response_model=ComplaintDetailResponse,
    summary="Admin: full complaint detail with session info and message history (UC-7.3)",
)
async def get_complaint(
    complaint_id: str,
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> ComplaintDetailResponse:
    return complaint_service.get_complaint_detail(complaint_id)


# ---------------------------------------------------------------------------
# UC-7.3  POST /complaints/{id}/action  (admin only)
# ---------------------------------------------------------------------------

@router.post(
    "/{complaint_id}/action",
    response_model=ComplaintDetailResponse,
    summary=(
        "Admin: record action, create disciplinary_record, notify user (UC-7.3)"
    ),
)
async def record_action(
    complaint_id: str,
    body: RecordActionBody,
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> ComplaintDetailResponse:
    # Hard Rule 2: admin_id from JWT dep — never from body
    return complaint_service.record_action(complaint_id, admin_id, body)
