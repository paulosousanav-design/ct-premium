-- Empresas do grupo: use este arquivo depois de supabase-add-unidades.sql.
-- Cada registro em "unidades" passa a representar uma empresa/CNPJ independente.
-- Não altera saldos, custos, OS ou financeiro existentes.

begin;

alter table public.unidades
  add column if not exists regime_tributario text,
  add column if not exists crt text,
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_municipal text,
  add column if not exists empresa_principal boolean not null default false;

alter table public.unidades drop constraint if exists unidades_tipo_check;
update public.unidades set tipo = 'EMPRESA' where tipo <> 'EMPRESA';
alter table public.unidades
  add constraint unidades_tipo_check check (tipo = 'EMPRESA');

alter table public.unidades drop constraint if exists unidades_regime_tributario_check;
alter table public.unidades
  add constraint unidades_regime_tributario_check
  check (regime_tributario is null or regime_tributario in ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'OUTRO'));

drop index if exists public.unidades_unica_matriz_idx;
create unique index if not exists unidades_uma_principal_idx
  on public.unidades (empresa_principal) where empresa_principal;
create unique index if not exists unidades_cnpj_unico_idx
  on public.unidades (regexp_replace(cnpj, '[^0-9]', '', 'g'))
  where nullif(regexp_replace(cnpj, '[^0-9]', '', 'g'), '') is not null;

-- A empresa já existente continua sendo a principal até você cadastrar e marcar
-- a Smart Electro como principal na tela Empresas do grupo.
update public.unidades
set empresa_principal = true
where id = (
  select id from public.unidades
  where ativa = true
  order by id
  limit 1
) and not exists (select 1 from public.unidades where empresa_principal);

create or replace function public.unidade_principal_id()
returns bigint language sql stable as $$
  select id from public.unidades
  where ativa = true
  order by empresa_principal desc, id
  limit 1
$$;

-- Compatibilidade com os defaults já instalados pelas migrações anteriores.
create or replace function public.unidade_matriz_id()
returns bigint language sql stable as $$
  select public.unidade_principal_id()
$$;

commit;

-- Próximo passo operacional: editar a empresa atual para Eletrônica Paulista,
-- cadastrar a Smart Electro e marcá-la como Empresa principal. O estoque atual
-- não é duplicado nem transferido automaticamente: ele deve ser conferido antes
-- de qualquer saldo ser lançado para a segunda empresa.
