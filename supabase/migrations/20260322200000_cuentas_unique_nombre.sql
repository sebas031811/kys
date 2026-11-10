-- Merge duplicate cuentas (same name ignoring case/spaces), keep lowest id.
do $$
declare
  grp record;
  keep_id bigint;
  dup_id bigint;
begin
  for grp in
    select lower(trim(nombre)) as nk, array_agg(id order by id) as ids
    from cuentas
    group by lower(trim(nombre))
    having count(*) > 1
  loop
    keep_id := grp.ids[1];
    for i in 2..array_length(grp.ids, 1) loop
      dup_id := grp.ids[i];
      update ventas set cuenta_compra_id = keep_id where cuenta_compra_id = dup_id;
      update pagos set cuenta_cobro_id = keep_id where cuenta_cobro_id = dup_id;
      delete from cuentas where id = dup_id;
    end loop;
  end loop;
end $$;

create unique index if not exists idx_cuentas_nombre_unique
  on cuentas (lower(trim(nombre)));
