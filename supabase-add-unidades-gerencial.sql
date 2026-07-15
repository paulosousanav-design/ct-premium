alter table contas_pagar
add column if not exists unidade_id bigint references unidades(id);

update contas_pagar
set unidade_id = unidade_matriz_id()
where unidade_id is null;

alter table contas_pagar
alter column unidade_id set default unidade_matriz_id(),
alter column unidade_id set not null;

create index if not exists contas_pagar_unidade_idx
on contas_pagar (unidade_id, vencimento);
