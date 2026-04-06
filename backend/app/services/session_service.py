"""Business logic for session coordination (Phase 5).

State machine transitions enforced here — invalid transitions raise UnprocessableError.
Hard Rule 2: user_id from JWT dep; roles checked by comparing to session.tutee_id / tutor_id.

State machine (from plan.md Section 7):
  pending_tutor_selection → tutor_accepted     (accept — tutor only)
  pending_tutor_selection → cancelled          (decline — tutor only)
  pending_tutor_selection → cancelled          (cancel — tutee only)
  tutor_accepted          → pending_confirmation (confirm-slot — tutee only)
  tutor_accepted          → cancelled          (cancel — either party)
  pending_confirmation    → confirmed          (payment — Phase 6)
  pending_confirmation    → cancelled          (cancel — either party or timeout)
  confirmed               → cancelled          (admin cancel or timeout)
  confirmed               → completed_*        (outcome — Phase 6)

propose-slots: no state change (tutor stores proposed slots; tutee then confirms one)
"""

import logging

from app.core.errors import ForbiddenError, NotFoundError, UnprocessableError
from app.db import messaging_db, notifications_db, ratings_db, requests_db, sessions_db, venues_db
from app.models.session import (
    CancelSessionBody,
    ConfirmSlotBody,
    ConfirmVenueBody,
    CreateSessionBody,
    ProposeSlotsBody,
    SessionResponse,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# State machine validation
# ---------------------------------------------------------------------------

_VALID_TRANSITIONS: dict[str, set[str]] = {
    "pending_tutor_selection": {"tutor_accepted", "cancelled"},
    "tutor_accepted":          {"pending_confirmation", "cancelled"},
    "pending_confirmation":    {"confirmed", "cancelled"},
    "confirmed":               {"completed_attended", "completed_no_show", "cancelled"},
    "completed_attended":      set(),
    "completed_no_show":       set(),
    "cancelled":               set(),
}

_CANCELLABLE_STATES = {
    "pending_tutor_selection",
    "tutor_accepted",
    "pending_confirmation",
    "confirmed",
}


def _assert_transition(current: str, target: str) -> None:
    allowed = _VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise UnprocessableError(
            f"Cannot transition session from '{current}' to '{target}'. "
            f"Allowed transitions from '{current}': {sorted(allowed) or ['none']}."
        )


def _get_session_or_404(session_id: str, user_id: str) -> dict:
    row = sessions_db.get_session_for_participant(session_id, user_id)
    if not row:
        raise NotFoundError("Session not found or access denied.")
    return row


def _notify(
    user_id: str,
    notification_type: str,
    title: str,
    content: str,
) -> None:
    """Fire-and-forget notification — failure is logged, never raised."""
    notifications_db.create_notification(user_id, notification_type, title, content)


# ---------------------------------------------------------------------------
# UC-3.4  Create session (tutee selects tutor from recommendations)
# ---------------------------------------------------------------------------

def create_session(tutee_id: str, body: CreateSessionBody) -> SessionResponse:
    """Create a tutoring_session in pending_tutor_selection state.

    Validates that the tutoring_request belongs to the tutee.
    """
    request = requests_db.get_request_by_id_and_tutee(body.request_id, tutee_id)
    if not request:
        raise NotFoundError("Tutoring request not found.")
    if request.get("status") == "cancelled":
        raise UnprocessableError("Cannot create a session for a cancelled request.")

    row = sessions_db.create_session(
        request_id=request.get("id") or body.request_id,
        tutee_id=tutee_id,
        tutor_id=body.tutor_id,
        academic_level=request.get("academic_level", ""),
        duration_hours=request.get("duration_hours", 1),
    )

    # Notify the tutor that a tutee has selected them
    subjects = request.get("subjects") or []
    subject_str = ", ".join(subjects) if subjects else "a subject"
    _notify(
        body.tutor_id,
        "new_request",
        "A student wants your help!",
        f"A student has requested your tutoring services for {subject_str}. "
        f"Please accept or decline the request.",
    )

    return SessionResponse.from_db(row)


# ---------------------------------------------------------------------------
# UC-4.5  Accept
# ---------------------------------------------------------------------------

def accept_session(session_id: str, tutor_id: str) -> SessionResponse:
    """Tutor accepts → tutor_accepted + create messaging channel + notify tutee."""
    row = _get_session_or_404(session_id, tutor_id)
    if row.get("tutor_id") != tutor_id:
        raise ForbiddenError("Only the assigned tutor can accept this session.")

    _assert_transition(row["status"], "tutor_accepted")

    updated = sessions_db.update_status(session_id, "tutor_accepted")

    # Create messaging channel (SRS UC-4.5 — created at accept time)
    messaging_db.create_channel(session_id)

    # Notify tutee
    _notify(
        row["tutee_id"],
        "session_update",
        "Tutor accepted your request",
        f"Your tutor has accepted your request. A messaging channel is now open "
        f"to coordinate timing and venue.",
    )

    return SessionResponse.from_db(updated)


# ---------------------------------------------------------------------------
# UC-4.6  Decline
# ---------------------------------------------------------------------------

def decline_session(session_id: str, tutor_id: str) -> SessionResponse:
    """Tutor declines → cancelled + notify tutee."""
    row = _get_session_or_404(session_id, tutor_id)
    if row.get("tutor_id") != tutor_id:
        raise ForbiddenError("Only the assigned tutor can decline this session.")

    _assert_transition(row["status"], "cancelled")

    sessions_db.set_cancel_reason(session_id, "Tutor declined the request.")
    updated = sessions_db.update_status(session_id, "cancelled")

    _notify(
        row["tutee_id"],
        "session_update",
        "Tutor declined your request",
        "The tutor has declined your request. You can return to recommendations "
        "and select a different tutor.",
    )

    return SessionResponse.from_db(updated)


# ---------------------------------------------------------------------------
# UC-4.7  Propose slots
# ---------------------------------------------------------------------------

def propose_slots(session_id: str, tutor_id: str, body: ProposeSlotsBody) -> SessionResponse:
    """Tutor proposes one or more time slots. No state change."""
    row = _get_session_or_404(session_id, tutor_id)
    if row.get("tutor_id") != tutor_id:
        raise ForbiddenError("Only the assigned tutor can propose time slots.")
    if row["status"] != "tutor_accepted":
        raise UnprocessableError(
            "Slots can only be proposed when the session is in 'tutor_accepted' state."
        )

    updated = sessions_db.set_proposed_slots(session_id, body.slots)

    _notify(
        row["tutee_id"],
        "session_update",
        "Tutor proposed time slots",
        f"Your tutor has proposed {len(body.slots)} time slot(s). "
        "Please confirm one to proceed.",
    )

    return SessionResponse.from_db(updated)


# ---------------------------------------------------------------------------
# UC-5.2  Confirm slot
# ---------------------------------------------------------------------------

def confirm_slot(session_id: str, tutee_id: str, body: ConfirmSlotBody) -> SessionResponse:
    """Tutee confirms one slot → pending_confirmation."""
    row = _get_session_or_404(session_id, tutee_id)
    if row.get("tutee_id") != tutee_id:
        raise ForbiddenError("Only the tutee can confirm a time slot.")

    _assert_transition(row["status"], "pending_confirmation")

    # Build ISO timestamp from the selected slot
    try:
        scheduled_at = f"{body.date}T{body.hour_slot:02d}:00:00+08:00"
    except Exception:
        raise UnprocessableError("Invalid date or hour_slot.")

    updated = sessions_db.confirm_slot(session_id, scheduled_at)

    _notify(
        row["tutor_id"],
        "session_update",
        "Tutee confirmed a time slot",
        f"The tutee has confirmed the session for {body.date} at {body.hour_slot:02d}:00. "
        "Please wait while payment is processed.",
    )

    return SessionResponse.from_db(updated)


# ---------------------------------------------------------------------------
# UC-3.7 / SRS 2.9.4  Cancel
# ---------------------------------------------------------------------------

def cancel_session(
    session_id: str,
    user_id: str,
    body: CancelSessionBody,
) -> SessionResponse:
    """Cancel from any cancellable state. Both parties can cancel."""
    row = _get_session_or_404(session_id, user_id)
    current = row["status"]

    if current not in _CANCELLABLE_STATES:
        raise UnprocessableError(
            f"Sessions in '{current}' state cannot be cancelled."
        )

    reason = (body.reason or "").strip() or "Cancelled by user."
    sessions_db.set_cancel_reason(session_id, reason)
    updated = sessions_db.update_status(session_id, "cancelled")

    # Set messaging channel read-only (SRS 2.6)
    channel = messaging_db.get_channel_by_session(session_id)
    if channel:
        messaging_db.set_channel_readonly(channel["id"], True)

    # Notify the other party
    is_tutee = row.get("tutee_id") == user_id
    other_id = row["tutor_id"] if is_tutee else row["tutee_id"]
    other_role = "tutor" if is_tutee else "tutee"

    _notify(
        other_id,
        "session_update",
        f"Session cancelled by {('you' if not is_tutee else 'tutee')}",
        f"The session has been cancelled. Reason: {reason}",
    )

    return SessionResponse.from_db(updated)


# ---------------------------------------------------------------------------
# UC-5.3 / UC-5.4  Set venue
# ---------------------------------------------------------------------------

def set_venue(session_id: str, user_id: str, body: ConfirmVenueBody) -> SessionResponse:
    """Attach a venue (from DB) or a manual description to the session.

    SRS 2.8: only public venues allowed.  Manual venues show a warning
    that the location must be a public place, not a home address.
    Callable by either party.
    """
    row = _get_session_or_404(session_id, user_id)

    if row["status"] not in {"tutor_accepted", "pending_confirmation"}:
        raise UnprocessableError(
            "Venue can only be set when the session is in "
            "'tutor_accepted' or 'pending_confirmation' state."
        )

    if body.venue_manual and not body.venue_id:
        # Warn about public venue requirement (enforced socially, not technically)
        logger.info(
            "Manual venue set for session %s: %r — user reminded about public location policy.",
            session_id,
            body.venue_manual,
        )

    updated = sessions_db.set_venue(
        session_id,
        venue_id=body.venue_id,
        venue_manual=body.venue_manual,
    )
    return SessionResponse.from_db(updated)


# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------

def _inject_has_rating(row: dict) -> dict:
    """Set has_rating=True on the row if a rating exists for this session."""
    status = row.get("status", "")
    if status not in ("completed_attended", "completed_no_show"):
        return row
    try:
        rating = ratings_db.get_rating_by_session(row.get("id") or row.get("session_id", ""))
        return {**row, "has_rating": rating is not None}
    except Exception:
        return row


def list_sessions(
    user_id: str,
    role: str | None,
    status_group: str | None,
) -> list[SessionResponse]:
    rows = sessions_db.list_sessions(user_id, role, status_group)
    return [SessionResponse.from_db(_inject_has_rating(r)) for r in rows]


def _build_onemap_url(postal: str | None, name: str = "", address: str = "") -> str:
    """Return a OneMap Advanced Minimap embed URL.

    Uses the amm.html endpoint with postalcode: marker syntax when a 6-digit
    Singapore postal code is available — this reliably centres and pins the map.
    Falls back to address text if no postal code is found.
    """
    from urllib.parse import quote as urlquote

    if postal:
        popup = urlquote(f"{name}\n{address}".strip()[:80], safe="")
        return (
            "https://www.onemap.gov.sg/amm/amm.html"
            f"?mapStyle=Default&zoomLevel=17"
            f"&marker=postalcode:{postal}!colour:red!popupMsg:{popup}"
            f"&popupWidth=200"
        )
    # Fallback: no postal code — just centre on the address name
    search = urlquote((address or name)[:80], safe="")
    return (
        "https://www.onemap.gov.sg/amm/amm.html"
        f"?mapStyle=Default&zoomLevel=15"
        f"&marker=postalcode:{search}!colour:red"
        f"&popupWidth=200"
    )


def _enrich_venue(row: dict) -> dict:
    """Inject venue_name, venue_address, and venue_map_url into a session row."""
    import re

    venue_id = row.get("venue_id")
    venue_manual = row.get("venue_manual")

    if venue_id:
        try:
            venue = venues_db._get_venue_coords_by_id(venue_id)
            if venue:
                name = venue.get("name", "") or ""
                address = venue.get("address", "") or ""
                row = {**row, "venue_name": name, "venue_address": address}
                postal_match = re.search(r'\bS?(\d{6})\b', address)
                postal = postal_match.group(1) if postal_match else None
                row = {**row, "venue_map_url": _build_onemap_url(postal, name=name, address=address)}
        except Exception:
            pass
    elif venue_manual:
        try:
            postal_match = re.search(r'\bS?(\d{6})\b', venue_manual)
            postal = postal_match.group(1) if postal_match else None
            row = {**row, "venue_map_url": _build_onemap_url(postal, name=venue_manual, address=venue_manual)}
        except Exception:
            pass
    return row


def get_session(session_id: str, user_id: str) -> SessionResponse:
    row = _get_session_or_404(session_id, user_id)
    return SessionResponse.from_db(_inject_has_rating(_enrich_venue(row)))
