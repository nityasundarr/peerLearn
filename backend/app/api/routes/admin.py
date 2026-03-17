"""FastAPI route handlers for /admin/*.

All routes require get_admin_user (403 if caller is not admin).
Hard Rule 2: admin_id from JWT dep — never from body or query params.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.deps import get_admin_user
from app.models.admin import (
    DemandResponse,
    GapAnalysisResponse,
    OverviewResponse,
    SupplyResponse,
    WeightsResponse,
    WeightsUpdateBody,
)
from app.services import analytics_service

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# UC-8.1  GET /admin/overview
# ---------------------------------------------------------------------------

@router.get(
    "/overview",
    response_model=OverviewResponse,
    summary=(
        "Admin KPI dashboard: user counts, session stats, alerts, "
        "top subjects, recent activity (UC-8.1)"
    ),
)
async def get_overview(
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> OverviewResponse:
    return analytics_service.get_overview()


# ---------------------------------------------------------------------------
# UC-8.2  GET /admin/analytics/demand
# ---------------------------------------------------------------------------

@router.get(
    "/analytics/demand",
    response_model=DemandResponse,
    summary=(
        "Demand analytics: requests by subject, trending topics, "
        "by planning area, filterable by date range (UC-8.2)"
    ),
)
async def get_demand(
    admin_id: Annotated[str, Depends(get_admin_user)],
    start_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    end_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
) -> DemandResponse:
    return analytics_service.get_demand(start_date, end_date)


# ---------------------------------------------------------------------------
# UC-8.3  GET /admin/analytics/supply
# ---------------------------------------------------------------------------

@router.get(
    "/analytics/supply",
    response_model=SupplyResponse,
    summary=(
        "Supply analytics: tutor counts, workload bands, "
        "tutors by subject (UC-8.3)"
    ),
)
async def get_supply(
    admin_id: Annotated[str, Depends(get_admin_user)],
    start_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    end_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
) -> SupplyResponse:
    return analytics_service.get_supply(start_date, end_date)


# ---------------------------------------------------------------------------
# UC-8.4  GET /admin/analytics/gaps
# ---------------------------------------------------------------------------

@router.get(
    "/analytics/gaps",
    response_model=GapAnalysisResponse,
    summary=(
        "Gap analysis: shortage %, supply vs demand, "
        "recommendations (UC-8.4)"
    ),
)
async def get_gaps(
    admin_id: Annotated[str, Depends(get_admin_user)],
    start_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    end_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
) -> GapAnalysisResponse:
    return analytics_service.get_gaps(start_date, end_date)


# ---------------------------------------------------------------------------
# UC-8.5  GET /admin/analytics/export
# ---------------------------------------------------------------------------

@router.get(
    "/analytics/export",
    summary=(
        "Export analytics data as CSV or Excel, "
        "respecting active date filters (UC-8.5)"
    ),
    response_class=StreamingResponse,
)
async def export_analytics(
    admin_id: Annotated[str, Depends(get_admin_user)],
    format: Annotated[str, Query(description="csv | excel")] = "csv",
    start_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    end_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
) -> StreamingResponse:
    fmt = format.lower()
    if fmt not in {"csv", "excel"}:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="format must be 'csv' or 'excel'.",
        )

    file_bytes, content_type, filename = analytics_service.export_analytics(
        start_date, end_date, fmt
    )

    return StreamingResponse(
        content=iter([file_bytes]),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# SRS 2.5.3  GET /admin/matching/weights
# ---------------------------------------------------------------------------

@router.get(
    "/matching/weights",
    response_model=WeightsResponse,
    summary="Return current matching scoring weights (SRS 2.5.3)",
)
async def get_weights(
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> WeightsResponse:
    return analytics_service.get_weights()


# ---------------------------------------------------------------------------
# SRS 2.5.3  PUT /admin/matching/weights
# ---------------------------------------------------------------------------

@router.put(
    "/matching/weights",
    response_model=WeightsResponse,
    summary=(
        "Update matching scoring weights; all five components required, "
        "must sum to 1.0 (SRS 2.5.3)"
    ),
)
async def update_weights(
    body: WeightsUpdateBody,
    admin_id: Annotated[str, Depends(get_admin_user)],
) -> WeightsResponse:
    # Pydantic model_validator already enforced sum=1.0 and valid components.
    # This handler is intentionally thin.
    return analytics_service.update_weights(body)
