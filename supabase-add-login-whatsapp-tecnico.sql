create table if not exists tecnico_login_codigos (
  id bigserial primary key,
  parceiro_id bigint not null references parceiros(id) on delete cascade,
  telefone_hash text not null,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas smallint not null default 0,
  usado_em timestamptz,
  mensagem_id text,
  criado_em timestamptz not null default now(),
  constraint tecnico_login_codigos_tentativas_check check (tentativas between 0 and 5)
);

create index if not exists tecnico_login_codigos_parceiro_idx
  on tecnico_login_codigos (parceiro_id, criado_em desc);

create index if not exists tecnico_login_codigos_expiracao_idx
  on tecnico_login_codigos (expira_em)
  where usado_em is null;

alter table tecnico_login_codigos enable row level security;

revoke all on table tecnico_login_codigos from anon, authenticated;
revoke all on sequence tecnico_login_codigos_id_seq from anon, authenticated;
grant all on table tecnico_login_codigos to service_role;
grant usage, select on sequence tecnico_login_codigos_id_seq to service_role;

comment on table tecnico_login_codigos is
  'Codigos temporarios, de uso unico, para acesso do tecnico pelo WhatsApp.';

