import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  applyPaymentsToSchedule,
  countPaidInstallments,
} from "../../../../shared/installments.mjs";
import { num } from "./pricing.ts";

export type CuotaWorking = {
  id: number;
  numero_cuota: number;
  monto: number;
  monto_pagado: number;
  estado: string;
  fecha_pago: string | null;
};

export { applyPaymentsToSchedule, countPaidInstallments };

export function applyAmountToSchedule(installments: CuotaWorking[], totalCollected: number) {
  return applyPaymentsToSchedule(installments, [{ monto: totalCollected, fecha_pago: null }]);
}

export function lastPaymentDatesBySale(
  pagos: { venta_id: unknown; fecha_pago: unknown }[],
): Record<number, string> {
  const map: Record<number, string> = {};
  for (const p of pagos) {
    const vid = Number(p.venta_id);
    const f = p.fecha_pago ? String(p.fecha_pago) : "";
    if (!f) continue;
    if (!map[vid] || f > map[vid]) map[vid] = f;
  }
  return map;
}

export async function lastPaymentDateForSale(db: SupabaseClient, saleId: number) {
  const { data } = await db
    .from("pagos")
    .select("fecha_pago")
    .eq("venta_id", saleId)
    .order("fecha_pago", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.fecha_pago ? String(data.fecha_pago) : null;
}

export async function totalPaymentsForSale(db: SupabaseClient, saleId: number) {
  const { data: pagos } = await db.from("pagos").select("monto").eq("venta_id", saleId);
  const sum = (pagos ?? []).reduce((s, p) => s + num(p.monto), 0);
  return Math.round(sum * 100) / 100;
}

/** Reparte pagos de la venta en cuotas (FIFO) y guarda fecha_pago por cuota. */
export async function syncSalePaymentsToCuotas(
  db: SupabaseClient,
  saleId: number,
  ventaTotal: number,
) {
  const { data: pagosRows } = await db
    .from("pagos")
    .select("monto, fecha_pago, id")
    .eq("venta_id", saleId)
    .order("fecha_pago")
    .order("id");
  const pagos = pagosRows ?? [];

  const { data: cuotasRows, error } = await db
    .from("cuotas")
    .select("id, numero_cuota, monto, monto_pagado, estado, fecha_pago")
    .eq("venta_id", saleId)
    .order("numero_cuota");
  if (error) throw new Error(error.message);

  const totalCollected = pagos.reduce((s, p) => s + num(p.monto), 0);

  if (!cuotasRows?.length) {
    const pendiente = Math.max(num(ventaTotal) - totalCollected, 0);
    await db.from("ventas").update({
      valor_abonado: Math.round(totalCollected * 100) / 100,
      pendiente,
      cuotas_pagadas: 0,
    }).eq("id", saleId);
    return;
  }

  const working: CuotaWorking[] = cuotasRows.map((r) => ({
    id: Number(r.id),
    numero_cuota: Number(r.numero_cuota),
    monto: num(r.monto),
    monto_pagado: 0,
    estado: "pendiente",
    fecha_pago: null,
  }));

  const applied = pagos.length
    ? applyPaymentsToSchedule(working, pagos)
    : applyAmountToSchedule(working, 0);

  for (const inst of applied.installments) {
    const { error: ue } = await db.from("cuotas").update({
      monto_pagado: inst.monto_pagado,
      estado: inst.estado,
      fecha_pago: inst.fecha_pago,
    }).eq("id", inst.id);
    if (ue) throw new Error(ue.message);
  }

  const cuotas_pagadas = countPaidInstallments(applied.installments);
  const pendiente = Math.round(Math.max(num(ventaTotal) - applied.valor_abonado, 0) * 100) / 100;

  await db.from("ventas").update({
    valor_abonado: applied.valor_abonado,
    pendiente,
    cuotas_pagadas,
  }).eq("id", saleId);
}
