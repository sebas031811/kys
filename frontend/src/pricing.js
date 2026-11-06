/** Same rules as google/kys-app/Pricing.gs — runs in browser (no server round-trip). */
function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function normalizePorcentaje(rate) {
  const r = num(rate);
  return r > 1 ? r / 100 : r;
}

export function computeSalePricing(payload) {
  const valor = num(payload.valor);
  const rate = normalizePorcentaje(payload.porcentaje);
  const inicial = Math.max(num(payload.inicial), 0);
  const count = Math.max(num(payload.num_cuotas) || 1, 1);
  const periodo = payload.periodo_pago || "Mensual";

  const profitBase = Math.max(valor - inicial, 0);
  const ganancia = Math.round(profitBase * rate);
  const total = payload.total != null ? num(payload.total) : Math.round(valor + ganancia);
  const financiado = Math.max(total - inicial, 0);
  let cuota;

  if (periodo === "Contado" || count <= 1) {
    cuota = payload.cuota != null ? num(payload.cuota) : total;
  } else if (payload.cuota != null) {
    cuota = num(payload.cuota);
  } else {
    cuota = count ? Math.round(financiado / count) : financiado;
  }

  return { ganancia, total, cuota, saldo_financiado: financiado };
}
