create table if not exists recebimento_parcelas (
  id bigserial primary key,
  os_id bigint not null references ordens_servico(id) on delete cascade,
  numero_parcela integer not null,
  total_parcelas integer not null,
  valor numeric(12,2) not null,
  vencimento date not null,
  forma_recebimento text not null default 'BOLETO',
  status text not null default 'PENDENTE',
  recebido_em timestamptz,
  criado_por text not null,
  recebido_por text,
  criado_em timestamptz not null default now(),
  observacao text,
  unique (os_id, numero_parcela, total_parcelas)
);

create index if not exists recebimento_parcelas_os_idx
on recebimento_parcelas(os_id, status, vencimento);
