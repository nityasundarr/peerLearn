"""Business logic for the payments module.

Hard Rule 9: fee is ALWAYS computed server-side from settings.
  Any fee value supplied by the client is ignored entirely.
  The fee computation path: academic_level → base_rate → fee = base_rate × duration_hours.

SRS 2.9.2 / 2.9.3 checks at payment initiation:
  1. Session must be in pending_confirmation state
  2. Slot must still be available (no other confirmed session at same scheduled_at)
  3. Session must not push tutor over weekly load cap
  4. Fee computed deterministically (same inputs → same fee)
  5. Fee locked on session, payment_transaction created
  6. Payment simulated as success (Phase 6 — no real payment provider)
  7. Session → confirmed, workload updated
"""

import logging
from datetime import date, datetime, timezone

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.db import payments_db, sessions_db
from app.models.payment import FeeResponse, InitiatePaymentBody, PaymentResponse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fee computation (SRS 2.9.3) — Hard Rule 9
# ---------------------------------------------------------------------------

_BASE_RATES: dict[str, float] = {
    "Primary":       float(settings.FEE_PRIMARY),
    "Secondary":     float(settings.FEE_SECONDARY),
    "Junior College": float(settings.FEE_JUNIOR_COLLEGE),
    "Polytechnic":   float(settings.FEE_POLYTECHNIC),
    "ITE":           float(settings.FEE_ITE),
    "University":    float(settings.FEE_UNIVERSITY),
}


def _get_base_rate(academic_level: str) -> float:
    rate = _BASE_RATES.get(academic_level)
    if rate is None:
        raise UnprocessableError(
            f"Unknown academic level '{academic_level}'. "
            f"Valid levels: {sorted(_BASE_RATES)}."
        )
    return rate


def compute_fee(academic_level: str, duration_hours: int) -> float:
    """Hard Rule 9: deterministic fee computation.  Same inputs → same output."""
    return _get_base_rate(academic_level) * duration_hours


# ---------------------------------------------------------------------------
# UC-6.2  GET /payments/fee
# ---------------------------------------------------------------------------

def get_fee(session_id: str, user_id: str) -> FeeResponse:
    """Return the computed fee for a session without any side effects."""
    session = sessions_db.get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    level = session.get("academic_level", "")
    duration = int(session.get("duration_hours") or 1)
    base_rate = _get_base_rate(level)
    fee = base_rate * duration

    return FeeResponse(
        session_id=session_id,
        academic_level=level,
        duration_hours=duration,
        base_rate_per_hour=base_rate,
        fee=fee,
    )


# ---------------------------------------------------------------------------
# UC-6.1  POST /payments/initiate
# ---------------------------------------------------------------------------

def initiate_payment(user_id: str, body: InitiatePaymentBody) -> PaymentResponse:
    """Run pre-payment checks, compute fee, create transaction, confirm session.

    Hard Rule 9: fee comes from compute_fee() only — body carries no fee field.
    """
    session_id = body.session_id
    session = sessions_db.get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    # ── Check 1: must be in pending_confirmation ──────────────────────────
    if session.get("status") != "pending_confirmation":
        raise UnprocessableError(
            f"Payment can only be initiated for sessions in 'pending_confirmation' state. "
            f"Current status: '{session.get('status')}'."
        )

    # ── Check 2: slot conflict (SRS 2.9.2) ───────────────────────────────
    scheduled_at = session.get("scheduled_at")
    if not scheduled_at:
        raise UnprocessableError(
            "Session has no confirmed time slot. "
            "Please confirm a time slot before initiating payment."
        )

    tutor_id = session["tutor_id"]
    conflicts = payments_db.count_conflicting_confirmed_sessions(
        tutor_id, scheduled_at, session_id
    )
    if conflicts > 0:
        raise ConflictError(
            "The selected time slot is no longer available — the tutor has another "
            "confirmed session at that time. Please coordinate an alternative slot."
        )

    # ── Check 3: weekly load cap (SRS 2.9.2) ─────────────────────────────
    duration_hours = int(session.get("duration_hours") or 1)
    max_hours = payments_db.get_tutor_max_weekly_hours(tutor_id)

    try:
        slot_date = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00")).date()
    except (ValueError, AttributeError):
        slot_date = date.today()
    week_start = payments_db.week_start_for_date(slot_date)

    current_load = payments_db.get_confirmed_hours_for_week(tutor_id, week_start)
    if current_load + duration_hours > max_hours:
        raise ConflictError(
            f"Confirming this session would exceed the tutor's weekly limit "
            f"({max_hours} hours). The session has been cancelled automatically. "
            "Please find an alternative tutor."
        )

    # ── Compute fee (Hard Rule 9) ─────────────────────────────────────────
    academic_level = session.get("academic_level", "")
    fee = compute_fee(academic_level, duration_hours)

    # ── Create pending transaction ────────────────────────────────────────
    tx = payments_db.create_payment_transaction(session_id, fee)

    # ── Simulate payment success (Phase 6 — no real provider) ────────────
    # In production this would call a payment gateway and handle async callbacks.
    # For Phase 6, payment is treated as immediately successful.
    tx = payments_db.update_payment_status(tx["id"], "success")

    # ── Lock fee + confirm session ────────────────────────────────────────
    sessions_db.lock_fee_and_confirm(session_id, fee)

    # ── Update workload ───────────────────────────────────────────────────
    payments_db.add_workload_hours(tutor_id, week_start, duration_hours)

    return PaymentResponse.from_db(tx)


# ---------------------------------------------------------------------------
# UC-6.1  GET /payments/{session_id}
# ---------------------------------------------------------------------------

def get_payment(session_id: str, user_id: str) -> PaymentResponse:
    """Fetch the payment transaction for a session."""
    session = sessions_db.get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    tx = payments_db.get_payment_by_session(session_id)
    if not tx:
        raise NotFoundError("No payment transaction found for this session.")

    return PaymentResponse.from_db(tx)
