from app.models import PaymentPeriod
from app.schemas import PricingPreviewResponse


def normalize_margin_rate(margin_rate: float) -> float:
    if margin_rate > 1:
        return margin_rate / 100
    return margin_rate


def compute_sale_pricing(
    cost_price: float,
    margin_rate: float,
    down_payment: float = 0,
    installment_count: int = 1,
    payment_period: PaymentPeriod = PaymentPeriod.mensual,
    total_override: float | None = None,
    installment_override: float | None = None,
) -> PricingPreviewResponse:
    """
    Margin applies to (cost - inicial), not including the initial in the profit base.
    Example: cost 1_500_000, margin 0.3, inicial 500_000 ->
      profit 300_000, total 1_800_000, 4 cuotas of 325_000.
    """
    rate = normalize_margin_rate(margin_rate)
    down = max(down_payment, 0)
    profit_base = max(cost_price - down, 0)
    profit = round(profit_base * rate)
    total_charge = total_override if total_override is not None else round(cost_price + profit)

    financed_amount = max(total_charge - down, 0)

    if payment_period == PaymentPeriod.contado or installment_count <= 1:
        installment_amount = installment_override if installment_override is not None else total_charge
    elif installment_override is not None:
        installment_amount = installment_override
    else:
        installment_amount = round(financed_amount / installment_count) if installment_count else financed_amount

    return PricingPreviewResponse(
        profit=profit,
        total_charge=total_charge,
        installment_amount=installment_amount,
        financed_amount=financed_amount,
    )
