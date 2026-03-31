"""Business logic for the tutor profile module.

Hard Rule 2: user_id always comes from the JWT dep — never from request bodies.
Hard Rule 6: DB errors surfaced as AppError from tutor_profile_db; not re-wrapped here.

SRS 2.2.1 — Role assignment:
  Submitting a tutor profile (POST) implicitly assigns the "tutor" role.
  This is also where tutor_reliability_metrics are seeded for Phase 4 matching.

SRS 2.2.2 — Tutor mode deactivation:
  PATCH /mode sets is_active_mode. When deactivated the tutor is hidden from
  matching and receives no new requests; existing Confirmed sessions are
  unaffected (that enforcement happens at the matching/session layer).
"""

from app.core.errors import ConflictError, NotFoundError
from app.db import tutor_profile_db
from app.models.tutor_profile import (
    AvailabilityRequest,
    AvailabilityResponse,
    SetModeRequest,
    TutorProfileRequest,
    TutorProfileResponse,
)


def _topics_as_dicts(body: TutorProfileRequest) -> list[dict]:
    return [{"subject": t.subject, "topic": t.topic} for t in body.topics]


def _profile_data(body: TutorProfileRequest) -> dict:
    """Extract tutor_profiles column values from the request body."""
    return {
        "academic_levels": body.academic_levels,
        "subjects": body.subjects,
        "planning_areas": body.planning_areas,
        "accessibility_capabilities": body.accessibility_capabilities,
        "accessibility_notes": body.accessibility_notes,
        "max_weekly_hours": body.max_weekly_hours,
        "is_active_mode": body.is_active_mode,
    }


def _fetch_full(tutor_id: str) -> TutorProfileResponse:
    """Fetch profile + topics + reliability metrics + workload and return a combined response."""
    profile = tutor_profile_db.get_profile(tutor_id)
    if not profile:
        raise NotFoundError("Tutor profile not found.")
    topics = tutor_profile_db.get_topics(tutor_id)
    metrics = tutor_profile_db.get_reliability_metrics(tutor_id)
    confirmed_hours = tutor_profile_db.get_confirmed_hours_this_week(tutor_id)
    return TutorProfileResponse.from_db(profile, topics, metrics, confirmed_hours)


# ---------------------------------------------------------------------------
# UC-4.1  Create profile (POST)
# ---------------------------------------------------------------------------

def create_profile(user_id: str, body: TutorProfileRequest) -> TutorProfileResponse:
    """Create a new tutor profile, assign the tutor role, and seed metrics.

    Raises ConflictError if a profile already exists for this user.
    """
    if tutor_profile_db.profile_exists(user_id):
        raise ConflictError(
            "A tutor profile already exists. Use PUT /tutor-profile to update it."
        )

    # Create the profile row
    tutor_profile_db.create_profile(user_id, _profile_data(body))

    # Insert topics
    tutor_profile_db.replace_topics(user_id, _topics_as_dicts(body))

    # SRS 2.2.1: assign tutor role to the user
    tutor_profile_db.assign_tutor_role(user_id)

    # Seed reliability metrics for Phase 4 matching engine
    tutor_profile_db.init_reliability_metrics(user_id)

    return _fetch_full(user_id)


# ---------------------------------------------------------------------------
# UC-4.1  Get profile (GET)
# ---------------------------------------------------------------------------

def get_profile(user_id: str) -> TutorProfileResponse:
    """Return the tutor profile for the authenticated user.

    Raises NotFoundError if the user has not yet created a tutor profile.
    """
    return _fetch_full(user_id)


# ---------------------------------------------------------------------------
# UC-4.1  Update full profile (PUT)
# ---------------------------------------------------------------------------

def update_profile(user_id: str, body: TutorProfileRequest) -> TutorProfileResponse:
    """Full replacement of profile fields and topics.

    Raises NotFoundError if the profile does not exist yet (use POST to create).
    Topics are replaced atomically via delete-then-insert.
    """
    if not tutor_profile_db.profile_exists(user_id):
        raise NotFoundError(
            "Tutor profile not found. Use POST /tutor-profile to create one first."
        )

    tutor_profile_db.update_profile(user_id, _profile_data(body))
    tutor_profile_db.replace_topics(user_id, _topics_as_dicts(body))

    return _fetch_full(user_id)


# ---------------------------------------------------------------------------
# UC-4.3  Toggle tutor mode (PATCH)
# ---------------------------------------------------------------------------

def set_mode(user_id: str, body: SetModeRequest) -> TutorProfileResponse:
    """Activate or deactivate tutor mode.

    Raises NotFoundError if the profile does not exist.
    SRS 2.2.2: deactivating mode hides the tutor from matching and blocks
    new requests; existing Confirmed sessions are unaffected.
    """
    if not tutor_profile_db.profile_exists(user_id):
        raise NotFoundError("Tutor profile not found.")

    tutor_profile_db.set_active_mode(user_id, body.is_active_mode)

    return _fetch_full(user_id)


# ---------------------------------------------------------------------------
# UC-4.2  Get availability (GET)
# ---------------------------------------------------------------------------

def get_availability(user_id: str) -> AvailabilityResponse:
    """Return the weekly availability grid for the authenticated tutor.

    Returns an empty slots list if no profile or no availability is set —
    the route does not require the profile to exist so tutors can check
    their availability independently.
    """
    rows = tutor_profile_db.get_availability(user_id)
    return AvailabilityResponse.from_db(rows)


# ---------------------------------------------------------------------------
# UC-4.2  Update availability (PUT)
# ---------------------------------------------------------------------------

def update_availability(user_id: str, body: AvailabilityRequest) -> AvailabilityResponse:
    """Replace the weekly availability grid.

    Raises NotFoundError if no tutor profile exists (must create profile first).
    Duplicate (day, hour) pairs in the request are silently deduplicated.
    """
    if not tutor_profile_db.profile_exists(user_id):
        raise NotFoundError(
            "Tutor profile not found. Create a profile before setting availability."
        )

    # Deduplicate slots preserving first occurrence
    seen: set[tuple[int, int]] = set()
    unique_slots: list[dict] = []
    for slot in body.slots:
        key = (slot.day_of_week, slot.hour_slot)
        if key not in seen:
            seen.add(key)
            unique_slots.append({"day_of_week": slot.day_of_week, "hour_slot": slot.hour_slot})

    tutor_profile_db.replace_availability(user_id, unique_slots)

    rows = tutor_profile_db.get_availability(user_id)
    return AvailabilityResponse.from_db(rows)
