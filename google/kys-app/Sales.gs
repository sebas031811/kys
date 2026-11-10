function saleOut_(row, withRelated) {
  var v = KYS_FIELDS.VENTA;
  var sale = {
    id: Number(row.id),
    cliente_id: Number(row.cliente_id != null ? row.cliente_id : row.client_id),
    vendedor_id: row.vendedor_id || row.seller_id ? Number(row.vendedor_id || row.seller_id) : null,
    cuenta_compra_id: row.cuenta_compra_id || row.purchase_account_id
      ? Number(row.cuenta_compra_id || row.purchase_account_id)
      : null,
    producto: row.producto || row.product_description,
    fecha_venta: row.fecha_venta || row.sold_at || null,
    fecha_cotizacion: row.fecha_cotizacion || null,
    fecha_entrega: row.fecha_entrega || row.delivered_at || null,
    valor: num_(row.valor != null ? row.valor : row.cost_price),
    porcentaje: num_(row.porcentaje != null ? row.porcentaje : row.margin_rate),
    inicial: num_(row.inicial != null ? row.inicial : row.down_payment),
    ganancia: num_(row.ganancia != null ? row.ganancia : row.profit),
    porcentaje_comision: row.porcentaje_comision != null && row.porcentaje_comision !== ''
      ? num_(row.porcentaje_comision)
      : 30,
    total: num_(row.total != null ? row.total : row.total_charge),
    num_cuotas: Number(row.num_cuotas != null ? row.num_cuotas : row.installment_count) || 1,
    cuota: num_(row.cuota != null ? row.cuota : row.installment_amount),
    periodo_pago: row.periodo_pago || row.payment_period || 'Mensual',
    fecha_cuota: row.fecha_cuota || row.due_rule || null,
    valor_abonado: num_(row.valor_abonado != null ? row.valor_abonado : row.amount_paid),
    pendiente: num_(row.pendiente != null ? row.pendiente : row.balance_pending),
    compra: row.compra || row.purchase_url || null,
    tarjeta: row.tarjeta || row.card_installment_note || null,
    cuota_tarjeta: row.cuota_tarjeta || null,
    cuotas_pagadas: row.cuotas_pagadas != null ? Number(row.cuotas_pagadas) : null,
    observaciones: row.observaciones || null,
    estado_registro: row.estado_registro || row.record_status || 'venta',
    fecha_ultimo_pago: null,
    cuotas: [],
    cliente: null,
  };
  if (withRelated) {
    var client = findById_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS), sale.cliente_id);
    if (client) sale.cliente = clientOut_(client);
    sale.cuotas = loadInstallmentsForSale_(sale.id);
    if (sale.cuotas_pagadas == null) sale.cuotas_pagadas = countPaidInstallments_(sale.cuotas);
  }
  return sale;
}

function listSales_(token, recordStatus) {
  var me = requireUser_(token);
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.SALES));
  rows = rows.filter(function (r) {
    var estado = r.estado_registro || r.record_status;
    if (recordStatus && estado !== recordStatus) return false;
    var sellerId = r.vendedor_id || r.seller_id;
    if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) return false;
    return true;
  });
  rows.sort(function (a, b) { return Number(b.id) - Number(a.id); });
  var clientRows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS));
  var clientById = indexRowsById_(clientRows);
  var lastPayBySale = lastPaymentDatesBySale_();
  return rows.slice(0, 200).map(function (r) {
    var sale = saleOut_(r, false);
    var client = clientById[sale.cliente_id];
    if (client) sale.cliente = clientOut_(client);
    sale.fecha_ultimo_pago = lastPayBySale[sale.id] || null;
    return sale;
  });
}

function getSale_(token, saleId) {
  var me = requireUser_(token);
  var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
  if (!row) throw new Error('Venta no encontrada');
  var sellerId = row.vendedor_id || row.seller_id;
  if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) throw new Error('Acceso denegado');
  var sale = saleOut_(row, true);
  sale.fecha_ultimo_pago = lastPaymentDateForSale_(saleId);
  sale.pagos = paymentsForSale_(saleId).map(paymentOut_);
  sale.cuentas = listAccounts_();
  return sale;
}

function paymentOut_(row) {
  return {
    id: Number(row.id),
    monto: num_(row.monto != null ? row.monto : row.amount),
    fecha_pago: row.fecha_pago || row.paid_at || null,
    cuenta_cobro_id: row.cuenta_cobro_id || row.collection_account_id
      ? Number(row.cuenta_cobro_id || row.collection_account_id)
      : null,
    notas: row.notas || row.notes || null,
  };
}

function pricingFieldsFromCreate_(body) {
  var pricing = computeSalePricing_(body);
  return {
    ganancia: body.ganancia != null ? num_(body.ganancia) : pricing.ganancia,
    total: body.total != null ? num_(body.total) : pricing.total,
    cuota: body.cuota != null ? num_(body.cuota) : pricing.cuota,
  };
}

function ventaRowFromBody_(body, amounts, me, isQuote) {
  var v = KYS_FIELDS.VENTA;
  var sellerId = body.vendedor_id != null ? body.vendedor_id : (body.seller_id != null ? body.seller_id : me.id);
  if (me.rol === 'seller') sellerId = me.id;

  var row = {};
  row[v.cliente_id] = body.cliente_id != null ? body.cliente_id : body.client_id;
  row[v.vendedor_id] = sellerId;
  row[v.cuenta_compra_id] = body.cuenta_compra_id || body.purchase_account_id || '';
  row[v.producto] = body.producto || body.product_description;
  row[v.fecha_venta] = isQuote ? '' : (body.fecha_venta || body.sold_at || todayIso_());
  row[v.fecha_cotizacion] = isQuote ? (body.fecha_cotizacion || todayIso_()) : (body.fecha_cotizacion || '');
  row[v.fecha_entrega] = body.fecha_entrega || body.delivered_at || '';
  row[v.valor] = body.valor != null ? body.valor : body.cost_price;
  row[v.porcentaje] = body.porcentaje != null ? body.porcentaje : body.margin_rate;
  row[v.inicial] = body.inicial != null ? body.inicial : (body.down_payment || 0);
  row[v.ganancia] = amounts.ganancia;
  row[v.porcentaje_comision] = body.porcentaje_comision != null ? body.porcentaje_comision : 30;
  row[v.total] = amounts.total;
  row[v.num_cuotas] = body.num_cuotas != null ? body.num_cuotas : (body.installment_count || 1);
  row[v.cuota] = amounts.cuota;
  row[v.periodo_pago] = body.periodo_pago || body.payment_period || 'Mensual';
  row[v.fecha_cuota] = body.fecha_cuota || body.due_rule || '';
  row[v.valor_abonado] = 0;
  row[v.pendiente] = amounts.total;
  row[v.compra] = body.compra || body.purchase_url || '';
  row[v.tarjeta] = body.tarjeta || body.card_installment_note || '';
  row[v.cuota_tarjeta] = body.cuota_tarjeta || '';
  row[v.cuotas_pagadas] = 0;
  row[v.observaciones] = body.observaciones || '';
  row[v.estado_registro] = isQuote ? 'cotizacion' : 'venta';
  return row;
}

function createSale_(token, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var amounts = pricingFieldsFromCreate_(body);
    var estado = body.estado_registro || body.record_status;
    var isQuote = estado === 'cotizacion';
    var sale = appendObject_(getSheet_(KYS_CONFIG.SHEETS.SALES), ventaRowFromBody_(body, amounts, me, isQuote));

    if (!isQuote) {
      var instRows = rebuildInstallmentsForSale_(sale);
      saveInstallmentsForSale_(sale.id, instRows);
    }
    return getSale_(token, sale.id);
  });
}

function applyPricingToSaleRow_(sale) {
  var pricing = computeSalePricing_(ventaPricingInputFromRow_(sale));
  var v = KYS_FIELDS.VENTA;
  sale[v.ganancia] = pricing.ganancia;
  sale[v.total] = pricing.total;
  sale.cuota = pricing.cuota;
  sale[v.cuota] = pricing.cuota;
  sale.ganancia = pricing.ganancia;
  sale.total = pricing.total;

  var estado = sale.estado_registro || sale.record_status;
  if (estado === 'cotizacion') {
    sale.valor_abonado = 0;
    sale[v.valor_abonado] = 0;
    sale.pendiente = pricing.total;
    sale[v.pendiente] = pricing.total;
  } else {
    var abonado = num_(sale.valor_abonado != null ? sale.valor_abonado : sale.amount_paid);
    sale.pendiente = Math.round(Math.max(num_(pricing.total) - abonado, 0) * 100) / 100;
    sale[v.pendiente] = sale.pendiente;
  }
  return sale;
}

function patchVentaRow_(row, body) {
  var allowed = KYS_HEADERS.Ventas;
  Object.keys(body).forEach(function (k) {
    if (body[k] === undefined) return;
    if (allowed.indexOf(k) !== -1) row[k] = body[k];
  });
  return row;
}

function updateSale_(token, saleId, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Venta no encontrada');
    var sellerId = row.vendedor_id || row.seller_id;
    if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) throw new Error('Acceso denegado');

    var collected = totalPaymentsForSale_(saleId);
    row = patchVentaRow_(row, body);
    row = applyPricingToSaleRow_(row);

    var estado = row.estado_registro || row.record_status;
    if (estado === 'venta') {
      var instRows = rebuildInstallmentsForSale_(row);
      var applied = applyPaymentsToSchedule_(instRows, paymentsForSale_(saleId));
      row.valor_abonado = applied.valor_abonado;
      row[KYS_FIELDS.VENTA.valor_abonado] = applied.valor_abonado;
      row.pendiente = Math.round(Math.max(num_(row.total || row.total_charge) - row.valor_abonado, 0) * 100) / 100;
      row[KYS_FIELDS.VENTA.pendiente] = row.pendiente;
      row.cuotas_pagadas = countPaidInstallments_(applied.installments);
      row[KYS_FIELDS.VENTA.cuotas_pagadas] = row.cuotas_pagadas;
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
    if (!row) throw new Error('Venta no encontrada');
    var estado = row.estado_registro || row.record_status;
    if (estado !== 'cotizacion') throw new Error('Solo una cotización puede convertirse en venta');
    var sellerId = row.vendedor_id || row.seller_id;
    if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) throw new Error('Acceso denegado');

    var v = KYS_FIELDS.VENTA;
    if (body.inicial != null) row[v.inicial] = body.inicial;
    if (body.down_payment != null) row[v.inicial] = body.down_payment;
    if (body.cuenta_compra_id != null) row[v.cuenta_compra_id] = body.cuenta_compra_id;
    if (body.fecha_cuota != null) row[v.fecha_cuota] = body.fecha_cuota;

    row = applyPricingToSaleRow_(row);
    row[v.fecha_venta] = body.fecha_venta || body.sold_at || todayIso_();
    row[v.fecha_entrega] = body.fecha_entrega || body.delivered_at || row[v.fecha_entrega] || '';
    row[v.estado_registro] = 'venta';

    var collected = body.valor_abonado != null ? num_(body.valor_abonado) : (body.amount_paid != null ? num_(body.amount_paid) : 0);
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);

    if (collected > 0) {
      appendObject_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), {
        venta_id: saleId,
        cuota_id: '',
        cuenta_cobro_id: '',
        registrado_por_id: me.id,
        monto: collected,
        fecha_pago: row[v.fecha_venta],
        notas: 'Abono inicial al confirmar venta',
      });
    }

    var instRows = rebuildInstallmentsForSale_(row);
    var applied = applyPaymentsToSchedule_(instRows, paymentsForSale_(saleId));
    row[v.valor_abonado] = applied.valor_abonado;
    row[v.pendiente] = Math.round(Math.max(num_(row[v.total]) - applied.valor_abonado, 0) * 100) / 100;
    row[v.cuotas_pagadas] = countPaidInstallments_(applied.installments);
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    saveInstallmentsForSale_(saleId, applied.installments);

    return getSale_(token, saleId);
  });
}

function deleteSale_(token, saleId) {
  var me = requireUser_(token);
  if (me.rol !== 'admin') throw new Error('Solo administrador');
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Venta no encontrada');

    deleteRowsWhereColumnEquals_(getSheet_(KYS_CONFIG.SHEETS.INSTALLMENTS), KYS_FIELDS.CUOTA.venta_id, saleId);
    deleteRowsWhereColumnEquals_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), KYS_FIELDS.PAGO.venta_id, saleId);
    if (!deleteById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId)) throw new Error('Venta no encontrada');
    return { ok: true, id: Number(saleId) };
  });
}

function deletePayment_(token, saleId, paymentId) {
  var me = requireUser_(token);
  if (me.rol !== 'admin') throw new Error('Solo administrador');
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Venta no encontrada');
    var estado = row.estado_registro || row.record_status;
    if (estado === 'cotizacion') throw new Error('Convierte la cotización en venta antes de eliminar cobros');

    var payRow = findById_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), paymentId);
    if (!payRow) throw new Error('Cobro no encontrado');
    var paySaleId = payRow.venta_id != null ? payRow.venta_id : payRow.sale_id;
    if (Number(paySaleId) !== Number(saleId)) throw new Error('Cobro no encontrado');

    if (!deleteById_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), paymentId)) throw new Error('Cobro no encontrado');

    row = applyPricingToSaleRow_(row);
    var instRows = loadInstallmentsForSale_(saleId);
    if (!instRows.length) {
      instRows = rebuildInstallmentsForSale_(row);
    }
    var applied = applyPaymentsToSchedule_(instRows, paymentsForSale_(saleId));
    var v = KYS_FIELDS.VENTA;
    row[v.valor_abonado] = applied.valor_abonado;
    row[v.pendiente] = Math.round(Math.max(num_(row[v.total] || row.total) - applied.valor_abonado, 0) * 100) / 100;
    row[v.cuotas_pagadas] = countPaidInstallments_(applied.installments);
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    saveInstallmentsForSale_(saleId, applied.installments);

    return getSale_(token, saleId);
  });
}

function updatePayment_(token, saleId, paymentId, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Venta no encontrada');
    var estado = row.estado_registro || row.record_status;
    if (estado === 'cotizacion') throw new Error('Convierte la cotización en venta antes de editar cobros');
    var sellerId = row.vendedor_id || row.seller_id;
    if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) throw new Error('Acceso denegado');

    var payRow = findById_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), paymentId);
    if (!payRow) throw new Error('Cobro no encontrado');
    var paySaleId = payRow.venta_id != null ? payRow.venta_id : payRow.sale_id;
    if (Number(paySaleId) !== Number(saleId)) throw new Error('Cobro no encontrado');

    var p = KYS_FIELDS.PAGO;
    if (body.monto != null) payRow[p.monto] = body.monto;
    if (body.amount != null) payRow[p.monto] = body.amount;
    if (body.fecha_pago != null) payRow[p.fecha_pago] = body.fecha_pago;
    if (body.paid_at != null) payRow[p.fecha_pago] = body.paid_at;
    if (body.cuenta_cobro_id !== undefined) payRow[p.cuenta_cobro_id] = body.cuenta_cobro_id || '';
    if (body.collection_account_id !== undefined) payRow[p.cuenta_cobro_id] = body.collection_account_id || '';
    if (body.notas !== undefined) payRow[p.notas] = body.notas || '';
    if (body.notes !== undefined) payRow[p.notas] = body.notes || '';
    updateById_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), paymentId, payRow);

    row = applyPricingToSaleRow_(row);
    var instRows = loadInstallmentsForSale_(saleId);
    if (!instRows.length) {
      instRows = rebuildInstallmentsForSale_(row);
    }
    var applied = applyPaymentsToSchedule_(instRows, paymentsForSale_(saleId));
    var v = KYS_FIELDS.VENTA;
    row[v.valor_abonado] = applied.valor_abonado;
    row[v.pendiente] = Math.round(Math.max(num_(row[v.total] || row.total) - applied.valor_abonado, 0) * 100) / 100;
    row[v.cuotas_pagadas] = countPaidInstallments_(applied.installments);
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    saveInstallmentsForSale_(saleId, applied.installments);

    return getSale_(token, saleId);
  });
}

function recordPayment_(token, saleId, body) {
  var me = requireUser_(token);
  return withDocLock_(function () {
    var row = findById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId);
    if (!row) throw new Error('Venta no encontrada');
    var estado = row.estado_registro || row.record_status;
    if (estado === 'cotizacion') throw new Error('Convierte la cotización en venta antes de registrar cobros');
    var sellerId = row.vendedor_id || row.seller_id;
    if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) throw new Error('Acceso denegado');

    appendObject_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS), {
      venta_id: saleId,
      cuota_id: body.cuota_id || body.installment_id || '',
      cuenta_cobro_id: body.cuenta_cobro_id || body.collection_account_id || '',
      registrado_por_id: me.id,
      monto: body.monto != null ? body.monto : body.amount,
      fecha_pago: body.fecha_pago || body.paid_at || todayIso_(),
      notas: body.notas || body.notes || '',
    });

    var total = totalPaymentsForSale_(saleId);
    var instRows = loadInstallmentsForSale_(saleId);
    if (!instRows.length) {
      instRows = rebuildInstallmentsForSale_(row);
    }
    var applied = applyPaymentsToSchedule_(instRows, paymentsForSale_(saleId));
    var v = KYS_FIELDS.VENTA;
    row[v.valor_abonado] = applied.valor_abonado;
    row[v.pendiente] = Math.round(Math.max(num_(row[v.total] || row.total) - applied.valor_abonado, 0) * 100) / 100;
    row[v.cuotas_pagadas] = countPaidInstallments_(applied.installments);
    updateById_(getSheet_(KYS_CONFIG.SHEETS.SALES), saleId, row);
    saveInstallmentsForSale_(saleId, applied.installments);

    var payments = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS));
    var last = payments[payments.length - 1];
    return {
      id: Number(last.id),
      monto: num_(last.monto != null ? last.monto : last.amount),
      fecha_pago: last.fecha_pago || last.paid_at,
      cuenta_cobro_id: last.cuenta_cobro_id || last.collection_account_id
        ? Number(last.cuenta_cobro_id || last.collection_account_id)
        : null,
      cuota_id: last.cuota_id || last.installment_id ? Number(last.cuota_id || last.installment_id) : null,
      notas: last.notas || last.notes || null,
    };
  });
}

function sellerDashboard_(token) {
  var me = requireUser_(token);
  var salesRows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.SALES));
  salesRows = salesRows.filter(function (r) {
    var estado = r.estado_registro || r.record_status;
    if (estado !== 'venta') return false;
    var sellerId = r.vendedor_id || r.seller_id;
    if (me.rol === 'seller' && Number(sellerId) !== Number(me.id)) return false;
    return true;
  });

  var sales = salesRows.map(function (r) { return saleOut_(r, false); });
  var recovered = 0;
  var pending = 0;
  sales.forEach(function (s) {
    recovered += num_(s.valor_abonado);
    pending += num_(s.pendiente);
  });

  var allInstRows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.INSTALLMENTS));
  var instBySale = groupInstallmentsBySaleId_(allInstRows);
  var clientById = indexRowsById_(sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS)));

  var upcoming = [];
  var until = new Date();
  until.setDate(until.getDate() + 30);
  var untilStr = formatIsoDate_(until);

  sales.forEach(function (s) {
    var rawInst = instBySale[s.id] || [];
    rawInst.sort(function (a, b) {
      return Number(a.numero_cuota != null ? a.numero_cuota : a.sequence) -
        Number(b.numero_cuota != null ? b.numero_cuota : b.sequence);
    });
    rawInst.forEach(function (row) {
      var inst = installmentOut_(row);
      if (inst.estado === 'pagada') return;
      if (!inst.fecha_vencimiento || String(inst.fecha_vencimiento) > untilStr) return;
      var client = clientById[s.cliente_id];
      upcoming.push({
        venta_id: s.id,
        cliente_nombre: client ? (client.nombre || client.name) : '',
        producto: s.producto,
        numero_cuota: inst.numero_cuota,
        monto: inst.monto,
        fecha_vencimiento: inst.fecha_vencimiento,
      });
    });
  });
  upcoming.sort(function (a, b) { return String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)); });
  upcoming = upcoming.slice(0, 50);

  return {
    vendedor_id: me.id,
    nombre_vendedor: me.nombre_visible,
    total_recuperado: recovered,
    total_pendiente: pending,
    num_ventas: sales.length,
    proximas_cuotas: upcoming,
  };
}

function quotePrintHtml_(token, saleId) {
  var sale = getSale_(token, saleId);
  var b = KYS_CONFIG.BUSINESS;
  var clientName = sale.cliente ? sale.cliente.nombre : '';
  var clientPhone = sale.cliente ? sale.cliente.telefono : '';
  function money(n) {
    return '$' + Math.round(num_(n)).toLocaleString('es-CO');
  }
  var saldoFin = Math.max(num_(sale.total) - num_(sale.inicial), 0);
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Cotización</title></head><body>' +
    '<h1>' + b.name + '</h1><p>' + b.address + ' · ' + b.whatsapp + '</p>' +
    '<p><strong>N° Cotización:</strong> ' + sale.id + '<br/>' +
    '<strong>Cliente:</strong> ' + clientName + '<br/><strong>Teléfono:</strong> ' + (clientPhone || '—') + '</p>' +
    '<p><strong>Producto:</strong> ' + sale.producto + '</p>' +
    '<table border="1" cellpadding="6"><tr><th>Concepto</th><th>Valor</th></tr>' +
    '<tr><td>Valor producto</td><td>' + money(sale.valor) + '</td></tr>' +
    '<tr><td>Cuota inicial</td><td>' + money(sale.inicial) + '</td></tr>' +
    '<tr><td>Saldo financiado</td><td>' + money(saldoFin) + '</td></tr>' +
    '<tr><td>Ganancia</td><td>' + money(sale.ganancia) + '</td></tr>' +
    '<tr><td>Total</td><td>' + money(sale.total) + '</td></tr>' +
    '<tr><td>N° cuotas</td><td>' + sale.num_cuotas + '</td></tr>' +
    '<tr><td>Valor cuota</td><td>' + money(sale.cuota) + '</td></tr>' +
    '<tr><td>Pendiente</td><td>' + money(sale.pendiente) + '</td></tr></table>' +
    (sale.observaciones ? '<p><strong>Observaciones:</strong> ' + sale.observaciones + '</p>' : '') +
    '</body></html>';
}
