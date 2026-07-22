-- CT Premium - reversao emergencial do endurecimento RLS
-- Use somente se o arquivo supabase-security-final-rls.sql causar bloqueio
-- inesperado. Este rollback restaura o modelo anterior, mais permissivo,
-- para usuarios autenticados do Supabase.

begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

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

    if not exists (
      select 1
      from pg_policies p
      where p.schemaname = item.schema_name
        and p.tablename = item.table_name
        and p.policyname = 'authenticated_full_access'
    ) then
      execute format(
        'create policy authenticated_full_access on %I.%I for all to authenticated using (true) with check (true)',
        item.schema_name,
        item.table_name
      );
    end if;
  end loop;
end $$;

alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public grant usage, select on sequences to authenticated;
alter default privileges for role postgres in schema public grant execute on functions to authenticated;

commit;
