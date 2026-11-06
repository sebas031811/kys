import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { computeSalePricing, num } from "./pricing.ts";
import { userOut } from "./auth.ts";

function clientOut(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    telefono: row.telefono ?? null,
    identificacion: row.identificacion ?? null,
    email: row.email ?? null,
    direccion: row.direccion ?? null,
    texto_cliente: row.texto_cliente ?? null,
    notas: row.notas ?? null,
  };
}

function installmentOut(row: Record<string, unknown>) {
  const st = String(row.estado ?? "pendiente");
  let estado = "pendiente";
  if (st === "pagada" || st === "paid") estado = "pagada";
  else if (st === "parcial" || st === "partial") estado = "parcial";
  return {
    id: Number(row.id),
    numero_cuota: Number(row.numero_cuota),
    monto: num(row.monto),
    fecha_vencimiento: row.fecha_vencimiento ?? null,
    estado,
    monto_pagado: num(row.monto_pagado),
  };
}

export function saleOut(row: Record<string, unknown>, cliente: Record<string, unknown> | null, cuotas: unknown[]) {
  return {
    id: Number(row.id),
    cliente_id: Number(row.cliente_id),
    vendedor_id: row.vendedor_id ? Number(row.vendedor_id) : null,
    cuenta_compra_id: row.cuenta_compra_id ? Number(row.cuenta_compra_id) : null,
    producto: row.producto,
    fecha_venta: row.fecha_venta ?? null,
    fecha_cotizacion: row.fecha_cotizacion ?? null,
    fecha_entrega: row.fecha_entrega ?? null,
    valor: num(row.valor),
    porcentaje: num(row.porcentaje),
    inicial: num(row.inicial),
    ganancia: num(row.ganancia),
    total: num(row.total),
    num_cuotas: Number(row.num_cuotas) || 1,
    cuota: num(row.cuota),
    periodo_pago: row.periodo_pago ?? "Mensual",
    fecha_cuota: row.fecha_cuota ?? null,
    valor_abonado: num(row.valor_abonado),
    pendiente: num(row.pendiente),
    compra: row.compra ?? null,
    tarjeta: row.tarjeta ?? null,
    cuota_tarjeta: row.cuota_tarjeta ?? null,
    ganancia_vivi: num(row.ganancia_vivi),
    abonado_vivi: num(row.abonado_vivi),
    cuotas_pagadas: row.cuotas_pagadas != null ? Number(row.cuotas_pagadas) : null,
    observaciones: row.observaciones ?? null,
    estado_registro: row.estado_registro ?? "venta",
    cuotas,
    cliente: cliente ? clientOut(cliente) : null,
  };
}

export async function listSales(db: SupabaseClient, me: ReturnType<typeof userOut>, estado: string | null) {
  let q = db.from("ventas").select("*").order("id", { ascending: false }).limit(200);
  if (estado) q = q.eq("estado_registro", estado);
  if (me.rol === "seller") q = q.eq("vendedor_id", me.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => saleOut(r, null, []));
}

export async function getSale(db: SupabaseClient, me: ReturnType<typeof userOut>, saleId: number) {
  const { data: row, error } = await db.from("ventas").select("*").eq("id", saleId).maybeSingle();
  if (error || !row) throw new Error("Venta no encontrada");
  if (me.rol === "seller" && Number(row.vendedor_id) !== me.id) throw new Error("Acceso denegado");

  const { data: cliente } = await db.from("clientes").select("*").eq("id", row.cliente_id).maybeSingle();
  const { data: cuotasRows } = await db.from("cuotas").select("*").eq("venta_id", saleId).order("numero_cuota");
  const cuotas = (cuotasRows ?? []).map(installmentOut);
  const { data: cuentas } = await db.from("cuentas").select("*").order("nombre");
  const sale = saleOut(row, cliente, cuotas);
  if (sale.cuotas_pagadas == null) {
    sale.cuotas_pagadas = cuotas.filter((c) => c.estado === "pagada").length;
  }
  return { ...sale, cuentas: (cuentas ?? []).map((a) => ({ id: Number(a.id), nombre: a.nombre, tipo_cuenta: a.tipo_cuenta, saldo_inicial: num(a.saldo_inicial), notas: a.notas ?? null })) };
}

