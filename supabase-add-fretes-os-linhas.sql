-- Uma linha por envio de peças ao parceiro.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.os_fretes (
  id bigserial primary key,
  os_id bigint not null references public.ordens_servico(id) on delete cascade,
  valor numeric(14,2) not null default 0,
  transportadora text,
  conhecimento text,
  documento text,
  criado_em timestamptz not null default now()
);

create index if not exists os_fretes_os_idx on public.os_fretes (os_id);
