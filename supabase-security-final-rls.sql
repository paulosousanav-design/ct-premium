-- CT Premium - endurecimento final do acesso ao banco
-- Data: 2026-07-21
--
-- Execute este arquivo somente depois de publicar a versao em que todas as
-- telas administrativas usam /api/*. O script nao altera auth.users nem o
-- schema storage; links publicos de imagens continuam funcionando.
--
-- Resultado esperado:
-- - anon e authenticated nao consultam nem alteram tabelas publicas direto.
-- - funcoes publicas ficam executaveis apenas pelo servidor (service_role).
-- - todas as tabelas publicas reais ficam com RLS habilitado.
-- - as APIs do sistema continuam operando com service_role.

begin;

-- O servidor precisa continuar acessando o schema e todos os objetos atuais.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Remove a exposicao direta do schema e dos objetos pelo navegador.
revoke usage on schema public from public, anon, authenticated;
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Depois dos revokes, reafirma os acessos exclusivos do servidor.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Habilita RLS em todas as tabelas de aplicacao do schema public.
do $$
declare
  item record;
begin
  for item in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', item.schema_name, item.table_name);
  end loop;
end $$;

-- Remove politicas antigas que liberavam anon/authenticated/public.
-- Politicas exclusivas de service_role, se existirem, sao preservadas.
do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles && array['public'::name, 'anon'::name, 'authenticated'::name]
  loop
    execute format('drop policy if exists %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
end $$;

-- Novos objetos criados pelo usuario que executa este SQL tambem nascem
-- fechados para o navegador e liberados para o servidor.
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

commit;

-- Conferencia: estas consultas devem retornar zero linhas.
select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, table_name, privilege_type;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and roles && array['public'::name, 'anon'::name, 'authenticated'::name]
order by tablename, policyname;

select grantee, routine_name, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, routine_name, privilege_type;
