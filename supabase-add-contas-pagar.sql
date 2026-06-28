create table if not exists contas_pagar (
  id bigserial primary key,
  descricao text not null,
  fornecedor text,
  categoria text not null default 'OPERACIONAL',
  valor numeric(12, 2) not null default 0,
  vencimento date,
  status text not null default 'PENDENTE',
  forma_pagamento text,
  pago_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table financeiro_historico
add column if not exists conta_id bigint references contas_pagar(id);
