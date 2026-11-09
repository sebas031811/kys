alter table ventas add column if not exists comision_monto numeric;
alter table ventas add column if not exists clave_importacion text;

create unique index if not exists idx_ventas_clave_importacion
  on ventas (clave_importacion)
  where clave_importacion is not null;
