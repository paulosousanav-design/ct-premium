-- Isola dados operacionais entre o grupo interno e cada oficina cliente.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.clientes add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.parceiros add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.garantidores add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.documentos_tecnicos add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.documento_emissores add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.documento_carimbos add column if not exists organizacao_id bigint references public.saas_organizacoes(id);

-- Tudo que já existia pertence ao grupo interno, nunca aos clientes P4.
update public.clientes set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno') where organizacao_id is null;
update public.parceiros set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno') where organizacao_id is null;
update public.garantidores set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno') where organizacao_id is null;
update public.documentos_tecnicos set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno') where organizacao_id is null;
update public.documento_emissores set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno') where organizacao_id is null;
update public.documento_carimbos set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno') where organizacao_id is null;

create index if not exists clientes_organizacao_idx on public.clientes(organizacao_id);
create index if not exists parceiros_organizacao_idx on public.parceiros(organizacao_id);
create index if not exists garantidores_organizacao_idx on public.garantidores(organizacao_id);
create index if not exists documentos_tecnicos_organizacao_idx on public.documentos_tecnicos(organizacao_id);
create index if not exists documento_emissores_organizacao_idx on public.documento_emissores(organizacao_id);
create index if not exists documento_carimbos_organizacao_idx on public.documento_carimbos(organizacao_id);
