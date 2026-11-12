import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { num } from "./pricing.ts";
import { userOut } from "./auth.ts";

type AccountRow = {
  id: number;
  nombre: string;
  tipo_cuenta: string;
  saldo_inicial: number;
  notas: string | null;
};

function nombreKey(nombre: string) {
  return String(nombre || "").trim().toLowerCase();
}

async function fetchAccounts(db: SupabaseClient): Promise<AccountRow[]> {
  const { data, error } = await db.from("cuentas").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    nombre: String(row.nombre),
    tipo_cuenta: row.tipo_cuenta ?? "both",
    saldo_inicial: num(row.saldo_inicial),
    notas: row.notas ?? null,
  }));
}

/** Same display name → one row (lowest id); totals can merge duplicate ids in summary. */
function groupByNombre(accounts: AccountRow[]) {
  const map = new Map<string, { ids: number[]; primary: AccountRow }>();
  for (const a of accounts) {
    const key = nombreKey(a.nombre);
    if (!key) continue;
    let g = map.get(key);
    if (!g) {
      g = { ids: [], primary: a };
      map.set(key, g);
    }
    g.ids.push(a.id);
    if (a.id < g.primary.id) g.primary = a;
  }
  return map;
}

export async function listAccounts(db: SupabaseClient) {
  const accounts = await fetchAccounts(db);
  return [...groupByNombre(accounts).values()]
    .map((g) => g.primary)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}

