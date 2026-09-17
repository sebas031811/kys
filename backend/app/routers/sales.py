from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import CurrentUser
from app.database import get_db
from app.models import Installment, InstallmentStatus, RecordStatus, Sale, User, UserRole
from app.schemas import (
    PaymentCreate,
    PaymentOut,
    SaleConfirmRequest,
    SaleCreate,
    SaleOut,
    SaleUpdate,
    SellerDashboard,
)
from app.services.payments_service import apply_payment_to_sale
from app.services.sales_service import confirm_quote_as_sale, create_sale_with_schedule, update_sale_record

router = APIRouter(prefix="/sales", tags=["sales"])


def _sale_query(db: Session):
    return db.query(Sale).options(
        joinedload(Sale.client),
        joinedload(Sale.installments),
        joinedload(Sale.payments),
    )


@router.get("/dashboard/seller", response_model=SellerDashboard)
def seller_dashboard(
    user: CurrentUser,
    db: Session = Depends(get_db),
    seller_id: Optional[int] = Query(None),
    days_ahead: int = Query(30, ge=1, le=90),
):
    if user.role == UserRole.admin:
        target_id = seller_id
        sales_q = db.query(Sale).filter(Sale.record_status == RecordStatus.venta)
        if seller_id is not None:
            sales_q = sales_q.filter(Sale.seller_id == seller_id)
        sales = sales_q.all()
    else:
        target_id = user.id
        sales = (
            db.query(Sale)
            .filter(Sale.seller_id == user.id, Sale.record_status == RecordStatus.venta)
            .all()
        )

    seller = db.query(User).filter(User.id == target_id).first() if target_id else None
    recovered = sum(s.amount_paid for s in sales)
    pending = sum(s.balance_pending for s in sales)
    sale_ids = [s.id for s in sales]
    upcoming = []
    if sale_ids:
        until = date.today() + timedelta(days=days_ahead)
        rows = (
            db.query(Installment, Sale)
            .join(Sale)
            .options(joinedload(Sale.client))
            .filter(
                Installment.sale_id.in_(sale_ids),
                Installment.status != InstallmentStatus.paid,
                Installment.due_date.isnot(None),
                Installment.due_date <= until,
            )
            .order_by(Installment.due_date)
            .limit(50)
            .all()
        )
        for inst, sale in rows:
            upcoming.append(
                {
                    "sale_id": sale.id,
                    "client_name": sale.client.name if sale.client else "",
                    "product": sale.product_description,
                    "sequence": inst.sequence,
                    "amount": inst.amount,
                    "due_date": inst.due_date.isoformat() if inst.due_date else None,
                }
            )

    return SellerDashboard(
        seller_id=target_id,
        seller_name=seller.display_name if seller else "Todos",
        total_recovered=recovered,
        total_pending=pending,
        sale_count=len(sales),
        upcoming_installments=upcoming,
    )


@router.get("", response_model=list[SaleOut])
def list_sales(
    user: CurrentUser,
    db: Session = Depends(get_db),
    seller_id: Optional[int] = None,
    record_status: Optional[RecordStatus] = Query(None),
):
    q = _sale_query(db)
    if user.role == UserRole.seller:
        q = q.filter(Sale.seller_id == user.id)
    elif seller_id is not None:
        q = q.filter(Sale.seller_id == seller_id)
    if record_status is not None:
        q = q.filter(Sale.record_status == record_status)
    return q.order_by(Sale.id.desc()).limit(200).all()


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    sale = _sale_query(db).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if user.role == UserRole.seller and sale.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return sale


@router.post("", response_model=SaleOut)
def create_sale(body: SaleCreate, user: CurrentUser, db: Session = Depends(get_db)):
    payload = body.model_dump()
    if user.role == UserRole.seller:
        payload["seller_id"] = user.id
    sale = create_sale_with_schedule(db, SaleCreate(**payload))
    db.commit()
    db.refresh(sale)
    return _sale_query(db).filter(Sale.id == sale.id).first()


@router.patch("/{sale_id}", response_model=SaleOut)
def update_sale(
    sale_id: int,
    body: SaleUpdate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    sale = _sale_query(db).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if user.role == UserRole.seller and sale.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        update_sale_record(db, sale, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return _sale_query(db).filter(Sale.id == sale_id).first()


@router.post("/{sale_id}/confirm", response_model=SaleOut)
def confirm_sale(
    sale_id: int,
    body: SaleConfirmRequest,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    sale = _sale_query(db).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if user.role == UserRole.seller and sale.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        confirm_quote_as_sale(db, sale, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return _sale_query(db).filter(Sale.id == sale_id).first()


@router.post("/{sale_id}/payments", response_model=PaymentOut)
def record_payment(
    sale_id: int,
    body: PaymentCreate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    sale = db.query(Sale).options(joinedload(Sale.installments), joinedload(Sale.payments)).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if user.role == UserRole.seller and sale.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if sale.record_status == RecordStatus.cotizacion:
        raise HTTPException(status_code=400, detail="Convert cotizacion to venta before recording payments")
    payment = apply_payment_to_sale(
        db,
        sale,
        amount=body.amount,
        paid_at=body.paid_at,
        collection_account_id=body.collection_account_id,
        recorded_by_id=user.id,
        installment_id=body.installment_id,
        notes=body.notes,
    )
    db.commit()
    db.refresh(payment)
    return payment
