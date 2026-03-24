"""Supabase query functions for the matching engine.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  tutor_profiles           — candidate pool base data
  tutor_topics             — per-tutor (subject, topic) pairs
  weekly_availability      — (day_of_week, hour_slot) slots
  workload                 — confirmed hours per week (for load cap)
  tutor_reliability_metrics — avg_rating, reliability score
  admin_weights            — configurable scoring weights (SRS 2.5.3)
  users                    — full_name (for response display)

Note on matching_scores persistence:
  The matching_scores table has a session_id FK referencing tutoring_sessions.
  Sessions don't exist at GET /matching/recommendations time.
  Scores are therefore NOT persisted here — they are persisted in Phase 5
  when the tutee selects a tutor and a session is created.
"""

import logging
from datetime import date, timedelta

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# Scoring weight component names (must match admin_weights.component_name)
WEIGHT_COMPONENTS = frozenset(
    {"rating", "reliability", "topic_overlap", "distance", "workload_fairness"}
)

DEFAULT_WEIGHTS: dict[str, float] = {
    "rating": 0.25,
    "reliability": 0.25,
    "topic_overlap": 0.20,
    "distance": 0.15,
    "workload_fairness": 0.15,
}


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Candidate pool data fetching
# ---------------------------------------------------------------------------

def get_active_tutor_profiles(academic_level: str) -> list[dict]:
    """Return all active tutor profiles that teach the given academic level.

    Filters:
      is_active_mode = True
      academic_level IN tutor.academic_levels (via Python-side filter after fetch,
      because Supabase array containment requires the @> operator via RPC or
      a client-side check).
    """
    try:
        result = (
            supabase.table("tutor_profiles")
            .select(
                "user_id, academic_levels, subjects, planning_areas, "
                "accessibility_capabilities, max_weekly_hours, is_active_mode"
            )
            .eq("is_active_mode", True)
            .execute()
        )
        rows = result.data or []
        # Filter: tutor must teach the requested academic level
        return [r for r in rows if academic_level in (r.get("academic_levels") or [])]
    except Exception as exc:
        raise _db_error("get_active_tutor_profiles", exc) from exc


def get_topics_for_tutors(tutor_ids: list[str]) -> dict[str, list[dict]]:
    """Return topics grouped by tutor_id.

    Returns: {tutor_id: [{"subject": ..., "topic": ...}, ...]}
    """
    if not tutor_ids:
        return {}
    try:
        result = (
            supabase.table("tutor_topics")
            .select("tutor_id, subject, topic")
            .in_("tutor_id", tutor_ids)
            .execute()
        )
        grouped: dict[str, list[dict]] = {tid: [] for tid in tutor_ids}
        for row in (result.data or []):
            tid = row["tutor_id"]
            if tid in grouped:
                grouped[tid].append({"subject": row["subject"], "topic": row["topic"]})
        return grouped
    except Exception as exc:
        raise _db_error("get_topics_for_tutors", exc) from exc


def get_availability_for_tutors(tutor_ids: list[str]) -> dict[str, list[dict]]:
    """Return weekly_availability slots grouped by tutor_id.

    Returns: {tutor_id: [{"day_of_week": int, "hour_slot": int}, ...]}
    """
    if not tutor_ids:
        return {}
    try:
        result = (
            supabase.table("weekly_availability")
            .select("tutor_id, day_of_week, hour_slot")
            .in_("tutor_id", tutor_ids)
            .execute()
        )
        grouped: dict[str, list[dict]] = {tid: [] for tid in tutor_ids}
        for row in (result.data or []):
            tid = row["tutor_id"]
            if tid in grouped:
                grouped[tid].append(
                    {"day_of_week": row["day_of_week"], "hour_slot": row["hour_slot"]}
                )
        return grouped
    except Exception as exc:
        raise _db_error("get_availability_for_tutors", exc) from exc