export async function createAccount(db: SupabaseClient, me: ReturnType<typeof userOut>, body: Record<string, unknown>) {
  if (me.rol !== "admin") throw new Error("Solo administrador");
  const nombre = String(body.nombre ?? body.name ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  const { data: existing } = await db.from("cuentas").select("*").ilike("nombre", nombre).limit(5);
  const dup = (existing ?? []).find((r) => String(r.nombre).trim().toLowerCase() === nombre.toLowerCase());
  if (dup) {
    return {
      id: Number(dup.id),
      nombre: dup.nombre,
      tipo_cuenta: dup.tipo_cuenta,
      saldo_inicial: num(dup.saldo_inicial),
      notas: dup.notas,
    };
  }
  const { data, error } = await db.from("cuentas").insert({
    nombre,
    tipo_cuenta: body.tipo_cuenta ?? body.account_type ?? "both",
    saldo_inicial: body.saldo_inicial ?? body.opening_balance ?? 0,
    notas: body.notas ?? body.notes ?? "",
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { id: Number(data.id), nombre: data.nombre, tipo_cuenta: data.tipo_cuenta, saldo_inicial: num(data.saldo_inicial), notas: data.notas };
}

export async function recordAccountTransfer(
  db: SupabaseClient,
  me: ReturnType<typeof userOut>,
  body: Record<string, unknown>,
) {
  if (me.rol !== "admin") throw new Error("Solo administrador");
  const origenId = Number(body.cuenta_origen_id ?? body.from_account_id);
  const destinoId = Number(body.cuenta_destino_id ?? body.to_account_id);
  const monto = num(body.monto ?? body.amount);
  if (!origenId || !destinoId) throw new Error("Cuenta origen y destino requeridas");
  if (origenId === destinoId) throw new Error("Origen y destino deben ser distintas");
  if (monto <= 0) throw new Error("Monto debe ser mayor que cero");

  const { data: origen, error: e1 } = await db.from("cuentas").select("id").eq("id", origenId).maybeSingle();
  const { data: destino, error: e2 } = await db.from("cuentas").select("id").eq("id", destinoId).maybeSingle();
  if (e1?.message) throw new Error(e1.message);
  if (e2?.message) throw new Error(e2.message);
  if (!origen || !destino) throw new Error("Cuenta no encontrada");

  const fechaRaw = body.fecha ?? body.date;
  const fecha = fechaRaw != null && String(fechaRaw).trim() !== ""
    ? String(fechaRaw).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const notas = body.notas ?? body.notes ?? "";

  const { data, error } = await db.from("transferencias_cuenta").insert({
    cuenta_origen_id: origenId,
    cuenta_destino_id: destinoId,
    monto,
    fecha,
    notas,
    registrado_por_id: me.id,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return {
    id: Number(data.id),
    cuenta_origen_id: Number(data.cuenta_origen_id),
    cuenta_destino_id: Number(data.cuenta_destino_id),
    monto: num(data.monto),
    fecha: data.fecha ?? "",
    notas: data.notas ?? "",
  };
}

export async function updateAccount(db: SupabaseClient, me: ReturnType<typeof userOut>, id: number, body: Record<string, unknown>) {
  if (me.rol !== "admin") throw new Error("Solo administrador");
  const patch: Record<string, unknown> = {};
  if (body.saldo_inicial != null) patch.saldo_inicial = body.saldo_inicial;
  if (body.opening_balance != null) patch.saldo_inicial = body.opening_balance;
  if (body.nombre != null) patch.nombre = body.nombre;
  if (body.name != null) patch.nombre = body.name;
  if (body.tipo_cuenta != null) patch.tipo_cuenta = body.tipo_cuenta;
  if (body.notas != null) patch.notas = body.notas;
  const { error } = await db.from("cuentas").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  const { data } = await db.from("cuentas").select("*").eq("id", id).single();
  if (!data) throw new Error("Cuenta no encontrada");
  return { id: Number(data.id), nombre: data.nombre, tipo_cuenta: data.tipo_cuenta, saldo_inicial: num(data.saldo_inicial), notas: data.notas };
}

export async function listAccountsSummary(db: SupabaseClient) {
  const accounts = await fetchAccounts(db);
  const groups = groupByNombre(accounts);
  const idToCanonical = new Map<number, number>();
  for (const { ids, primary } of groups.values()) {
    for (const id of ids) idToCanonical.set(id, primary.id);
  }

  const { data: sales } = await db.from("ventas").select("id, valor, cuenta_compra_id, estado_registro, producto, fecha_venta").neq("estado_registro", "cotizacion");
  const { data: payments } = await db.from("pagos").select("id, monto, cuenta_cobro_id, venta_id, fecha_pago, notas");
  const { data: transfers } = await db.from("transferencias_cuenta").select("id, monto, cuenta_origen_id, cuenta_destino_id, fecha, notas");

  const accountNameById = new Map(accounts.map((a) => [a.id, a.nombre]));

  const purchasedByAccount: Record<number, number> = {};
  const receivedByAccount: Record<number, number> = {};
  const movimientos: Record<string, unknown>[] = [];

  (sales ?? []).forEach((s) => {
    const accId = Number(s.cuenta_compra_id);
    if (!accId) return;
    const cost = num(s.valor);
    purchasedByAccount[accId] = (purchasedByAccount[accId] || 0) + cost;
    movimientos.push({
      cuenta_id: idToCanonical.get(accId) ?? accId,
      tipo: "compra",
      monto: cost,
      fecha: s.fecha_venta ?? "",
      referencia: `Venta #${s.id}`,
      descripcion: s.producto ?? "",
    });
  });

  (payments ?? []).forEach((p) => {
    const accId = Number(p.cuenta_cobro_id);
    if (!accId) return;
    const amt = num(p.monto);
    receivedByAccount[accId] = (receivedByAccount[accId] || 0) + amt;
    movimientos.push({
      cuenta_id: idToCanonical.get(accId) ?? accId,
      tipo: "cobro",
      monto: amt,
      fecha: p.fecha_pago ?? "",
      referencia: `Pago #${p.id} (venta ${p.venta_id})`,
      descripcion: p.notas ?? "",
    });
  });

  (transfers ?? []).forEach((t) => {
    const amt = num(t.monto);
    const ref = `Transferencia #${t.id}`;
    const origenId = Number(t.cuenta_origen_id);
    const destinoId = Number(t.cuenta_destino_id);
    if (origenId) {
      purchasedByAccount[origenId] = (purchasedByAccount[origenId] || 0) + amt;
      const destName = accountNameById.get(destinoId) ?? destinoId;
      movimientos.push({
        cuenta_id: idToCanonical.get(origenId) ?? origenId,
        tipo: "transferencia_salida",
        monto: amt,
        fecha: t.fecha ?? "",
        referencia: ref,
        descripcion: `A ${destName}${t.notas ? ` — ${t.notas}` : ""}`,
      });
    }
    if (destinoId) {
      receivedByAccount[destinoId] = (receivedByAccount[destinoId] || 0) + amt;
      const origName = accountNameById.get(origenId) ?? origenId;
      movimientos.push({
        cuenta_id: idToCanonical.get(destinoId) ?? destinoId,
        tipo: "transferencia_entrada",
        monto: amt,
        fecha: t.fecha ?? "",
        referencia: ref,
        descripcion: `Desde ${origName}${t.notas ? ` — ${t.notas}` : ""}`,
      });
    }
  });

  movimientos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const cuentas = [...groups.values()].map(({ ids, primary }) => {
    let purchased = 0;
    let received = 0;
    let saldo = 0;
    for (const id of ids) {
      purchased += purchasedByAccount[id] || 0;
      received += receivedByAccount[id] || 0;
      const acc = accounts.find((x) => x.id === id);
      saldo += acc ? num(acc.saldo_inicial) : 0;
    }
    purchased = Math.round(purchased * 100) / 100;
    received = Math.round(received * 100) / 100;
    const balance = Math.round((saldo + received - purchased) * 100) / 100;
    return {
      ...primary,
      id: primary.id,
      saldo_inicial: Math.round(saldo * 100) / 100,
      total_comprado: purchased,
      total_recibido: received,
      balance,
    };
  }).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  return { cuentas, movimientos: movimientos.slice(0, 200) };
}
