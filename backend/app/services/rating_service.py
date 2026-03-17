"""Business logic for session outcomes, ratings, and reliability updates.

SRS 2.9.4 outcome rules:
  outcome_tutor: the tutor's self-report ("attended" | "no_show")
  outcome_tutee: the tutee's self-report ("attended" | "no_show")

  Once both fields are set, the final status is determined:
    both attended       → completed_attended
    tutor no_show       → completed_no_show (full_refund to tutee)
    tutee no_show       → completed_no_show (partial_refund: 50% to tutee)
    both no_show        → completed_no_show (disputed → admin escalation)
    conflicting reports → completed_no_show (disputed → admin escalation)

UC-6.5 rating rules:
  - Only the tutee may submit a rating
  - Rating allowed only after completed_attended (cannot rate if tutor no-showed —
    the tutee still can, but typically only after attended sessions)
  - One rating per session (UNIQUE constraint on tutor_ratings.session_id)
  - After rating: update avg_rating in tutor_reliability_metrics
"""

import logging

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnprocessableError
from app.db import notifications_db, ratings_db, sessions_db
from app.models.rating import OutcomeResponse, RatingResponse, RecordOutcomeBody, SubmitRatingBody
from app.models.session import SessionResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Outcome determination
# ---------------------------------------------------------------------------

def _determine_outcome(outcome_tutor: str, outcome_tutee: str) -> tuple[str, str | None, str]:
    """Return (new_status, refund_status, message) from the two outcome values.

    Both values must be 'attended' or 'no_show'.
    """
    if outcome_tutor == "attended" and outcome_tutee == "attended":
        return "completed_attended", "no_refund", "Session marked as completed."

    if outcome_tutor == "no_show" and outcome_tutee == "attended":
        # Tutor didn't show — full refund to tutee
        return (
            "completed_no_show",
            "full_refund",
            "Session marked as no-show (tutor). A full refund will be issued to the tutee.",
        )

    if outcome_tutor == "attended" and outcome_tutee == "no_show":
        # Tutee didn't show — 50% refund
        return (
            "completed_no_show",
            "partial_refund",
            "Session marked as no-show (tutee). A 50% refund will be issued to the tutee.",
        )

    # Both no_show or mismatch — dispute
    return (
        "completed_no_show",
        "disputed",
        "Conflicting outcome reports. This session has been escalated to admin for review.",
    )


# ---------------------------------------------------------------------------
# UC-6.3 / UC-6.4  Record outcome
# ---------------------------------------------------------------------------

def record_outcome(
    session_id: str,
    user_id: str,
    body: RecordOutcomeBody,
) -> OutcomeResponse:
    """Record the caller's self-reported outcome.

    Tutor call  → sets outcome_tutor
    Tutee call  → sets outcome_tutee

    When both fields are set, finalises the session and updates workload +
    tutor_reliability_metrics.
    """
    session = sessions_db.get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    if session["status"] != "confirmed":
        raise UnprocessableError(
            "Outcomes can only be recorded for sessions in 'confirmed' state."
        )

    is_tutor = session["tutor_id"] == user_id
    is_tutee = session["tutee_id"] == user_id

    if not is_tutor and not is_tutee:
        raise ForbiddenError("Access denied.")

    outcome_field = "outcome_tutor" if is_tutor else "outcome_tutee"
    updated = sessions_db.set_outcome_field(session_id, outcome_field, body.outcome)

    outcome_tutor = updated.get("outcome_tutor")
    outcome_tutee = updated.get("outcome_tutee")

    # Not finalised yet — one party still hasn't reported
    if not outcome_tutor or not outcome_tutee:
        return OutcomeResponse(
            session_id=session_id,
            status=updated["status"],
            outcome_tutor=outcome_tutor,
            outcome_tutee=outcome_tutee,
            refund_status=None,
            message="Outcome recorded. Waiting for the other party to submit their report.",
        )

    # Both reported — finalise
    new_status, refund_status, message = _determine_outcome(outcome_tutor, outcome_tutee)
    finalised = sessions_db.finalize_outcome(session_id, new_status)

    # Update tutor reliability metrics
    tutor_had_no_show = outcome_tutor == "no_show"
    ratings_db.update_reliability_after_completion(session["tutor_id"], tutor_had_no_show)

    # Notify both parties
    _notify_outcome(session, new_status, refund_status)

    return OutcomeResponse(
        session_id=session_id,
        status=new_status,
        outcome_tutor=outcome_tutor,
        outcome_tutee=outcome_tutee,
        refund_status=refund_status,
        message=message,
    )


def _notify_outcome(session: dict, status: str, refund: str | None) -> None:
    tutee_id = session["tutee_id"]
    tutor_id = session["tutor_id"]
    title = "Session outcome recorded"
    if status == "completed_attended":
        content = "The session has been marked as completed. Please leave a rating."
    elif refund == "full_refund":
        content = "The session ended as a tutor no-show. A full refund is being processed."
    elif refund == "partial_refund":
        content = "The session ended as a tutee no-show. A 50% refund is being processed."
    else:
        content = "There is a dispute over session attendance. An admin will review this."
    notifications_db.create_notification(tutee_id, "session_update", title, content)
    notifications_db.create_notification(tutor_id, "session_update", title, content)


# ---------------------------------------------------------------------------
# UC-6.5  Submit rating
# ---------------------------------------------------------------------------

def submit_rating(
    session_id: str,
    tutee_id: str,
    body: SubmitRatingBody,
) -> RatingResponse:
    """Tutee submits a rating for a completed session.

    Only the tutee may rate; one rating per session (DB UNIQUE constraint).
    """
    session = sessions_db.get_session_for_participant(session_id, tutee_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    if session.get("tutee_id") != tutee_id:
        raise ForbiddenError("Only the tutee can submit a rating for this session.")

    if session["status"] not in {"completed_attended", "completed_no_show"}:
        raise UnprocessableError(
            "Ratings can only be submitted after the session has been completed."
        )

    existing = ratings_db.get_rating_by_session(session_id)
    if existing:
        raise ConflictError("A rating has already been submitted for this session.")

    tutor_id = session["tutor_id"]
    rating_row = ratings_db.create_rating(
        session_id=session_id,
        tutee_id=tutee_id,
        tutor_id=tutor_id,
        stars=body.stars,
        standout_traits=body.standout_traits,
        is_anonymous=body.is_anonymous,
    )

    review_row: dict | None = None
    if body.review_text:
        review_row = ratings_db.create_review(rating_row["id"], body.review_text)

    # Update reliability metrics with new rating
    ratings_db.update_avg_rating_after_rating(tutor_id, body.stars)

    return RatingResponse.from_db(rating_row, review_row)


# ---------------------------------------------------------------------------
# UC-6.5  Get rating
# ---------------------------------------------------------------------------

def get_rating(session_id: str, user_id: str) -> RatingResponse:
    """Fetch the rating for a session.  Both parties can view it."""
    session = sessions_db.get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    rating = ratings_db.get_rating_by_session(session_id)
    if not rating:
        raise NotFoundError("No rating has been submitted for this session yet.")

    review = ratings_db.get_review_by_rating(rating["id"])
    return RatingResponse.from_db(rating, review)
