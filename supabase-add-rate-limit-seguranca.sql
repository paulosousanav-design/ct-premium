-- Controle de tentativas nas rotas publicas.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.seguranca_rate_limits (
  chave text primary key,
  janela_inicio timestamptz not null default now(),
  tentativas integer not null default 0,
  atualizado_em timestamptz not null default now()
);

create index if not exists seguranca_rate_limits_atualizado_idx
  on public.seguranca_rate_limits (atualizado_em);

create or replace function public.verificar_limite_requisicao(
  p_chave text,
  p_limite integer,
  p_janela_segundos integer
)
returns table (permitido boolean, restantes integer, tentar_novamente_em integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro public.seguranca_rate_limits%rowtype;
  v_agora timestamptz := now();
  v_fim_janela timestamptz;
begin
  if coalesce(p_chave, '') = '' or p_limite < 1 or p_janela_segundos < 1 then
    raise exception 'Parametros de limite invalidos.';
  end if;

  insert into public.seguranca_rate_limits (chave, janela_inicio, tentativas, atualizado_em)
  values (p_chave, v_agora, 0, v_agora)
  on conflict (chave) do nothing;

  select * into v_registro
  from public.seguranca_rate_limits
  where chave = p_chave
  for update;

  v_fim_janela := v_registro.janela_inicio + make_interval(secs => p_janela_segundos);
  if v_fim_janela <= v_agora then
    update public.seguranca_rate_limits
    set janela_inicio = v_agora, tentativas = 1, atualizado_em = v_agora
    where chave = p_chave;
    return query select true, greatest(p_limite - 1, 0), p_janela_segundos;
    return;
  end if;

  if v_registro.tentativas >= p_limite then
    return query select false, 0, greatest(ceil(extract(epoch from (v_fim_janela - v_agora)))::integer, 1);
    return;
  end if;

  update public.seguranca_rate_limits
  set tentativas = tentativas + 1, atualizado_em = v_agora
  where chave = p_chave;
  return query select true, greatest(p_limite - v_registro.tentativas - 1, 0), greatest(ceil(extract(epoch from (v_fim_janela - v_agora)))::integer, 1);
end;
$$;

revoke all on table public.seguranca_rate_limits from anon, authenticated;
revoke all on function public.verificar_limite_requisicao(text, integer, integer) from public, anon, authenticated;
grant execute on function public.verificar_limite_requisicao(text, integer, integer) to service_role;
