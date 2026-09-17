from app.models import Installment, InstallmentStatus, Sale


def sync_sale_totals_from_installments(sale: Sale) -> None:
    sale.amount_paid = total_collected_from_installments(sale)
    sale.balance_pending = round(max(sale.total_charge - sale.amount_paid, 0), 2)


def apply_amount_to_schedule(sale: Sale, total_collected: float) -> None:
    """Apply collected money to cuotas in order: 0 (inicial) if any, then 1, 2, …"""
    for inst in sale.installments:
        inst.amount_paid = 0
        inst.status = InstallmentStatus.pending

    remaining = max(total_collected, 0)
    for inst in sorted(sale.installments, key=lambda i: i.sequence):
        due = inst.amount - inst.amount_paid
        if due <= 0:
            continue
        applied = min(remaining, due)
        if applied <= 0:
            continue
        inst.amount_paid += applied
        remaining -= applied
        if inst.amount_paid >= inst.amount - 0.01:
            inst.status = InstallmentStatus.paid
            inst.amount_paid = inst.amount
        else:
            inst.status = InstallmentStatus.partial

    sync_sale_totals_from_installments(sale)


def total_collected_from_installments(sale: Sale) -> float:
    return round(sum(i.amount_paid for i in sale.installments), 2)


def total_payments_recorded(sale: Sale) -> float:
    return round(sum(p.amount for p in sale.payments), 2)
