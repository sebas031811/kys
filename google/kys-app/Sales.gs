function saleOut_(row, withRelated) {
  var sale = {
    id: Number(row.id),
    client_id: Number(row.client_id),
    product_id: null,
    seller_id: row.seller_id ? Number(row.seller_id) : null,
    purchase_account_id: row.purchase_account_id ? Number(row.purchase_account_id) : null,
    product_description: row.product_description,
    sold_at: row.sold_at || null,
    delivered_at: row.delivered_at || null,
    cost_price: num_(row.cost_price),
    margin_rate: num_(row.margin_rate),
    down_payment: num_(row.down_payment),
    profit: num_(row.profit),
    total_charge: num_(row.total_charge),
    installment_count: Number(row.installment_count) || 1,
    installment_amount: num_(row.installment_amount),
    payment_period: row.payment_period || 'Mensual',
    due_rule: row.due_rule || null,
    amount_paid: num_(row.amount_paid),
    balance_pending: num_(row.balance_pending),
    purchase_url: row.purchase_url || null,
    card_installment_note: row.card_installment_note || null,
    partner_metadata: null,
    record_status: row.record_status || 'venta',
    installments: [],
    client: null,
  };
  if (withRelated) {
    var client = getClientById_(sale.client_id);
    if (client) sale.client = clientOut_(client);
    sale.installments = loadInstallmentsForSale_(sale.id);
  }
  return sale;
}

function listSales_(token, recordStatus) {
  var me = requireUser_(token);
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.SALES));
  rows = rows.filter(function (r) {
    if (recordStatus && r.record_status !== recordStatus) return false;
    if (me.role === 'seller' && Number(r.seller_id) !== Number(me.id)) return false;
    return true;
  });
  rows.sort(function (a, b) { return Number(b.id) - Number(a.id); });
  return rows.slice(0, 200).map(function (r) { return saleOut_(r, false); });
}

function getSale_(token, saleId) {
  var me = requireUser_(token);
  var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
  if (!row) throw new Error('Sale not found');
  if (me.role === 'seller' && Number(row.seller_id) !== Number(me.id)) throw new Error('Forbidden');
  return saleOut_(row, true);
}

function pricingFieldsFromCreate_(body) {
  var pricing = computeSalePricing_(body);
  return {
    profit: body.profit != null ? num_(body.profit) : pricing.profit,
    total_charge: body.total_charge != null ? num_(body.total_charge) : pricing.total_charge,
    installment_amount: body.installment_amount != null ? num_(body.installment_amount) : pricing.installment_amount,
  };
}

function createSale_(token, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var amounts = pricingFieldsFromCreate_(body);
    var isQuote = body.record_status === 'cotizacion';
    var sellerId = body.seller_id != null ? body.seller_id : me.id;
    if (me.role === 'seller') sellerId = me.id;

    var sale = appendObject_(getSheet_(KYS_CONFIG.SHEETS.SALES), {
      client_id: body.client_id,
      seller_id: sellerId,
      purchase_account_id: body.purchase_account_id || '',
      product_description: body.product_description,
      sold_at: isQuote ? '' : (body.sold_at || todayIso_()),
      delivered_at: body.delivered_at || '',
      cost_price: body.cost_price,
      margin_rate: body.margin_rate,
      down_payment: body.down_payment || 0,
      profit: amounts.profit,
      total_charge: amounts.total_charge,
      installment_count: body.installment_count || 1,
      installment_amount: amounts.installment_amount,
      payment_period: body.payment_period || 'Mensual',
      due_rule: body.due_rule || '',
      amount_paid: 0,
      balance_pending: amounts.total_charge,
      purchase_url: body.purchase_url || '',
      card_installment_note: body.card_installment_note || '',
      record_status: isQuote ? 'cotizacion' : 'venta',
    });

    if (!isQuote) {
      var instRows = rebuildInstallmentsForSale_(sale);
      saveInstallmentsForSale_(sale.id, instRows);
    }
    return getSale_(token, sale.id);
  });
}

function applyPricingToSaleRow_(sale) {
  var pricing = computeSalePricing_(sale);
  sale.profit = pricing.profit;
  sale.total_charge = pricing.total_charge;
  sale.installment_amount = pricing.installment_amount;
  if (sale.record_status === 'cotizacion') {
    sale.amount_paid = 0;
    sale.balance_pending = pricing.total_charge;
  } else {
    sale.balance_pending = Math.round(Math.max(num_(sale.total_charge) - num_(sale.amount_paid), 0) * 100) / 100;
  }
  return sale;
}

function updateSale_(token, saleId, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Sale not found');
    if (me.role === 'seller' && Number(row.seller_id) !== Number(me.id)) throw new Error('Forbidden');

    var collected = totalPaymentsForSale_(saleId);
    Object.keys(body).forEach(function (k) {
      if (body[k] !== undefined) row[k] = body[k];
    });
    row = applyPricingToSaleRow_(row);

    if (row.record_status === 'venta') {
      var instRows = rebuildInstallmentsForSale_(row);
      var applied = applyAmountToSchedule_(instRows, collected);
      row.amount_paid = applied.amount_paid;
      row.balance_pending = Math.round(Math.max(num_(row.total_charge) - row.amount_paid, 0) * 100) / 100;
      updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
      saveInstallmentsForSale_(saleId, applied.installments);
    } else {
      updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    }
    return getSale_(token, saleId);
  });
}

