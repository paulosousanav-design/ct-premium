-- Arquivamento individual das conversas diretas do chat interno.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.chat_arquivamentos (
  conversa_id bigint not null references public.chat_conversas(id) on delete cascade,
  admin_usuario_id bigint not null references public.admin_usuarios(id) on delete cascade,
  arquivada_em timestamptz not null default now(),
  primary key (conversa_id, admin_usuario_id)
);

create index if not exists chat_arquivamentos_usuario_idx
  on public.chat_arquivamentos (admin_usuario_id, arquivada_em desc);

comment on table public.chat_arquivamentos is
  'Conversas diretas arquivadas individualmente por cada usuario administrativo.';
