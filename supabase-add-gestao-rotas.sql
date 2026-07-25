create table if not exists rotas (
  id bigserial primary key,
  numero_rota text unique,
  unidade_id bigint not null references unidades(id),
  origem text not null,
  destino text not null,
  data_inicio date not null,
  data_fim date,
  parceiro_id bigint references parceiros(id),
  motorista_nome text,
  veiculo text,
  km_total numeric(12,2) not null default 0 check (km_total >= 0),
  metodo_rateio text not null default 'RECEITA'
    check (metodo_rateio in ('IGUAL', 'RECEITA', 'QUILOMETRAGEM')),
  status text not null default 'PLANEJADA'
    check (status in ('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  observacao text,
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now(),
  atualizado_por_nome text,
  atualizado_por_email text,
  atualizado_em timestamptz not null default now()
);

create table if not exists rota_despesas (
  id bigserial primary key,
  rota_id bigint not null references rotas(id) on delete cascade,
  tipo text not null
    check (tipo in ('COMBUSTIVEL', 'PEDAGIO', 'ALIMENTACAO', 'HOSPEDAGEM', 'ESTACIONAMENTO', 'OUTRA')),
  descricao text,
  valor numeric(12,2) not null check (valor > 0),
  data_despesa date not null default current_date,
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now()
);

create table if not exists rota_ordens (
  id bigserial primary key,
  rota_id bigint not null references rotas(id) on delete cascade,
  os_id bigint not null references ordens_servico(id) on delete cascade,
  finalidade text not null default 'ATENDIMENTO'
    check (finalidade in ('COLETA', 'ATENDIMENTO', 'ENTREGA', 'RETORNO', 'OUTRA')),
  km_referencia numeric(12,2) not null default 0 check (km_referencia >= 0),
  receita_referencia numeric(12,2) not null default 0,
  percentual_rateio numeric(9,6) not null default 0,
  custo_rateado numeric(12,2) not null default 0,
  vinculado_por_nome text not null,
  vinculado_por_email text not null,
  vinculado_em timestamptz not null default now(),
  unique (rota_id, os_id)
);

alter table rota_ordens
add column if not exists finalidade text not null default 'ATENDIMENTO';

alter table rota_ordens
drop constraint if exists rota_ordens_os_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rota_ordens_finalidade_check'
      and conrelid = 'rota_ordens'::regclass
  ) then
    alter table rota_ordens
    add constraint rota_ordens_finalidade_check
    check (finalidade in ('COLETA', 'ATENDIMENTO', 'ENTREGA', 'RETORNO', 'OUTRA'));
  end if;
end
$$;

create index if not exists rotas_unidade_data_idx
on rotas (unidade_id, data_inicio desc);

create index if not exists rota_despesas_rota_idx
on rota_despesas (rota_id, data_despesa);

create index if not exists rota_ordens_rota_idx
on rota_ordens (rota_id);

create index if not exists rota_ordens_os_idx
on rota_ordens (os_id);

alter table rotas enable row level security;
alter table rota_despesas enable row level security;
alter table rota_ordens enable row level security;

comment on table rotas is 'Viagens operacionais que agrupam varias ordens de servico.';
comment on table rota_despesas is 'Despesas registradas uma unica vez por viagem.';
comment on table rota_ordens is 'Vinculo e custo da rota rateado para cada ordem de servico.';
