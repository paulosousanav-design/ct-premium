-- Execute uma única vez no SQL Editor do Supabase.
-- Estes campos armazenam a classificação fiscal da peça; não calculam impostos.
alter table pecas add column if not exists ncm text;
alter table pecas add column if not exists cest text;
alter table pecas add column if not exists gtin text;
alter table pecas add column if not exists origem_mercadoria text;
alter table pecas add column if not exists unidade_tributavel text;
alter table pecas add column if not exists cfop_entrada text;
alter table pecas add column if not exists cfop_saida text;
alter table pecas add column if not exists cst_icms text;
alter table pecas add column if not exists csosn text;
alter table pecas add column if not exists ipi_cst text;
alter table pecas add column if not exists pis_cst text;
alter table pecas add column if not exists cofins_cst text;
alter table pecas add column if not exists perfil_fiscal text;
alter table pecas add column if not exists observacao_fiscal text;

create index if not exists pecas_ncm_idx on pecas (ncm) where ncm is not null;
create index if not exists pecas_cest_idx on pecas (cest) where cest is not null;

comment on column pecas.ncm is 'NCM de 8 dígitos para classificação fiscal da mercadoria.';
comment on column pecas.cest is 'CEST de 7 dígitos, quando aplicável à mercadoria.';
comment on column pecas.perfil_fiscal is 'Rótulo do enquadramento fiscal definido pelo contador; cálculo será feito pela integração fiscal.';
