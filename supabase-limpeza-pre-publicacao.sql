-- Limpeza pre-publicacao
-- Mantem somente a OS real OS-2026-669801 e remove dados de teste ligados as demais OS.
--
-- IMPORTANTE:
-- 1. Rode primeiro o bloco "PREVIEW" para conferir os totais.
-- 2. Rode o bloco "LIMPEZA" somente se a OS abaixo for realmente a unica que deve ficar.
-- 3. Este script nao remove arquivos fisicos do Storage; ele remove os registros do banco.

-- =========================
-- PREVIEW
-- =========================

select
  id,
  numero_os,
  status,
  cliente_id,
  parceiro_id,
  created_at
from public.ordens_servico
where numero_os = 'OS-2026-669801';

select
  count(*) filter (where numero_os = 'OS-2026-669801') as os_que_fica,
  count(*) filter (where numero_os <> 'OS-2026-669801' or numero_os is null) as os_para_remover,
  count(*) as total_os
from public.ordens_servico;

select
  count(*) as tecnicos_total,
  count(*) filter (
    where id in (
      select parceiro_id
      from public.ordens_servico
      where numero_os = 'OS-2026-669801'
        and parceiro_id is not null
    )
  ) as tecnicos_ligados_a_os_real
from public.parceiros;

select
  count(*) as clientes_total,
  count(*) filter (
    where id in (
      select cliente_id
      from public.ordens_servico
      where numero_os = 'OS-2026-669801'
        and cliente_id is not null
    )
  ) as clientes_ligados_a_os_real
from public.clientes;

-- =========================
-- LIMPEZA
-- =========================

begin;

do $$
declare
  keep_os_id bigint;
  keep_cliente_id bigint;
  keep_parceiro_id bigint;
  total_keep integer;
begin
  select count(*)
  into total_keep
  from public.ordens_servico
  where numero_os = 'OS-2026-669801';

  if total_keep <> 1 then
    raise exception 'Limpeza abortada: esperado encontrar exatamente 1 OS OS-2026-669801, encontrado %.', total_keep;
  end if;

  select id, cliente_id, parceiro_id
  into keep_os_id, keep_cliente_id, keep_parceiro_id
  from public.ordens_servico
  where numero_os = 'OS-2026-669801';

  delete from public.financeiro_historico
  where os_id is not null
    and os_id <> keep_os_id;

  delete from public.financeiro_historico
  where documento_id in (
    select id
    from public.tecnico_documentos
    where os_id is distinct from keep_os_id
  );

  delete from public.tecnico_documentos
  where os_id is distinct from keep_os_id;

  delete from public.pecas_movimentacoes
  where os_id is not null
    and os_id <> keep_os_id;

  delete from public.os_pecas
  where os_id <> keep_os_id;

  delete from public.os_fotos
  where os_id <> keep_os_id;

  delete from public.os_historico
  where os_id <> keep_os_id;

  delete from public.ordens_servico
  where id <> keep_os_id;

  delete from public.clientes
  where keep_cliente_id is null
     or id <> keep_cliente_id;

  delete from public.parceiros
  where keep_parceiro_id is null
     or id <> keep_parceiro_id;
end $$;

commit;

-- =========================
-- CONFERENCIA APOS LIMPEZA
-- =========================

select id, numero_os, status, cliente_id, parceiro_id
from public.ordens_servico
order by created_at desc;

select count(*) as clientes_restantes from public.clientes;
select count(*) as tecnicos_restantes from public.parceiros;
