create table if not exists vendas (
  id bigserial primary key,
  numero_venda text unique,
  cliente_id bigint references clientes(id),
  unidade_id bigint,
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  forma_recebimento text not null,
  status text not null default 'PAGO',
  observacao text,
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now(),
  cancelado_por_nome text,
  cancelado_por_email text,
  cancelado_em timestamptz,
  cancelamento_motivo text
);

create table if not exists venda_itens (
  id bigserial primary key,
  venda_id bigint not null references vendas(id) on delete cascade,
  peca_id bigint not null references pecas(id),
  descricao text not null,
  codigo text,
  quantidade numeric(12,3) not null,
  valor_custo_unitario numeric(12,2) not null default 0,
  valor_unitario numeric(12,2) not null,
  desconto numeric(12,2) not null default 0,
  total_item numeric(12,2) not null
);

alter table pecas_movimentacoes
add column if not exists venda_id bigint references vendas(id);

create index if not exists vendas_criado_em_idx on vendas(criado_em desc);
create index if not exists venda_itens_venda_idx on venda_itens(venda_id);
