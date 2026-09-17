# KYS API

FastAPI backend for sales, cuotas, accounts, and sellers.

## Local setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `.env` (optional):

```env
DATABASE_URL=sqlite:///./kys.db
JWT_SECRET=your-long-random-secret
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
COOKIE_SECURE=false
```

Run:

```powershell
uvicorn app.main:app --reload --port 8000
```

Default admin (first start only): `admin@kyscred.com` / `admin123` — change in production.

## Import sales CSV

From `backend` folder:

```powershell
$env:PYTHONPATH = "."
python -m app.scripts.import_sales_ledger ..\ventas.csv --dry-run
python -m app.scripts.import_sales_ledger ..\ventas.csv
```

## Deploy on Render

- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Env:** `JWT_SECRET`, `CORS_ORIGINS` (your GitHub Pages URL), `DATABASE_URL` (Postgres URL recommended), `COOKIE_SECURE=true`
