# KYS on Google (Sheets + Apps Script)

The spreadsheet is the database. Users open the **Apps Script web app** URL.

## 1. Spreadsheet + script

1. New [Google Sheet](https://sheets.google.com) (e.g. **KYS Data**).
2. **Extensions → Apps Script**.
3. Copy every file from [`kys-app/`](kys-app/) into the project (run `npm run build` first so `Index.html` exists, or use `Index.stub.html` as a placeholder until you build).
4. Run **`kysBindSpreadsheet`** once (creates tabs + admin `admin@kyscred.com` / `admin123`).

## 2. Build UI

From the repo root:

```powershell
cd frontend
npm install
npm run build
```

Replace **Index.html** in Apps Script with `google/kys-app/Index.html` from the repo.

## 3. Deploy web app

**Deploy → New deployment → Web app**

- Execute as: **Me**
- Who has access: **Anyone** (or **Anyone with Google account**)

Use the `/exec` URL as your app link. After UI changes: `npm run build`, update **Index.html**, publish a **new version**.

## Sheets

| Tab | Purpose |
|-----|--------|
| Ventas | Sales / cotizaciones |
| Cuotas | Schedule (0 = inicial when applicable) |
| Pagos | Payment ledger |
| Clientes | Clients |
| Cuentas | Accounts |
| Usuarios | Logins |

Menu **KYS → Setup sheets** if you need to recreate tabs.

## Optional: clasp

```powershell
npm install -g @google/clasp
clasp login
cd google/kys-app
clasp push
```

For a standalone script, set script property **`KYS_SPREADSHEET_ID`** to your sheet ID.

## Security

Change the default admin password. Set script property **`KYS_PWD_SALT`** to a random string.
