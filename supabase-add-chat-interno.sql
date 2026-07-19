-- Chat interno entre usuarios administrativos.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.chat_conversas (
  id bigserial primary key,
  tipo text not null check (tipo in ('GERAL', 'UNIDADE', 'DIRETA')),
  nome text,
  unidade_id bigint references public.unidades(id),
  chave_unica text not null unique,
  criado_por_id bigint references public.admin_usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.chat_participantes (
  conversa_id bigint not null references public.chat_conversas(id) on delete cascade,
  admin_usuario_id bigint not null references public.admin_usuarios(id) on delete cascade,
  adicionado_em timestamptz not null default now(),
  primary key (conversa_id, admin_usuario_id)
);

create table if not exists public.chat_mensagens (
  id bigserial primary key,
  conversa_id bigint not null references public.chat_conversas(id) on delete cascade,
  autor_id bigint not null references public.admin_usuarios(id),
  conteudo text not null check (char_length(conteudo) between 1 and 2000),
  os_id bigint references public.ordens_servico(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.chat_leituras (
  conversa_id bigint not null references public.chat_conversas(id) on delete cascade,
  admin_usuario_id bigint not null references public.admin_usuarios(id) on delete cascade,
  ultima_leitura_em timestamptz not null default now(),
  ultima_mensagem_id bigint references public.chat_mensagens(id) on delete set null,
  primary key (conversa_id, admin_usuario_id)
);

create index if not exists chat_mensagens_conversa_idx
  on public.chat_mensagens (conversa_id, criado_em desc);
create index if not exists chat_participantes_usuario_idx
  on public.chat_participantes (admin_usuario_id, conversa_id);
create index if not exists chat_leituras_usuario_idx
  on public.chat_leituras (admin_usuario_id, conversa_id);

-- O ADM Master recebe a nova permissao automaticamente e pode libera-la aos demais.
update public.admin_usuarios
set permissoes = array_append(permissoes, 'chat'),
atualizado_em = now()
where 'usuarios' = any(permissoes)
  and not ('chat' = any(permissoes));

comment on table public.chat_mensagens is
  'Mensagens administrativas imutaveis; correcoes devem ser enviadas como nova mensagem.';
