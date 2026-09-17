import enum
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    seller = "seller"


class AccountType(str, enum.Enum):
    purchase = "purchase"
    collection = "collection"
    both = "both"


class PaymentPeriod(str, enum.Enum):
    mensual = "Mensual"
    quincenal = "Quincenal"
    semanal = "Semanal"
    contado = "Contado"


class InstallmentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    partial = "partial"


class RecordStatus(str, enum.Enum):
    cotizacion = "cotizacion"
    venta = "venta"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.seller)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sales: Mapped[list["Sale"]] = relationship(back_populates="seller")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    account_type: Mapped[AccountType] = mapped_column(Enum(AccountType), default=AccountType.both)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    sales_purchase: Mapped[list["Sale"]] = relationship(
        back_populates="purchase_account", foreign_keys="Sale.purchase_account_id"
    )


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    identification: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_client_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sales: Mapped[list["Sale"]] = relationship(back_populates="client")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    default_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    purchase_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    sales: Mapped[list["Sale"]] = relationship(back_populates="product")


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"), nullable=True)
    seller_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    purchase_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id"), nullable=True)

    product_description: Mapped[str] = mapped_column(String(500))
    sold_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivered_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    cost_price: Mapped[float] = mapped_column(Float, default=0)
    margin_rate: Mapped[float] = mapped_column(Float, default=0)
    down_payment: Mapped[float] = mapped_column(Float, default=0)
    profit: Mapped[float] = mapped_column(Float, default=0)
    total_charge: Mapped[float] = mapped_column(Float, default=0)
    installment_count: Mapped[int] = mapped_column(Integer, default=1)
    installment_amount: Mapped[float] = mapped_column(Float, default=0)
    payment_period: Mapped[PaymentPeriod] = mapped_column(Enum(PaymentPeriod), default=PaymentPeriod.mensual)
    due_rule: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    amount_paid: Mapped[float] = mapped_column(Float, default=0)
    balance_pending: Mapped[float] = mapped_column(Float, default=0)

    purchase_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    card_installment_note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    partner_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    record_status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus), default=RecordStatus.venta, index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client"] = relationship(back_populates="sales")
    product: Mapped[Optional["Product"]] = relationship(back_populates="sales")
    seller: Mapped[Optional["User"]] = relationship(back_populates="sales")
    purchase_account: Mapped[Optional["Account"]] = relationship(
        back_populates="sales_purchase", foreign_keys=[purchase_account_id]
    )
    installments: Mapped[list["Installment"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="Installment.sequence"
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="sale", cascade="all, delete-orphan")


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[InstallmentStatus] = mapped_column(
        Enum(InstallmentStatus), default=InstallmentStatus.pending
    )
    amount_paid: Mapped[float] = mapped_column(Float, default=0)

    sale: Mapped["Sale"] = relationship(back_populates="installments")
    payments: Mapped[list["Payment"]] = relationship(back_populates="installment")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    installment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("installments.id"), nullable=True)
    collection_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    recorded_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Float)
    paid_at: Mapped[date] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sale: Mapped["Sale"] = relationship(back_populates="payments")
    installment: Mapped[Optional["Installment"]] = relationship(back_populates="payments")