def get_current_workload_for_tutors(tutor_ids: list[str]) -> dict[str, float]:
    """Return confirmed_hours for the current week, grouped by tutor_id.

    Uses ISO week start (Monday) as the key in the workload table.
    Returns: {tutor_id: confirmed_hours}
    """
    if not tutor_ids:
        return {}
    try:
        today = date.today()
        week_start = (today - timedelta(days=today.weekday())).isoformat()

        result = (
            supabase.table("workload")
            .select("tutor_id, confirmed_hours")
            .in_("tutor_id", tutor_ids)
            .eq("week_start", week_start)
            .execute()
        )
        workload_map: dict[str, float] = {tid: 0.0 for tid in tutor_ids}
        for row in (result.data or []):
            tid = row["tutor_id"]
            if tid in workload_map:
                workload_map[tid] = float(row.get("confirmed_hours") or 0)
        return workload_map
    except Exception as exc:
        raise _db_error("get_current_workload_for_tutors", exc) from exc


def get_reliability_metrics_for_tutors(tutor_ids: list[str]) -> dict[str, dict]:
    """Return reliability metrics grouped by tutor_id.

    Returns: {tutor_id: {"avg_rating": float, "score": float, "total_sessions": int}}
    """
    if not tutor_ids:
        return {}
    try:
        result = (
            supabase.table("tutor_reliability_metrics")
            .select("tutor_id, avg_rating, score, total_sessions, no_shows")
            .in_("tutor_id", tutor_ids)
            .execute()
        )
        metrics: dict[str, dict] = {
            tid: {"avg_rating": 0.0, "score": 100.0, "total_sessions": 0, "no_shows": 0}
            for tid in tutor_ids
        }
        for row in (result.data or []):
            tid = row["tutor_id"]
            if tid in metrics:
                metrics[tid] = {
                    "avg_rating": float(row.get("avg_rating") or 0),
                    "score": float(row.get("score") or 100),
                    "total_sessions": int(row.get("total_sessions") or 0),
                    "no_shows": int(row.get("no_shows") or 0),
                }
        return metrics
    except Exception as exc:
        raise _db_error("get_reliability_metrics_for_tutors", exc) from exc


def get_user_names_for_tutors(tutor_ids: list[str]) -> dict[str, str]:
    """Return {tutor_id: full_name} for display in the recommendations list."""
    if not tutor_ids:
        return {}
    try:
        result = (
            supabase.table("users")
            .select("id, full_name")
            .in_("id", tutor_ids)
            .execute()
        )
        return {r["id"]: r.get("full_name", "Unknown") for r in (result.data or [])}
    except Exception as exc:
        raise _db_error("get_user_names_for_tutors", exc) from exc


# ---------------------------------------------------------------------------
# Admin weights (SRS 2.5.3 — weights configurable without code changes)
# ---------------------------------------------------------------------------

def get_admin_weights() -> dict[str, float]:
    """Return scoring weights from admin_weights table.

    Falls back to DEFAULT_WEIGHTS if the table is empty or a component is missing.
    Normalises the values so they always sum to 1.0.
    """
    try:
        result = (
            supabase.table("admin_weights")
            .select("component_name, weight_value")
            .in_("component_name", list(WEIGHT_COMPONENTS))
            .execute()
        )
        rows = result.data or []
        weights = dict(DEFAULT_WEIGHTS)  # start from defaults
        for row in rows:
            name = row["component_name"]
            if name in WEIGHT_COMPONENTS:
                weights[name] = float(row.get("weight_value") or 0)

        # Normalise so weights sum to 1.0 (prevents misconfiguration breaking scoring)
        total = sum(weights.values())
        if total > 0:
            weights = {k: v / total for k, v in weights.items()}
        else:
            weights = dict(DEFAULT_WEIGHTS)

        return weights
    except Exception as exc:
        # Fallback to defaults — weight retrieval failure must not block matching
        logger.warning("Failed to fetch admin_weights, using defaults: %s", exc)
        return dict(DEFAULT_WEIGHTS)
