"""Business logic for the dashboard module.

Hard Rule 2: user_id always comes from the JWT dep.
Hard Rule 6: DB errors surfaced as AppError; not re-wrapped here.
"""

from app.db import dashboard_db, notifications_db
from app.models.notification import (
    DashboardBadgesResponse,
    DashboardSummaryResponse,
    PendingActionItem,
    SessionCountsResponse,
    UpcomingSessionItem,
)


# ---------------------------------------------------------------------------
# UC-2.1  Dashboard summary
# ---------------------------------------------------------------------------

def get_summary(user_id: str) -> DashboardSummaryResponse:
    """Aggregate session counts, upcoming sessions, and pending actions.

    Three DB calls run sequentially.  (Parallelised async calls are a future
    optimisation; the data volume at this phase doesn't warrant it.)
    """
    counts = dashboard_db.count_sessions_by_group(user_id)
    upcoming_rows = dashboard_db.get_upcoming_sessions(user_id, limit=3)
    action_rows = dashboard_db.get_pending_actions(user_id)

    return DashboardSummaryResponse(
        session_counts=SessionCountsResponse(**counts),
        upcoming_sessions=[UpcomingSessionItem.from_db(r) for r in upcoming_rows],
        pending_actions=[
            PendingActionItem(
                type=a["type"],
                session_id=a["session_id"],
                description=a["description"],
            )
            for a in action_rows
        ],
    )


# ---------------------------------------------------------------------------
# UC-2.1  Dashboard badges
# ---------------------------------------------------------------------------

def get_badges(user_id: str) -> DashboardBadgesResponse:
    """Return the three tab badge counts for DashboardLayout.

    Three independent counts are fetched:
      - notifications: unread notification rows
      - messages: unread session_messages not sent by the user
      - tutoring: sessions / requests currently requiring the user's action
    """
    unread_notifications = notifications_db.get_unread_count(user_id)
    unread_messages = dashboard_db.count_unread_messages(user_id)
    pending_tutoring = dashboard_db.count_pending_tutoring(user_id)

    return DashboardBadgesResponse(
        notifications=unread_notifications,
        messages=unread_messages,
        tutoring=pending_tutoring,
    )
