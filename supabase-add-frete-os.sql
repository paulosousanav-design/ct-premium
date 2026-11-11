-- Frete de peças enviadas ao parceiro, como despesa interna da OS.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.ordens_servico
  add column if not exists valor_frete numeric(14,2) not null default 0;
