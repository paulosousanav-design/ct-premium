alter table backup_execucoes
  add column if not exists destino text not null default 'DOWNLOAD',
  add column if not exists google_arquivo_id text,
  add column if not exists google_link text,
  add column if not exists arquivos_storage_enviados integer not null default 0;

create table if not exists backup_configuracoes (
  id smallint primary key default 1 check (id = 1),
  google_refresh_token_criptografado text,
  google_email text,
  google_pasta_id text,
  google_pasta_banco_id text,
  google_pasta_storage_id text,
  google_conectado_em timestamptz,
  automatico_ativo boolean not null default false,
  retencao_dias integer not null default 30 check (retencao_dias between 7 and 365),
  ultimo_backup_automatico_em timestamptz,
  ultimo_backup_automatico_status text,
  ultimo_backup_automatico_erro text,
  atualizado_em timestamptz not null default now()
);

insert into backup_configuracoes (id)
values (1)
on conflict (id) do nothing;

create table if not exists backup_storage_arquivos (
  id bigserial primary key,
  bucket text not null,
  caminho text not null,
  storage_atualizado_em timestamptz,
  tamanho_bytes bigint not null default 0,
  google_arquivo_id text,
  ultimo_backup_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (bucket, caminho)
);

create index if not exists backup_storage_arquivos_data_idx
on backup_storage_arquivos (ultimo_backup_em desc);

alter table backup_configuracoes enable row level security;
alter table backup_storage_arquivos enable row level security;

comment on table backup_configuracoes is
'Configuracao sigilosa do backup automatico. A credencial Google e armazenada criptografada.';

comment on table backup_storage_arquivos is
'Controle incremental dos arquivos do Storage copiados para o Google Drive.';
