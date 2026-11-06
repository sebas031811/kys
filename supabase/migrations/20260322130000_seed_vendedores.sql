-- Vendedores (contraseña: admin123, mismo hash que admin)
insert into usuarios (email, password_hash, nombre_visible, rol, activo)
values
  ('vivi@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Vivi', 'seller', true),
  ('sebas@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Sebas', 'seller', true),
  ('karen@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Karen', 'seller', true),
  ('otro@kyscred.com', 'vZ6Z1g1T9peN4RLda6Lt4+YkHyfBu/dBm+9WhvZl2mc=', 'Otro', 'seller', true)
on conflict (email) do nothing;
