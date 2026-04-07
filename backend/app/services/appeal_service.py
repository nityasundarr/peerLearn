"""Business logic for the appeals module.

SRS 2.10.6 flow:
  1. User submits appeal against a disciplinary_record
     — checks that appeal_deadline has not passed (from settings.APPEAL_WINDOW_DAYS)
     — prevents duplicate appeals (one per record)
  2. Admin lists pending appeals
  3. Admin views appeal detail with linked disciplinary_record
  4. Admin decides outcome (upheld | modified | revoked) → notifies user

Hard Rule 2: user_id and admin_id always from JWT dep.
"""

import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnprocessableError
from app.db import appeals_db, notifications_db
from app.db.complaints_db import get_admin_user_ids, get_complaint_by_id, update_complaint_status
from app.db.sessions_db import get_session
from app.models.complaint import (
    AppealDetailResponse,
    AppealResponse,
    DecideAppealBody,
    DisciplinaryRecordItem,
    SubmitAppealBody,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# UC-7.2  Submit appeal
# ---------------------------------------------------------------------------

def submit_appeal(user_id: str, body: SubmitAppealBody) -> AppealResponse:
    """Submit an appeal against a disciplinary record.

    Validates:
    - Record exists and belongs to user (ownership check)
    - Appeal deadline has not passed
    - No existing appeal for this record (one appeal per record)
    """
    record = appeals_db.get_disciplinary_record_for_user(
        body.disciplinary_record_id, user_id
    )
    if not record:
        raise NotFoundError(
            "Disciplinary record not found or access denied."
        )

    # Check appeal deadline
    deadline_str = record.get("appeal_deadline")
    if deadline_str:
        try:
            deadline = datetime.fromisoformat(
                deadline_str.replace("Z", "+00:00")
            )
            if datetime.now(timezone.utc) > deadline:
                raise UnprocessableError(
                    f"The appeal window for this record has expired "
                    f"({settings.APPEAL_WINDOW_DAYS} days from issuance). "
                    "You may no longer submit an appeal."
                )
        except ValueError:
            logger.warning("Could not parse appeal_deadline: %s", deadline_str)

    # Prevent duplicate appeals
    existing = appeals_db.existing_appeal_for_record(body.disciplinary_record_id)
    if existing:
        raise ConflictError(
            "An appeal has already been submitted for this disciplinary record."
        )

    row = appeals_db.create_appeal(
        disciplinary_record_id=body.disciplinary_record_id,
        user_id=user_id,
        appeal_text=body.appeal_text,
    )

    # Reopen the linked complaint so admin can review the appeal
    complaint_id = record.get("complaint_id", "")
    if complaint_id:
        try:
            update_complaint_status(complaint_id, "under_review")
        except Exception:
            pass

    # Notify admins — embed complaint_id so they can deep-link to it
    admin_ids = get_admin_user_ids()
    for admin_id in admin_ids:
        notifications_db.create_notification(
            user_id=admin_id,
            notification_type="admin_appeal",
            title="Penalty appeal submitted",
            content=(
                f"A user has appealed a disciplinary action. "
                f"Please review the complaint. [complaint:{complaint_id}]"
            ),
            is_mandatory=True,
        )

    # Notify the other party in the session (tutor or tutee)
    try:
        if complaint_id:
            complaint = get_complaint_by_id(complaint_id)
            if complaint and complaint.get("session_id"):
                session = get_session(complaint["session_id"])
                if session:
                    tutor_id = session.get("tutor_id")
                    tutee_id = session.get("tutee_id")
                    other_id = tutor_id if user_id == tutee_id else tutee_id
                    if other_id and other_id != user_id:
                        notifications_db.create_notification(
                            user_id=other_id,
                            notification_type="session_update",
                            title="An appeal has been filed",
                            content=(
                                "The other party in one of your sessions has filed an appeal "
                                "against a disciplinary action. An admin will review the case."
                            ),
                            is_mandatory=False,
                        )
    except Exception:
        pass

    return AppealResponse.from_db(row)


# ---------------------------------------------------------------------------
# UC-7.4  Admin: list appeals
# ---------------------------------------------------------------------------

def list_appeals(status_filter: str | None) -> list[AppealResponse]:
    rows = appeals_db.list_appeals(status_filter)
    return [AppealResponse.from_db(r) for r in rows]


# ---------------------------------------------------------------------------
# UC-7.4  Admin: get appeal detail
# ---------------------------------------------------------------------------

def get_appeal_detail(appeal_id: str) -> AppealDetailResponse:
    row = appeals_db.get_appeal_by_id(appeal_id)
    if not row:
        raise NotFoundError("Appeal not found.")

    record = appeals_db.get_disciplinary_record_by_id(
        row["disciplinary_record_id"]
    )
    if not record:
        raise NotFoundError("Associated disciplinary record not found.")

    return AppealDetailResponse(
        appeal=AppealResponse.from_db(row),
        disciplinary_record=DisciplinaryRecordItem.from_db(record),
    )


# ---------------------------------------------------------------------------
# UC-7.4  Admin: decide outcome
# ---------------------------------------------------------------------------

def decide_appeal(appeal_id: str, body: DecideAppealBody) -> AppealResponse:
    """Admin records a decision on a pending appeal and notifies the user."""
    row = appeals_db.get_appeal_by_id(appeal_id)
    if not row:
        raise NotFoundError("Appeal not found.")

    if row.get("status") != "pending":
        raise UnprocessableError(
            f"This appeal has already been decided (status: '{row['status']}')."
        )

    decided_at = datetime.now(timezone.utc).isoformat()
    updated = appeals_db.decide_appeal(
        appeal_id=appeal_id,
        outcome=body.outcome,
        outcome_notes=body.outcome_notes,
        decided_at=decided_at,
    )

    # Notify the appellant
    user_id = row.get("user_id", "")
    outcome_titles = {
        "upheld":   "Appeal outcome: penalty upheld",
        "modified": "Appeal outcome: penalty modified",
        "revoked":  "Appeal outcome: penalty revoked",
    }
    outcome_bodies = {
        "upheld":   "Your appeal has been reviewed. The penalty has been upheld and remains in effect.",
        "modified": "Your appeal has been reviewed. The penalty has been modified — please review the updated decision.",
        "revoked":  "Your appeal has been reviewed. The penalty has been revoked. No further action is required.",
    }
    notes_suffix = f" Admin notes: {body.outcome_notes}" if body.outcome_notes else ""
    notifications_db.create_notification(
        user_id=user_id,
        notification_type="appeal_decided",
        title=outcome_titles.get(body.outcome, "Appeal decision recorded"),
        content=outcome_bodies.get(body.outcome, "Your appeal has been decided.") + notes_suffix,
        is_mandatory=True,
    )

    return AppealResponse.from_db(updated)
