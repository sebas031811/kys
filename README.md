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

## Pricing (como Ventas-a-Credito.xlsx — Base de datos)

`Ganancia = (valor − inicial) × %` · `Total = valor + ganancia` · `Cuota = (total − inicial) ÷ # cuotas`

Las columnas del Sheet y la app usan nombres en español (`valor`, `inicial`, `porcentaje`, `fecha_venta`, …). Si tu hoja tiene encabezados en inglés de una versión anterior, en el Sheet: **KYS → Migrar encabezados (inglés → español)** después de `gas:push`.

## Cloudflare Pages (solo UI)

Build en CI (no usa `embed-gas`; eso es solo para Google):

```bash
npm ci --prefix frontend && npm run build:pages --prefix frontend
```

**Directorio de salida:** `frontend/dist` · **Build command** en el dashboard: el comando de arriba (no hace falta `npm ci` en la raíz). La app en Pages aún necesita Supabase (o GAS) para datos; ver `wrangler.toml`.

## Repo layout

```
frontend/       Form UI (Vite → embedded in Index.html)
google/kys-app/ Apps Script + sheet logic (.gs files)
google/SETUP.md Step-by-step Google deploy
scripts/        embed-gas.mjs
```
