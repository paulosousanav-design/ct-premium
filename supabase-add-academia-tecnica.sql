create table if not exists academia_conteudos (
  id bigserial primary key,
  tipo text not null default 'COMUNICADO' check (tipo in ('COMUNICADO', 'BOLETIM', 'VIDEO', 'CURSO')),
  titulo text not null,
  resumo text,
  conteudo text,
  video_url text,
  arquivo_url text,
  destaque boolean not null default false,
  obrigatorio boolean not null default false,
  publicado boolean not null default false,
  destinatario_todos boolean not null default true,
  criado_por_nome text,
  criado_por_email text,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists academia_conteudo_tecnicos (
  conteudo_id bigint not null references academia_conteudos(id) on delete cascade,
  parceiro_id bigint not null references parceiros(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (conteudo_id, parceiro_id)
);

create table if not exists academia_progresso (
  id bigserial primary key,
  conteudo_id bigint not null references academia_conteudos(id) on delete cascade,
  parceiro_id bigint not null references parceiros(id) on delete cascade,
  visualizado_em timestamptz,
  confirmado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (conteudo_id, parceiro_id)
);

create index if not exists academia_conteudos_publicados_idx
on academia_conteudos (publicado, publicado_em desc);

create index if not exists academia_progresso_tecnico_idx
on academia_progresso (parceiro_id, atualizado_em desc);

alter table academia_conteudos enable row level security;
alter table academia_conteudo_tecnicos enable row level security;
alter table academia_progresso enable row level security;
