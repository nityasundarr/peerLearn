"""Business logic for the tutee requests module.

Hard Rule 2: user_id (tutee_id) always comes from the JWT dep.
Hard Rule 6: DB errors surfaced as AppError from requests_db; not re-wrapped here.

SRS 2.3 — Urgency derivation:
  urgency_level is computed from urgency_category + prior unfulfilled requests.
  It is stored on both tutoring_requests AND learning_needs so the matching
  engine and dashboard can read it without a JOIN.

SRS 2.2.1 — Role assignment:
  Submitting a tutoring request implicitly assigns the "tutee" role.
"""

from app.core.errors import ForbiddenError, NotFoundError, UnprocessableError
from app.db import requests_db
from app.models.request import (
    BroadenRequestBody,
    CreateRequestBody,
    IncomingRequestItem,
    TutoringRequestResponse,
)

# ---------------------------------------------------------------------------
# Urgency computation (SRS 2.3)
# ---------------------------------------------------------------------------

_BASE_URGENCY: dict[str, str] = {
    "assignment_due": "very_urgent",
    "exam_soon": "urgent",
    "general_study": "normal",
}

_URGENCY_ESCALATION: list[str] = ["normal", "urgent", "very_urgent"]


def _compute_urgency_level(urgency_category: str, prior_unfulfilled: int) -> str:
    """Derive urgency_level from category + history.

    SRS 2.3: urgency escalates by one level for every 2 prior unmatched requests.
    """
    base = _BASE_URGENCY.get(urgency_category, "normal")
    escalation_steps = prior_unfulfilled // 2
    current_idx = _URGENCY_ESCALATION.index(base)
    new_idx = min(current_idx + escalation_steps, len(_URGENCY_ESCALATION) - 1)
    return _URGENCY_ESCALATION[new_idx]


def _time_slots_as_json(body: CreateRequestBody) -> list[dict]:
    return [{"date": s.date, "hour_slot": s.hour_slot} for s in body.time_slots]


# ---------------------------------------------------------------------------
# UC-3.1 / UC-3.2  Create request
# ---------------------------------------------------------------------------

def create_request(tutee_id: str, body: CreateRequestBody) -> TutoringRequestResponse:
    """Create a tutoring request, assign the tutee role, and write learning_needs.

    Urgency level is derived from the selected category + the tutee's history
    of prior unfulfilled requests (SRS 2.3).
    """
    # Compute urgency
    prior_unfulfilled = requests_db.count_prior_unfulfilled(tutee_id)
    urgency_level = _compute_urgency_level(body.urgency_category, prior_unfulfilled)

    # Build the request row data
    data = {
        "academic_level": body.academic_level,
        "subjects": body.subjects,
        "topics": body.topics,
        "planning_areas": body.planning_areas,
        "accessibility_needs": body.accessibility_needs,
        "accessibility_notes": body.accessibility_notes,
        "time_slots": _time_slots_as_json(body),
        "duration_hours": body.duration_hours,
        "urgency_category": body.urgency_category,
        "urgency_level": urgency_level,
        "status": "open",
    }

    request_row = requests_db.create_request(tutee_id, data)
    need_row = requests_db.create_learning_need(request_row["id"], urgency_level)

    # SRS 2.2.1: assign tutee role
    requests_db.assign_tutee_role(tutee_id)

    return TutoringRequestResponse.from_db(request_row, need_row)


# ---------------------------------------------------------------------------
# UC-3.1  List + get requests
# ---------------------------------------------------------------------------

def list_requests(tutee_id: str) -> list[TutoringRequestResponse]:
    rows = requests_db.list_requests_by_tutee(tutee_id)
    result = []
    for row in rows:
        need = requests_db.get_learning_need(row["id"])
        result.append(TutoringRequestResponse.from_db(row, need))
    return result


def get_request(request_id: str, tutee_id: str) -> TutoringRequestResponse:
    row = requests_db.get_request_by_id_and_tutee(request_id, tutee_id)
    if not row:
        raise NotFoundError("Tutoring request not found.")
    need = requests_db.get_learning_need(request_id)
    return TutoringRequestResponse.from_db(row, need)


# ---------------------------------------------------------------------------
# UC-3.6  Broaden criteria (PATCH)
# ---------------------------------------------------------------------------

