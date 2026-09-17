from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import CurrentUser
from app.schemas import PricingPreviewRequest, PricingPreviewResponse
from app.services.credit_quote import credit_installment
from app.services.sale_pricing import compute_sale_pricing

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/preview", response_model=PricingPreviewResponse)
def preview_pricing(body: PricingPreviewRequest, _user: CurrentUser):
    return compute_sale_pricing(
        cost_price=body.cost_price,
        margin_rate=body.margin_rate,
        down_payment=body.down_payment,
        installment_count=body.installment_count,
        payment_period=body.payment_period,
    )


class CreditQuoteRequest(BaseModel):
    product_value: float
    down_payment: float = 0
    rate: float
    installments: int


class CreditQuoteResponse(BaseModel):
    financed_balance: float
    installment_amount: float


@router.post("/credit-quote", response_model=CreditQuoteResponse)
def preview_credit_quote(body: CreditQuoteRequest, _user: CurrentUser):
    financed = max(body.product_value - body.down_payment, 0)
    return CreditQuoteResponse(
        financed_balance=financed,
        installment_amount=credit_installment(financed, body.rate, body.installments),
    )
