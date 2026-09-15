-- Base multiempresa para clientes externos do CT Premium.
-- Execute uma única vez no SQL Editor do Supabase, após as migrações de unidades e assinaturas.

create table if not exists public.saas_organizacoes (
  id bigserial primary key,
  cliente_id bigint unique references public.saas_clientes(id) on delete set null,
  nome text not null,
  slug text not null unique,
  plano text not null default 'ESSENCIAL' check (plano in ('ESSENCIAL', 'PROFISSIONAL', 'COMPLETO')),
  status text not null default 'ATIVA' check (status in ('ATIVA', 'SUSPENSA', 'CANCELADA')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.unidades add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.admin_usuarios add column if not exists organizacao_id bigint references public.saas_organizacoes(id);
alter table public.admin_usuarios add column if not exists acesso_plataforma boolean not null default false;

-- A empresa principal é única dentro de cada organização, e não em toda a plataforma.
drop index if exists public.unidades_uma_principal_idx;
create unique index if not exists unidades_organizacao_uma_principal_idx
  on public.unidades (organizacao_id)
  where empresa_principal;

-- Cria a organização interna e associa os dados já existentes a ela.
insert into public.saas_organizacoes (nome, slug, plano, status)
select 'Grupo interno CT Premium', 'grupo-interno', 'COMPLETO', 'ATIVA'
where not exists (select 1 from public.saas_organizacoes where slug = 'grupo-interno');

update public.unidades
set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno')
where organizacao_id is null;

update public.admin_usuarios
set organizacao_id = (select id from public.saas_organizacoes where slug = 'grupo-interno')
where organizacao_id is null;

-- Usuários internos que já administram Configurações passam a poder cadastrar oficinas clientes.
update public.admin_usuarios
set acesso_plataforma = true
where coalesce(permissoes, '{}'::text[]) @> array['configuracoes']::text[];

create index if not exists unidades_organizacao_idx on public.unidades(organizacao_id);
create index if not exists admin_usuarios_organizacao_idx on public.admin_usuarios(organizacao_id);
create index if not exists saas_organizacoes_status_idx on public.saas_organizacoes(status);

alter table public.saas_organizacoes enable row level security;
