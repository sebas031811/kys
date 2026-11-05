# KYS — Full Google app (Sheet = DB + web forms)

You get **one Google Spreadsheet** (database) and **one web page** (forms: ventas, clientes, pagos, login). No servers.

```
┌─────────────────────┐     google.script.run      ┌──────────────────┐
│  Web app (forms)    │ ─────────────────────────► │  Apps Script     │
│  Index.html         │                            │  apiDispatch     │
└─────────────────────┘                            └────────┬─────────┘
                                                            │
                                                            ▼
                                                   ┌──────────────────┐
                                                   │  Google Sheet    │
                                                   │  Ventas, Cuotas… │
                                                   └──────────────────┘
```

## Step 1 — Create the spreadsheet app

1. Go to [Google Sheets](https://sheets.google.com) → **Blank spreadsheet**. Name it e.g. **KYS**.
2. **Extensions → Apps Script**.
3. Remove default `Code.gs` content.
4. Create one Apps Script file per file in [`kys-app/`](kys-app/) (same names: `Api.gs`, `Db.gs`, `Index.html`, …).

## Step 2 — Build the forms page (UI)

On your computer, in the repo:

```powershell
cd frontend
npm install
npm run build
```

This writes **`google/kys-app/Index.html`** (full UI). Copy that file into the Apps Script project (replace any placeholder).

## Step 3 — Initialize the database tabs

1. In the **spreadsheet**, refresh the page.
2. Menu **KYS → Inicializar (primera vez)**.
3. Authorize the script when asked.

You should see tabs: **Usuarios**, **Clientes**, **Cuentas**, **Ventas**, **Cuotas**, **Pagos**.  
Default login: **admin@kyscred.com** / **admin123** (change later in **Usuarios**).

## Step 4 — Publish the web app (forms URL)

**Use exactly one URL**, ending in `/exec` (no extra text glued to it):

```text
https://script.google.com/macros/s/AKfycb…/exec
```

Wrong: `…/exechttps://script.google.com/…` (two URLs pasted together).

1. Apps Script → **Deploy → New deployment**.
2. Type: **Web app**.
3. **Execute as:** Me · **Who has access:** Anyone (or Anyone with Google account).
4. **Deploy** → copy the URL ending in **`/exec`**.

## Step 5 — Link sheet menu to the forms

1. Back in the spreadsheet: **KYS → Guardar URL de la app** → paste the `/exec` URL.
2. **KYS → Abrir app (formularios)** — this is the page your team uses daily.

Bookmark that URL on phones and PCs.

## What the forms do

| Screen | Writes to sheet |
|--------|------------------|
| Login | Usuarios (session) |
| Clientes | Clientes |
| Cuentas | Cuentas |
| Nueva venta / cotización | Ventas (+ Cuotas if venta) |
| Detalle → Registrar pago | Pagos + updates Cuotas |
| Dashboard | reads Ventas / Cuotas |

You can still **view and filter data in the sheet**; the app is the main data entry UI.

## After UI / code changes (automatic upload)

Use **[clasp](https://github.com/google/clasp)** once, then push from the repo:

### One-time clasp setup

1. **Enable Apps Script API** (required for `clasp push`):
   - Open [script.google.com/home/usersettings](https://script.google.com/home/usersettings)
   - Turn **Google Apps Script API** **ON**
   - Wait 1–2 minutes if you just enabled it

2. Install and log in:

```powershell
cd c:\Users\DELL\Documents\kys
npm install
npm run gas:login
```

**Link to an existing Apps Script project** (the one on your sheet):

1. Apps Script → **Project settings** → copy **Script ID**.
2. Create `google/kys-app/.clasp.json`:

```json
{
  "scriptId": "PASTE_SCRIPT_ID_HERE",
  "rootDir": "."
}
```

Or create a new bound project:

```powershell
npx clasp create --type sheets --title "KYS" --rootDir .
```

3. In the sheet: **KYS → Inicializar (primera vez)**.

### Every update (manual copy → automatic)

```powershell
cd c:\Users\DELL\Documents\kys
npm run gas:push
```

This runs `npm run build`, embeds **Index.html**, and **`clasp push`** uploads all `.gs` + **Index.html** to Google.

### Optional: publish new web app version in one step

After the first **Deploy → Web app** in the browser, copy the **Deployment ID** from **Manage deployments**.

```powershell
$env:KYS_CLASP_DEPLOYMENT_ID = "YOUR_DEPLOYMENT_ID"
npm run gas:deploy
```

That runs **push + redeploy** so the `/exec` URL serves the latest code (same URL, new version).

Without `gas:deploy`, you still need **Manage deployments → Edit → New version** after `gas:push`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **`User has not enabled the Apps Script API`** | See [clasp API enable](#enable-apps-script-api-for-clasp) below. |
| “Open from web app URL” on localhost | Use the **Deploy /exec** URL, not `npm run dev`. |
| Empty app / placeholder text | Run `npm run build` and paste **Index.html**. |
| Login fails | Run **Inicializar**; check **Usuarios** tab. |
| Permission errors | Redeploy web app; re-authorize script. |
| **No se puede abrir el archivo en estos momentos** | [Web app won’t open](#web-app-no-se-puede-abrir) |

### Web app: “No se puede abrir el archivo…”

1. **URL** — Open only the **Deploy → Web app** link ending in **`/exec`**, one line, in Chrome as **sebas03181@gmail.com**.
2. **Index.html** — In Apps Script, confirm **Index.html** exists and is the **built** file (thousands of characters / includes `<div id="app">` and a big `<script>`). If you only see “Run npm run build”, run `npm run build` locally and paste/upload **Index.html** again.
3. **New deployment** — **Deploy → New deployment → Web app**  
   - Execute as: **Me**  
   - Who has access: **Anyone** (or **Anyone with Google account**)  
   Copy the **new** `/exec` URL (each new deployment can change the ID).
4. **Authorize once** — Apps Script → select **`doGet`** → **Run** → accept permissions → try the `/exec` link again.
5. **Test as owner** — Open **`…/dev`** (from **Test deployments**) while logged in; if `/dev` works but `/exec` does not, fix step 3 (access = Anyone).
6. **Blank page when clicking menu** — Use the **`/exec`** or **`/dev`** URL, not the editor “Preview” panel. Rebuild UI (`npm run build`) and re-upload **Index.html** after pull (fix: no `<base target="_top">` on hash links).

### Enable Apps Script API (for clasp)

clasp uses **sebas03181@gmail.com** (same account as `npm run gas:login`).

1. In Chrome, open **[script.google.com/home/usersettings](https://script.google.com/home/usersettings)** while signed in as **that** account (not a work account, not another `@gmail`).
2. Turn **Google Apps Script API** **ON** (not only “Google Cloud” API in console — this user toggle is required).
3. Wait **5–10 minutes**.
4. Re-auth clasp with the right scope:

```powershell
npm run gas:logout
npm run gas:login
```

In the browser consent screen, enable **“Create and update Google Apps Script projects”** (and Drive if offered).

5. `npm run gas:push`

If it still fails, use **manual upload** (no clasp): copy all `.gs` files + `Index.html` from `google/kys-app/` into the Apps Script editor (see Step 1 in this doc).
