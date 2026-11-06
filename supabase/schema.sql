-- KYS en Supabase (Postgres). Ejecutar en SQL Editor del proyecto Supabase.

create extension if not exists "pgcrypto";

create table if not exists usuarios (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  nombre_visible text not null,
  rol text not null default 'seller' check (rol in ('admin', 'seller')),
  activo boolean not null default true
);

create table if not exists sesiones (
  token uuid primary key default gen_random_uuid(),
  usuario_id bigint not null references usuarios (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists clientes (
  id bigserial primary key,
  nombre text not null,
  telefono text,
  identificacion text,
  email text,
  direccion text,
  texto_cliente text,
  notas text
);

create table if not exists cuentas (
  id bigserial primary key,
  nombre text not null,
  tipo_cuenta text not null default 'both',
  saldo_inicial numeric not null default 0,
  notas text
);

create table if not exists ventas (
  id bigserial primary key,
  cliente_id bigint references clientes (id),
  vendedor_id bigint references usuarios (id),
  cuenta_compra_id bigint references cuentas (id),
  producto text,
  fecha_venta date,
  fecha_cotizacion date,
  fecha_entrega date,
  valor numeric not null default 0,
  porcentaje numeric not null default 0,
  inicial numeric not null default 0,
  ganancia numeric not null default 0,
  total numeric not null default 0,
  num_cuotas int not null default 1,
  cuota numeric not null default 0,
  periodo_pago text default 'Mensual',
  fecha_cuota text,
  valor_abonado numeric not null default 0,
  pendiente numeric not null default 0,
  compra text,
  tarjeta text,
  cuota_tarjeta text,
  ganancia_vivi numeric default 0,
  abonado_vivi numeric default 0,
  cuotas_pagadas numeric default 0,
  observaciones text,
  estado_registro text not null default 'venta' check (estado_registro in ('venta', 'cotizacion'))
);

create table if not exists cuotas (
  id bigserial primary key,
  venta_id bigint not null references ventas (id) on delete cascade,
  numero_cuota int not null,
  monto numeric not null,
  fecha_vencimiento date,
  estado text not null default 'pendiente',
  monto_pagado numeric not null default 0,
  fecha_pago date
);

create table if not exists pagos (
  id bigserial primary key,
  venta_id bigint not null references ventas (id) on delete cascade,
  cuota_id bigint,
  cuenta_cobro_id bigint references cuentas (id),
  registrado_por_id bigint references usuarios (id),
  monto numeric not null,
  fecha_pago date,
  notas text
);

create index if not exists idx_cuotas_venta on cuotas (venta_id);
create index if not exists idx_pagos_venta on pagos (venta_id);
create index if not exists idx_ventas_estado on ventas (estado_registro);

-- Admin inicial (misma contraseña que Google: admin123)
insert into usuarios (email, password_hash, nombre_visible, rol, activo)
values (
  'admin@kyscred.com',
  'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=',
  'Admin',
  'admin',
  true
)
on conflict (email) do nothing;

insert into usuarios (email, password_hash, nombre_visible, rol, activo)
values
  ('vivi@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Vivi', 'seller', true),
  ('sebas@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Sebas', 'seller', true),
  ('karen@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Karen', 'seller', true),
  ('otro@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Otro', 'seller', true)
on conflict (email) do nothing;

-- Proyectos creados antes de cuotas.fecha_pago: ejecutar en SQL Editor (seguro repetir):
-- alter table cuotas add column if not exists fecha_pago date;
