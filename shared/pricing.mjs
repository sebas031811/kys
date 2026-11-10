import { num } from "./num.mjs";

/** Margin or commission percent: 30 → 0.3, values ≤1 stay as rate. */
export function normalizePercentRate(rate) {
  const r = num(rate);
  return r > 1 ? r / 100 : r;
}

export function computeSalePricing(payload) {
  const valor = num(payload.valor ?? payload.cost_price);
  const rate = normalizePercentRate(payload.porcentaje ?? payload.margin_rate);
  const inicial = Math.max(num(payload.inicial ?? payload.down_payment), 0);
  const count = Math.max(num(payload.num_cuotas ?? payload.installment_count) || 1, 1);
  const periodo = String(payload.periodo_pago ?? payload.payment_period ?? "Mensual");

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

export { num };
