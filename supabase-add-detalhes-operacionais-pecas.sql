-- Complementa a ficha da peça com informações operacionais de compra.
-- Execute este arquivo no SQL Editor do Supabase uma única vez.

alter table public.pecas
  add column if not exists fornecedor_principal text,
  add column if not exists data_ultima_compra date,
  add column if not exists valor_ultima_compra numeric(12,2),
  add column if not exists foto_url text;

create index if not exists pecas_fornecedor_principal_idx
  on public.pecas (fornecedor_principal)
  where fornecedor_principal is not null;

comment on column public.pecas.fornecedor_principal is 'Fornecedor mais usado para reposição desta peça.';
comment on column public.pecas.data_ultima_compra is 'Data da última compra registrada da peça.';
comment on column public.pecas.valor_ultima_compra is 'Custo unitário da última compra registrada.';
comment on column public.pecas.foto_url is 'Link opcional para foto ou referência visual da peça.';
