function accountOut_(row) {
  return {
    id: Number(row.id),
    name: row.name,
    account_type: row.account_type || 'both',
    opening_balance: num_(row.opening_balance),
    notes: row.notes || null,
  };
}

function listAccounts_() {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS))
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
    .map(accountOut_);
}

function createAccount_(body, token) {
  var me = requireUser_(token);
  if (me.role !== 'admin') throw new Error('Admin only');
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].name).toLowerCase() === String(body.name).toLowerCase()) {
      throw new Error('Account name exists');
    }
  }
  return accountOut_(appendObject_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS), {
    name: body.name,
    account_type: body.account_type || 'both',
    opening_balance: body.opening_balance != null ? body.opening_balance : 0,
    notes: body.notes || '',
  }));
}

function updateAccount_(accountId, body, token) {
  var me = requireUser_(token);
  if (me.role !== 'admin') throw new Error('Admin only');
  var patch = {};
  if (body.opening_balance != null) patch.opening_balance = body.opening_balance;
  if (body.notes != null) patch.notes = body.notes;
  if (body.name != null) patch.name = body.name;
  if (body.account_type != null) patch.account_type = body.account_type;
  var row = updateById_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS), accountId, patch);
  if (!row) throw new Error('Account not found');
  return accountOut_(row);
}

/** Comprado = costo en ventas con cuenta compra; Recibido = pagos con cuenta cobro. Balance = inicial + recibido − comprado. */
function listAccountsSummary_(token) {
  requireUser_(token);
  var accounts = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS));
  var sales = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.SALES));
  var payments = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS));

  var purchasedByAccount = {};
  var receivedByAccount = {};
  var movements = [];

  sales.forEach(function (s) {
    if (String(s.record_status) === 'cotizacion') return;
    var accId = s.purchase_account_id;
    if (!accId) return;
    accId = Number(accId);
    var cost = num_(s.cost_price);
    purchasedByAccount[accId] = (purchasedByAccount[accId] || 0) + cost;
    movements.push({
      account_id: accId,
      kind: 'purchase',
      amount: cost,
      date: s.sold_at || '',
      reference: 'Venta #' + s.id,
      description: s.product_description || '',
    });
  });

  payments.forEach(function (p) {
    var accId = p.collection_account_id;
    if (!accId) return;
    accId = Number(accId);
    var amt = num_(p.amount);
    receivedByAccount[accId] = (receivedByAccount[accId] || 0) + amt;
    movements.push({
      account_id: accId,
      kind: 'collection',
      amount: amt,
      date: p.paid_at || '',
      reference: 'Pago #' + p.id + ' (venta ' + p.sale_id + ')',
      description: p.notes || '',
    });
  });

  movements.sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  });

  var result = accounts.map(function (row) {
    var id = Number(row.id);
    var opening = num_(row.opening_balance);
    var purchased = Math.round((purchasedByAccount[id] || 0) * 100) / 100;
    var received = Math.round((receivedByAccount[id] || 0) * 100) / 100;
    var balance = Math.round((opening + received - purchased) * 100) / 100;
    return {
      id: id,
      name: row.name,
      account_type: row.account_type || 'both',
      opening_balance: opening,
      notes: row.notes || null,
      total_purchased: purchased,
      total_received: received,
      balance: balance,
    };
  });

  result.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

  return { accounts: result, movements: movements.slice(0, 200) };
}
