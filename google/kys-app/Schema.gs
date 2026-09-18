var KYS_HEADERS = {
  Usuarios: ['id', 'email', 'password_hash', 'display_name', 'role', 'is_active'],
  Clientes: ['id', 'name', 'phone', 'identification', 'email', 'address', 'raw_client_text', 'notes'],
  Cuentas: ['id', 'name', 'account_type', 'notes'],
  Ventas: [
    'id', 'client_id', 'seller_id', 'purchase_account_id', 'product_description', 'sold_at', 'delivered_at',
    'cost_price', 'margin_rate', 'down_payment', 'profit', 'total_charge', 'installment_count', 'installment_amount',
    'payment_period', 'due_rule', 'amount_paid', 'balance_pending', 'purchase_url', 'card_installment_note',
    'record_status',
  ],
  Cuotas: ['id', 'sale_id', 'sequence', 'amount', 'due_date', 'status', 'amount_paid'],
  Pagos: ['id', 'sale_id', 'installment_id', 'collection_account_id', 'recorded_by_id', 'amount', 'paid_at', 'notes'],
};
