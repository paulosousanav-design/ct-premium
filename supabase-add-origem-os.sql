-- CT Premium - origem da OS
-- Rode este script no Supabase SQL Editor.
-- Ele identifica se a OS veio do portal do cliente, abertura interna,
-- garantia/seguradora ou avulso/admin.

alter table public.ordens_servico
add column if not exists origem_os text;

update public.ordens_servico os
set origem_os = case
  when os.garantia is true then 'GARANTIA_SEGURADORA'
  when exists (
    select 1
    from public.os_historico h
    where h.os_id = os.id
      and h.acao = 'OS_ABERTA_CLIENTE'
  ) then 'PORTAL_CLIENTE'
  else 'ABERTURA_INTERNA'
end
where os.origem_os is null
   or os.origem_os not in ('PORTAL_CLIENTE', 'ABERTURA_INTERNA', 'GARANTIA_SEGURADORA', 'AVULSO_ADMIN');

alter table public.ordens_servico
alter column origem_os set default 'ABERTURA_INTERNA';

alter table public.ordens_servico
alter column origem_os set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ordens_servico_origem_os_check'
  ) then
    alter table public.ordens_servico
    add constraint ordens_servico_origem_os_check
    check (origem_os in ('PORTAL_CLIENTE', 'ABERTURA_INTERNA', 'GARANTIA_SEGURADORA', 'AVULSO_ADMIN'));
  end if;
end $$;

create index if not exists idx_ordens_servico_origem_os
on public.ordens_servico (origem_os);
