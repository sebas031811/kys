import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { num } from "./pricing.ts";
import { userOut } from "./auth.ts";

export const DEFAULT_PORCENTAJE_COMISION = 30;

export function commissionRate(pct: unknown): number {
  let rate = num(pct);
  if (rate > 1) rate /= 100;
  return Math.max(0, rate);
}

export function salePorcentajeComision(sale: Record<string, unknown>): number {
  const raw = sale.porcentaje_comision;
  if (raw == null || raw === "") return DEFAULT_PORCENTAJE_COMISION;
  return num(raw);
}

export function computeCommissionSummary(
  sales: Array<Record<string, unknown>>,
  comisionPagada: number,
) {
  let ganancia_total_ventas = 0;
  let comision_total_ventas = 0;
  let comision_total_recaudo = 0;

  sales.forEach((s) => {
    const rate = commissionRate(salePorcentajeComision(s));
    const ganancia = num(s.ganancia);
    const total = num(s.total);
    const abonado = num(s.valor_abonado);
    ganancia_total_ventas += ganancia;
    comision_total_ventas += Math.round(ganancia * rate);
    const ratio = total > 0 ? Math.min(abonado / total, 1) : 0;
    comision_total_recaudo += Math.round(ganancia * rate * ratio);
  });

  return {
    ganancia_total_ventas,
    comision_total_ventas,
    comision_total_recaudo,
    comision_pagada: comisionPagada,
    comision_pendiente_pago: Math.max(0, comision_total_recaudo - comisionPagada),
  };
}

export async function readComisionPagadaUsuario(db: SupabaseClient, vendedorId: number): Promise<number> {
  const { data, error } = await db.from("usuarios").select("comision_pagada").eq("id", vendedorId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.comision_pagada != null) return num(data.comision_pagada);
  const { data: rows } = await db.from("pagos_comision_vendedor").select("monto").eq("vendedor_id", vendedorId);
  let total = 0;
  (rows ?? []).forEach((row) => { total += num(row.monto); });
  return total;
}

async function incrementComisionPagada(db: SupabaseClient, vendedorId: number, delta: number) {
  const current = await readComisionPagadaUsuario(db, vendedorId);
  const next = current + delta;
  const { error } = await db.from("usuarios").update({ comision_pagada: next }).eq("id", vendedorId);
  if (error) throw new Error(error.message);
  return next;
}

function pagoComisionOut(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    vendedor_id: Number(row.vendedor_id),
    monto: num(row.monto),
    fecha_pago: row.fecha_pago ?? null,
    notas: row.notas ?? null,
    registrado_por_id: row.registrado_por_id ? Number(row.registrado_por_id) : null,
  };
}

export async function listPagosComisionVendedor(db: SupabaseClient, vendedorId: number) {
  const { data, error } = await db
    .from("pagos_comision_vendedor")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("fecha_pago", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(pagoComisionOut);
}

export async function recordPagoComisionVendedor(
  db: SupabaseClient,
  me: ReturnType<typeof userOut>,
  vendedorId: number,
  body: Record<string, unknown>,
) {
  if (me.rol !== "admin") throw new Error("Solo administrador");
  const monto = num(body.monto);
  if (monto <= 0) throw new Error("Monto inválido");

  const { data: vendedor, error: ve } = await db.from("usuarios").select("id, rol").eq("id", vendedorId).maybeSingle();
  if (ve || !vendedor) throw new Error("Vendedor no encontrado");
  if (vendedor.rol !== "seller") throw new Error("El usuario no es vendedor");

  const { data: inserted, error: pe } = await db.from("pagos_comision_vendedor").insert({
    vendedor_id: vendedorId,
    monto,
    fecha_pago: body.fecha_pago ?? new Date().toISOString().slice(0, 10),
    notas: body.notas ?? null,
    registrado_por_id: me.id,
  }).select("*").single();
  if (pe) throw new Error(pe.message);
  await incrementComisionPagada(db, vendedorId, monto);
  return pagoComisionOut(inserted);
}

export async function vendedorComisionResumen(db: SupabaseClient, vendedorId: number) {
  const { data: vendedor, error: ve } = await db.from("usuarios").select("*").eq("id", vendedorId).maybeSingle();
  if (ve || !vendedor) throw new Error("Vendedor no encontrado");

  const { data: sales } = await db
    .from("ventas")
    .select("ganancia, total, valor_abonado, porcentaje_comision")
    .eq("estado_registro", "venta")
    .eq("vendedor_id", vendedorId);

  const pagada = await readComisionPagadaUsuario(db, vendedorId);
  const resumen = computeCommissionSummary(sales ?? [], pagada);

  return {
    vendedor: userOut(vendedor),
    resumen,
    pagos: await listPagosComisionVendedor(db, vendedorId),
  };
}
