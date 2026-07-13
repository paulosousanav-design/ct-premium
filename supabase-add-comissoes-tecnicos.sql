alter table parceiros
add column if not exists comissao_pecas_percentual numeric(5,2) not null default 0,
add column if not exists comissao_mao_obra_percentual numeric(5,2) not null default 0,
add column if not exists periodicidade_comissao text not null default 'MENSAL';

create table if not exists comissao_fechamentos (
  id bigserial primary key,
  parceiro_id bigint not null references parceiros(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  periodicidade text not null,
  status text not null default 'FECHADO',
  total_pecas_venda numeric(12,2) not null default 0,
  total_mao_obra_venda numeric(12,2) not null default 0,
  total_comissao_pecas numeric(12,2) not null default 0,
  total_comissao_mao_obra numeric(12,2) not null default 0,
  total_ajustes numeric(12,2) not null default 0,
  total_comissao numeric(12,2) not null default 0,
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now(),
  pago_por_nome text,
  pago_por_email text,
  pago_em timestamptz,
  forma_pagamento text,
  observacao text,
  unique (parceiro_id, periodo_inicio, periodo_fim)
);

create table if not exists comissao_fechamento_itens (
  id bigserial primary key,
  fechamento_id bigint not null references comissao_fechamentos(id) on delete cascade,
  os_id bigint references ordens_servico(id),
  tipo text not null default 'OS',
  descricao text,
  valor_pecas_venda numeric(12,2) not null default 0,
  valor_mao_obra_venda numeric(12,2) not null default 0,
  percentual_pecas numeric(5,2) not null default 0,
  percentual_mao_obra numeric(5,2) not null default 0,
  comissao_pecas numeric(12,2) not null default 0,
  comissao_mao_obra numeric(12,2) not null default 0,
  valor_ajuste numeric(12,2) not null default 0,
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now()
);

create unique index if not exists comissao_item_os_unico
on comissao_fechamento_itens(os_id)
where os_id is not null and tipo = 'OS';

create index if not exists comissao_fechamentos_periodo_idx
on comissao_fechamentos(periodo_inicio, periodo_fim, parceiro_id);
