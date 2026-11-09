alter table ventas add column if not exists porcentaje_comision numeric not null default 30;

update ventas set porcentaje_comision = 30 where porcentaje_comision is null;
