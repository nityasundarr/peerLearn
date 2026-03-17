"""Tutor matching engine — candidate pool filter + scoring + fairness cap.

SRS 2.5 implementation:

2.5.1 Candidate Pool Filter — ALL of:
  ✓ is_active_mode = true
  ✓ academic_level in tutor.academic_levels
  ✓ at least 1 subject overlap
  ✓ at least 1 topic overlap
  ✓ weekly load not exceeded (confirmed_hours < max_weekly_hours)
  ✓ at least 1 time slot overlaps

2.5.2 Scoring (0–100 weighted):
  rating           — tutor avg_rating / 5.0 * 100
  reliability      — reliability score (already 0–100)
  topic_overlap    — overlapping topic count / requested topic count * 100
  distance         — Near=100, Medium=60, Far=20
  workload_fairness — (1 - load_ratio) * 100

2.5.3 Fairness cap:
  - Weights from admin_weights table (fallback to equal weights)
  - Over-allocated tutors (load ≥ 80% of weekly cap) get a fairness multiplier
    applied to their composite score.

Hard Rule 10: distance is computed internally using location_service;
  only the bucket label is included in the response — never lat/lng or km value.

Matching_scores persistence note:
  The matching_scores DB table has a session_id FK that does not exist yet at
  recommendation time.  Scores are therefore NOT persisted here.
  Phase 5 (session creation) will persist them when the tutee selects a tutor.
"""

import logging
from datetime import date as DateType

from app.core.errors import NotFoundError, UnprocessableError
from app.db import matching_db, requests_db
from app.models.matching import MatchingResponse, ScoreComponents, TutorRecommendation
from app.services.location_service import get_best_distance_bucket

logger = logging.getLogger(__name__)

# Score value for each distance bucket (SRS 2.8.4 proxy)
_DISTANCE_SCORES: dict[str, float] = {
    "Near": 100.0,
    "Medium": 60.0,
    "Far": 20.0,
    "Unknown": 40.0,
}

# Fairness cap: tutors above this load fraction get a composite score penalty
_OVERLOAD_THRESHOLD = 0.80
_OVERLOAD_MULTIPLIER = 0.70  # score reduced to 70% when at/above threshold


# ---------------------------------------------------------------------------
# Time slot helper
# ---------------------------------------------------------------------------

def _python_weekday_to_db_day(py_weekday: int) -> int:
    """Convert Python's Monday=0 weekday to the DB's Sunday=0 convention."""
    return (py_weekday + 1) % 7


def _tutee_slot_set(time_slots: list[dict]) -> set[tuple[int, int]]:
    """Return a set of (db_day_of_week, hour_slot) from a tutee's time_slots JSON."""
    result: set[tuple[int, int]] = set()
    for slot in time_slots:
        try:
            d = DateType.fromisoformat(slot["date"])
            db_day = _python_weekday_to_db_day(d.weekday())
            result.add((db_day, int(slot["hour_slot"])))
        except (KeyError, ValueError):
            pass
    return result


def _tutor_slot_set(availability: list[dict]) -> set[tuple[int, int]]:
    return {(int(a["day_of_week"]), int(a["hour_slot"])) for a in availability}


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _score_rating(avg_rating: float) -> float:
    return min(max((avg_rating / 5.0) * 100.0, 0.0), 100.0)


def _score_reliability(reliability_score: float) -> float:
    return min(max(reliability_score, 0.0), 100.0)


def _score_topic_overlap(
    requested_topics: list[str],
    tutor_topics: list[dict],
) -> float:
    if not requested_topics:
        return 0.0
    tutor_flat = {t["topic"].lower() for t in tutor_topics}
    overlap = sum(1 for t in requested_topics if t.lower() in tutor_flat)
    return (overlap / len(requested_topics)) * 100.0


def _score_distance(bucket: str) -> float:
    return _DISTANCE_SCORES.get(bucket, 40.0)


def _score_workload_fairness(confirmed_hours: float, max_hours: int) -> float:
    if max_hours <= 0:
        return 0.0
    load_ratio = confirmed_hours / max_hours
    return max(0.0, (1.0 - load_ratio) * 100.0)


def _apply_fairness_cap(
    score: float,
    confirmed_hours: float,
    max_hours: int,
) -> float:
    """Reduce score for over-allocated tutors (SRS 2.5.3 fairness)."""
    if max_hours <= 0:
        return score
    load_ratio = confirmed_hours / max_hours
    if load_ratio >= _OVERLOAD_THRESHOLD:
        return score * _OVERLOAD_MULTIPLIER
    return score


# ---------------------------------------------------------------------------
# Main matching function
# ---------------------------------------------------------------------------

