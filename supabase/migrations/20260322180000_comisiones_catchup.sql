-- Ejecutar en SQL Editor si faltaron migraciones de comisiones (orden seguro, repetible).

create table if not exists pagos_comision_vendedor (
  id bigserial primary key,
  vendedor_id bigint not null references usuarios (id) on delete cascade,
  monto numeric not null,
  fecha_pago date,
  notas text,
  registrado_por_id bigint references usuarios (id)
);

create index if not exists idx_pagos_comision_vendedor on pagos_comision_vendedor (vendedor_id);

alter table ventas add column if not exists porcentaje_comision numeric not null default 30;

alter table usuarios add column if not exists comision_pagada numeric not null default 0;

alter table usuarios drop column if exists porcentaje_comision;

alter table ventas drop column if exists ganancia_vivi;
alter table ventas drop column if exists abonado_vivi;

update usuarios u
set comision_pagada = coalesce((
  select sum(p.monto) from pagos_comision_vendedor p where p.vendedor_id = u.id
), 0);
