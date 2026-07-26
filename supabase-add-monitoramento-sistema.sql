create table if not exists sistema_eventos (
  id bigserial primary key,
  fingerprint text not null,
  tipo text not null default 'ERRO'
    check (tipo in ('ERRO', 'ALERTA', 'SAUDE')),
  gravidade text not null default 'ATENCAO'
    check (gravidade in ('INFO', 'ATENCAO', 'CRITICO')),
  status text not null default 'ABERTO'
    check (status in ('ABERTO', 'RESOLVIDO', 'IGNORADO')),
  modulo text not null,
  origem text not null default 'API',
  rota text,
  metodo text,
  codigo text,
  mensagem text not null,
  detalhes jsonb,
  unidade_id bigint references unidades(id),
  usuario_nome text,
  usuario_email text,
  ip text,
  ocorrencias integer not null default 1 check (ocorrencias > 0),
  primeira_ocorrencia_em timestamptz not null default now(),
  ultima_ocorrencia_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por_nome text,
  resolvido_por_email text,
  resolucao_observacao text,
  criado_em timestamptz not null default now()
);

create unique index if not exists sistema_eventos_aberto_fingerprint_idx
on sistema_eventos (fingerprint) where status = 'ABERTO';

create index if not exists sistema_eventos_status_data_idx
on sistema_eventos (status, ultima_ocorrencia_em desc);

create index if not exists sistema_eventos_gravidade_data_idx
on sistema_eventos (gravidade, ultima_ocorrencia_em desc);

create index if not exists sistema_eventos_modulo_data_idx
on sistema_eventos (modulo, ultima_ocorrencia_em desc);

alter table sistema_eventos enable row level security;

create or replace function registrar_evento_sistema(
  p_fingerprint text,
  p_tipo text,
  p_gravidade text,
  p_modulo text,
  p_origem text,
  p_rota text,
  p_metodo text,
  p_codigo text,
  p_mensagem text,
  p_detalhes jsonb default null,
  p_unidade_id bigint default null,
  p_usuario_nome text default null,
  p_usuario_email text default null,
  p_ip text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  evento_id bigint;
begin
  insert into sistema_eventos (
    fingerprint, tipo, gravidade, modulo, origem, rota, metodo, codigo,
    mensagem, detalhes, unidade_id, usuario_nome, usuario_email, ip
  ) values (
    left(p_fingerprint, 64),
    case when p_tipo in ('ERRO', 'ALERTA', 'SAUDE') then p_tipo else 'ERRO' end,
    case when p_gravidade in ('INFO', 'ATENCAO', 'CRITICO') then p_gravidade else 'ATENCAO' end,
    left(coalesce(nullif(p_modulo, ''), 'SISTEMA'), 80),
    left(coalesce(nullif(p_origem, ''), 'API'), 40),
    left(p_rota, 300),
    left(p_metodo, 12),
    left(p_codigo, 100),
    left(coalesce(nullif(p_mensagem, ''), 'Erro sem mensagem.'), 2000),
    p_detalhes,
    p_unidade_id,
    left(p_usuario_nome, 200),
    left(p_usuario_email, 300),
    left(p_ip, 100)
  )
  on conflict (fingerprint) where status = 'ABERTO'
  do update set
    ocorrencias = sistema_eventos.ocorrencias + 1,
    ultima_ocorrencia_em = now(),
    gravidade = case
      when excluded.gravidade = 'CRITICO' then 'CRITICO'
      when sistema_eventos.gravidade = 'INFO' and excluded.gravidade = 'ATENCAO' then 'ATENCAO'
      else sistema_eventos.gravidade
    end,
    mensagem = excluded.mensagem,
    detalhes = excluded.detalhes,
    codigo = coalesce(excluded.codigo, sistema_eventos.codigo),
    unidade_id = coalesce(excluded.unidade_id, sistema_eventos.unidade_id),
    usuario_nome = coalesce(excluded.usuario_nome, sistema_eventos.usuario_nome),
    usuario_email = coalesce(excluded.usuario_email, sistema_eventos.usuario_email),
    ip = coalesce(excluded.ip, sistema_eventos.ip)
  returning id into evento_id;

  return evento_id;
end;
$$;

revoke all on function registrar_evento_sistema(
  text, text, text, text, text, text, text, text, text, jsonb, bigint, text, text, text
) from public, anon, authenticated;

grant execute on function registrar_evento_sistema(
  text, text, text, text, text, text, text, text, text, jsonb, bigint, text, text, text
) to service_role;

comment on table sistema_eventos is
'Erros, alertas e falhas de saúde agrupados para acompanhamento pelo ADM Master.';
