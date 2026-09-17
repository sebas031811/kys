from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Payment, Sale
from app.services.installment_payments import apply_amount_to_schedule


def _payments_total(db: Session, sale_id: int) -> float:
    raw = db.query(func.coalesce(func.sum(Payment.amount), 0.0)).filter(Payment.sale_id == sale_id).scalar()
    return round(float(raw or 0), 2)


def apply_payment_to_sale(
    db: Session,
    sale: Sale,
    amount: float,
    paid_at: date,
    collection_account_id: int | None,
    recorded_by_id: int | None,
    installment_id: int | None = None,
    notes: str | None = None,
) -> Payment:
    payment = Payment(
        sale_id=sale.id,
        installment_id=installment_id,
        collection_account_id=collection_account_id,
        recorded_by_id=recorded_by_id,
        amount=amount,
        paid_at=paid_at,
        notes=notes,
    )
    db.add(payment)
    db.flush()

    total = _payments_total(db, sale.id)
    apply_amount_to_schedule(sale, total)

    db.flush()
    return payment
