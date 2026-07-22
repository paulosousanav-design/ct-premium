-- CT Premium - metas gerenciais dos KPIs
-- Execute uma unica vez no SQL Editor do Supabase.

alter table public.empresas
add column if not exists kpi_meta_sla_percentual numeric(5,2) not null default 90,
add column if not exists kpi_meta_conclusao_dias numeric(8,2) not null default 5,
add column if not exists kpi_meta_aprovacao_percentual numeric(5,2) not null default 70,
add column if not exists kpi_meta_produtividade numeric(8,2) not null default 10,
add column if not exists kpi_meta_ticket numeric(12,2) not null default 500;

alter table public.empresas
drop constraint if exists empresas_kpi_meta_sla_percentual_check,
drop constraint if exists empresas_kpi_meta_conclusao_dias_check,
drop constraint if exists empresas_kpi_meta_aprovacao_percentual_check,
drop constraint if exists empresas_kpi_meta_produtividade_check,
drop constraint if exists empresas_kpi_meta_ticket_check;

alter table public.empresas
add constraint empresas_kpi_meta_sla_percentual_check
  check (kpi_meta_sla_percentual between 0 and 100),
add constraint empresas_kpi_meta_conclusao_dias_check
  check (kpi_meta_conclusao_dias > 0),
add constraint empresas_kpi_meta_aprovacao_percentual_check
  check (kpi_meta_aprovacao_percentual between 0 and 100),
add constraint empresas_kpi_meta_produtividade_check
  check (kpi_meta_produtividade > 0),
add constraint empresas_kpi_meta_ticket_check
  check (kpi_meta_ticket > 0);
