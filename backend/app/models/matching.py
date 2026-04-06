"""Pydantic v2 response schemas for the matching engine.

Hard Rule 10: coordinates (lat/lng) are NEVER included in any response.
              Frontend receives only planning_area (str) and distance_bucket
              (Near/Medium/Far).

SRS 2.5.4 display fields per recommendation:
  name, avg_rating, completed_sessions, distance_bucket,
  availability slot count, accessibility_capabilities
"""

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Recommendation item
# ---------------------------------------------------------------------------

class ScoreComponents(BaseModel):
    """Per-component score breakdown (0-100 each, for transparency/debugging)."""
    rating: float
    reliability: float
    topic_overlap: float
    distance: float
    workload_fairness: float


class TutorRecommendation(BaseModel):
    """One ranked tutor recommendation."""
    tutor_id: str
    full_name: str                      # from users table
    avg_rating: float                   # 0.0–5.0
    completed_sessions: int
    reliability_score: float            # 0–100
    distance_bucket: str                # Near | Medium | Far — NEVER lat/lng
    planning_areas: list[str]           # tutor's teaching areas
    available_slot_count: int           # number of overlapping time slots
    accessibility_capabilities: list[str]
    match_score: float                  # 0–100 weighted composite
    score_components: ScoreComponents   # breakdown for frontend display
    subjects: list[str]                 # subjects the tutor teaches
    topics: list[str]                   # topics the tutor covers


class MatchingResponse(BaseModel):
    """Returned by GET /matching/recommendations."""
    request_id: str
    recommendations: list[TutorRecommendation]
    total_candidates: int   # number of tutors that passed the candidate filter
    message: str | None     # contextual hint when results are 0 or 1
