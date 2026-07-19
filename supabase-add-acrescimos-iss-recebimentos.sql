-- Juros, multa, desconto e ISS retido nos recebimentos de clientes.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.ordens_servico
  add column if not exists juros_recebidos_cliente numeric(14,2) not null default 0,
  add column if not exists multa_recebida_cliente numeric(14,2) not null default 0,
  add column if not exists iss_retido_cliente numeric(14,2) not null default 0;

alter table public.recebimento_parcelas
  add column if not exists juros numeric(14,2) not null default 0,
  add column if not exists multa numeric(14,2) not null default 0,
  add column if not exists desconto_baixa numeric(14,2) not null default 0,
  add column if not exists iss_retido numeric(14,2) not null default 0,
  add column if not exists valor_recebido numeric(14,2);

alter table public.financeiro_historico
  add column if not exists valor_principal numeric(14,2),
  add column if not exists juros numeric(14,2) not null default 0,
  add column if not exists multa numeric(14,2) not null default 0,
  add column if not exists desconto numeric(14,2) not null default 0,
  add column if not exists iss_retido numeric(14,2) not null default 0,
  add column if not exists valor_liquido numeric(14,2);

-- Consolida baixas antigas que usavam apenas o status RECEBIDO.
update public.ordens_servico
set valor_recebido_cliente = greatest(
  coalesce(cliente_total, total, 0) - coalesce(desconto_recebimento_cliente, 0),
  0
)
where status_financeiro = 'RECEBIDO'
  and coalesce(valor_recebido_cliente, 0) = 0
  and coalesce(iss_retido_cliente, 0) = 0;

comment on column public.ordens_servico.valor_recebido_cliente is
  'Valor principal efetivamente recebido do cliente, sem juros, multa ou ISS retido.';
comment on column public.ordens_servico.iss_retido_cliente is
  'Valor de ISS retido pelo tomador que compoe a quitacao da OS sem entrada no caixa.';
comment on column public.recebimento_parcelas.valor_recebido is
  'Valor efetivamente recebido no caixa: principal + juros + multa.';
