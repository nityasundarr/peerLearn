"""FastAPI route handlers for /payments/*.

Hard Rule 9: POST /payments/initiate has no fee field in its body.
             Fee is computed server-side only.
Hard Rule 2: user_id from get_current_user dep.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.payment import FeeResponse, InitiatePaymentBody, PaymentResponse
from app.services import payment_service

router = APIRouter(prefix="/payments", tags=["payments"])


# ---------------------------------------------------------------------------
# UC-6.2  GET /payments/fee
# ---------------------------------------------------------------------------

@router.get(
    "/fee",
    response_model=FeeResponse,
    summary=(
        "Compute and return the session fee — never accepts a fee from the client "
        "(UC-6.2, SRS 2.9.3, Hard Rule 9)"
    ),
)
async def get_fee(
    session_id: Annotated[str, Query(description="Session ID to compute fee for")],
    user_id: Annotated[str, Depends(get_current_user)],
) -> FeeResponse:
    return payment_service.get_fee(session_id, user_id)


# ---------------------------------------------------------------------------
# UC-6.1  POST /payments/initiate
# ---------------------------------------------------------------------------

@router.post(
    "/initiate",
    response_model=PaymentResponse,
    summary=(
        "Initiate payment: check slot + load cap, compute fee, confirm session "
        "(UC-6.1, SRS 2.9.2-2.9.3)"
    ),
)
async def initiate_payment(
    body: InitiatePaymentBody,
    user_id: Annotated[str, Depends(get_current_user)],
) -> PaymentResponse:
    # Hard Rule 9: body.session_id only — no fee field exists in InitiatePaymentBody
    return payment_service.initiate_payment(user_id, body)


# ---------------------------------------------------------------------------
# UC-6.1  GET /payments/{session_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{session_id}",
    response_model=PaymentResponse,
    summary="Fetch payment status for a session (UC-6.1)",
)
async def get_payment(
    session_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
) -> PaymentResponse:
    return payment_service.get_payment(session_id, user_id)
