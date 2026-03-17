"""Pydantic v2 schemas for admin analytics and matching weights.

Hard Rule 4: model_validator(mode='after') for cross-field validation.
SRS 2.5.3: weights must sum to 1.0 — enforced at model level.
"""

from pydantic import BaseModel, ConfigDict, model_validator


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------

class SubjectCount(BaseModel):
    subject: str
    count: int


class TopicCount(BaseModel):
    topic: str
    count: int


class AreaCount(BaseModel):
    area: str
    count: int


class KPIs(BaseModel):
    total_users: int
    active_tutors: int
    sessions_this_week: int
    pending_requests: int
    avg_rating: float


class ActivityItem(BaseModel):
    type: str        # registration | session | complaint
    description: str
    created_at: str


# ---------------------------------------------------------------------------
# GET /admin/overview (UC-8.1)
# ---------------------------------------------------------------------------

class OverviewResponse(BaseModel):
    kpis: KPIs
    alerts: list[str]
    top_subjects: list[SubjectCount]
    recent_activity: list[ActivityItem]


# ---------------------------------------------------------------------------
# GET /admin/analytics/demand (UC-8.2)
# ---------------------------------------------------------------------------

class DemandResponse(BaseModel):
    requests_by_subject: list[SubjectCount]
    trending_topics: list[TopicCount]
    by_planning_area: list[AreaCount]
    total_requests: int
    start_date: str
    end_date: str


# ---------------------------------------------------------------------------
# GET /admin/analytics/supply (UC-8.3)
# ---------------------------------------------------------------------------

class WorkloadBands(BaseModel):
    light: int      # confirmed_hours < 30% of weekly cap
    balanced: int   # 30–70%
    heavy: int      # > 70%


class SupplyResponse(BaseModel):
    total_tutors: int
    active_tutors: int
    avg_sessions_per_tutor: float
    avg_rating: float
    workload_bands: WorkloadBands
    tutors_by_subject: list[SubjectCount]
    start_date: str
    end_date: str


# ---------------------------------------------------------------------------
# GET /admin/analytics/gaps (UC-8.4)
# ---------------------------------------------------------------------------

class GapItem(BaseModel):
    subject: str
    demand: int
    supply: int
    shortage_pct: float
    label: str      # shortage | surplus | balanced


class CriticalGap(BaseModel):
    subject: str
    shortfall: int
    description: str


class GapAnalysisResponse(BaseModel):
    gaps: list[GapItem]
    critical_gaps: list[CriticalGap]
    recommendations: list[str]


# ---------------------------------------------------------------------------
# GET /admin/matching/weights (SRS 2.5.3)
# ---------------------------------------------------------------------------

class WeightsResponse(BaseModel):
    weights: dict[str, float]
    components: list[str]


# ---------------------------------------------------------------------------
# PUT /admin/matching/weights (SRS 2.5.3)
# ---------------------------------------------------------------------------

_VALID_COMPONENTS = frozenset(
    {"rating", "reliability", "topic_overlap", "distance", "workload_fairness"}
)

_WEIGHT_TOLERANCE = 0.001


class WeightsUpdateBody(BaseModel):
    """All five weight components required; must sum to 1.0 ± 0.001."""
    model_config = ConfigDict()

    weights: dict[str, float]

    @model_validator(mode="after")
    def _validate_weights(self) -> "WeightsUpdateBody":
        w = self.weights

        missing = _VALID_COMPONENTS - set(w.keys())
        if missing:
            raise ValueError(
                f"Missing weight components: {sorted(missing)}. "
                f"All five must be provided: {sorted(_VALID_COMPONENTS)}."
            )

        extra = set(w.keys()) - _VALID_COMPONENTS
        if extra:
            raise ValueError(
                f"Unknown weight components: {sorted(extra)}. "
                f"Valid components: {sorted(_VALID_COMPONENTS)}."
            )

        for name, value in w.items():
            if value < 0:
                raise ValueError(f"Weight for '{name}' must be non-negative.")

        total = sum(w.values())
        if abs(total - 1.0) > _WEIGHT_TOLERANCE:
            raise ValueError(
                f"Weights must sum to 1.0 (got {total:.6f}). "
                "Adjust the values so they sum to exactly 1.0."
            )

        return self
