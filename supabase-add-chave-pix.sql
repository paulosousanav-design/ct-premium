alter table parceiros
add column if not exists chave_pix text;

alter table parceiros
add column if not exists especialidades text[];

alter table parceiros
add column if not exists observacoes text;

alter table parceiros
add column if not exists portal_pin_hash text;

alter table parceiros
add column if not exists tipo_vinculo text not null default 'TERCEIRIZADO';

alter table ordens_servico
add column if not exists data_compra date;

alter table ordens_servico
add column if not exists numero_nf text;

alter table ordens_servico
add column if not exists local_compra text;

alter table ordens_servico
add column if not exists garantidor_id bigint references garantidores(id);

alter table ordens_servico
add column if not exists tecnico_avulso_nome text;

alter table ordens_servico
add column if not exists tecnico_avulso_whatsapp text;

alter table ordens_servico
add column if not exists tecnico_avulso_cidade text;

alter table ordens_servico
add column if not exists tecnico_avulso_estado text;

alter table ordens_servico
add column if not exists tecnico_avulso_observacao text;

alter table ordens_servico
add column if not exists tecnico_valor_pecas numeric(12,2) default 0;

alter table ordens_servico
add column if not exists tecnico_valor_mao_obra numeric(12,2) default 0;

alter table ordens_servico
add column if not exists tecnico_desconto numeric(12,2) default 0;

alter table ordens_servico
add column if not exists tecnico_total numeric(12,2) default 0;

alter table ordens_servico
add column if not exists cliente_valor_pecas numeric(12,2) default 0;

alter table ordens_servico
add column if not exists cliente_valor_mao_obra numeric(12,2) default 0;

alter table ordens_servico
add column if not exists cliente_desconto numeric(12,2) default 0;

alter table ordens_servico
add column if not exists cliente_total numeric(12,2) default 0;

alter table ordens_servico
add column if not exists tecnico_status_pagamento text not null default 'PENDENTE';

alter table ordens_servico
add column if not exists tecnico_pago_em timestamptz;

update ordens_servico
set
  tecnico_valor_pecas = coalesce(nullif(tecnico_valor_pecas, 0), valor_pecas, 0),
  tecnico_valor_mao_obra = coalesce(nullif(tecnico_valor_mao_obra, 0), valor_mao_obra, 0),
  tecnico_desconto = coalesce(nullif(tecnico_desconto, 0), desconto, 0),
  tecnico_total = coalesce(nullif(tecnico_total, 0), total, 0)
where coalesce(tecnico_total, 0) = 0
  and coalesce(total, 0) > 0;

update ordens_servico
set
  cliente_valor_pecas = coalesce(nullif(cliente_valor_pecas, 0), valor_pecas, 0),
  cliente_valor_mao_obra = coalesce(nullif(cliente_valor_mao_obra, 0), valor_mao_obra, 0),
  cliente_desconto = coalesce(nullif(cliente_desconto, 0), desconto, 0),
  cliente_total = coalesce(nullif(cliente_total, 0), total, 0)
where coalesce(cliente_total, 0) = 0
  and coalesce(total, 0) > 0;

update ordens_servico
set
  tecnico_status_pagamento = 'RECEBIDO',
  tecnico_pago_em = coalesce(tecnico_pago_em, data_pagamento, now())
where status = 'FINALIZADA'
  and status_financeiro = 'RECEBIDO'
  and coalesce(tecnico_status_pagamento, 'PENDENTE') <> 'RECEBIDO';

create table if not exists tecnico_documentos (
  id bigserial primary key,
  os_id bigint references ordens_servico(id),
  parceiro_id bigint references parceiros(id),
  tipo text not null default 'RECIBO',
  valor numeric(12, 2) not null default 0,
  nome_arquivo text,
  url text,
  observacao text,
  status text not null default 'PENDENTE',
  criado_em timestamptz not null default now(),
  pago_em timestamptz
);

create table if not exists financeiro_historico (
  id bigserial primary key,
  os_id bigint references ordens_servico(id),
  documento_id bigint references tecnico_documentos(id),
  tipo text not null,
  status_anterior text,
  status_novo text,
  valor numeric(12, 2) not null default 0,
  descricao text,
  responsavel text not null default 'Admin',
  criado_em timestamptz not null default now()
);

create table if not exists admin_usuarios (
  id bigserial primary key,
  auth_user_id uuid,
  nome text not null,
  email text not null unique,
  ativo boolean not null default true,
  permissoes text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists empresas (
  id bigserial primary key,
  nome_fantasia text not null default 'Chame o Tecnico',
  razao_social text,
  cnpj text,
  whatsapp text,
  telefone text,
  email text,
  site text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  estado text,
  complemento text,
  chave_pix text,
  logo_principal_url text default '/logo-chame-o-tecnico.png',
  logo_reduzida_url text default '/logo-ct.png',
  cor_principal text default '#ff6b00',
  cor_secundaria text default '#031226',
  texto_garantia text,
  texto_entrega text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists pecas (
  id bigserial primary key,
  codigo text,
  descricao text not null,
  categoria text,
  marca text,
  valor_custo numeric(12,2) default 0,
  valor_venda numeric(12,2) default 0,
  estoque numeric(12,2) default 0,
  estoque_minimo numeric(12,2) default 0,
  localizacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table os_pecas
add column if not exists origem text default 'AVULSA',
add column if not exists peca_id bigint references pecas(id);

create table if not exists pecas_movimentacoes (
  id bigserial primary key,
  peca_id bigint not null references pecas(id),
  os_id bigint references ordens_servico(id),
  tipo text not null,
  quantidade numeric(12,2) not null default 0,
  estoque_anterior numeric(12,2) default 0,
  estoque_posterior numeric(12,2) default 0,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table tecnico_documentos
add column if not exists os_id bigint references ordens_servico(id);

insert into storage.buckets (id, name, public)
values ('tecnico-documentos', 'tecnico-documentos', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Tecnico documentos public read'
  ) then
    create policy "Tecnico documentos public read"
    on storage.objects for select
    using (bucket_id = 'tecnico-documentos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Tecnico documentos service insert'
  ) then
    create policy "Tecnico documentos service insert"
    on storage.objects for insert
    with check (bucket_id = 'tecnico-documentos');
  end if;
end $$;
