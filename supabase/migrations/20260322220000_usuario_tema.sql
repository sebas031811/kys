alter table usuarios add column if not exists tema text not null default 'dark'
  check (tema in ('dark', 'light'));
