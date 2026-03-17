"""Pydantic v2 schemas for the payments module.

Hard Rule 9: POST /payments/initiate body intentionally has NO fee field.
  Fee is computed server-side from session.academic_level × session.duration_hours
  using base rates in settings.  Any client-supplied fee is completely ignored.

Hard Rule 2: session_id links to tutee/tutor; user_id from JWT dep.
"""

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class InitiatePaymentBody(BaseModel):
    """POST /payments/initiate.

    Hard Rule 9: no fee field — fee is ALWAYS computed server-side.
    The client supplies only the session_id.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    session_id: str


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FeeResponse(BaseModel):
    """Returned by GET /payments/fee."""
    session_id: str
    academic_level: str
    duration_hours: int
    base_rate_per_hour: float
    fee: float


class PaymentResponse(BaseModel):
    """Returned by POST /payments/initiate and GET /payments/{session_id}."""
    transaction_id: str
    session_id: str
    amount: float
    status: str                    # pending | success | failed | refunded
    provider_transaction_id: str | None
    created_at: str

    @classmethod
    def from_db(cls, row: dict) -> "PaymentResponse":
        return cls(
            transaction_id=row["id"],
            session_id=row.get("session_id", ""),
            amount=float(row.get("amount") or 0),
            status=row.get("status", ""),
            provider_transaction_id=row.get("provider_transaction_id"),
            created_at=str(row.get("created_at", "")),
        )
