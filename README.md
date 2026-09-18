# KYS — ventas y cuotas

Web app for KYS: clients, sales (cost + margin %), installment schedules, accounts, and seller dashboard.

**Stack:** Google Sheets (data) + Apps Script (API) + Vite SPA (UI in the web app).

Deploy and setup: **[google/README.md](google/README.md)**

## Build UI for Apps Script

```powershell
cd frontend
npm install
npm run build
```

Copy `google/kys-app/Index.html` into your Apps Script project after each build.

## Business rules

| Estado | Meaning |
|--------|---------|
| **Cotización** | **Solo cotización** on the form; convert on detail. |
| **Venta** | Full schedule; **Registrar pago** applies to cuotas 0 → 1 → 2… |

**Pricing:** `Ganancia = (costo − inicial) × %` · `Total = costo + ganancia` · `Cuota = (total − inicial) ÷ # cuotas`.

## Layout

```
frontend/       UI source (build → embed into Apps Script)
google/kys-app/ Apps Script project files (.gs + Index.html)
scripts/        embed-gas.mjs (called by npm run build)
```