def broaden_request(
    request_id: str,
    tutee_id: str,
    body: BroadenRequestBody,
) -> TutoringRequestResponse:
    """Update request criteria and escalate urgency via the unfulfilled counter.

    Only fields explicitly sent in the body are updated.
    After a broaden, the unfulfilled_count is incremented so the next
    urgency computation reflects this re-attempt (SRS 2.3).
    """
    row = requests_db.get_request_by_id_and_tutee(request_id, tutee_id)
    if not row:
        raise NotFoundError("Tutoring request not found.")
    if row.get("status") != "open":
        raise UnprocessableError(
            "Only open requests can be updated. "
            "Cancelled or matched requests cannot be modified."
        )

    updates: dict = {}
    if body.subjects is not None:
        updates["subjects"] = body.subjects
    if body.topics is not None:
        updates["topics"] = body.topics
    if body.planning_areas is not None:
        updates["planning_areas"] = body.planning_areas
    if body.time_slots is not None:
        updates["time_slots"] = [
            {"date": s.date, "hour_slot": s.hour_slot} for s in body.time_slots
        ]
    if body.duration_hours is not None:
        updates["duration_hours"] = body.duration_hours
    if body.urgency_category is not None:
        updates["urgency_category"] = body.urgency_category

    if not updates:
        raise UnprocessableError(
            "Request body must include at least one field to update."
        )

    # Increment unfulfilled counter before recomputing urgency
    requests_db.increment_unfulfilled_count(request_id)
    need = requests_db.get_learning_need(request_id)
    unfulfilled = (need.get("unfulfilled_count") or 0) if need else 0

    new_category = updates.get("urgency_category") or row.get("urgency_category", "general_study")
    new_urgency = _compute_urgency_level(new_category, unfulfilled)
    updates["urgency_level"] = new_urgency

    updated_row = requests_db.update_request(request_id, tutee_id, updates)
    refreshed_need = requests_db.get_learning_need(request_id)
    return TutoringRequestResponse.from_db(updated_row, refreshed_need)


# ---------------------------------------------------------------------------
# UC-3.7  Cancel request (DELETE)
# ---------------------------------------------------------------------------

def cancel_request(request_id: str, tutee_id: str) -> TutoringRequestResponse:
    """Cancel an open request.  Only the request owner can cancel."""
    row = requests_db.get_request_by_id_and_tutee(request_id, tutee_id)
    if not row:
        raise NotFoundError("Tutoring request not found.")

    cancelled_row = requests_db.cancel_request(request_id, tutee_id)
    need = requests_db.get_learning_need(request_id)
    return TutoringRequestResponse.from_db(cancelled_row, need)


# ---------------------------------------------------------------------------
# UC-4.4  Incoming requests for tutor
# ---------------------------------------------------------------------------

def get_incoming_requests(tutor_id: str) -> list[IncomingRequestItem]:
    """Return sessions in pending_tutor_selection for the current tutor.

    Each session is enriched with the originating tutoring_request details
    so the tutor can see what the tutee needs.

    Note: returns an empty list in Phase 4 since sessions are created in
    Phase 5.  The endpoint is fully wired and will return data once sessions
    exist.
    """
    sessions = requests_db.get_incoming_sessions_for_tutor(tutor_id)
    if not sessions:
        return []

    # Batch-fetch related requests
    request_ids = [s["request_id"] for s in sessions if s.get("request_id")]
    request_map: dict[str, dict] = {}
    if request_ids:
        request_rows = requests_db.get_requests_by_ids(request_ids)
        request_map = {r["id"]: r for r in request_rows}

    # Also fetch learning needs to get urgency_level
    result: list[IncomingRequestItem] = []
    for session in sessions:
        rid = session.get("request_id")
        req = request_map.get(rid, {}) if rid else {}
        need = requests_db.get_learning_need(rid) if rid else None

        result.append(
            IncomingRequestItem(
                session_id=session["id"],
                request_id=rid,
                academic_level=req.get("academic_level") or session.get("academic_level", ""),
                subjects=req.get("subjects") or [],
                topics=req.get("topics") or [],
                planning_areas=req.get("planning_areas") or [],
                time_slots=req.get("time_slots") or [],
                duration_hours=req.get("duration_hours") or 1,
                urgency_level=(need.get("urgency_level") if need else "normal") or "normal",
                created_at=str(session.get("created_at", "")),
            )
        )
    return result
