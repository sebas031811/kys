function normalizePorcentaje_(rate) {
  var r = num_(rate);
  return r > 1 ? r / 100 : r;
}

function pricingInputFromBody_(payload) {
  payload = payload || {};
  return {
    valor: payload.valor != null ? payload.valor : payload.cost_price,
    inicial: payload.inicial != null ? payload.inicial : payload.down_payment,
    porcentaje: payload.porcentaje != null ? payload.porcentaje : payload.margin_rate,
    num_cuotas: payload.num_cuotas != null ? payload.num_cuotas : payload.installment_count,
    periodo_pago: payload.periodo_pago || payload.payment_period || 'Mensual',
    total: payload.total,
    cuota: payload.cuota,
  };
}

function ventaPricingInputFromRow_(row) {
  return {
    valor: row.valor != null ? row.valor : row.cost_price,
    porcentaje: row.porcentaje != null ? row.porcentaje : row.margin_rate,
    inicial: row.inicial != null ? row.inicial : row.down_payment,
    num_cuotas: row.num_cuotas != null ? row.num_cuotas : row.installment_count,
    periodo_pago: row.periodo_pago || row.payment_period || 'Mensual',
  };
}

function computeSalePricing_(payload) {
  var input = pricingInputFromBody_(payload);
  var valor = num_(input.valor);
  var rate = normalizePorcentaje_(input.porcentaje);
  var inicial = Math.max(num_(input.inicial), 0);
  var count = Math.max(Number(input.num_cuotas) || 1, 1);
  var periodo = input.periodo_pago || 'Mensual';

  var profitBase = Math.max(valor - inicial, 0);
  var ganancia = Math.round(profitBase * rate);
  var total = input.total != null ? num_(input.total) : Math.round(valor + ganancia);
  var financiado = Math.max(total - inicial, 0);
  var cuota;

  if (periodo === 'Contado' || count <= 1) {
    cuota = input.cuota != null ? num_(input.cuota) : total;
  } else if (input.cuota != null) {
    cuota = num_(input.cuota);
  } else {
    cuota = count ? Math.round(financiado / count) : financiado;
  }

  return {
    ganancia: ganancia,
    total: total,
    cuota: cuota,
    saldo_financiado: financiado,
  };
}
