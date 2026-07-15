create table if not exists documento_emissores (
  id bigserial primary key,
  tipo_pessoa text not null check (tipo_pessoa in ('PF', 'PJ')),
  nome_razao_social text not null,
  nome_fantasia text,
  cpf_cnpj text not null,
  inscricao_estadual text,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  logo_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists documento_carimbos (
  id bigserial primary key,
  tipo text not null check (tipo in ('CNPJ', 'TECNICO')),
  nome text not null,
  linha_1 text,
  linha_2 text,
  linha_3 text,
  linha_4 text,
  cpf_cnpj text,
  conselho text check (conselho is null or conselho in ('CREA', 'CFT', 'OUTRO')),
  registro_conselho text,
  imagem_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists documentos_tecnicos (
  id bigserial primary key,
  numero text not null unique,
  tipo text not null check (tipo in ('LAUDO', 'ORCAMENTO')),
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'EMITIDO', 'CANCELADO')),
  versao integer not null default 1,
  os_id bigint references ordens_servico(id),
  titulo text not null,
  emissor_id bigint references documento_emissores(id),
  emissor_snapshot jsonb not null default '{}'::jsonb,
  carimbo_ids bigint[] not null default '{}',
  carimbos_snapshot jsonb not null default '[]'::jsonb,
  cliente_nome text,
  cliente_cpf_cnpj text,
  cliente_contato text,
  cliente_endereco text,
  equipamento text,
  marca text,
  modelo text,
  numero_serie text,
  defeito_relatado text,
  diagnostico text,
  procedimentos text,
  conclusao text,
  recomendacoes text,
  itens jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  validade_dias integer not null default 15,
  observacoes text,
  criado_por_nome text,
  criado_por_email text,
  atualizado_por_nome text,
  atualizado_por_email text,
  emitido_em timestamptz,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists documento_historico (
  id bigserial primary key,
  documento_id bigint not null references documentos_tecnicos(id) on delete cascade,
  acao text not null,
  descricao text,
  responsavel_nome text,
  responsavel_email text,
  criado_em timestamptz not null default now()
);

create index if not exists documentos_tecnicos_numero_idx on documentos_tecnicos(numero);
create index if not exists documentos_tecnicos_os_idx on documentos_tecnicos(os_id);
create index if not exists documentos_tecnicos_criado_idx on documentos_tecnicos(criado_em desc);
create index if not exists documento_historico_documento_idx on documento_historico(documento_id, criado_em desc);

alter table documento_emissores enable row level security;
alter table documento_carimbos enable row level security;
alter table documentos_tecnicos enable row level security;
alter table documento_historico enable row level security;

insert into storage.buckets (id, name, public)
values ('documento-carimbos', 'documento-carimbos', true)
on conflict (id) do update set public = true;