function ventaPayload(body: Record<string, unknown>, me: ReturnType<typeof userOut>, pricing: ReturnType<typeof computeSalePricing>, isQuote: boolean) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    cliente_id: body.cliente_id,
    vendedor_id: body.vendedor_id ?? me.id,
    cuenta_compra_id: body.cuenta_compra_id || null,
    producto: body.producto,
    fecha_venta: isQuote ? null : (body.fecha_venta ?? today),
    fecha_cotizacion: isQuote ? (body.fecha_cotizacion ?? today) : body.fecha_cotizacion ?? null,
    fecha_entrega: body.fecha_entrega ?? null,
    valor: body.valor,
    porcentaje: body.porcentaje,
    inicial: body.inicial ?? 0,
    ganancia: pricing.ganancia,
    total: pricing.total,
    num_cuotas: body.num_cuotas ?? 1,
    cuota: pricing.cuota,
    periodo_pago: body.periodo_pago ?? "Mensual",
    fecha_cuota: body.fecha_cuota ?? null,
    valor_abonado: 0,
    pendiente: pricing.total,
    compra: body.compra ?? null,
    tarjeta: body.tarjeta ?? null,
    cuota_tarjeta: body.cuota_tarjeta ?? null,
    ganancia_vivi: body.ganancia_vivi ?? 0,
    abonado_vivi: body.abonado_vivi ?? 0,
    cuotas_pagadas: 0,
    observaciones: body.observaciones ?? null,
    estado_registro: isQuote ? "cotizacion" : "venta",
  };
}

async function rebuildCuotas(db: SupabaseClient, sale: Record<string, unknown>) {
  await db.from("cuotas").delete().eq("venta_id", sale.id);
  const rows: Record<string, unknown>[] = [];
  const inicial = num(sale.inicial);
  if (inicial > 0) {
    rows.push({
      venta_id: sale.id,
      numero_cuota: 0,
      monto: inicial,
      fecha_vencimiento: sale.fecha_venta ?? new Date().toISOString().slice(0, 10),
      estado: "pendiente",
      monto_pagado: 0,
    });
  }
  const n = Number(sale.num_cuotas) || 1;
  const cuota = num(sale.cuota);
  for (let i = 1; i <= n; i++) {
    rows.push({
      venta_id: sale.id,
      numero_cuota: i,
      monto: cuota,
      fecha_vencimiento: null,
      estado: "pendiente",
      monto_pagado: 0,
    });
  }
  if (rows.length) await db.from("cuotas").insert(rows);
}

export async function createSale(db: SupabaseClient, me: ReturnType<typeof userOut>, body: Record<string, unknown>) {
  const pricing = computeSalePricing(body);
  const isQuote = body.estado_registro === "cotizacion";
  if (me.rol === "seller") body.vendedor_id = me.id;
  const payload = ventaPayload(body, me, pricing, isQuote);
  const { data: row, error } = await db.from("ventas").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  if (!isQuote) await rebuildCuotas(db, row);
  return getSale(db, me, Number(row.id));
}

const VENTA_KEYS = new Set([
  "cliente_id", "vendedor_id", "cuenta_compra_id", "producto", "fecha_venta", "fecha_cotizacion",
  "fecha_entrega", "valor", "porcentaje", "inicial", "num_cuotas", "periodo_pago", "fecha_cuota",
  "compra", "tarjeta", "cuota_tarjeta", "ganancia_vivi", "abonado_vivi", "observaciones", "estado_registro", "cuota",
]);

export async function patchSale(db: SupabaseClient, me: ReturnType<typeof userOut>, saleId: number, body: Record<string, unknown>) {
  const { data: row, error: fe } = await db.from("ventas").select("*").eq("id", saleId).maybeSingle();
  if (fe || !row) throw new Error("Venta no encontrada");
  if (me.rol === "seller" && Number(row.vendedor_id) !== me.id) throw new Error("Acceso denegado");

  const merged: Record<string, unknown> = { ...row };
  Object.keys(body).forEach((k) => {
    if (body[k] !== undefined && VENTA_KEYS.has(k)) merged[k] = body[k];
  });
  const pricing = computeSalePricing(merged);
  const collected = num(row.valor_abonado);
  const patch: Record<string, unknown> = {
    ganancia: pricing.ganancia,
    total: pricing.total,
    cuota: pricing.cuota,
  };
  Object.keys(body).forEach((k) => {
    if (body[k] !== undefined && VENTA_KEYS.has(k)) patch[k] = body[k];
  });
  if (row.estado_registro === "cotizacion") {
    patch.pendiente = pricing.total;
  } else {
    patch.pendiente = Math.max(pricing.total - collected, 0);
  }
  const { error } = await db.from("ventas").update(patch).eq("id", saleId);
  if (error) throw new Error(error.message);
  if (row.estado_registro === "venta") {
    const { data: updated } = await db.from("ventas").select("*").eq("id", saleId).single();
    if (updated) await rebuildCuotas(db, updated);
  }
  return getSale(db, me, saleId);
}

