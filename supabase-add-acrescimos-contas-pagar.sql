-- Juros, multa e desconto na baixa de contas a pagar.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.contas_pagar
  add column if not exists juros numeric(14,2) not null default 0 check (juros >= 0),
  add column if not exists multa numeric(14,2) not null default 0 check (multa >= 0),
  add column if not exists desconto numeric(14,2) not null default 0 check (desconto >= 0),
  add column if not exists valor_pago numeric(14,2);

update public.contas_pagar
set valor_pago = valor
where upper(coalesce(status, '')) = 'PAGO'
  and valor_pago is null;

comment on column public.contas_pagar.valor is
  'Valor original da conta antes de juros, multa e desconto.';
comment on column public.contas_pagar.juros is
  'Juros efetivamente pagos na baixa.';
comment on column public.contas_pagar.multa is
  'Multa efetivamente paga na baixa.';
comment on column public.contas_pagar.desconto is
  'Desconto obtido no pagamento.';
comment on column public.contas_pagar.valor_pago is
  'Total efetivamente pago: valor original + juros + multa - desconto.';
