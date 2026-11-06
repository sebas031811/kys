export function num(v: unknown): number {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function computeSalePricing(payload: Record<string, unknown>) {
  const valor = num(payload.valor ?? payload.cost_price);
  let rate = num(payload.porcentaje ?? payload.margin_rate);
  if (rate > 1) rate /= 100;
  const inicial = Math.max(num(payload.inicial ?? payload.down_payment), 0);
  const count = Math.max(num(payload.num_cuotas ?? payload.installment_count) || 1, 1);
  const periodo = String(payload.periodo_pago ?? payload.payment_period ?? "Mensual");

  const profitBase = Math.max(valor - inicial, 0);
  const ganancia = Math.round(profitBase * rate);
  const total = payload.total != null ? num(payload.total) : Math.round(valor + ganancia);
  const financiado = Math.max(total - inicial, 0);
  let cuota: number;

  if (periodo === "Contado" || count <= 1) {
    cuota = payload.cuota != null ? num(payload.cuota) : total;
  } else if (payload.cuota != null) {
    cuota = num(payload.cuota);
  } else {
    cuota = count ? Math.round(financiado / count) : financiado;
  }

  return { ganancia, total, cuota, saldo_financiado: financiado };
}
