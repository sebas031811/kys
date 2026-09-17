from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.database import get_db
from app.models import Product
from app.schemas import ProductCreate, ProductOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(_user: CurrentUser, db: Session = Depends(get_db)):
    return db.query(Product).order_by(Product.name).limit(500).all()


@router.post("", response_model=ProductOut)
def create_product(body: ProductCreate, _user: CurrentUser, db: Session = Depends(get_db)):
    product = Product(**body.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product
