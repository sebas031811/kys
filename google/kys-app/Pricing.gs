function normalizeMargin_(marginRate) {
  var r = num_(marginRate);
  return r > 1 ? r / 100 : r;
}

function computeSalePricing_(payload) {
  var cost = num_(payload.cost_price);
  var rate = normalizeMargin_(payload.margin_rate);
  var down = Math.max(num_(payload.down_payment), 0);
  var count = Math.max(Number(payload.installment_count) || 1, 1);
  var period = payload.payment_period || 'Mensual';

  var profitBase = Math.max(cost - down, 0);
  var profit = Math.round(profitBase * rate);
  var total = payload.total_charge != null ? num_(payload.total_charge) : Math.round(cost + profit);
  var financed = Math.max(total - down, 0);
  var installmentAmount;

  if (period === 'Contado' || count <= 1) {
    installmentAmount = payload.installment_amount != null ? num_(payload.installment_amount) : total;
  } else if (payload.installment_amount != null) {
    installmentAmount = num_(payload.installment_amount);
  } else {
    installmentAmount = count ? Math.round(financed / count) : financed;
  }

  return {
    profit: profit,
    total_charge: total,
    installment_amount: installmentAmount,
    financed_amount: financed,
  };
}
