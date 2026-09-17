import argparse
import csv
import re
import sys
from datetime import date
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.models import (
    Account,
    AccountType,
    Client,
    PaymentPeriod,
    RecordStatus,
    Sale,
    User,
    UserRole,
)
from app.services.client_parser import parse_client_block
from app.services.installment_payments import apply_amount_to_schedule
from app.services.sales_service import _add_installments

HEADER_ALIASES = {
    "fecha venta": "sold_at",
    "cliente": "client",
    "telefono": "phone",
    "producto": "product",
    "inicial": "down_payment",
    "valor": "cost_price",
    "%": "margin_rate",
    "periodo de pago": "payment_period",
    "# cuotas": "installment_count",
    "cuota": "installment_amount",
    "fecha entrega": "delivered_at",
    "fecha cuota": "due_rule",
    "valor abonado": "amount_paid",
    "pendiente": "balance_pending",
    "total": "total_charge",
    "ganancia": "profit",
    "compra": "purchase_url",
    "tarjeta": "purchase_account",
    "vendedor": "seller",
    "cuota tarjeta": "card_installment_note",
    "cuotas pagadas": "paid_installments",
    "ganancia vivi": "ganancia_vivi",
    "valor abonado vivi": "abonado_vivi",
    "pendiente vivi": "pendiente_vivi",
}


def normalize_header(h: str) -> str:
    return re.sub(r"\s+", " ", (h or "").strip().lower())


def parse_co_money(value: str) -> float:
    if value is None:
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    s = re.sub(r"[^\d,.\-]", "", s)
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts[-1]) == 2:
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_co_date(value: str) -> date | None:
    if not value or not str(value).strip():
        return None
    s = str(value).strip().split()[0]
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000 if y < 70 else 1900
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def map_period(raw: str) -> PaymentPeriod:
    t = (raw or "").strip().lower()
    if "quincenal" in t:
        return PaymentPeriod.quincenal
    if "semanal" in t:
        return PaymentPeriod.semanal
    if "contado" in t:
        return PaymentPeriod.contado
    return PaymentPeriod.mensual


def get_or_create_account(db, name: str) -> Account | None:
    name = (name or "").strip()
    if not name:
        return None
    acc = db.query(Account).filter(Account.name == name).first()
    if acc:
        return acc
    acc = Account(name=name, account_type=AccountType.both)
    db.add(acc)
    db.flush()
    return acc


def get_or_create_seller(db, name: str) -> User | None:
    name = (name or "").strip()
    if not name:
        return None
    user = db.query(User).filter(User.display_name.ilike(name)).first()
    if user:
        return user
    slug = re.sub(r"[^a-z0-9]", "", name.lower()) or "seller"
    email = f"{slug}@import.kyscred.com"
    if db.query(User).filter(User.email == email).first():
        return db.query(User).filter(User.email == email).first()
    from app.auth import hash_password

    user = User(
        email=email,
        hashed_password=hash_password("changeme"),
        display_name=name,
        role=UserRole.seller,
    )
    db.add(user)
    db.flush()
    return user


def find_or_create_client(db, client_text: str, phone: str) -> Client:
    parsed = parse_client_block(client_text, phone)
    q = db.query(Client)
    if parsed.get("identification"):
        existing = q.filter(Client.identification == parsed["identification"]).first()
        if existing:
            return existing
    if parsed.get("phone"):
        existing = q.filter(Client.phone == parsed["phone"]).first()
        if existing:
            return existing
    client = Client(
        name=parsed["name"],
        phone=parsed.get("phone"),
        identification=parsed.get("identification"),
        email=parsed.get("email"),
        address=parsed.get("address"),
        raw_client_text=parsed.get("raw_client_text"),
    )
    db.add(client)
    db.flush()
    return client


def row_to_dict(headers: list[str], row: list[str]) -> dict:
    mapped = {}
    for h, val in zip(headers, row):
        key = HEADER_ALIASES.get(normalize_header(h))
        if key:
            mapped[key] = val
    return mapped


def import_row(db, data: dict, dry_run: bool) -> list[str]:
    warnings: list[str] = []
    client_text = data.get("client", "")
    if not client_text or not str(client_text).strip():
        return ["skip: empty client"]

    client = find_or_create_client(db, str(client_text), str(data.get("phone", "") or ""))
    sold_at = parse_co_date(data.get("sold_at", ""))
    delivered_at = parse_co_date(data.get("delivered_at", ""))
    cost = parse_co_money(data.get("cost_price", ""))
    margin = parse_co_money(data.get("margin_rate", ""))
    if margin > 1:
        margin = margin / 100
    down = parse_co_money(data.get("down_payment", ""))
    total = parse_co_money(data.get("total_charge", ""))
    profit = parse_co_money(data.get("profit", ""))
    inst_count = int(parse_co_money(data.get("installment_count", "1")) or 1)
    inst_amount = parse_co_money(data.get("installment_amount", ""))
    amount_paid = parse_co_money(data.get("amount_paid", ""))
    pending = parse_co_money(data.get("balance_pending", ""))
    period = map_period(data.get("payment_period", ""))
    if inst_count < 1:
        inst_count = 1
    if not total and cost:
        total = cost + (profit or round(cost * margin))
    if not inst_amount and inst_count:
        inst_amount = round((total - down) / inst_count) if inst_count else total

    purchase_acc = get_or_create_account(db, str(data.get("purchase_account", "") or ""))
    seller = get_or_create_seller(db, str(data.get("seller", "") or ""))

    partner_metadata = {}
    for k in ("ganancia_vivi", "abonado_vivi", "pendiente_vivi"):
        if data.get(k):
            partner_metadata[k] = data.get(k)

    if dry_run:
        return warnings

    sale = Sale(
        client_id=client.id,
        seller_id=seller.id if seller else None,
        purchase_account_id=purchase_acc.id if purchase_acc else None,
        product_description=str(data.get("product", "") or "Producto"),
        sold_at=sold_at,
        delivered_at=delivered_at,
        cost_price=cost,
        margin_rate=margin,
        down_payment=down,
        profit=profit,
        total_charge=total,
        installment_count=inst_count,
        installment_amount=inst_amount,
        payment_period=period,
        due_rule=str(data.get("due_rule", "") or "") or None,
        amount_paid=amount_paid,
        balance_pending=pending if pending else max(total - amount_paid, 0),
        purchase_url=str(data.get("purchase_url", "") or "") or None,
        card_installment_note=str(data.get("card_installment_note", "") or "") or None,
        partner_metadata=partner_metadata or None,
        record_status=RecordStatus.venta,
    )
    db.add(sale)
    db.flush()

    _add_installments(sale)
    apply_amount_to_schedule(sale, amount_paid)

    return warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import KYS sales ledger CSV")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    imported = 0
    skipped = 0
    all_warnings: list[str] = []

    with args.csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        headers = next(reader, None)
        if not headers:
            print("Empty CSV")
            return 1
        for i, row in enumerate(reader, start=2):
            if not any(cell.strip() for cell in row if cell):
                continue
            data = row_to_dict(headers, row)
            result = import_row(db, data, args.dry_run)
            if result and result[0].startswith("skip"):
                skipped += 1
                all_warnings.append(f"row {i}: {result[0]}")
            else:
                imported += 1
                all_warnings.extend([f"row {i}: {w}" for w in result])

    if not args.dry_run:
        db.commit()
    else:
        db.rollback()
    db.close()

    print(f"Imported: {imported}, skipped: {skipped}, dry_run={args.dry_run}")
    for w in all_warnings[:30]:
        print(w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
