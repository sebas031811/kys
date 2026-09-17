from datetime import date, timedelta
from typing import Optional

from app.models import PaymentPeriod


def _add_months(d: date, months: int) -> date:
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = min(d.day, 28)
    return date(year, month, day)


def _next_due_from_rule(base: date, sequence: int, period: PaymentPeriod, due_rule: Optional[str]) -> date:
    rule = (due_rule or "").lower().strip()
    if "al entregar" in rule:
        return base

    if period == PaymentPeriod.quincenal or "15 y 30" in rule:
        month_offset = (sequence - 1) // 2
        use_fifteenth = (sequence - 1) % 2 == 0
        month_date = _add_months(base.replace(day=1), month_offset)
        day = 15 if use_fifteenth else 28
        try:
            return month_date.replace(day=day if day != 28 else min(28, month_date.day))
        except ValueError:
            return month_date.replace(day=28)

    if "15 de cada mes" in rule:
        m = _add_months(base.replace(day=1), sequence - 1)
        return m.replace(day=min(15, 28))

    if period == PaymentPeriod.semanal:
        return base + timedelta(weeks=sequence - 1)

    m = _add_months(base.replace(day=1), sequence - 1)
    day = 30
    if "30 de cada mes" in rule or not rule:
        day = min(30, 28)
    try:
        return m.replace(day=day)
    except ValueError:
        return m.replace(day=28)


def build_installment_schedule(
    start_date: date,
    installment_count: int,
    installment_amount: float,
    payment_period: PaymentPeriod,
    due_rule: Optional[str],
) -> list[dict]:
    rows = []
    for seq in range(1, installment_count + 1):
        due = _next_due_from_rule(start_date, seq, payment_period, due_rule)
        rows.append(
            {
                "sequence": seq,
                "amount": installment_amount,
                "due_date": due,
                "status": "pending",
                "amount_paid": 0,
            }
        )
    return rows
