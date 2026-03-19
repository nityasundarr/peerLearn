"""Supabase query functions for the ratings domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 6: exceptions caught and re-raised as AppError(500).

Tables touched:
  tutor_ratings             — stars, traits, is_anonymous per session
  tutor_reviews             — optional review text linked to a rating
  tutor_reliability_metrics — updated after completion and after rating
"""

import logging

from app.core.errors import AppError, NotFoundError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

_RATING_COLS = "id, session_id, tutee_id, tutor_id, stars, standout_traits, is_anonymous, created_at"
_REVIEW_COLS = "id, rating_id, review_text, created_at"
_METRICS_COLS = "tutor_id, total_sessions, no_shows, avg_rating, score, updated_at"


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# tutor_ratings + tutor_reviews
# ---------------------------------------------------------------------------

def create_rating(
    session_id: str,
    tutee_id: str,
    tutor_id: str,
    stars: int,
    standout_traits: list[str],
    is_anonymous: bool,
) -> dict:
    try:
        result = (
            supabase.table("tutor_ratings")
            .insert(
                {
                    "session_id": session_id,
                    "tutee_id": tutee_id,
                    "tutor_id": tutor_id,
                    "stars": stars,
                    "standout_traits": standout_traits,
                    "is_anonymous": is_anonymous,
                }
            )
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("tutor_ratings")
                .select(_RATING_COLS)
                .eq("session_id", session_id)
                .eq("tutee_id", tutee_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_rating", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_rating", exc) from exc


def create_review(rating_id: str, review_text: str) -> dict:
    try:
        result = (
            supabase.table("tutor_reviews")
            .insert({"rating_id": rating_id, "review_text": review_text})
            .execute()
        )
        if result is None or not result.data or len(result.data) == 0:
            fetch = (
                supabase.table("tutor_reviews")
                .select(_REVIEW_COLS)
                .eq("rating_id", rating_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if fetch is None or not fetch.data or len(fetch.data) == 0:
                raise _db_error("create_review", RuntimeError("Insert returned no data"))
            return fetch.data[0]
        return result.data[0]
    except Exception as exc:
        raise _db_error("create_review", exc) from exc


def get_rating_by_session(session_id: str) -> dict | None:
    """Return the rating row for a session (None if not yet rated)."""
    try:
        result = (
            supabase.table("tutor_ratings")
            .select(_RATING_COLS)
            .eq("session_id", session_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_rating_by_session", exc) from exc


def get_review_by_rating(rating_id: str) -> dict | None:
    try:
        result = (
            supabase.table("tutor_reviews")
            .select(_REVIEW_COLS)
            .eq("rating_id", rating_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_review_by_rating", exc) from exc


# ---------------------------------------------------------------------------
# tutor_reliability_metrics
# ---------------------------------------------------------------------------

def get_reliability_metrics(tutor_id: str) -> dict | None:
    try:
        result = (
            supabase.table("tutor_reliability_metrics")
            .select(_METRICS_COLS)
            .eq("tutor_id", tutor_id)
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data is not None else None
    except Exception as exc:
        raise _db_error("get_reliability_metrics", exc) from exc


def update_reliability_after_completion(
    tutor_id: str,
    tutor_had_no_show: bool,
) -> None:
    """Increment total_sessions (and no_shows if applicable) after session completes.

    Recomputes score = (avg_rating/5)*70 + reliability_factor*30.
    Called by rating_service when PATCH /sessions/{id}/outcome finalises.
    """
    try:
        current = get_reliability_metrics(tutor_id)
        if not current:
            # Metrics row should have been seeded at profile creation; create if missing
            supabase.table("tutor_reliability_metrics").upsert(
                {
                    "tutor_id": tutor_id,
                    "total_sessions": 1,
                    "no_shows": 1 if tutor_had_no_show else 0,
                    "avg_rating": 0,
                    "score": 70.0,
                }
            ).execute()
            return

        total = (current.get("total_sessions") or 0) + 1
        no_shows = (current.get("no_shows") or 0) + (1 if tutor_had_no_show else 0)
        avg_rating = float(current.get("avg_rating") or 0)

        score = _compute_score(avg_rating, total, no_shows)

        supabase.table("tutor_reliability_metrics").update(
            {"total_sessions": total, "no_shows": no_shows, "score": score}
        ).eq("tutor_id", tutor_id).execute()
    except AppError:
        raise
    except Exception as exc:
        raise _db_error("update_reliability_after_completion", exc) from exc


def update_avg_rating_after_rating(tutor_id: str, new_stars: int) -> None:
    """Recalculate avg_rating and score after a new rating is submitted.

    Uses the incremental mean formula:
      new_avg = (old_avg * rated_sessions + new_stars) / (rated_sessions + 1)
    where rated_sessions = total_sessions - no_shows (only attended sessions get rated).
    """
    try:
        current = get_reliability_metrics(tutor_id)
        if not current:
            return  # Guard — should not happen if seeded correctly

        total = current.get("total_sessions") or 0
        no_shows = current.get("no_shows") or 0
        old_avg = float(current.get("avg_rating") or 0)

        rated_count = max(0, total - no_shows - 1)  # -1 because this session just completed
        new_avg = (old_avg * rated_count + new_stars) / (rated_count + 1)
        new_score = _compute_score(new_avg, total, no_shows)

        supabase.table("tutor_reliability_metrics").update(
            {"avg_rating": round(new_avg, 4), "score": new_score}
        ).eq("tutor_id", tutor_id).execute()
    except AppError:
        raise
    except Exception as exc:
        raise _db_error("update_avg_rating_after_rating", exc) from exc


def _compute_score(avg_rating: float, total_sessions: int, no_shows: int) -> float:
    """Reliability score: 70% from average rating, 30% from no-show rate."""
    rating_component = (avg_rating / 5.0) * 70.0
    reliability_factor = 1.0 - (no_shows / max(total_sessions, 1))
    reliability_component = max(0.0, reliability_factor) * 30.0
    return round(rating_component + reliability_component, 2)
