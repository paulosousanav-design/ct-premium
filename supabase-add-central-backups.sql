create table if not exists backup_execucoes (
  id bigserial primary key,
  tipo text not null default 'MANUAL'
    check (tipo in ('MANUAL', 'AUTOMATICO')),
  status text not null default 'CONCLUIDO'
    check (status in ('CONCLUIDO', 'FALHA')),
  integridade text not null default 'VALIDA'
    check (integridade in ('VALIDA', 'INVALIDA', 'NAO_VERIFICADA')),
  arquivo_nome text,
  tamanho_bytes bigint not null default 0 check (tamanho_bytes >= 0),
  checksum_sha256 text,
  total_tabelas integer not null default 0 check (total_tabelas >= 0),
  total_registros bigint not null default 0 check (total_registros >= 0),
  tabelas_ignoradas integer not null default 0 check (tabelas_ignoradas >= 0),
  gerado_por_nome text,
  gerado_por_email text,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists backup_execucoes_data_idx
on backup_execucoes (criado_em desc);

create index if not exists backup_execucoes_status_data_idx
on backup_execucoes (status, criado_em desc);

alter table backup_execucoes enable row level security;

comment on table backup_execucoes is
'Historico e comprovantes de integridade dos backups gerados pelo ADM Master.';
