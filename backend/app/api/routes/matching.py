"""FastAPI route handlers for /matching/*.

All routes require a valid Bearer JWT.
Hard Rule 10: no lat/lng or numeric distances in any response —
              only planning_area (str) and distance_bucket (Near/Medium/Far).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.matching import MatchingResponse
from app.services import matching_service

router = APIRouter(prefix="/matching", tags=["matching"])


# ---------------------------------------------------------------------------
# UC-3.3  GET /matching/recommendations
# ---------------------------------------------------------------------------

@router.get(
    "/recommendations",
    response_model=MatchingResponse,
    summary=(
        "Run matching engine for a request and return a ranked tutor list "
        "(UC-3.3, SRS 2.5). Only distance_bucket returned — never coordinates."
    ),
)
async def get_recommendations(
    request_id: Annotated[str, Query(description="The tutoring request ID to match against")],
    user_id: Annotated[str, Depends(get_current_user)],
) -> MatchingResponse:
    return matching_service.get_recommendations(request_id, user_id)
