alter table usuarios add column if not exists porcentaje_comision numeric not null default 0;

create table if not exists pagos_comision_vendedor (
  id bigserial primary key,
  vendedor_id bigint not null references usuarios (id) on delete cascade,
  monto numeric not null,
  fecha_pago date,
  notas text,
  registrado_por_id bigint references usuarios (id)
);

create index if not exists idx_pagos_comision_vendedor on pagos_comision_vendedor (vendedor_id);
