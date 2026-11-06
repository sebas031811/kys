import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { num } from "./pricing.ts";
import { userOut } from "./auth.ts";

export async function listAccounts(db: SupabaseClient) {
  const { data, error } = await db.from("cuentas").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    nombre: row.nombre,
    tipo_cuenta: row.tipo_cuenta ?? "both",
    saldo_inicial: num(row.saldo_inicial),
    notas: row.notas ?? null,
  }));
}

export async function createAccount(db: SupabaseClient, me: ReturnType<typeof userOut>, body: Record<string, unknown>) {
  if (me.rol !== "admin") throw new Error("Solo administrador");
  const { data, error } = await db.from("cuentas").insert({
    nombre: body.nombre ?? body.name,
    tipo_cuenta: body.tipo_cuenta ?? body.account_type ?? "both",
    saldo_inicial: body.saldo_inicial ?? body.opening_balance ?? 0,
    notas: body.notas ?? body.notes ?? "",
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { id: Number(data.id), nombre: data.nombre, tipo_cuenta: data.tipo_cuenta, saldo_inicial: num(data.saldo_inicial), notas: data.notas };
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
  const accounts = await listAccounts(db);
  const { data: sales } = await db.from("ventas").select("id, valor, cuenta_compra_id, estado_registro, producto, fecha_venta").neq("estado_registro", "cotizacion");
  const { data: payments } = await db.from("pagos").select("id, monto, cuenta_cobro_id, venta_id, fecha_pago, notas");

  const purchasedByAccount: Record<number, number> = {};
  const receivedByAccount: Record<number, number> = {};
  const movimientos: Record<string, unknown>[] = [];

  (sales ?? []).forEach((s) => {
    const accId = Number(s.cuenta_compra_id);
    if (!accId) return;
    const cost = num(s.valor);
    purchasedByAccount[accId] = (purchasedByAccount[accId] || 0) + cost;
    movimientos.push({
      cuenta_id: accId,
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
      cuenta_id: accId,
      tipo: "cobro",
      monto: amt,
      fecha: p.fecha_pago ?? "",
      referencia: `Pago #${p.id} (venta ${p.venta_id})`,
      descripcion: p.notas ?? "",
    });
  });

  movimientos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const cuentas = accounts.map((a) => {
    const purchased = Math.round((purchasedByAccount[a.id] || 0) * 100) / 100;
    const received = Math.round((receivedByAccount[a.id] || 0) * 100) / 100;
    const balance = Math.round((a.saldo_inicial + received - purchased) * 100) / 100;
    return { ...a, total_comprado: purchased, total_recibido: received, balance };
  });

  return { cuentas, movimientos: movimientos.slice(0, 200) };
}
