alter table public.empresas
add column if not exists sla_particular_dias integer not null default 3,
add column if not exists sla_garantia_dias integer not null default 7;

alter table public.empresas
drop constraint if exists empresas_sla_particular_dias_check,
drop constraint if exists empresas_sla_garantia_dias_check;

alter table public.empresas
add constraint empresas_sla_particular_dias_check check (sla_particular_dias between 1 and 365),
add constraint empresas_sla_garantia_dias_check check (sla_garantia_dias between 1 and 365);
