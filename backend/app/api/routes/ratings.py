"""FastAPI route handlers for session outcomes and ratings.

These routes are added to the /sessions prefix to match plan.md:
  PATCH /sessions/{id}/outcome
  POST  /sessions/{id}/rating
  GET   /sessions/{id}/rating

Hard Rule 2: user_id from get_current_user.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.rating import OutcomeResponse, RatingResponse, RecordOutcomeBody, SubmitRatingBody
from app.services import rating_service

router = APIRouter(prefix="/sessions", tags=["ratings"])


# ---------------------------------------------------------------------------
# UC-6.3 / UC-6.4  PATCH /sessions/{id}/outcome
# ---------------------------------------------------------------------------

@router.patch(
    "/{session_id}/outcome",
    response_model=OutcomeResponse,
    summary=(
        "Record session outcome (attended | no_show). "
        "Each party calls this once; final status determined when both submit "
        "(UC-6.3, UC-6.4, SRS 2.9.4)"
    ),
)
async def record_outcome(
    session_id: str,
    body: RecordOutcomeBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> OutcomeResponse:
    return rating_service.record_outcome(session_id, user_id, body)


# ---------------------------------------------------------------------------
# UC-6.5  POST /sessions/{id}/rating
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/rating",
    response_model=RatingResponse,
    summary=(
        "Tutee submits stars, traits, and optional review for a completed session "
        "(UC-6.5, SRS 2.9.4)"
    ),
)
async def submit_rating(
    session_id: str,
    body: SubmitRatingBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> RatingResponse:
    return rating_service.submit_rating(session_id, user_id, body)


# ---------------------------------------------------------------------------
# UC-6.5  GET /sessions/{id}/rating
# ---------------------------------------------------------------------------

@router.get(
    "/{session_id}/rating",
    response_model=RatingResponse,
    summary="Fetch the rating for a completed session (UC-6.5)",
)
async def get_rating(
    session_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> RatingResponse:
    return rating_service.get_rating(session_id, user_id)
