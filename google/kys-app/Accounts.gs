function accountOut_(row) {
  return {
    id: Number(row.id),
    nombre: row.nombre || row.name,
    tipo_cuenta: row.tipo_cuenta || row.account_type || 'both',
    saldo_inicial: num_(row.saldo_inicial != null ? row.saldo_inicial : row.opening_balance),
    notas: row.notas || row.notes || null,
  };
}

function listAccounts_() {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS))
    .sort(function (a, b) {
      var na = a.nombre || a.name || '';
      var nb = b.nombre || b.name || '';
      return String(na).localeCompare(String(nb));
    })
    .map(accountOut_);
}

function createAccount_(body, token) {
  var me = requireUser_(token);
  if (me.rol !== 'admin') throw new Error('Solo administrador');
  var nombre = body.nombre || body.name;
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS));
  for (var i = 0; i < rows.length; i++) {
    var rn = rows[i].nombre || rows[i].name;
    if (String(rn).toLowerCase() === String(nombre).toLowerCase()) {
      throw new Error('Ya existe una cuenta con ese nombre');
    }
  }
  var c = KYS_FIELDS.CUENTA;
  return accountOut_(appendObject_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS), {
    nombre: nombre,
    tipo_cuenta: body.tipo_cuenta || body.account_type || 'both',
    saldo_inicial: body.saldo_inicial != null ? body.saldo_inicial : (body.opening_balance != null ? body.opening_balance : 0),
    notas: body.notas || body.notes || '',
  }));
}

function updateAccount_(accountId, body, token) {
  var me = requireUser_(token);
  if (me.rol !== 'admin') throw new Error('Solo administrador');
  var c = KYS_FIELDS.CUENTA;
  var patch = {};
  if (body.saldo_inicial != null) patch[c.saldo_inicial] = body.saldo_inicial;
  if (body.opening_balance != null) patch[c.saldo_inicial] = body.opening_balance;
  if (body.notas != null) patch[c.notas] = body.notas;
  if (body.notes != null) patch[c.notas] = body.notes;
  if (body.nombre != null) patch[c.nombre] = body.nombre;
  if (body.name != null) patch[c.nombre] = body.name;
  if (body.tipo_cuenta != null) patch[c.tipo_cuenta] = body.tipo_cuenta;
  if (body.account_type != null) patch[c.tipo_cuenta] = body.account_type;
  var row = updateById_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS), accountId, patch);
  if (!row) throw new Error('Cuenta no encontrada');
  return accountOut_(row);
}

function listAccountsSummary_(token) {
  requireUser_(token);
  var accounts = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS));
  var sales = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.SALES));
  var payments = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS));
  var v = KYS_FIELDS.VENTA;
  var p = KYS_FIELDS.PAGO;

  var purchasedByAccount = {};
  var receivedByAccount = {};
  var movements = [];

  sales.forEach(function (s) {
    var estado = s.estado_registro || s.record_status;
    if (String(estado) === 'cotizacion') return;
    var accId = s.cuenta_compra_id || s.purchase_account_id;
    if (!accId) return;
    accId = Number(accId);
    var cost = num_(s.valor != null ? s.valor : s.cost_price);
    purchasedByAccount[accId] = (purchasedByAccount[accId] || 0) + cost;
    movements.push({
      cuenta_id: accId,
      tipo: 'compra',
      monto: cost,
      fecha: s.fecha_venta || s.sold_at || '',
      referencia: 'Venta #' + s.id,
      descripcion: s.producto || s.product_description || '',
    });
  });

  payments.forEach(function (pay) {
    var accId = pay.cuenta_cobro_id || pay.collection_account_id;
    if (!accId) return;
    accId = Number(accId);
    var amt = num_(pay.monto != null ? pay.monto : pay.amount);
    receivedByAccount[accId] = (receivedByAccount[accId] || 0) + amt;
    var ventaId = pay.venta_id || pay.sale_id;
    movements.push({
      cuenta_id: accId,
      tipo: 'cobro',
      monto: amt,
      fecha: pay.fecha_pago || pay.paid_at || '',
      referencia: 'Pago #' + pay.id + ' (venta ' + ventaId + ')',
      descripcion: pay.notas || pay.notes || '',
    });
  });

  movements.sort(function (a, b) {
    return String(b.fecha).localeCompare(String(a.fecha));
  });

  var result = accounts.map(function (row) {
    var id = Number(row.id);
    var opening = num_(row.saldo_inicial != null ? row.saldo_inicial : row.opening_balance);
    var purchased = Math.round((purchasedByAccount[id] || 0) * 100) / 100;
    var received = Math.round((receivedByAccount[id] || 0) * 100) / 100;
    var balance = Math.round((opening + received - purchased) * 100) / 100;
    return {
      id: id,
      nombre: row.nombre || row.name,
      tipo_cuenta: row.tipo_cuenta || row.account_type || 'both',
      saldo_inicial: opening,
      notas: row.notas || row.notes || null,
      total_comprado: purchased,
      total_recibido: received,
      balance: balance,
    };
  });

  result.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });

  return { cuentas: result, movimientos: movements.slice(0, 200) };
}
