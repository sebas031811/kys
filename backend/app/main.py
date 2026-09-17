from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import hash_password
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.database_migrate import ensure_record_status_column
from app.models import User, UserRole
from app.routers import accounts, auth, clients, pricing, products, quotes, sales


def seed_admin():
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                email="admin@kyscred.com",
                hashed_password=hash_password("admin123"),
                display_name="Admin",
                role=UserRole.admin,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_record_status_column()
    seed_admin()
    yield


app = FastAPI(title="KYS API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(pricing.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")


@app.get("/")
@app.get("/api")
def api_root():
    return {
        "name": "KYS API",
        "health": "/api/health",
        "docs": "/docs",
        "ui": "Use the frontend at http://localhost:5173 (not this URL in the browser).",
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}
