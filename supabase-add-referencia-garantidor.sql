alter table if exists public.ordens_servico
  add column if not exists referencia_garantidor text;

comment on column public.ordens_servico.referencia_garantidor
  is 'Numero externo da garantia, sinistro, protocolo ou OS do garantidor/seguradora.';
