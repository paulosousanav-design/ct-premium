create or replace function unidade_matriz_id()
returns bigint
language sql
stable
as $$
  select id from unidades where tipo = 'MATRIZ' limit 1
$$;

alter table ordens_servico
add column if not exists unidade_id bigint references unidades(id);

alter table pecas
add column if not exists unidade_id bigint references unidades(id);

alter table pecas_movimentacoes
add column if not exists unidade_id bigint references unidades(id);

alter table vendas
add column if not exists unidade_id bigint references unidades(id);

update ordens_servico
set unidade_id = unidade_matriz_id()
where unidade_id is null;

update pecas
set unidade_id = unidade_matriz_id()
where unidade_id is null;

update pecas_movimentacoes movimento
set unidade_id = coalesce(
  (select peca.unidade_id from pecas peca where peca.id = movimento.peca_id),
  (select os.unidade_id from ordens_servico os where os.id = movimento.os_id),
  unidade_matriz_id()
)
where movimento.unidade_id is null;

update vendas
set unidade_id = unidade_matriz_id()
where unidade_id is null;

alter table ordens_servico
alter column unidade_id set default unidade_matriz_id(),
alter column unidade_id set not null;

alter table pecas
alter column unidade_id set default unidade_matriz_id(),
alter column unidade_id set not null;

alter table pecas_movimentacoes
alter column unidade_id set default unidade_matriz_id(),
alter column unidade_id set not null;

alter table vendas
alter column unidade_id set default unidade_matriz_id(),
alter column unidade_id set not null;

create index if not exists ordens_servico_unidade_idx
on ordens_servico (unidade_id, created_at desc);

create index if not exists pecas_unidade_idx
on pecas (unidade_id, descricao);

create index if not exists pecas_movimentacoes_unidade_idx
on pecas_movimentacoes (unidade_id, criado_em desc);

create index if not exists vendas_unidade_idx
on vendas (unidade_id, criado_em desc);
