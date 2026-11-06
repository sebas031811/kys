export const PERIODOS = ["Mensual", "Quincenal", "Semanal", "Contado"];

/** Valores alineados con Schedule.gs / Installments.gs */
export const REGLAS_FECHA_CUOTA = [
  { value: "30 de cada mes", label: "Día 30 de cada mes" },
  { value: "15 de cada mes", label: "Día 15 de cada mes" },
  { value: "15 y 30", label: "15 y 30 (alterno)" },
];

export function periodOptions(current) {
  const p = current || "Mensual";
  return PERIODOS.map((o) => `<option ${p === o ? "selected" : ""}>${o}</option>`).join("");
}

export function fechaCuotaOptions(current) {
  const raw = String(current || "").trim();
  const norm = raw.toLowerCase();
  let selected = "30 de cada mes";
  if (norm.includes("15 y 30")) selected = "15 y 30";
  else if (norm.includes("15")) selected = "15 de cada mes";
  else if (raw) selected = raw;
  const values = new Set(REGLAS_FECHA_CUOTA.map((r) => r.value));
  let html = REGLAS_FECHA_CUOTA.map(
    (r) => `<option value="${r.value}" ${selected === r.value ? "selected" : ""}>${r.label}</option>`,
  ).join("");
  if (raw && !values.has(selected) && !REGLAS_FECHA_CUOTA.some((r) => r.value === raw)) {
    html += `<option value="${raw.replace(/"/g, "&quot;")}" selected>${raw}</option>`;
  }
  return html;
}

export function formatDiaCuota(fechaCuota) {
  if (!fechaCuota) return "30";
  const r = String(fechaCuota).toLowerCase();
  if (r.includes("15 y 30")) return "15 y 30";
  if (r.includes("15 de cada mes") || r === "15") return "15";
  if (r.includes("30 de cada mes") || r === "30") return "30";
  return String(fechaCuota);
}

function saleHasInicialCuota(sale) {
  if (Array.isArray(sale.cuotas) && sale.cuotas.some((c) => Number(c.numero_cuota) === 0)) return true;
  return Number(sale.inicial) > 0;
}

export function cuotasPagadasPendientes(sale) {
  if (Array.isArray(sale.cuotas) && sale.cuotas.length > 0) {
    const pagadas = sale.cuotas.filter((c) => c.estado === "pagada").length;
    const total = sale.cuotas.length;
    return { pagadas, pendientes: Math.max(total - pagadas, 0), total };
  }
  const financed = Math.max(Number(sale.num_cuotas) || 0, 0);
  const total = financed + (saleHasInicialCuota(sale) ? 1 : 0);
  const pagadas = Math.max(Number(sale.cuotas_pagadas) || 0, 0);
  const pendientes = Math.max(total - pagadas, 0);
  return { pagadas, pendientes, total };
}

/** Ej. 3/5 cuotas pagadas (incluye inicial como cuota 0 si aplica). */
export function formatCuotasRatio(sale) {
  const { pagadas, total } = cuotasPagadasPendientes(sale);
  if (!total) return "—";
  return `${pagadas}/${total}`;
}

export function formatUltimoPago(fecha) {
  if (!fecha) return "—";
  return String(fecha);
}

/** Cuota pendiente más próxima usada por el filtro «vence hasta». */
export function saleDueForVenceFilter(sale, venceHasta) {
  if (!venceHasta || sale.estado_registro === "cotizacion") return null;
  const due = sale.proximo_vencimiento ? String(sale.proximo_vencimiento).slice(0, 10) : "";
  if (!due || due > venceHasta) return null;
  return {
    vencimiento: due,
    estado: sale.proximo_vencimiento_estado || "pendiente",
    numero: sale.proximo_vencimiento_numero,
  };
}

export function saleMatchesVenceHasta(sale, venceHasta) {
  if (!venceHasta) return true;
  return saleDueForVenceFilter(sale, venceHasta) != null;
}

/** row-pay-ok = cuota cubierta; row-pay-late = sigue debiendo esa cuota. */
export function salePaymentRowClassForVence(sale, venceHasta) {
  const info = saleDueForVenceFilter(sale, venceHasta);
  if (!info) return "";
  const pendiente = Number(sale.pendiente) || 0;
  if (pendiente <= 0) return "row-pay-ok";
  if (info.estado === "pagada") return "row-pay-ok";
  const ult = sale.fecha_ultimo_pago ? String(sale.fecha_ultimo_pago).slice(0, 10) : "";
  if (ult && ult >= info.vencimiento) return "row-pay-ok";
  return "row-pay-late";
}

export function formatProximoVencimiento(sale) {
  const due = sale.proximo_vencimiento ? String(sale.proximo_vencimiento).slice(0, 10) : "";
  if (!due) return "—";
  const n = sale.proximo_vencimiento_numero;
  const cuota = n === 0 || n != null ? (n === 0 ? "Inicial" : `#${n}`) : "";
  return cuota ? `${due} (${cuota})` : due;
}
