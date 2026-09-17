from datetime import date



from sqlalchemy.orm import Session



from app.models import Installment, InstallmentStatus, Payment, PaymentPeriod, RecordStatus, Sale

from app.schemas import SaleConfirmRequest, SaleCreate, SaleUpdate

from app.services.installment_payments import apply_amount_to_schedule, total_payments_recorded

from app.services.sale_pricing import compute_sale_pricing

from app.services.schedule_from_due_rule import build_installment_schedule





def _pricing_fields(data: SaleCreate) -> dict:

    pricing = compute_sale_pricing(

        cost_price=data.cost_price,

        margin_rate=data.margin_rate,

        down_payment=data.down_payment,

        installment_count=data.installment_count,

        payment_period=data.payment_period,

        total_override=data.total_charge,

        installment_override=data.installment_amount,

    )

    return {

        "profit": data.profit if data.profit is not None else pricing.profit,

        "total_charge": data.total_charge if data.total_charge is not None else pricing.total_charge,

        "installment_amount": data.installment_amount

        if data.installment_amount is not None

        else pricing.installment_amount,

    }





def _initial_installment_date(sale: Sale, schedule_start: date) -> date:
    return sale.sold_at or schedule_start





def _add_installments(sale: Sale) -> None:

    """Cuota 0 only when there is inicial; financed cuotas are always 1..N."""

    start = sale.delivered_at or sale.sold_at or date.today()



    if sale.down_payment > 0:

        sale.installments.append(

            Installment(

                sequence=0,

                amount=sale.down_payment,

                due_date=_initial_installment_date(sale, start),

                status=InstallmentStatus.pending,

                amount_paid=0,

            )

        )



    schedule = build_installment_schedule(

        start_date=start,

        installment_count=sale.installment_count,

        installment_amount=sale.installment_amount,

        payment_period=sale.payment_period,

        due_rule=sale.due_rule,

    )

    for row in schedule:

        sale.installments.append(

            Installment(

                sequence=row["sequence"],

                amount=row["amount"],

                due_date=row["due_date"],

                status=InstallmentStatus(row["status"]),

                amount_paid=row["amount_paid"],

            )

        )





def create_sale_with_schedule(db: Session, data: SaleCreate) -> Sale:

    amounts = _pricing_fields(data)

    is_quote = data.record_status == RecordStatus.cotizacion



    sale = Sale(

        client_id=data.client_id,

        product_id=data.product_id,

        seller_id=data.seller_id,

        purchase_account_id=data.purchase_account_id,

        product_description=data.product_description,

        sold_at=None if is_quote else (data.sold_at or date.today()),

        delivered_at=data.delivered_at,

        cost_price=data.cost_price,

        margin_rate=data.margin_rate,

        down_payment=data.down_payment,

        profit=amounts["profit"],

        total_charge=amounts["total_charge"],

        installment_count=data.installment_count,

        installment_amount=amounts["installment_amount"],

        payment_period=data.payment_period,

        due_rule=data.due_rule,

        purchase_url=data.purchase_url,

        card_installment_note=data.card_installment_note,

        record_status=data.record_status,

        amount_paid=0,

        balance_pending=amounts["total_charge"],

    )

    db.add(sale)

    db.flush()



    if not is_quote:

        if not sale.sold_at:

            sale.sold_at = date.today()

        _add_installments(sale)

    db.flush()

    return sale





def _apply_pricing_to_sale(sale: Sale) -> None:

    pricing = compute_sale_pricing(

        cost_price=sale.cost_price,

        margin_rate=sale.margin_rate,

        down_payment=sale.down_payment,

        installment_count=sale.installment_count,

        payment_period=sale.payment_period,

    )

    sale.profit = pricing.profit

    sale.total_charge = pricing.total_charge

    sale.installment_amount = pricing.installment_amount

    if sale.record_status == RecordStatus.cotizacion:

        sale.amount_paid = 0

        sale.balance_pending = pricing.total_charge

    else:

        sale.balance_pending = round(max(sale.total_charge - sale.amount_paid, 0), 2)





def update_sale_record(db: Session, sale: Sale, body: SaleUpdate) -> Sale:

    collected = total_payments_recorded(sale)



    for field, value in body.model_dump(exclude_unset=True).items():

        setattr(sale, field, value)

    _apply_pricing_to_sale(sale)



    if sale.record_status == RecordStatus.venta:

        for inst in list(sale.installments):

            db.delete(inst)

        db.flush()

        _add_installments(sale)

        apply_amount_to_schedule(sale, collected)



    db.flush()

    return sale





def confirm_quote_as_sale(db: Session, sale: Sale, body: SaleConfirmRequest) -> Sale:

    if sale.record_status != RecordStatus.cotizacion:

        raise ValueError("Only cotizacion can be converted to venta")



    if body.down_payment is not None:

        sale.down_payment = body.down_payment

    if body.purchase_account_id is not None:

        sale.purchase_account_id = body.purchase_account_id

    if body.due_rule is not None:

        sale.due_rule = body.due_rule

    _apply_pricing_to_sale(sale)

    sale.sold_at = body.sold_at or date.today()

    sale.delivered_at = body.delivered_at or sale.delivered_at

    sale.record_status = RecordStatus.venta



    collected = body.amount_paid if body.amount_paid is not None else 0



    for inst in list(sale.installments):

        db.delete(inst)

    db.flush()

    _add_installments(sale)

    if collected > 0:
        db.add(
            Payment(
                sale_id=sale.id,
                amount=collected,
                paid_at=sale.sold_at or date.today(),
            )
        )
        db.flush()

    apply_amount_to_schedule(sale, collected)

    db.flush()

    return sale


