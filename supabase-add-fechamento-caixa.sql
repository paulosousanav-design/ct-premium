-- Fechamento de caixa, contas bancarias, operadoras e taxas de cartao.
-- Execute este arquivo uma unica vez no SQL Editor do Supabase.

create table if not exists contas_financeiras (
  id bigserial primary key,
  unidade_id bigint not null references unidades(id),
  nome text not null,
  tipo text not null check (tipo in ('CAIXA', 'BANCO', 'CARTEIRA_DIGITAL', 'ADQUIRENTE')),
  banco text,
  agencia text,
  numero_conta text,
  chave_pix text,
  saldo_inicial numeric(14,2) not null default 0,
  ativa boolean not null default true,
  padrao_dinheiro boolean not null default false,
  observacao text,
  criado_por_id bigint references admin_usuarios(id),
  criado_por_nome text,
  criado_por_email text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists contas_financeiras_nome_unidade_idx
on contas_financeiras(unidade_id, lower(nome));

create unique index if not exists contas_financeiras_padrao_dinheiro_idx
on contas_financeiras(unidade_id) where padrao_dinheiro and ativa;

insert into contas_financeiras (unidade_id, nome, tipo, padrao_dinheiro, observacao)
select u.id, 'Caixa fisico', 'CAIXA', true, 'Conta criada automaticamente para dinheiro em especie.'
from unidades u
where not exists (
  select 1 from contas_financeiras c where c.unidade_id = u.id and c.tipo = 'CAIXA'
);

create table if not exists operadoras_cartao (
  id bigserial primary key,
  unidade_id bigint not null references unidades(id),
  nome text not null,
  conta_recebimento_id bigint references contas_financeiras(id),
  ativa boolean not null default true,
  observacao text,
  criado_por_id bigint references admin_usuarios(id),
  criado_por_nome text,
  criado_por_email text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, nome)
);

create table if not exists operadoras_cartao_taxas (
  id bigserial primary key,
  operadora_id bigint not null references operadoras_cartao(id) on delete cascade,
  modalidade text not null check (modalidade in ('DEBITO', 'CREDITO', 'PIX')),
  parcelas_de integer not null default 1 check (parcelas_de between 1 and 24),
  parcelas_ate integer not null default 1 check (parcelas_ate between 1 and 24 and parcelas_ate >= parcelas_de),
  taxa_percentual numeric(7,4) not null default 0 check (taxa_percentual >= 0 and taxa_percentual <= 100),
  taxa_fixa numeric(12,2) not null default 0 check (taxa_fixa >= 0),
  prazo_dias integer not null default 1 check (prazo_dias between 0 and 365),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (operadora_id, modalidade, parcelas_de, parcelas_ate)
);

create table if not exists movimentos_financeiros (
  id bigserial primary key,
  unidade_id bigint not null references unidades(id),
  conta_financeira_id bigint not null references contas_financeiras(id),
  conta_contrapartida_id bigint references contas_financeiras(id),
  natureza text not null check (natureza in ('ENTRADA', 'SAIDA')),
  tipo text not null,
  forma text not null,
  valor_bruto numeric(14,2) not null check (valor_bruto >= 0),
  taxa_valor numeric(14,2) not null default 0 check (taxa_valor >= 0),
  valor_liquido numeric(14,2) not null,
  operadora_id bigint references operadoras_cartao(id),
  taxa_id bigint references operadoras_cartao_taxas(id),
  taxa_percentual numeric(7,4) not null default 0,
  parcelas integer not null default 1,
  data_competencia date not null default current_date,
  previsao_credito date,
  efetivado_em timestamptz not null default now(),
  origem_tipo text,
  origem_id text,
  grupo_transferencia uuid,
  descricao text not null,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ESTORNADO')),
  criado_por_id bigint references admin_usuarios(id),
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now(),
  estornado_em timestamptz,
  estorno_motivo text
);

create index if not exists movimentos_financeiros_conta_data_idx
on movimentos_financeiros(conta_financeira_id, efetivado_em desc);
create index if not exists movimentos_financeiros_origem_idx
on movimentos_financeiros(origem_tipo, origem_id);

