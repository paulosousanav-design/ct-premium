-- Cobranças das assinaturas CT Premium. Execute uma única vez no SQL Editor do Supabase.
create table if not exists saas_clientes (
  id bigserial primary key,
  nome text not null,
  email text not null unique,
  cnpj text,
  telefone text,
  asaas_customer_id text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists saas_assinaturas (
  id bigserial primary key,
  cliente_id bigint not null references saas_clientes(id) on delete restrict,
  plano text not null check (plano in ('ESSENCIAL', 'PROFISSIONAL', 'COMPLETO')),
  ciclo text not null check (ciclo in ('MENSAL', 'ANUAL')),
  forma_pagamento text not null check (forma_pagamento in ('PIX', 'BOLETO')),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'ATIVA', 'EM_ATRASO', 'CANCELADA', 'FALHA_CRIACAO')),
  valor numeric(12,2) not null check (valor > 0),
  proximo_vencimento date not null,
  asaas_subscription_id text unique,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists saas_cobrancas (
  id bigserial primary key,
  assinatura_id bigint not null references saas_assinaturas(id) on delete cascade,
  asaas_payment_id text not null unique,
  status text not null,
  valor numeric(12,2) not null default 0,
  vencimento date,
  invoice_url text,
  boleto_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists saas_webhook_eventos (
  id bigserial primary key,
  asaas_event_id text not null unique,
  evento text not null,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz
);

create index if not exists saas_assinaturas_cliente_idx on saas_assinaturas(cliente_id, criado_em desc);
create index if not exists saas_assinaturas_status_idx on saas_assinaturas(status, proximo_vencimento);
create index if not exists saas_cobrancas_assinatura_idx on saas_cobrancas(assinatura_id, vencimento desc);

alter table saas_clientes enable row level security;
alter table saas_assinaturas enable row level security;
alter table saas_cobrancas enable row level security;
alter table saas_webhook_eventos enable row level security;

comment on table saas_assinaturas is 'Assinaturas pagas ao CT Premium pelo Asaas; não representa o financeiro das oficinas clientes.';
