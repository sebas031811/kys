from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import AdminUser, CurrentUser
from app.database import get_db
from app.models import Account
from app.schemas import AccountCreate, AccountOut

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
def list_accounts(_user: CurrentUser, db: Session = Depends(get_db)):
    return db.query(Account).order_by(Account.name).all()


@router.post("", response_model=AccountOut)
def create_account(body: AccountCreate, _admin: AdminUser, db: Session = Depends(get_db)):
    existing = db.query(Account).filter(Account.name == body.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account name exists")
    acc = Account(name=body.name, account_type=body.account_type, notes=body.notes)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc
