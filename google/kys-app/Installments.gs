function applyAmountToSchedule_(installments, totalCollected) {
  var q = KYS_FIELDS.CUOTA;
  var sorted = installments.slice().sort(function (a, b) {
    return Number(a.numero_cuota != null ? a.numero_cuota : a.sequence) -
      Number(b.numero_cuota != null ? b.numero_cuota : b.sequence);
  });
  sorted.forEach(function (inst) {
    inst.monto_pagado = 0;
    inst.amount_paid = 0;
    inst.estado = KYS_ESTADO_CUOTA_.pending;
    inst.status = 'pending';
  });

  var remaining = Math.max(num_(totalCollected), 0);
  sorted.forEach(function (inst) {
    var amt = num_(inst.monto != null ? inst.monto : inst.amount);
    var paid = num_(inst.monto_pagado != null ? inst.monto_pagado : inst.amount_paid);
    var due = amt - paid;
    if (due <= 0) return;
    var applied = Math.min(remaining, due);
    if (applied <= 0) return;
    inst.monto_pagado = paid + applied;
    inst.amount_paid = inst.monto_pagado;
    remaining -= applied;
    if (inst.monto_pagado >= amt - 0.01) {
      inst.estado = KYS_ESTADO_CUOTA_.paid;
      inst.status = 'paid';
      inst.monto_pagado = amt;
      inst.amount_paid = amt;
    } else {
      inst.estado = KYS_ESTADO_CUOTA_.partial;
      inst.status = 'partial';
    }
  });

  var amountPaid = 0;
  sorted.forEach(function (i) {
    amountPaid += num_(i.monto_pagado != null ? i.monto_pagado : i.amount_paid);
  });
  return { installments: sorted, amount_paid: Math.round(amountPaid * 100) / 100, valor_abonado: Math.round(amountPaid * 100) / 100 };
}

function totalPaymentsForSale_(saleId) {
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.PAYMENTS));
  var sum = 0;
  rows.forEach(function (p) {
    var vid = p.venta_id != null ? p.venta_id : p.sale_id;
    if (Number(vid) === Number(saleId)) sum += num_(p.monto != null ? p.monto : p.amount);
  });
  return Math.round(sum * 100) / 100;
}

function loadInstallmentsForSale_(saleId) {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.INSTALLMENTS))
    .filter(function (r) {
      var vid = r.venta_id != null ? r.venta_id : r.sale_id;
      return Number(vid) === Number(saleId);
    })
    .sort(function (a, b) {
      return Number(a.numero_cuota != null ? a.numero_cuota : a.sequence) -
        Number(b.numero_cuota != null ? b.numero_cuota : b.sequence);
    })
    .map(installmentOut_);
}

function installmentOut_(row) {
  var num = row.numero_cuota != null ? row.numero_cuota : row.sequence;
  return {
    id: Number(row.id),
    numero_cuota: Number(num),
    monto: num_(row.monto != null ? row.monto : row.amount),
    fecha_vencimiento: row.fecha_vencimiento || row.due_date || null,
    estado: mapEstadoCuotaFromSheet_(row.estado || row.status),
    monto_pagado: num_(row.monto_pagado != null ? row.monto_pagado : row.amount_paid),
  };
}

function saveInstallmentsForSale_(saleId, installmentRows) {
  var sh = getSheet_(KYS_CONFIG.SHEETS.INSTALLMENTS);
  var q = KYS_FIELDS.CUOTA;
  deleteWhere_(sh, function (r) {
    var vid = r.venta_id != null ? r.venta_id : r.sale_id;
    return Number(vid) === Number(saleId);
  });
  installmentRows.forEach(function (row) {
    var seq = row.numero_cuota != null ? row.numero_cuota : row.sequence;
    appendObject_(sh, {
      venta_id: saleId,
      numero_cuota: seq,
      monto: row.monto != null ? row.monto : row.amount,
      fecha_vencimiento: row.fecha_vencimiento || row.due_date,
      estado: mapEstadoCuotaToSheet_(row.estado || row.status),
      monto_pagado: row.monto_pagado != null ? row.monto_pagado : row.amount_paid,
    });
  });
}

function rebuildInstallmentsForSale_(sale) {
  var start = sale.fecha_entrega || sale.delivered_at || sale.fecha_venta || sale.sold_at || todayIso_();
  var rows = [];
  var inicial = num_(sale.inicial != null ? sale.inicial : sale.down_payment);
  if (inicial > 0) {
    rows.push({
      numero_cuota: 0,
      monto: inicial,
      fecha_vencimiento: sale.fecha_venta || sale.sold_at || start,
      estado: 'pendiente',
      monto_pagado: 0,
    });
  }
  var schedule = buildInstallmentSchedule_(
    start,
    Number(sale.num_cuotas != null ? sale.num_cuotas : sale.installment_count) || 1,
    num_(sale.cuota != null ? sale.cuota : sale.installment_amount),
    sale.periodo_pago || sale.payment_period || 'Mensual',
    sale.fecha_cuota || sale.due_rule
  );
  schedule.forEach(function (s) {
    rows.push({
      numero_cuota: s.sequence,
      monto: s.amount,
      fecha_vencimiento: s.due_date,
      estado: 'pendiente',
      monto_pagado: 0,
    });
  });
  return rows;
}
