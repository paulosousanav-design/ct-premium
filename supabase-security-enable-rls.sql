-- CT Premium - hardening de seguranca Supabase
-- Objetivo:
-- 1. Ativar Row Level Security nas tabelas publicas usadas pelo sistema.
-- 2. Remover acesso direto anonimo via API publica.
-- 3. Manter acesso para usuarios autenticados do painel admin.
--
-- Observacao:
-- As rotas publicas do CT Premium usam o servidor com service_role, entao
-- auto cadastro de tecnico, abertura de chamado e consulta de OS continuam
-- funcionando sem liberar tabelas diretamente para visitantes anonimos.

do $$
declare
  v_table text;
  tables text[] := array[
    'admin_usuarios',
    'categorias',
    'marcas',
    'clientes',
    'ordens_servico',
    'os_historico',
    'os_fotos',
    'os_pecas',
    'parceiros',
    'garantidores',
    'empresas',
    'pecas',
    'pecas_movimentacoes',
    'contas_pagar',
    'financeiro_historico',
    'tecnico_documentos'
  ];
begin
  foreach v_table in array tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('alter table public.%I enable row level security', v_table);

      execute format('revoke all on table public.%I from anon', v_table);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', v_table);

      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = v_table
          and policyname = 'authenticated_full_access'
      ) then
        execute format(
          'create policy authenticated_full_access on public.%I for all to authenticated using (true) with check (true)',
          v_table
        );
      end if;
    end if;
  end loop;
end $$;

-- Garante que inserts feitos por usuarios autenticados possam usar sequencias/IDs.
grant usage, select on all sequences in schema public to authenticated;
revoke all on all sequences in schema public from anon;
