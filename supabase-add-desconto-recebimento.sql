alter table public.ordens_servico
add column if not exists desconto_recebimento_cliente numeric(12,2) not null default 0;

update public.ordens_servico
set desconto_recebimento_cliente = 0
where desconto_recebimento_cliente is null;
