create table if not exists transferencias_cuenta (
  id bigserial primary key,
  cuenta_origen_id bigint not null references cuentas (id),
  cuenta_destino_id bigint not null references cuentas (id),
  monto numeric not null check (monto > 0),
  fecha date,
  notas text,
  registrado_por_id bigint references usuarios (id)
);

create index if not exists idx_transferencias_origen on transferencias_cuenta (cuenta_origen_id);
create index if not exists idx_transferencias_destino on transferencias_cuenta (cuenta_destino_id);
