import { adminClient, authLogin, authMe, destroySession, patchUserTheme, requireUser, userOut } from "./lib/auth.ts";
import { listClients, createClient, parseClientRequest } from "./lib/clients.ts";
import { listAccounts, createAccount, updateAccount, listAccountsSummary, recordAccountTransfer } from "./lib/accounts.ts";
import { computeSalePricing } from "./lib/pricing.ts";
import {
  listSales,
  getSale,
  createSale,
  patchSale,
  sellerDashboard,
  recordPayment,
  patchPayment,
  deletePayment,
  deleteSale,
  confirmSale,
} from "./lib/sales.ts";
import { vendedorComisionResumen, recordPagoComisionVendedor } from "./lib/commissions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseQuery(path: string) {
  const q: Record<string, string> = {};
  const i = path.indexOf("?");
  if (i === -1) return q;
  path.substring(i + 1).split("&").forEach((pair) => {
    const p = pair.split("=");
    q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
  });
  return q;
}

async function routeApi(method: string, path: string, body: Record<string, unknown> | null, token: string) {
  const db = adminClient();

  if (method === "POST" && path === "/api/auth/login") {
    return authLogin(db, String(body?.email ?? ""), String(body?.password ?? ""));
  }
  if (method === "POST" && path === "/api/auth/logout") {
    return destroySession(db, token);
  }
  if (method === "GET" && path === "/api/auth/me") {
    return authMe(db, token);
  }
  if (method === "PATCH" && path === "/api/auth/me") {
    const me = await requireUser(db, token);
    return patchUserTheme(db, me.id, body?.tema);
  }
  if (method === "GET" && path === "/api/auth/users") {
    const me = await requireUser(db, token);
    if (me.rol !== "admin") throw new Error("Solo administrador");
    const { data } = await db.from("usuarios").select("*");
    return (data ?? []).map((row) => userOut(row));
  }

  const comisionMatch = path.match(/^\/api\/vendedores\/(\d+)\/comision$/);
  if (comisionMatch && method === "GET") {
    const me = await requireUser(db, token);
    const vendedorId = Number(comisionMatch[1]);
    if (me.rol !== "admin" && me.id !== vendedorId) throw new Error("Acceso denegado");
    return vendedorComisionResumen(db, vendedorId);
  }

  const pagoComisionMatch = path.match(/^\/api\/vendedores\/(\d+)\/pagos-comision$/);
  if (pagoComisionMatch && method === "POST") {
    const me = await requireUser(db, token);
    return recordPagoComisionVendedor(db, me, Number(pagoComisionMatch[1]), body ?? {});
  }

  if (method === "GET" && path === "/api/clients") {
    await requireUser(db, token);
    return listClients(db);
  }
  if (method === "POST" && path === "/api/clients") {
    await requireUser(db, token);
    return createClient(db, body ?? {});
  }
  if (method === "POST" && path === "/api/clients/parse") {
    await requireUser(db, token);
    return parseClientRequest(body ?? {});
  }

  if (method === "GET" && path === "/api/accounts/summary") {
    await requireUser(db, token);
    return listAccountsSummary(db);
  }
  if (method === "GET" && path === "/api/accounts") {
    await requireUser(db, token);
    return listAccounts(db);
  }
  if (method === "POST" && path === "/api/accounts") {
    const me = await requireUser(db, token);
    return createAccount(db, me, body ?? {});
  }
  if (method === "POST" && path === "/api/accounts/transfers") {
    const me = await requireUser(db, token);
    return recordAccountTransfer(db, me, body ?? {});
  }

  const accountMatch = path.match(/^\/api\/accounts\/(\d+)$/);
  if (accountMatch && method === "PATCH") {
    const me = await requireUser(db, token);
    return updateAccount(db, me, Number(accountMatch[1]), body ?? {});
  }

  if (method === "POST" && path === "/api/pricing/preview") {
    await requireUser(db, token);
    return computeSalePricing(body ?? {});
  }

  if (method === "GET" && (path === "/api/sales/dashboard/seller" || path.startsWith("/api/sales/dashboard/seller?"))) {
    const me = await requireUser(db, token);
    const q = parseQuery(path);
    const vendedorId = q.vendedor_id ? Number(q.vendedor_id) : null;
    return sellerDashboard(db, me, vendedorId);
  }

  if (method === "GET" && (path === "/api/sales" || path.startsWith("/api/sales?"))) {
    const me = await requireUser(db, token);
    const q = parseQuery(path);
    const estado = q.estado_registro || q.record_status || null;
    return listSales(db, me, estado);
  }
  if (method === "POST" && path === "/api/sales") {
    const me = await requireUser(db, token);
    return createSale(db, me, body ?? {});
  }

  const salePaymentMatch = path.match(/^\/api\/sales\/(\d+)\/payments\/(\d+)$/);
  if (salePaymentMatch) {
    const saleId = Number(salePaymentMatch[1]);
    const paymentId = Number(salePaymentMatch[2]);
    const me = await requireUser(db, token);
    if (method === "PATCH") return patchPayment(db, me, saleId, paymentId, body ?? {});
    if (method === "DELETE") return deletePayment(db, me, saleId, paymentId);
  }

  const saleMatch = path.match(/^\/api\/sales\/(\d+)(\/confirm|\/payments)?$/);
  if (saleMatch) {
    const saleId = Number(saleMatch[1]);
    const sub = saleMatch[2];
    const me = await requireUser(db, token);
    if (method === "GET" && !sub) return getSale(db, me, saleId);
    if (method === "DELETE" && !sub) return deleteSale(db, me, saleId);
    if (method === "PATCH" && !sub) return patchSale(db, me, saleId, body ?? {});
    if (method === "POST" && sub === "/confirm") return confirmSale(db, me, saleId, body ?? {});
    if (method === "POST" && sub === "/payments") return recordPayment(db, me, saleId, body ?? {});
  }

  const quoteMatch = path.match(/^\/api\/quotes\/(\d+)\/print$/);
  if (method === "GET" && quoteMatch) {
    const me = await requireUser(db, token);
    const sale = await getSale(db, me, Number(quoteMatch[1]));
    const html = `<!DOCTYPE html><html lang="es"><body><h1>Cotización ${sale.id}</h1><p>${sale.producto}</p><p>Total ${sale.total}</p></body></html>`;
    return { html };
  }

  throw new Error(`Ruta desconocida: ${method} ${path}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST", status: 405 }, 405);
  }

  try {
    const payload = await req.json();
    const method = String(payload.method || "GET").toUpperCase();
    const path = String(payload.path || "/");
    const body = payload.body ?? null;
    const token = String(payload.token || "");

    const data = await routeApi(method, path, body, token);
    return json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let status = 400;
    if (msg === "No autenticado") status = 401;
    if (msg === "Acceso denegado" || msg === "Solo administrador") status = 403;
    if (msg.includes("no encontrada")) status = 404;
    return json({ error: msg, status }, status);
  }
});