def get_recommendations(request_id: str, tutee_id: str) -> MatchingResponse:
    """Run the full matching engine for a tutoring request.

    Steps:
      1. Fetch the request (ownership check)
      2. Fetch all active tutor profiles (academic_level filtered)
      3. Apply 6-step candidate pool filter
      4. Score each candidate using admin-configurable weights
      5. Apply fairness cap
      6. Sort descending, return response

    Hard Rule 10: only planning_area and distance_bucket in response — no coords.
    """
    # 1 — fetch and validate request
    request_row = requests_db.get_request_by_id_and_tutee(request_id, tutee_id)
    if not request_row:
        raise NotFoundError("Tutoring request not found.")
    if request_row.get("status") == "cancelled":
        raise UnprocessableError("Cannot run matching on a cancelled request.")

    academic_level: str = request_row["academic_level"]
    requested_subjects: set[str] = set(s.lower() for s in (request_row.get("subjects") or []))
    requested_topics: list[str] = request_row.get("topics") or []
    tutee_areas: list[str] = request_row.get("planning_areas") or []
    tutee_slots: set[tuple[int, int]] = _tutee_slot_set(
        request_row.get("time_slots") or []
    )

    # 2 — fetch active tutor profiles (academic_level pre-filtered in DB)
    profiles = matching_db.get_active_tutor_profiles(academic_level)
    if not profiles:
        return _empty_response(request_id)

    tutor_ids = [p["user_id"] for p in profiles]

    # Batch-fetch supporting data
    topics_by_tutor = matching_db.get_topics_for_tutors(tutor_ids)
    avail_by_tutor = matching_db.get_availability_for_tutors(tutor_ids)
    workload_by_tutor = matching_db.get_current_workload_for_tutors(tutor_ids)
    metrics_by_tutor = matching_db.get_reliability_metrics_for_tutors(tutor_ids)
    names_by_tutor = matching_db.get_user_names_for_tutors(tutor_ids)
    weights = matching_db.get_admin_weights()

    # 3 — candidate pool filter
    candidates: list[dict] = []
    for profile in profiles:
        tid = profile["user_id"]
        topics = topics_by_tutor.get(tid, [])
        availability = avail_by_tutor.get(tid, [])
        confirmed_hours = workload_by_tutor.get(tid, 0.0)
        max_hours = profile.get("max_weekly_hours") or 1

        # Filter: subject overlap (≥1 subject)
        tutor_subjects = {s.lower() for s in (profile.get("subjects") or [])}
        if not requested_subjects & tutor_subjects:
            continue

        # Filter: topic overlap (≥1 topic)
        tutor_flat_topics = {t["topic"].lower() for t in topics}
        if not any(t.lower() in tutor_flat_topics for t in requested_topics):
            continue

        # Filter: weekly load not exceeded
        if confirmed_hours >= max_hours:
            continue

        # Filter: time slot overlap (≥1 slot)
        tutor_slots = _tutor_slot_set(availability)
        overlapping_slots = tutee_slots & tutor_slots
        if not overlapping_slots:
            continue

        candidates.append({
            "profile": profile,
            "topics": topics,
            "availability": availability,
            "confirmed_hours": confirmed_hours,
            "overlapping_slot_count": len(overlapping_slots),
        })

    total_candidates = len(candidates)
    if total_candidates == 0:
        return _empty_response(request_id)

    # 4 + 5 — score and apply fairness cap
    scored: list[tuple[float, TutorRecommendation]] = []
    for c in candidates:
        profile = c["profile"]
        tid = profile["user_id"]
        confirmed_hours = c["confirmed_hours"]
        max_hours = profile.get("max_weekly_hours") or 1
        metrics = metrics_by_tutor.get(tid, {})

        bucket = get_best_distance_bucket(tutee_areas, profile.get("planning_areas") or [])

        components = ScoreComponents(
            rating=_score_rating(metrics.get("avg_rating", 0.0)),
            reliability=_score_reliability(metrics.get("score", 100.0)),
            topic_overlap=_score_topic_overlap(requested_topics, c["topics"]),
            distance=_score_distance(bucket),
            workload_fairness=_score_workload_fairness(confirmed_hours, max_hours),
        )

        raw_score = (
            weights["rating"] * components.rating
            + weights["reliability"] * components.reliability
            + weights["topic_overlap"] * components.topic_overlap
            + weights["distance"] * components.distance
            + weights["workload_fairness"] * components.workload_fairness
        )

        final_score = _apply_fairness_cap(raw_score, confirmed_hours, max_hours)

        recommendation = TutorRecommendation(
            tutor_id=tid,
            full_name=names_by_tutor.get(tid, "Unknown"),
            avg_rating=round(metrics.get("avg_rating", 0.0), 2),
            completed_sessions=metrics.get("total_sessions", 0),
            reliability_score=round(metrics.get("score", 100.0), 2),
            distance_bucket=bucket,
            planning_areas=profile.get("planning_areas") or [],
            available_slot_count=c["overlapping_slot_count"],
            accessibility_capabilities=profile.get("accessibility_capabilities") or [],
            match_score=round(min(final_score, 100.0), 2),
            score_components=components,
        )
        scored.append((final_score, recommendation))

    # 6 — sort descending by composite score
    scored.sort(key=lambda x: x[0], reverse=True)
    recommendations = [r for _, r in scored]

    message: str | None = None
    if len(recommendations) == 1:
        message = (
            "Only one tutor matches your criteria. "
            "You may broaden your search to see more options."
        )

    return MatchingResponse(
        request_id=request_id,
        recommendations=recommendations,
        total_candidates=total_candidates,
        message=message,
    )


def _empty_response(request_id: str) -> MatchingResponse:
    return MatchingResponse(
        request_id=request_id,
        recommendations=[],
        total_candidates=0,
        message=(
            "No tutors found matching your criteria. "
            "Try broadening your subjects, planning areas, or time slots."
        ),
    )
