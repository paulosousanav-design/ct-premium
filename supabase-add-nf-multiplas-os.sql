-- Permite vincular uma unica nota fiscal de tecnico a varias ordens de servico.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.tecnico_documentos_os (
  documento_id bigint not null references public.tecnico_documentos(id) on delete cascade,
  os_id bigint not null references public.ordens_servico(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (documento_id, os_id)
);

create index if not exists tecnico_documentos_os_os_id_idx
  on public.tecnico_documentos_os(os_id);

alter table public.tecnico_documentos_os enable row level security;

-- Mantem os documentos antigos vinculados as suas OS originais.
insert into public.tecnico_documentos_os (documento_id, os_id)
select id, os_id
from public.tecnico_documentos
where os_id is not null
on conflict (documento_id, os_id) do nothing;
