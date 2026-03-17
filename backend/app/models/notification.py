"""Pydantic v2 response schemas for notifications and dashboard.

No request-body models here — all write operations (mark-read) are
parameterised via path/route, not via request bodies with user data.
"""

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Notification schemas
# ---------------------------------------------------------------------------

class NotificationItem(BaseModel):
    """A single notification row."""
    notification_id: str
    type: str
    title: str
    content: str
    is_read: bool
    is_mandatory: bool
    created_at: str

    @classmethod
    def from_db(cls, row: dict) -> "NotificationItem":
        return cls(
            notification_id=row["id"],
            type=row.get("type", ""),
            title=row.get("title", ""),
            content=row.get("content", ""),
            is_read=row.get("is_read", False),
            is_mandatory=row.get("is_mandatory", False),
            created_at=str(row.get("created_at", "")),
        )


class NotificationsListResponse(BaseModel):
    """Paginated list of notifications."""
    notifications: list[NotificationItem]
    total: int
    unread_count: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Dashboard schemas
# ---------------------------------------------------------------------------

class SessionCountsResponse(BaseModel):
    """Session counts by dashboard status group."""
    upcoming: int   # confirmed, scheduled in the future
    pending: int    # pending_tutor_selection | tutor_accepted | pending_confirmation
    completed: int  # completed_attended | completed_no_show
    cancelled: int


class UpcomingSessionItem(BaseModel):
    """A brief summary of an upcoming confirmed session."""
    session_id: str
    status: str
    academic_level: str
    scheduled_at: str | None
    role: str  # "tutee" | "tutor" — the current user's role in this session

    @classmethod
    def from_db(cls, row: dict) -> "UpcomingSessionItem":
        return cls(
            session_id=row["id"],
            status=row.get("status", ""),
            academic_level=row.get("academic_level", ""),
            scheduled_at=str(row["scheduled_at"]) if row.get("scheduled_at") else None,
            role=row.get("role", "tutee"),
        )


class PendingActionItem(BaseModel):
    """A session that requires the current user to take action."""
    type: str        # respond_to_request | confirm_slot | awaiting_payment
    session_id: str
    description: str


class DashboardSummaryResponse(BaseModel):
    """Response for GET /dashboard/summary."""
    session_counts: SessionCountsResponse
    upcoming_sessions: list[UpcomingSessionItem]
    pending_actions: list[PendingActionItem]


class DashboardBadgesResponse(BaseModel):
    """Response for GET /dashboard/badges — tab badge counts."""
    notifications: int  # unread notification count
    messages: int       # unread messages across all active session channels
    tutoring: int       # sessions / requests requiring the user's attention