create table if not exists caixa_sessoes (
  id bigserial primary key,
  unidade_id bigint not null references unidades(id),
  conta_caixa_id bigint references contas_financeiras(id),
  data_operacao date not null default current_date,
  status text not null default 'ABERTO' check (status in ('ABERTO', 'FECHADO')),
  saldo_inicial_dinheiro numeric(12,2) not null default 0 check (saldo_inicial_dinheiro >= 0),
  aberto_por_id bigint references admin_usuarios(id),
  aberto_por_nome text not null,
  aberto_por_email text not null,
  aberto_em timestamptz not null default now(),
  fechado_por_id bigint references admin_usuarios(id),
  fechado_por_nome text,
  fechado_por_email text,
  fechado_em timestamptz,
  dinheiro_esperado numeric(12,2),
  dinheiro_contado numeric(12,2),
  diferenca_dinheiro numeric(12,2),
  total_entradas numeric(12,2),
  total_saidas numeric(12,2),
  resultado_liquido numeric(12,2),
  resumo_fechamento jsonb,
  observacao_abertura text,
  observacao_fechamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists caixa_sessao_aberta_unidade_idx
on caixa_sessoes(unidade_id) where status = 'ABERTO';
create index if not exists caixa_sessoes_unidade_data_idx
on caixa_sessoes(unidade_id, aberto_em desc);

create table if not exists caixa_movimentos (
  id bigserial primary key,
  sessao_id bigint not null references caixa_sessoes(id) on delete restrict,
  unidade_id bigint not null references unidades(id),
  conta_financeira_id bigint references contas_financeiras(id),
  tipo text not null check (tipo in ('SANGRIA', 'SUPRIMENTO', 'ENTRADA_MANUAL', 'SAIDA_MANUAL')),
  natureza text not null check (natureza in ('ENTRADA', 'SAIDA')),
  forma text not null default 'DINHEIRO',
  valor numeric(12,2) not null check (valor > 0),
  descricao text not null,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ESTORNADO')),
  criado_por_id bigint references admin_usuarios(id),
  criado_por_nome text not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now(),
  estornado_por_id bigint references admin_usuarios(id),
  estornado_por_nome text,
  estornado_por_email text,
  estornado_em timestamptz,
  estorno_motivo text
);
create index if not exists caixa_movimentos_sessao_idx on caixa_movimentos(sessao_id, criado_em);

alter table if exists caixa_sessoes add column if not exists conta_caixa_id bigint references contas_financeiras(id);
alter table if exists caixa_movimentos add column if not exists conta_financeira_id bigint references contas_financeiras(id);

alter table if exists financeiro_historico add column if not exists conta_financeira_id bigint references contas_financeiras(id);
alter table if exists financeiro_historico add column if not exists operadora_id bigint references operadoras_cartao(id);
alter table if exists financeiro_historico add column if not exists taxa_cartao numeric(12,2) not null default 0;
alter table if exists financeiro_historico add column if not exists parcelas_cartao integer not null default 1;
alter table if exists vendas add column if not exists conta_financeira_id bigint references contas_financeiras(id);
alter table if exists vendas add column if not exists operadora_id bigint references operadoras_cartao(id);
alter table if exists vendas add column if not exists taxa_cartao numeric(12,2) not null default 0;
alter table if exists vendas add column if not exists valor_liquido numeric(12,2);
alter table if exists vendas add column if not exists parcelas_cartao integer not null default 1;
alter table if exists contas_pagar add column if not exists conta_financeira_id bigint references contas_financeiras(id);
alter table if exists recebimento_parcelas add column if not exists conta_financeira_id bigint references contas_financeiras(id);
alter table if exists recebimentos_lotes add column if not exists conta_financeira_id bigint references contas_financeiras(id);
alter table if exists comissao_fechamentos add column if not exists conta_financeira_id bigint references contas_financeiras(id);

alter table contas_financeiras enable row level security;
alter table operadoras_cartao enable row level security;
alter table operadoras_cartao_taxas enable row level security;
alter table movimentos_financeiros enable row level security;
alter table caixa_sessoes enable row level security;
alter table caixa_movimentos enable row level security;

do $$
declare tabela text;
begin
  if exists (select 1 from pg_proc where proname = 'auditoria_registrar_alteracao') then
    foreach tabela in array array['contas_financeiras','operadoras_cartao','operadoras_cartao_taxas','movimentos_financeiros','caixa_sessoes','caixa_movimentos'] loop
      execute format('drop trigger if exists auditoria_%I on %I', tabela, tabela);
      execute format('create trigger auditoria_%I after insert or update or delete on %I for each row execute function auditoria_registrar_alteracao()', tabela, tabela);
    end loop;
  end if;
end $$;
