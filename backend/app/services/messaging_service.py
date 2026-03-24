"""Business logic for session messaging.

Hard Rule 8: contact info (phone numbers, emails) is stripped from all
messages before storage and before return.  Uses contact_filter.strip_contact_info().

SRS 2.6 rules enforced here:
  - Messages only during tutor_accepted + pending_confirmation states
    (channel is read-only after terminal states)
  - Channel suspended → messages blocked
  - Contact info → stripped with [contact info removed] placeholder
  - Read-only channel → new messages blocked with 422
"""

import logging

from app.core.errors import ForbiddenError, NotFoundError, UnprocessableError
from app.db import messaging_db, sessions_db
from app.models.message import MessageItem, MessageListResponse, SendMessageBody
from app.utils.contact_filter import strip_contact_info

logger = logging.getLogger(__name__)


def _get_channel_and_session(session_id: str, user_id: str) -> tuple[dict, dict]:
    """Return (channel, session) or raise appropriate errors."""
    session = sessions_db.get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    channel = messaging_db.get_channel_by_session(session_id)
    if not channel:
        raise NotFoundError(
            "Messaging channel not yet open. "
            "The tutor must accept the request before messaging is available."
        )
    return channel, session


# ---------------------------------------------------------------------------
# UC-5.1  Get messages
# ---------------------------------------------------------------------------

def get_messages(
    session_id: str,
    user_id: str,
    limit: int = 50,
    offset: int = 0,
) -> MessageListResponse:
    """Return paginated message history.  Contact info already stripped at storage time."""
    channel, _ = _get_channel_and_session(session_id, user_id)

    rows, total = messaging_db.get_messages(channel["id"], limit=limit, offset=offset)

    return MessageListResponse(
        messages=[MessageItem.from_db(r) for r in rows],
        total=total,
        channel_id=channel["id"],
        is_readonly=channel.get("is_readonly", False),
    )


# ---------------------------------------------------------------------------
# UC-5.1  Send message
# ---------------------------------------------------------------------------

def send_message(session_id: str, user_id: str, body: SendMessageBody) -> MessageItem:
    """Send a message, stripping contact info, after read-only/suspended checks."""
    channel, session = _get_channel_and_session(session_id, user_id)

    # SRS 2.6: read-only after Completed or Cancelled
    if channel.get("is_readonly"):
        raise UnprocessableError(
            "This messaging channel is read-only. "
            "Messaging is only available during active sessions."
        )

    # Admin-suspended channel
    if channel.get("is_suspended"):
        raise UnprocessableError(
            "This messaging channel has been suspended by an administrator."
        )

    # Hard Rule 8: strip contact info before storing
    cleaned_content = strip_contact_info(body.content)

    if not cleaned_content.strip():
        raise UnprocessableError("Message content cannot be empty.")

    row = messaging_db.create_message(
        channel_id=channel["id"],
        sender_id=user_id,
        content=cleaned_content,
    )
    return MessageItem.from_db(row)
