function applyAmountToSchedule_(installments, totalCollected) {
  var sorted = installments.slice().sort(function (a, b) { return Number(a.sequence) - Number(b.sequence); });
  sorted.forEach(function (inst) {
    inst.amount_paid = 0;
    inst.status = 'pending';
  });

  var remaining = Math.max(num_(totalCollected), 0);
  sorted.forEach(function (inst) {
    var due = num_(inst.amount) - num_(inst.amount_paid);
    if (due <= 0) return;
    var applied = Math.min(remaining, due);
    if (applied <= 0) return;
    inst.amount_paid = num_(inst.amount_paid) + applied;
    remaining -= applied;
    if (inst.amount_paid >= num_(inst.amount) - 0.01) {
      inst.status = 'paid';
      inst.amount_paid = num_(inst.amount);
    } else {
      inst.status = 'partial';
    }
  });

  var amountPaid = 0;
  sorted.forEach(function (i) { amountPaid += num_(i.amount_paid); });
  return { installments: sorted, amount_paid: Math.round(amountPaid * 100) / 100 };
}

function totalPaymentsForSale_(saleId) {
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS));
  var sum = 0;
  rows.forEach(function (p) {
    if (Number(p.sale_id) === Number(saleId)) sum += num_(p.amount);
  });
  return Math.round(sum * 100) / 100;
}

function loadInstallmentsForSale_(saleId) {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.INSTALLMENTS))
    .filter(function (r) { return Number(r.sale_id) === Number(saleId); })
    .sort(function (a, b) { return Number(a.sequence) - Number(b.sequence); })
    .map(installmentOut_);
}

function installmentOut_(row) {
  return {
    id: Number(row.id),
    sequence: Number(row.sequence),
    amount: num_(row.amount),
    due_date: row.due_date || null,
    status: row.status || 'pending',
    amount_paid: num_(row.amount_paid),
  };
}

function saveInstallmentsForSale_(saleId, installmentRows) {
  var sh = getSheet_(KYS_CONFIG.SHEETS.INSTALLMENTS);
  deleteWhere_(sh, function (r) { return Number(r.sale_id) === Number(saleId); });
  installmentRows.forEach(function (row) {
    appendObject_(sh, {
      sale_id: saleId,
      sequence: row.sequence,
      amount: row.amount,
      due_date: row.due_date,
      status: row.status,
      amount_paid: row.amount_paid,
    });
  });
}

function rebuildInstallmentsForSale_(sale) {
  var start = sale.delivered_at || sale.sold_at || todayIso_();
  var rows = [];
  if (num_(sale.down_payment) > 0) {
    rows.push({
      sequence: 0,
      amount: num_(sale.down_payment),
      due_date: sale.sold_at || start,
      status: 'pending',
      amount_paid: 0,
    });
  }
  var schedule = buildInstallmentSchedule_(
    start,
    Number(sale.installment_count) || 1,
    num_(sale.installment_amount),
    sale.payment_period || 'Mensual',
    sale.due_rule
  );
  schedule.forEach(function (s) { rows.push(s); });
  return rows;
}
