"""Business logic for the notifications module.

Hard Rule 2: user_id always comes from the JWT dep — never from request bodies.
Hard Rule 6: DB errors surfaced as AppError; not re-wrapped here.
"""

from app.core.errors import NotFoundError
from app.db import notifications_db
from app.models.notification import NotificationItem, NotificationsListResponse

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


# ---------------------------------------------------------------------------
# UC-2.3  List notifications
# ---------------------------------------------------------------------------

def list_notifications(
    user_id: str,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> NotificationsListResponse:
    """Return a paginated, newest-first list of notifications for the user.

    Also returns the unread_count so the frontend can update the badge in one
    call rather than making a separate GET /dashboard/badges.
    """
    limit = min(limit, _MAX_LIMIT)  # cap to prevent large result sets

    rows, total = notifications_db.get_notifications(
        user_id=user_id,
        limit=limit,
        offset=offset,
    )
    unread_count = notifications_db.get_unread_count(user_id)

    return NotificationsListResponse(
        notifications=[NotificationItem.from_db(r) for r in rows],
        total=total,
        unread_count=unread_count,
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# UC-2.3  Mark single notification as read
# ---------------------------------------------------------------------------

def mark_read(notification_id: str, user_id: str) -> NotificationItem:
    """Mark a notification as read.

    Ownership is enforced in the DB layer (user_id filter on the update).
    Raises NotFoundError if the notification doesn't exist for this user.
    """
    row = notifications_db.mark_notification_read(
        notification_id=notification_id,
        user_id=user_id,
    )
    return NotificationItem.from_db(row)


# ---------------------------------------------------------------------------
# UC-2.3  Mark all notifications as read
# ---------------------------------------------------------------------------

def mark_all_read(user_id: str) -> int:
    """Mark all unread notifications for the user as read.

    Returns the number of notifications updated.
    """
    return notifications_db.mark_all_read(user_id)
