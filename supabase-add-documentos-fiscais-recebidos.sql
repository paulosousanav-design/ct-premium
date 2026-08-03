-- Caixa de documentos fiscais recebidos pela Distribuicao DF-e da SEFAZ.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.dfe_configuracoes (
  id bigserial primary key,
  unidade_id bigint not null references public.unidades(id) on delete cascade,
  cnpj text not null,
  uf text not null,
  ambiente smallint not null default 1 check (ambiente in (1, 2)),
  certificado_pfx_criptografado text not null,
  certificado_senha_criptografada text not null,
  certificado_nome text,
  ultimo_nsu text not null default '000000000000000',
  max_nsu text not null default '000000000000000',
  consulta_ativa boolean not null default true,
  ultima_consulta_em timestamptz,
  ultima_consulta_status text,
  ultima_consulta_erro text,
  configurado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint dfe_configuracoes_unidade_uidx unique (unidade_id)
);

create table if not exists public.dfe_documentos (
  id bigserial primary key,
  unidade_id bigint not null references public.unidades(id) on delete cascade,
  nsu text not null,
  schema_xml text not null,
  tipo_documento text not null check (tipo_documento in ('NFE_COMPLETA', 'RESUMO_NFE', 'EVENTO', 'OUTRO')),
  chave_acesso text,
  emitente_cnpj text,
  emitente_nome text,
  data_emissao timestamptz,
  valor_total numeric(14,2) not null default 0,
  situacao_sefaz text,
  descricao_evento text,
  status text not null default 'NOVA' check (status in ('NOVA', 'XML_DISPONIVEL', 'IMPORTADA', 'ARQUIVADA', 'IGNORADA')),
  xml_documento text not null,
  nfe_importacao_id bigint references public.nfe_importacoes(id),
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  tratado_por text,
  tratado_em timestamptz,
  constraint dfe_documentos_nsu_uidx unique (unidade_id, nsu, schema_xml)
);

create unique index if not exists dfe_documentos_chave_completa_uidx
  on public.dfe_documentos (unidade_id, chave_acesso)
  where tipo_documento = 'NFE_COMPLETA' and chave_acesso is not null and chave_acesso <> '';

create index if not exists dfe_documentos_unidade_status_idx
  on public.dfe_documentos (unidade_id, status, recebido_em desc);

create index if not exists dfe_documentos_chave_idx
  on public.dfe_documentos (chave_acesso);

alter table public.dfe_configuracoes enable row level security;
alter table public.dfe_documentos enable row level security;

revoke all on public.dfe_configuracoes from anon, authenticated;
revoke all on public.dfe_documentos from anon, authenticated;
grant all on public.dfe_configuracoes to service_role;
grant all on public.dfe_documentos to service_role;
grant usage, select on sequence public.dfe_configuracoes_id_seq to service_role;
grant usage, select on sequence public.dfe_documentos_id_seq to service_role;

-- A permissao aparece na tela de Usuarios; nenhum usuario e liberado automaticamente.
comment on table public.dfe_configuracoes is 'Certificados A1 criptografados e cursor NSU por unidade.';
comment on table public.dfe_documentos is 'Documentos localizados na SEFAZ; importar e sempre uma acao manual.';
