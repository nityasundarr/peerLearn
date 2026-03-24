"""Pydantic v2 schemas for the messaging module.

Hard Rule 8: contact info stripping happens in messaging_service before
storage; these models only represent the cleaned data.
"""

from pydantic import BaseModel, ConfigDict


class SendMessageBody(BaseModel):
    """POST /sessions/{id}/messages."""
    model_config = ConfigDict(str_strip_whitespace=True)

    content: str

    @classmethod
    def __get_validators__(cls):
        yield cls._validate

    @classmethod
    def _validate(cls, v):
        return v


class MessageItem(BaseModel):
    """One message row."""
    message_id: str
    channel_id: str
    sender_id: str
    content: str
    sent_at: str
    is_read: bool

    @classmethod
    def from_db(cls, row: dict) -> "MessageItem":
        return cls(
            message_id=row["id"],
            channel_id=row.get("channel_id", ""),
            sender_id=row.get("sender_id", ""),
            content=row.get("content", ""),
            sent_at=str(row.get("sent_at", "")),
            is_read=row.get("is_read", False),
        )


class MessageListResponse(BaseModel):
    """Paginated message list."""
    messages: list[MessageItem]
    total: int
    channel_id: str
    is_readonly: bool