export async function sellerDashboard(db: SupabaseClient, me: ReturnType<typeof userOut>) {
  let vq = db.from("ventas").select("*").eq("estado_registro", "venta");
  if (me.rol === "seller") vq = vq.eq("vendedor_id", me.id);
  const { data: sales } = await vq;
  const list = sales ?? [];
  let total_recuperado = 0;
  let total_pendiente = 0;
  list.forEach((s) => {
    total_recuperado += num(s.valor_abonado);
    total_pendiente += num(s.pendiente);
  });

  const { data: allCuotas } = await db.from("cuotas").select("*");
  const { data: allClientes } = await db.from("clientes").select("*");
  const clientById: Record<number, Record<string, unknown>> = {};
  (allClientes ?? []).forEach((c) => { clientById[Number(c.id)] = c; });

  const until = new Date();
  until.setDate(until.getDate() + 30);
  const untilStr = until.toISOString().slice(0, 10);
  const proximas_cuotas: Record<string, unknown>[] = [];

  list.forEach((s) => {
    (allCuotas ?? []).filter((c) => Number(c.venta_id) === Number(s.id)).forEach((row) => {
      const inst = installmentOut(row);
      if (inst.estado === "pagada") return;
      if (inst.fecha_vencimiento && String(inst.fecha_vencimiento) > untilStr) return;
      const client = clientById[Number(s.cliente_id)];
      proximas_cuotas.push({
        venta_id: s.id,
        cliente_nombre: client?.nombre ?? "",
        producto: s.producto,
        numero_cuota: inst.numero_cuota,
        monto: inst.monto,
        fecha_vencimiento: inst.fecha_vencimiento,
      });
    });
  });
  proximas_cuotas.sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)));

  return {
    vendedor_id: me.id,
    nombre_vendedor: me.nombre_visible,
    total_recuperado,
    total_pendiente,
    num_ventas: list.length,
    proximas_cuotas: proximas_cuotas.slice(0, 50),
  };
}

export async function recordPayment(db: SupabaseClient, me: ReturnType<typeof userOut>, saleId: number, body: Record<string, unknown>) {
  const sale = await getSale(db, me, saleId);
  if (sale.estado_registro === "cotizacion") throw new Error("Convierte la cotización en venta antes de registrar cobros");
  await db.from("pagos").insert({
    venta_id: saleId,
    cuota_id: body.cuota_id ?? null,
    cuenta_cobro_id: body.cuenta_cobro_id ?? null,
    registrado_por_id: me.id,
    monto: body.monto,
    fecha_pago: body.fecha_pago ?? new Date().toISOString().slice(0, 10),
    notas: body.notas ?? null,
  });
  const { data: pagos } = await db.from("pagos").select("monto").eq("venta_id", saleId);
  const total = (pagos ?? []).reduce((s, p) => s + num(p.monto), 0);
  const pendiente = Math.max(num(sale.total) - total, 0);
  await db.from("ventas").update({ valor_abonado: total, pendiente }).eq("id", saleId);
  return { id: 0, monto: num(body.monto), fecha_pago: body.fecha_pago, cuenta_cobro_id: body.cuenta_cobro_id ?? null, cuota_id: null, notas: body.notas ?? null };
}

export async function confirmSale(db: SupabaseClient, me: ReturnType<typeof userOut>, saleId: number, body: Record<string, unknown>) {
  const { data: row } = await db.from("ventas").select("*").eq("id", saleId).single();
  if (!row || row.estado_registro !== "cotizacion") throw new Error("Solo una cotización puede convertirse en venta");
  const today = new Date().toISOString().slice(0, 10);
  const patch = {
    estado_registro: "venta",
    fecha_venta: body.fecha_venta ?? today,
    fecha_entrega: body.fecha_entrega ?? row.fecha_entrega,
    inicial: body.inicial ?? row.inicial,
  };
  await db.from("ventas").update(patch).eq("id", saleId);
  const abono = num(body.valor_abonado);
  if (abono > 0) {
    await db.from("pagos").insert({
      venta_id: saleId,
      registrado_por_id: me.id,
      monto: abono,
      fecha_pago: patch.fecha_venta,
      notas: "Abono inicial al confirmar venta",
    });
  }
  const { data: updated } = await db.from("ventas").select("*").eq("id", saleId).single();
  if (updated) {
    await rebuildCuotas(db, updated);
    const { data: pagos } = await db.from("pagos").select("monto").eq("venta_id", saleId);
    const total = (pagos ?? []).reduce((s, p) => s + num(p.monto), 0);
    await db.from("ventas").update({ valor_abonado: total, pendiente: Math.max(num(updated.total) - total, 0) }).eq("id", saleId);
  }
  return getSale(db, me, saleId);
}
