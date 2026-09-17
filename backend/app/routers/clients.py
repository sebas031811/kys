from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.database import get_db
from app.models import Client
from app.schemas import ClientCreate, ClientOut
from app.services.client_parser import parse_client_block

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(_user: CurrentUser, db: Session = Depends(get_db)):
    return db.query(Client).order_by(Client.name).limit(500).all()


@router.post("", response_model=ClientOut)
def create_client(body: ClientCreate, _user: CurrentUser, db: Session = Depends(get_db)):
    data = body.model_dump()
    if body.raw_client_text and not body.identification:
        parsed = parse_client_block(body.raw_client_text, body.phone)
        for key, val in parsed.items():
            if val and not data.get(key):
                data[key] = val
        if not data.get("name") or data["name"] == "Sin nombre":
            data["name"] = parsed["name"]
    client = Client(**data)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.post("/parse", response_model=ClientCreate)
def parse_client(body: ClientCreate, _user: CurrentUser):
    parsed = parse_client_block(body.raw_client_text or body.name, body.phone)
    return ClientCreate(
        name=parsed["name"],
        phone=parsed.get("phone"),
        identification=parsed.get("identification"),
        email=parsed.get("email"),
        address=parsed.get("address"),
        raw_client_text=parsed.get("raw_client_text"),
        notes=body.notes,
    )
