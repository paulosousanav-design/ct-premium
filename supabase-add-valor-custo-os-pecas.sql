alter table os_pecas
add column if not exists valor_custo numeric(12, 2) not null default 0;

update os_pecas
set valor_custo = 0
where valor_custo is null;
