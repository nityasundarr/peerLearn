"""FastAPI route handlers for /venues/*.

Hard Rule 10: venue_service strips lat/lng before returning VenueItem objects.
              This route handler never touches coordinates.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.venue import VenueListResponse
from app.services import venue_service

router = APIRouter(prefix="/venues", tags=["venues"])


# ---------------------------------------------------------------------------
# UC-5.3  GET /venues/recommend
# ---------------------------------------------------------------------------

@router.get(
    "/recommend",
    response_model=VenueListResponse,
    summary=(
        "Recommend public study venues; "
        "returns planning_area + distance_bucket only — never lat/lng (UC-5.3, SRS 2.8)"
    ),
)
async def recommend_venues(
    user_id: Annotated[str, Depends(get_current_user)],
    request_id: Annotated[str | None, Query(description="Tutoring request ID for tutee planning areas")] = None,
    tutor_id: Annotated[str | None, Query(description="Selected tutor ID for tutor planning areas")] = None,
) -> VenueListResponse:
    return await venue_service.recommend_venues(request_id=request_id, tutor_id=tutor_id)
