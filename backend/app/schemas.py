from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import AccountType, InstallmentStatus, PaymentPeriod, RecordStatus, UserRole


class TokenResponse(BaseModel):
    message: str = "ok"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    display_name: str
    role: UserRole = UserRole.seller


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccountCreate(BaseModel):
    name: str
    account_type: AccountType = AccountType.both
    notes: Optional[str] = None


class AccountOut(BaseModel):
    id: int
    name: str
    account_type: AccountType
    notes: Optional[str]

    model_config = {"from_attributes": True}


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    identification: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    raw_client_text: Optional[str] = None
    notes: Optional[str] = None


class ClientOut(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    identification: Optional[str]
    email: Optional[str]
    address: Optional[str]
    raw_client_text: Optional[str]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str
    category: Optional[str] = None
    default_cost: Optional[float] = None
    purchase_url: Optional[str] = None


class ProductOut(BaseModel):
    id: int
    name: str
    category: Optional[str]
    default_cost: Optional[float]
    purchase_url: Optional[str]

    model_config = {"from_attributes": True}


class PricingPreviewRequest(BaseModel):
    cost_price: float
    margin_rate: float
    down_payment: float = 0
    installment_count: int = 1
    payment_period: PaymentPeriod = PaymentPeriod.mensual


class PricingPreviewResponse(BaseModel):
    profit: float
    total_charge: float
    installment_amount: float
    financed_amount: float


class SaleCreate(BaseModel):
    client_id: int
    product_id: Optional[int] = None
    product_description: str
    seller_id: Optional[int] = None
    purchase_account_id: Optional[int] = None
    sold_at: Optional[date] = None
    delivered_at: Optional[date] = None
    cost_price: float
    margin_rate: float
    down_payment: float = 0
    installment_count: int = 1
    payment_period: PaymentPeriod = PaymentPeriod.mensual
    due_rule: Optional[str] = None
    purchase_url: Optional[str] = None
    card_installment_note: Optional[str] = None
    profit: Optional[float] = None
    total_charge: Optional[float] = None
    installment_amount: Optional[float] = None
    record_status: RecordStatus = RecordStatus.venta


class SaleUpdate(BaseModel):
    product_description: Optional[str] = None
    cost_price: Optional[float] = None
    margin_rate: Optional[float] = None
    down_payment: Optional[float] = None
    installment_count: Optional[int] = None
    payment_period: Optional[PaymentPeriod] = None
    due_rule: Optional[str] = None
    sold_at: Optional[date] = None
    delivered_at: Optional[date] = None
    purchase_account_id: Optional[int] = None
    purchase_url: Optional[str] = None
    card_installment_note: Optional[str] = None


class SaleConfirmRequest(BaseModel):
    sold_at: Optional[date] = None
    delivered_at: Optional[date] = None
    down_payment: Optional[float] = None
    amount_paid: Optional[float] = None
    purchase_account_id: Optional[int] = None
    due_rule: Optional[str] = None


class InstallmentOut(BaseModel):
    id: int
    sequence: int
    amount: float
    due_date: Optional[date]
    status: InstallmentStatus
    amount_paid: float

    model_config = {"from_attributes": True}


class PaymentCreate(BaseModel):
    amount: float
    paid_at: date
    collection_account_id: Optional[int] = None
    installment_id: Optional[int] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    id: int
    amount: float
    paid_at: date
    collection_account_id: Optional[int]
    installment_id: Optional[int]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class SaleOut(BaseModel):
    id: int
    client_id: int
    product_id: Optional[int]
    seller_id: Optional[int]
    purchase_account_id: Optional[int]
    product_description: str
    sold_at: Optional[date]
    delivered_at: Optional[date]
    cost_price: float
    margin_rate: float
    down_payment: float
    profit: float
    total_charge: float
    installment_count: int
    installment_amount: float
    payment_period: PaymentPeriod
    due_rule: Optional[str]
    amount_paid: float
    balance_pending: float
    purchase_url: Optional[str]
    card_installment_note: Optional[str]
    partner_metadata: Optional[dict[str, Any]]
    record_status: RecordStatus
    installments: list[InstallmentOut] = []
    client: Optional[ClientOut] = None

    model_config = {"from_attributes": True}


class SellerDashboard(BaseModel):
    seller_id: Optional[int]
    seller_name: str
    total_recovered: float
    total_pending: float
    sale_count: int
    upcoming_installments: list[dict[str, Any]]


class QuotePrintData(BaseModel):
    sale_id: int
    business_name: str = "KYS"
    business_whatsapp: str = "+573002683732"
    business_email: str = "kyscred@gmail.com"
    business_address: str = "Itagui, Antioquia"
    client_name: str
    client_phone: Optional[str]
    product: str
    cost_price: float
    total_charge: float
    down_payment: float
    installment_count: int
    installment_amount: float
    payment_period: str
    due_rule: Optional[str]
    balance_pending: float
    sold_at: Optional[date]
