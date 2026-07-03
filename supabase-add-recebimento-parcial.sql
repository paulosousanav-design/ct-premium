alter table public.ordens_servico
add column if not exists valor_recebido_cliente numeric(12,2) not null default 0,
add column if not exists data_ultimo_recebimento timestamptz;

update public.ordens_servico
set valor_recebido_cliente = coalesce(cliente_total, total, 0),
    data_ultimo_recebimento = coalesce(data_pagamento, data_ultimo_recebimento)
where status_financeiro = 'RECEBIDO'
  and coalesce(valor_recebido_cliente, 0) = 0;

update public.ordens_servico
set status_financeiro = 'PARCIAL'
where coalesce(valor_recebido_cliente, 0) > 0
  and coalesce(valor_recebido_cliente, 0) < coalesce(cliente_total, total, 0)
  and coalesce(status_financeiro, 'PENDENTE') <> 'RECEBIDO';
