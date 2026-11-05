# KYS — ventas y cuotas

Full **Google** app: **Spreadsheet = database**, **Apps Script = API**, **web app = forms** (ventas, cuotas, clientes, pagos).

**Setup guide:** [google/SETUP.md](google/SETUP.md)

## Update Google (automatic)

One-time: [google/SETUP.md](google/SETUP.md) → clasp login + `.clasp.json`.

```powershell
npm install
npm run gas:push
```

Builds the UI and uploads all Apps Script files. Optional: `npm run gas:deploy` with `KYS_CLASP_DEPLOYMENT_ID` set to refresh the web app version.

## Pricing

`Ganancia = (costo − inicial) × %` · `Total = costo + ganancia` · `Cuota = (total − inicial) ÷ # cuotas`

## Repo layout

```
frontend/       Form UI (Vite → embedded in Index.html)
google/kys-app/ Apps Script + sheet logic (.gs files)
google/SETUP.md Step-by-step Google deploy
scripts/        embed-gas.mjs
```
