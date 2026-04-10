"""Business logic for the complaints module.

SRS 2.10.5 flow:
  1. User submits complaint referencing a session → notify admin(s)
  2. Admin views complaint list (filtered by status)
  3. Admin views complaint detail (with session info + message history)
  4. Admin records an action → creates disciplinary_record → notifies affected user
     → updates complaint status

Hard Rule 2: reporter_id and admin_id always from JWT dep.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.errors import ForbiddenError, NotFoundError, UnprocessableError
from app.db import complaints_db, messaging_db, notifications_db
from app.db.sessions_db import get_session
from app.models.complaint import (
    ComplaintActionItem,
    ComplaintDetailResponse,
    ComplaintResponse,
    DisciplinaryRecordItem,
    RecordActionBody,
    SubmitComplaintBody,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# UC-7.1  Submit complaint
# ---------------------------------------------------------------------------

def submit_complaint(
    reporter_id: str,
    body: SubmitComplaintBody,
) -> ComplaintResponse:
    """Create a complaint and notify all admin users."""
    row = complaints_db.create_complaint(
        reporter_id=reporter_id,
        session_id=body.session_id,
        category=body.category,
        description=body.description,
    )

    # Notify all admins
    complaint_id = row.get("id", "")
    admin_ids = complaints_db.get_admin_user_ids()
    for admin_id in admin_ids:
        notifications_db.create_notification(
            user_id=admin_id,
            notification_type="admin_complaint",
            title="New complaint submitted",
            content=(
                f"A new complaint (category: {body.category}) has been submitted "
                f"for session {body.session_id}. [complaint:{complaint_id}]"
            ),
            is_mandatory=True,
        )

    # For no-show complaints: notify both session parties about the refund
    if body.category == "no_show" and body.session_id:
        try:
            session = get_session(body.session_id)
            if session:
                tutor_id = session.get("tutor_id")
                tutee_id = session.get("tutee_id")
                if tutee_id:
                    notifications_db.create_notification(
                        user_id=tutee_id,
                        notification_type="session_update",
                        title="No-show reported",
                        content=(
                            "A no-show has been reported for your session. "
                            "A full refund is being processed pending admin review. "
                            f"[complaint:{complaint_id}]"
                        ),
                        is_mandatory=True,
                    )
                if tutor_id:
                    notifications_db.create_notification(
                        user_id=tutor_id,
                        notification_type="session_update",
                        title="No-show reported",
                        content=(
                            "A no-show complaint has been filed for your session. "
                            "An admin will review this and determine next steps. "
                            f"[complaint:{complaint_id}]"
                        ),
                        is_mandatory=True,
                    )
        except Exception:
            pass  # Never block complaint submission on notification failure

    return ComplaintResponse.from_db(row)


# ---------------------------------------------------------------------------
# UC-7.3  Admin: list complaints
# ---------------------------------------------------------------------------

def list_complaints(status_filter: str | None) -> list[ComplaintResponse]:
    rows = complaints_db.list_complaints(status_filter)
    return [ComplaintResponse.from_db(r) for r in rows]


# ---------------------------------------------------------------------------
# UC-7.3  Admin: get complaint detail
# ---------------------------------------------------------------------------

def get_complaint_detail(complaint_id: str) -> ComplaintDetailResponse:
    """Return full complaint detail: complaint + actions + disciplinary records +
    session info + recent message history."""
    complaint_row = complaints_db.get_complaint_by_id(complaint_id)
    if not complaint_row:
        raise NotFoundError("Complaint not found.")

    actions = complaints_db.list_complaint_actions(complaint_id)
    records = complaints_db.get_disciplinary_records_by_complaint(complaint_id)

    # Fetch session info (basic fields; no lat/lng per Hard Rule 10)
    session_info: dict | None = None
    session_id = complaint_row.get("session_id")
    if session_id:
        s = get_session(session_id)
        if s:
            session_info = {
                "session_id": s["id"],
                "tutee_id": s.get("tutee_id"),
                "tutor_id": s.get("tutor_id"),
                "status": s.get("status"),
                "academic_level": s.get("academic_level"),
                "scheduled_at": str(s["scheduled_at"]) if s.get("scheduled_at") else None,
            }

    # Fetch recent messages (up to 20)
    recent_messages: list[dict] = []
    if session_id:
        channel = messaging_db.get_channel_by_session(session_id)
        if channel:
            msgs, _ = messaging_db.get_messages(
                channel["id"], limit=20, offset=0
            )
            recent_messages = [
                {
                    "message_id": m["id"],
                    "sender_id": m.get("sender_id"),
                    "content": m.get("content"),
                    "sent_at": str(m.get("sent_at", "")),
                }
                for m in msgs
            ]

    return ComplaintDetailResponse(
        complaint=ComplaintResponse.from_db(complaint_row),
        actions=[ComplaintActionItem.from_db(a) for a in actions],
        disciplinary_records=[DisciplinaryRecordItem.from_db(r) for r in records],
        session_info=session_info,
        recent_messages=recent_messages,
    )


# ---------------------------------------------------------------------------
# UC-7.3  Admin: record action
# ---------------------------------------------------------------------------

def record_action(
    complaint_id: str,
    admin_id: str,
    body: RecordActionBody,
) -> ComplaintDetailResponse:
    """Admin records an action, creates disciplinary_record, notifies affected user."""
    complaint_row = complaints_db.get_complaint_by_id(complaint_id)
    if not complaint_row:
        raise NotFoundError("Complaint not found.")

    if complaint_row.get("status") in {"resolved", "dismissed"}:
        raise UnprocessableError(
            f"Cannot record an action on a complaint with status "
            f"'{complaint_row['status']}'."
        )

    # Record action
    complaints_db.create_complaint_action(
        complaint_id=complaint_id,
        admin_id=admin_id,
        action=body.action,
        notes=body.notes,
    )

    # Create disciplinary record with appeal deadline from settings
    appeal_deadline = (
        datetime.now(timezone.utc)
        + timedelta(days=settings.APPEAL_WINDOW_DAYS)
    ).isoformat()

    record = complaints_db.create_disciplinary_record(
        user_id=body.affected_user_id,
        complaint_id=complaint_id,
        penalty_type=body.penalty_type,
        appeal_deadline=appeal_deadline,
    )
    record_id = record.get("id", "")

    # Update complaint status
    complaints_db.update_complaint_status(complaint_id, body.update_status)

    # Notify affected user — type "penalty_issued" lets the frontend show an
    # "Appeal" action; record_id is embedded so the appeal page can be pre-filled.
    notifications_db.create_notification(
        user_id=body.affected_user_id,
        notification_type="penalty_issued",
        title="Disciplinary action issued",
        content=(
            f"A {body.penalty_type} has been issued against your account. "
            f"Action taken: {body.action}. "
            f"You may submit an appeal before {appeal_deadline[:10]}. "
            f"[record:{record_id}]"
        ),
        is_mandatory=True,
    )

    return get_complaint_detail(complaint_id)
