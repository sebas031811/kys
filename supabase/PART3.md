# Parte 3 — Supabase + [kys-blb.pages.dev](https://kys-blb.pages.dev)

## 1. Proyecto Supabase

1. [supabase.com](https://supabase.com) → tu proyecto.
2. **SQL Editor** → pega y ejecuta [`schema.sql`](schema.sql).
3. **Project Settings → API**: copia **URL** y **anon key**.

## 2. Edge Function `kys-api`

### Si ves: `Access token not provided`

La CLI **no está logueada**. Elige **una** opción:

**A — Terminal de Cursor (recomendado)**  
Abre **Terminal → New Terminal** (Git Bash o PowerShell). **Primero login**, luego link/deploy (si saltas el login verás `Access token not provided`):

```powershell
npm run supabase:login
```

Cuando el login termine bien, en la **misma** terminal:

```bash
npm run supabase:link -- --project-ref jccpiuvsmgobhljavxov
npm run supabase:deploy
```

**B — Token manual (Git Bash / sin navegador en la CLI)**

1. [Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token**.
2. En la **misma sesión** de PowerShell donde harás `link` / `deploy`:

Git Bash:

```bash
cd /e/projects/personal/kys
export SUPABASE_ACCESS_TOKEN=sbp_pega_aqui_el_token
npm run supabase:link -- --project-ref jccpiuvsmgobhljavxov
npm run supabase:deploy
```

PowerShell: `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."`  
O guarda el login en la CLI: `npm run supabase:login -- --token sbp_...`

El token **`sbp_…`** es distinto de la **publishable key** (`sb_publishable_…`) del frontend.

---

CLI incluida en el repo (`npm install` en la raíz).

```powershell
cd E:\projects\personal\kys
npm install
npm run supabase:login
npm run supabase:link -- --project-ref jccpiuvsmgobhljavxov
npm run supabase:deploy
```

En Windows, `--use-api` evita depender de Docker local (ya va en `npm run supabase:deploy`).

`--no-verify-jwt` porque la app envía el token de sesión KYS (igual que Apps Script).

## 3. Cloudflare Pages — variables

Vite **no** lee `NEXT_PUBLIC_*`; usa estos nombres en **Settings → Environment variables**:

| Variable | Valor (tu proyecto) |
|----------|---------------------|
| `VITE_SUPABASE_URL` | `https://jccpiuvsmgobhljavxov.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clave `sb_publishable_…` del dashboard |
| `VITE_SUPABASE_FUNCTION` | `kys-api` (opcional) |

También sirve `VITE_SUPABASE_ANON_KEY` (JWT anon) en lugar de publishable.

**Project ref** (para `supabase link`): `jccpiuvsmgobhljavxov`

Redeploy Pages tras guardar.

## 4. CORS

En el primer deploy, si falla CORS desde Pages, en Supabase **Edge Functions → kys-api →** permite origen `https://kys-blb.pages.dev` (la función ya envía `Access-Control-Allow-Origin: *`).

## URL de la función

La app llama (vía `api.js`) a:

`https://jccpiuvsmgobhljavxov.supabase.co/functions/v1/kys-api`

Cuerpo POST: `{ "method", "path", "body", "token" }` · Header: `Authorization: Bearer <publishable key>`.

Prueba rápida (login OK si `schema.sql` y deploy hechos):

```bash
curl -X POST "https://jccpiuvsmgobhljavxov.supabase.co/functions/v1/kys-api" \
  -H "Authorization: Bearer sb_publishable_..." \
  -H "Content-Type: application/json" \
  -d '{"method":"POST","path":"/api/auth/login","body":{"email":"admin@kyscred.com","password":"admin123"},"token":""}'
```

## 5. Probar

1. Abre [https://kys-blb.pages.dev/#/login](https://kys-blb.pages.dev/#/login)
2. `admin@kyscred.com` / `admin123`
3. Panel, ventas, clientes deben responder sin Google Apps Script.

## 6. Migrar datos del Sheet

Manual o script posterior; la estructura coincide con las columnas en español del Sheet.

## No uses el asistente Vue / `todos` del dashboard

Supabase suele sugerir `App.vue`, `utils/supabase.ts` y `.from('todos')`. **KYS no es Vue** y **no lee tablas desde el navegador**: usa auth propia (`usuarios` / `sesiones`) y la Edge Function **`kys-api`** vía [`frontend/src/api.js`](../frontend/src/api.js).

Lo que sí aplica de ese asistente:

| Asistente | KYS |
|-----------|-----|
| `npm install @supabase/supabase-js` | Hecho en `frontend/` (opcional; la app funciona con `fetch`) |
| `.env.local` con `VITE_SUPABASE_URL` + publishable key | [`frontend/.env.local`](../frontend/.env.local) (gitignored) |
| `App.vue` + `select()` a Postgres | **No** — ignóralo |

Agent Skills (`npx skills add supabase/agent-skills`) es opcional; no cambia el flujo anterior.
