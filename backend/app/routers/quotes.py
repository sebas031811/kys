from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session, joinedload

from app.auth import CurrentUser
from app.database import get_db
from app.models import Sale
from app.schemas import QuotePrintData

router = APIRouter(prefix="/quotes", tags=["quotes"])

BUSINESS = {
    "name": "KYS",
    "whatsapp": "+573002683732",
    "email": "kyscred@gmail.com",
    "address": "Itagui, Antioquia",
}


def format_cop(amount: float) -> str:
    return f"$ {int(round(amount or 0)):,}".replace(",", ".")


@router.get("/{sale_id}/print", response_class=HTMLResponse)
def print_quote(sale_id: int, _user: CurrentUser, db: Session = Depends(get_db)):
    sale = (
        db.query(Sale)
        .options(joinedload(Sale.client))
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    client = sale.client
    client_name = client.name if client else ""
    client_phone = client.phone if client and client.phone else "—"
    sold = sale.sold_at.isoformat() if sale.sold_at else "—"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cotización KYS #{sale.id}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 1rem; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 1rem; }}
    th, td {{ border: 1px solid #ccc; padding: 0.5rem; text-align: left; }}
    th {{ background: #f4f4f4; }}
    .muted {{ color: #555; font-size: 0.9rem; }}
  </style>
</head>
<body>
  <h1>{BUSINESS["name"]} — {"Cotización" if sale.record_status.value == "cotizacion" else "Venta"}</h1>
  <p class="muted">{BUSINESS["address"]} · {BUSINESS["whatsapp"]} · {BUSINESS["email"]}</p>
  <p><strong>Cliente:</strong> {client_name}<br/>
  <strong>Teléfono:</strong> {client_phone}</p>
  <p><strong>Producto:</strong> {sale.product_description}</p>
  <table>
    <tr><th>Concepto</th><th>Valor</th></tr>
    <tr><td>Costo base</td><td>{format_cop(sale.cost_price)}</td></tr>
    <tr><td>Cuota inicial</td><td>{format_cop(sale.down_payment)}</td></tr>
    <tr><td>Total</td><td>{format_cop(sale.total_charge)}</td></tr>
    <tr><td># Cuotas</td><td>{sale.installment_count}</td></tr>
    <tr><td>Valor cuota</td><td>{format_cop(sale.installment_amount)}</td></tr>
    <tr><td>Periodo</td><td>{sale.payment_period.value}</td></tr>
    <tr><td>Fecha cuota</td><td>{sale.due_rule or "—"}</td></tr>
    <tr><td>Pendiente</td><td>{format_cop(sale.balance_pending)}</td></tr>
  </table>
  <p class="muted">Fecha: {sold}</p>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/{sale_id}/data", response_model=QuotePrintData)
def quote_data(sale_id: int, _user: CurrentUser, db: Session = Depends(get_db)):
    sale = db.query(Sale).options(joinedload(Sale.client)).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    c = sale.client
    return QuotePrintData(
        sale_id=sale.id,
        client_name=c.name if c else "",
        client_phone=c.phone if c else None,
        product=sale.product_description,
        cost_price=sale.cost_price,
        total_charge=sale.total_charge,
        down_payment=sale.down_payment,
        installment_count=sale.installment_count,
        installment_amount=sale.installment_amount,
        payment_period=sale.payment_period.value,
        due_rule=sale.due_rule,
        balance_pending=sale.balance_pending,
        sold_at=sale.sold_at,
    )
