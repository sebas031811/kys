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

export function dateYmd(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function cuotaNeedsPayment(cuota) {
  return cuota.estado !== "pagada";
}

/**
 * Cuotas impagas o parciales con vencimiento en o antes de venceHasta (orden: fecha, # cuota).
 */
export function cuotasDueBy(sale, venceHasta) {
  if (!venceHasta || sale.estado_registro === "cotizacion") return [];
  const rows = [...(sale.cuotas || [])].filter(cuotaNeedsPayment);
  if (rows.length) {
    return rows
      .filter((c) => {
        const due = dateYmd(c.fecha_vencimiento);
        return due && due <= venceHasta;
      })
      .sort((a, b) => {
        const cmp = dateYmd(a.fecha_vencimiento).localeCompare(dateYmd(b.fecha_vencimiento));
        if (cmp !== 0) return cmp;
        return a.numero_cuota - b.numero_cuota;
      });
  }
  const due = dateYmd(sale.proximo_vencimiento);
  if (!due || due > venceHasta) return [];
  if (saleIsFullyPaid(sale)) return [];
  return [
    {
      numero_cuota: sale.proximo_vencimiento_numero ?? 0,
      fecha_vencimiento: due,
      estado: sale.proximo_vencimiento_estado || "pendiente",
    },
  ];
}

/** Primera cuota impaga en el rango del filtro «vence hasta». */
export function saleDueForVenceFilter(sale, venceHasta) {
  const dueList = cuotasDueBy(sale, venceHasta);
  if (!dueList.length) return null;
  const focus = dueList[0];
  return {
    vencimiento: dateYmd(focus.fecha_vencimiento),
    estado: focus.estado,
    numero: focus.numero_cuota,
    count: dueList.length,
  };
}

export function saleMatchesVenceHasta(sale, venceHasta) {
  if (!venceHasta) return true;
  if (saleIsFullyPaid(sale)) return false;
  return cuotasDueBy(sale, venceHasta).length > 0;
}

/** Venta confirmada sin saldo pendiente. */
export function saleIsFullyPaid(sale) {
  return sale.estado_registro === "venta" && (Number(sale.pendiente) || 0) <= 0;
}

export function saleMatchesCompletadas(sale, onlyCompletadas) {
  if (!onlyCompletadas) return true;
  return saleIsFullyPaid(sale);
}

/**
 * Con filtro de fecha: rojo = vencida; amarillo = por vencer (hasta la fecha); verde = venta saldada.
 */
export function salePaymentRowClassForVence(sale, venceHasta, todayYmd = new Date().toISOString().slice(0, 10)) {
  if (!venceHasta) {
    return saleIsFullyPaid(sale) ? "row-pay-ok" : "";
  }
  const dueList = cuotasDueBy(sale, venceHasta);
  if (!dueList.length) {
    return saleIsFullyPaid(sale) ? "row-pay-ok" : "";
  }
  if (saleIsFullyPaid(sale)) return "row-pay-ok";

  const hasOverdue = dueList.some((c) => {
    const due = dateYmd(c.fecha_vencimiento);
    return due && due < todayYmd;
  });
  if (hasOverdue) return "row-pay-late";

  const hasUpcoming = dueList.some((c) => {
    const due = dateYmd(c.fecha_vencimiento);
    return due && due >= todayYmd && due <= venceHasta;
  });
  if (hasUpcoming) return "row-pay-due";

  return "row-pay-late";
}

export function formatProximoVencimiento(sale) {
  const due = sale.proximo_vencimiento ? String(sale.proximo_vencimiento).slice(0, 10) : "";
  if (!due) return "—";
  const n = sale.proximo_vencimiento_numero;
  const cuota = n === 0 || n != null ? (n === 0 ? "Inicial" : `#${n}`) : "";
  return cuota ? `${due} (${cuota})` : due;
}

/** Columna «Próx. vence» con filtro de fecha (incluye cuotas múltiples en el rango). */
export function formatVenceFilterCell(sale, venceHasta) {
  const list = cuotasDueBy(sale, venceHasta);
  if (!list.length) return formatProximoVencimiento(sale);
  const parts = list.map((c) => {
    const due = dateYmd(c.fecha_vencimiento);
    const label = c.numero_cuota === 0 ? "Inicial" : `#${c.numero_cuota}`;
    return `${due} (${label})`;
  });
  if (parts.length <= 2) return parts.join(" · ");
  return `${parts[0]} · … +${parts.length - 1} cuotas`;
}
