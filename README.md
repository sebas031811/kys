# KYS — ventas y cuotas

Web app for KYS: clients, sales (cost + margin %), installment schedules, purchase/collection accounts, and seller dashboard.

- **Frontend:** Vite static SPA → [GitHub Pages](https://pages.github.com/)
- **Backend:** Python FastAPI → Render / Railway
- **Legacy cotizador:** [`Cotizador/codigo.gs`](Cotizador/codigo.gs) (Google Sheets + Slides)

## Quick start (development)

1. API — see [backend/README.md](backend/README.md)
2. UI:

```powershell
cd frontend
# If install fails on Windows, delete node_modules and retry:
# Remove-Item -Recurse -Force node_modules; npm install
npm install
npm run dev
```

Open http://localhost:5173 — the dev server proxies `/api` to port 8000.

## Cotización vs venta

| Estado | Meaning |
|--------|---------|
| **Cotización** | Check **Solo cotización** on the form (or on an existing record, **Registrar como venta**). |
| **Venta** | Leave the box unchecked when saving. **Detalle** → edit fields → **Guardar cambios** (recalculates cuotas; paid cuotas stay marked). |

The dashboard counts **ventas** only (not open cotizaciones).

**Pricing:** `Ganancia = (costo − inicial) × %` · `Total = costo + ganancia` · `Cuota = (total − inicial) ÷ # cuotas`.

## Production (GitHub Pages + API)

**Live UI (after deploy):** `https://sebas031811.github.io/kys/`

### 1. Deploy the API (Render / Railway)

Use [backend/README.md](backend/README.md). Required env vars:

| Variable | Example |
|----------|---------|
| `JWT_SECRET` | long random string |
| `DATABASE_URL` | Postgres URL (recommended) |
| `CORS_ORIGINS` | `https://sebas031811.github.io` |
| `COOKIE_SECURE` | `true` |

Note the public API URL, e.g. `https://kys-api.onrender.com` (no trailing slash).

### 2. GitHub Pages (this repo)

1. Push `master` to GitHub (`frontend/` and `.github/workflows/deploy-frontend.yml` must be on the remote).
2. Repo **Settings → Pages → Build and deployment → Source:** **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables:**
   - `VITE_API_URL` = your API URL (e.g. `https://kys-api.onrender.com`)
   - Optional: `VITE_BASE` = `/kys/` (default is `/<repo-name>/` from the workflow).
4. **Actions → Deploy frontend to GitHub Pages → Run workflow** (or push any change under `frontend/`).

The workflow builds with `VITE_BASE` so assets load under `/kys/`. Login calls the API on another domain; cookies use `SameSite=None` when `COOKIE_SECURE=true`.

### 3. Local production preview

```powershell
cd frontend
$env:VITE_BASE="/kys/"
$env:VITE_API_URL="https://your-api.onrender.com"
npm run build
npm run preview
```

## Project layout

```
backend/     FastAPI + SQLite/Postgres
frontend/    Vite SPA
Cotizador/   Apps Script (optional quotes in Slides)
```
