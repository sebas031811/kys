-- Fecha en que se cubrió cada cuota (sync desde pagos).
alter table cuotas add column if not exists fecha_pago date;