function confirmSale_(token, saleId, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Sale not found');
    if (row.record_status !== 'cotizacion') throw new Error('Only cotizacion can be converted to venta');
    if (me.role === 'seller' && Number(row.seller_id) !== Number(me.id)) throw new Error('Forbidden');

    if (body.down_payment != null) row.down_payment = body.down_payment;
    if (body.purchase_account_id != null) row.purchase_account_id = body.purchase_account_id;
    if (body.due_rule != null) row.due_rule = body.due_rule;

    row = applyPricingToSaleRow_(row);
    row.sold_at = body.sold_at || todayIso_();
    row.delivered_at = body.delivered_at || row.delivered_at || '';
    row.record_status = 'venta';

    var collected = body.amount_paid != null ? num_(body.amount_paid) : 0;
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);

    if (collected > 0) {
      appendObject_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), {
        sale_id: saleId,
        installment_id: '',
        collection_account_id: '',
        recorded_by_id: me.id,
        amount: collected,
        paid_at: row.sold_at,
        notes: 'Initial balance on confirm',
      });
    }

    var instRows = rebuildInstallmentsForSale_(row);
    var applied = applyAmountToSchedule_(instRows, collected);
    row.amount_paid = applied.amount_paid;
    row.balance_pending = Math.round(Math.max(num_(row.total_charge) - row.amount_paid, 0) * 100) / 100;
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    saveInstallmentsForSale_(saleId, applied.installments);

    return getSale_(token, saleId);
  });
}

function recordPayment_(token, saleId, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Sale not found');
    if (row.record_status === 'cotizacion') throw new Error('Convert cotizacion to venta before recording payments');
    if (me.role === 'seller' && Number(row.seller_id) !== Number(me.id)) throw new Error('Forbidden');

    appendObject_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), {
      sale_id: saleId,
      installment_id: body.installment_id || '',
      collection_account_id: body.collection_account_id || '',
      recorded_by_id: me.id,
      amount: body.amount,
      paid_at: body.paid_at || todayIso_(),
      notes: body.notes || '',
    });

    var total = totalPaymentsForSale_(saleId);
    var instRows = loadInstallmentsForSale_(saleId);
    if (!instRows.length) {
      instRows = rebuildInstallmentsForSale_(row);
    }
    var applied = applyAmountToSchedule_(instRows, total);
    row.amount_paid = applied.amount_paid;
    row.balance_pending = Math.round(Math.max(num_(row.total_charge) - row.amount_paid, 0) * 100) / 100;
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    saveInstallmentsForSale_(saleId, applied.installments);

    var payments = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS));
    var last = payments[payments.length - 1];
    return {
      id: Number(last.id),
      amount: num_(last.amount),
      paid_at: last.paid_at,
      collection_account_id: last.collection_account_id ? Number(last.collection_account_id) : null,
      installment_id: last.installment_id ? Number(last.installment_id) : null,
      notes: last.notes || null,
    };
  });
}

function sellerDashboard_(token) {
  var me = requireUser_(token);
  var sales = listSales_(token, 'venta');
  var recovered = 0;
  var pending = 0;
  sales.forEach(function (s) {
    recovered += num_(s.amount_paid);
    pending += num_(s.balance_pending);
  });

  var upcoming = [];
  var until = new Date();
  until.setDate(until.getDate() + 30);
  var untilStr = formatIsoDate_(until);

  sales.forEach(function (s) {
    var insts = loadInstallmentsForSale_(s.id);
    insts.forEach(function (inst) {
      if (inst.status === 'paid') return;
      if (!inst.due_date || String(inst.due_date) > untilStr) return;
      var client = getClientById_(s.client_id);
      upcoming.push({
        sale_id: s.id,
        client_name: client ? client.name : '',
        product: s.product_description,
        sequence: inst.sequence,
        amount: inst.amount,
        due_date: inst.due_date,
      });
    });
  });
  upcoming.sort(function (a, b) { return String(a.due_date).localeCompare(String(b.due_date)); });
  upcoming = upcoming.slice(0, 50);

  return {
    seller_id: me.id,
    seller_name: me.display_name,
    total_recovered: recovered,
    total_pending: pending,
    sale_count: sales.length,
    upcoming_installments: upcoming,
  };
}

function quotePrintHtml_(token, saleId) {
  var sale = getSale_(token, saleId);
  var b = KYS_CONFIG.BUSINESS;
  var clientName = sale.client ? sale.client.name : '';
  var clientPhone = sale.client ? sale.client.phone : '';
  function money(n) {
    return '$' + Math.round(num_(n)).toLocaleString('es-CO');
  }
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Cotización</title></head><body>' +
    '<h1>' + b.name + '</h1><p>' + b.address + ' · ' + b.whatsapp + '</p>' +
    '<p><strong>Cliente:</strong> ' + clientName + '<br/><strong>Teléfono:</strong> ' + (clientPhone || '—') + '</p>' +
    '<p><strong>Producto:</strong> ' + sale.product_description + '</p>' +
    '<table border="1" cellpadding="6"><tr><th>Concepto</th><th>Valor</th></tr>' +
    '<tr><td>Costo base</td><td>' + money(sale.cost_price) + '</td></tr>' +
    '<tr><td>Cuota inicial</td><td>' + money(sale.down_payment) + '</td></tr>' +
    '<tr><td>Total</td><td>' + money(sale.total_charge) + '</td></tr>' +
    '<tr><td># Cuotas</td><td>' + sale.installment_count + '</td></tr>' +
    '<tr><td>Valor cuota</td><td>' + money(sale.installment_amount) + '</td></tr>' +
    '<tr><td>Pendiente</td><td>' + money(sale.balance_pending) + '</td></tr></table></body></html>';
}
