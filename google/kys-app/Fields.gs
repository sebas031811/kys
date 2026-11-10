/** Column keys for Google Sheet row 1 (Spanish, aligned with Ventas-a-Credito.xlsx). */
var KYS_FIELDS = {
  USUARIO: {
    id: 'id',
    email: 'email',
    password_hash: 'password_hash',
    nombre_visible: 'nombre_visible',
    rol: 'rol',
    activo: 'activo',
  },
  CLIENTE: {
    id: 'id',
    nombre: 'nombre',
    telefono: 'telefono',
    identificacion: 'identificacion',
    email: 'email',
    direccion: 'direccion',
    texto_cliente: 'texto_cliente',
    notas: 'notas',
  },
  CUENTA: {
    id: 'id',
    nombre: 'nombre',
    tipo_cuenta: 'tipo_cuenta',
    saldo_inicial: 'saldo_inicial',
    notas: 'notas',
  },
  VENTA: {
    id: 'id',
    cliente_id: 'cliente_id',
    vendedor_id: 'vendedor_id',
    cuenta_compra_id: 'cuenta_compra_id',
    producto: 'producto',
    fecha_venta: 'fecha_venta',
    fecha_cotizacion: 'fecha_cotizacion',
    fecha_entrega: 'fecha_entrega',
    valor: 'valor',
    porcentaje: 'porcentaje',
    inicial: 'inicial',
    ganancia: 'ganancia',
    porcentaje_comision: 'porcentaje_comision',
    total: 'total',
    num_cuotas: 'num_cuotas',
    cuota: 'cuota',
    periodo_pago: 'periodo_pago',
    fecha_cuota: 'fecha_cuota',
    valor_abonado: 'valor_abonado',
    pendiente: 'pendiente',
    compra: 'compra',
    tarjeta: 'tarjeta',
    cuota_tarjeta: 'cuota_tarjeta',
    cuotas_pagadas: 'cuotas_pagadas',
    observaciones: 'observaciones',
    estado_registro: 'estado_registro',
  },
  CUOTA: {
    id: 'id',
    venta_id: 'venta_id',
    numero_cuota: 'numero_cuota',
    monto: 'monto',
    fecha_vencimiento: 'fecha_vencimiento',
    estado: 'estado',
    monto_pagado: 'monto_pagado',
    fecha_pago: 'fecha_pago',
  },
  PAGO: {
    id: 'id',
    venta_id: 'venta_id',
    cuota_id: 'cuota_id',
    cuenta_cobro_id: 'cuenta_cobro_id',
    registrado_por_id: 'registrado_por_id',
    monto: 'monto',
    fecha_pago: 'fecha_pago',
    notas: 'notas',
  },
};

var KYS_LEGACY_HEADER_MAP_ = {
  Usuarios: {
    display_name: 'nombre_visible',
    role: 'rol',
    is_active: 'activo',
  },
  Clientes: {
    name: 'nombre',
    phone: 'telefono',
    identification: 'identificacion',
    address: 'direccion',
    raw_client_text: 'texto_cliente',
    notes: 'notas',
  },
  Cuentas: {
    name: 'nombre',
    account_type: 'tipo_cuenta',
    opening_balance: 'saldo_inicial',
    notes: 'notas',
  },
  Ventas: {
    client_id: 'cliente_id',
    seller_id: 'vendedor_id',
    purchase_account_id: 'cuenta_compra_id',
    product_description: 'producto',
    sold_at: 'fecha_venta',
    delivered_at: 'fecha_entrega',
    cost_price: 'valor',
    margin_rate: 'porcentaje',
    down_payment: 'inicial',
    profit: 'ganancia',
    total_charge: 'total',
    installment_count: 'num_cuotas',
    installment_amount: 'cuota',
    payment_period: 'periodo_pago',
    due_rule: 'fecha_cuota',
    amount_paid: 'valor_abonado',
    balance_pending: 'pendiente',
    purchase_url: 'compra',
    card_installment_note: 'tarjeta',
    record_status: 'estado_registro',
  },
  Cuotas: {
    sale_id: 'venta_id',
    sequence: 'numero_cuota',
    amount: 'monto',
    due_date: 'fecha_vencimiento',
    status: 'estado',
    amount_paid: 'monto_pagado',
    paid_at: 'fecha_pago',
  },
  Pagos: {
    sale_id: 'venta_id',
    installment_id: 'cuota_id',
    collection_account_id: 'cuenta_cobro_id',
    recorded_by_id: 'registrado_por_id',
    amount: 'monto',
    paid_at: 'fecha_pago',
    notes: 'notas',
  },
};

var KYS_ESTADO_CUOTA_ = {
  pending: 'pendiente',
  partial: 'parcial',
  paid: 'pagada',
};

function mapEstadoCuotaToSheet_(status) {
  if (status === 'paid' || status === 'pagada') return KYS_ESTADO_CUOTA_.paid;
  if (status === 'partial' || status === 'parcial') return KYS_ESTADO_CUOTA_.partial;
  return KYS_ESTADO_CUOTA_.pending;
}

function mapEstadoCuotaFromSheet_(status) {
  var s = String(status || '').toLowerCase();
  if (s === 'pagada' || s === 'paid') return 'pagada';
  if (s === 'parcial' || s === 'partial') return 'parcial';
  return 'pendiente';
}

function ventaHeaders_() {
  var v = KYS_FIELDS.VENTA;
  return [
    v.id, v.cliente_id, v.vendedor_id, v.cuenta_compra_id, v.producto, v.fecha_venta, v.fecha_cotizacion,
    v.fecha_entrega, v.valor, v.porcentaje, v.inicial, v.ganancia, v.porcentaje_comision, v.total, v.num_cuotas, v.cuota,
    v.periodo_pago, v.fecha_cuota, v.valor_abonado, v.pendiente, v.compra, v.tarjeta, v.cuota_tarjeta,
    v.cuotas_pagadas, v.observaciones, v.estado_registro,
  ];
}
