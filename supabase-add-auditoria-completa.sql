create table if not exists auditoria_eventos (
  id bigserial primary key,
  unidade_id bigint references unidades(id),
  modulo text not null,
  entidade text not null,
  entidade_id text,
  acao text not null check (acao in ('CRIACAO', 'ALTERACAO', 'EXCLUSAO')),
  descricao text not null,
  usuario_id bigint,
  usuario_nome text not null default 'Sistema/integração',
  usuario_email text,
  valores_anteriores jsonb,
  valores_novos jsonb,
  campos_alterados text[] not null default '{}',
  ip text,
  user_agent text,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_eventos_data_idx
on auditoria_eventos (criado_em desc);

create index if not exists auditoria_eventos_modulo_idx
on auditoria_eventos (modulo, criado_em desc);

create index if not exists auditoria_eventos_entidade_idx
on auditoria_eventos (entidade, entidade_id, criado_em desc);

create index if not exists auditoria_eventos_usuario_idx
on auditoria_eventos (usuario_email, criado_em desc);

create index if not exists auditoria_eventos_unidade_idx
on auditoria_eventos (unidade_id, criado_em desc);

alter table auditoria_eventos enable row level security;

create or replace function auditoria_decodificar_base64(valor text)
returns text
language plpgsql
immutable
as $$
begin
  if coalesce(valor, '') = '' then return null; end if;
  return convert_from(decode(valor, 'base64'), 'UTF8');
exception when others then
  return null;
end;
$$;

create or replace function auditoria_bloquear_mutacao()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registros de auditoria são imutáveis.';
end;
$$;

drop trigger if exists auditoria_eventos_imutavel on auditoria_eventos;
create trigger auditoria_eventos_imutavel
before update or delete on auditoria_eventos
for each row execute function auditoria_bloquear_mutacao();

create or replace function auditoria_registrar_alteracao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cabecalhos jsonb := '{}';
  anterior jsonb;
  novo jsonb;
  anterior_filtrado jsonb;
  novo_filtrado jsonb;
  alterados text[];
  registro jsonb;
  registro_id text;
  unidade bigint;
  nome_usuario text;
  email_usuario text;
  id_usuario bigint;
  modulo_evento text;
  acao_evento text;
  ip_evento text;
  agente_evento text;
begin
  begin
    cabecalhos := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    cabecalhos := '{}';
  end;

  anterior := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end;
  novo := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end;
  registro := coalesce(novo, anterior, '{}');

  anterior := anterior - array[
    'senha', 'password', 'token', 'access_token', 'refresh_token',
    'secret', 'chave_secreta', 'service_role_key', 'portal_pin_hash', 'senha_hash'
  ];
  novo := novo - array[
    'senha', 'password', 'token', 'access_token', 'refresh_token',
    'secret', 'chave_secreta', 'service_role_key', 'portal_pin_hash', 'senha_hash'
  ];

  if TG_OP = 'UPDATE' then
    select coalesce(jsonb_object_agg(a.key, a.value), '{}')
      into anterior_filtrado
    from jsonb_each(anterior) a
    where novo -> a.key is distinct from a.value;

    select coalesce(jsonb_object_agg(n.key, n.value), '{}')
      into novo_filtrado
    from jsonb_each(novo) n
    where anterior -> n.key is distinct from n.value;
  else
    anterior_filtrado := anterior;
    novo_filtrado := novo;
  end if;

  select coalesce(array_agg(chave order by chave), '{}')
    into alterados
  from (
    select jsonb_object_keys(coalesce(anterior_filtrado, '{}')) as chave
    union
    select jsonb_object_keys(coalesce(novo_filtrado, '{}')) as chave
  ) campos;

  registro_id := coalesce(
    registro ->> 'id',
    registro ->> 'numero_os',
    registro ->> 'codigo',
    registro ->> 'email'
  );
  begin
    unidade := nullif(registro ->> 'unidade_id', '')::bigint;
  exception when others then
    unidade := null;
  end;
  if unidade is null then
    begin
      unidade := nullif(cabecalhos ->> 'x-audit-unit-id', '')::bigint;
    exception when others then
      unidade := null;
    end;
  end if;

  nome_usuario := coalesce(
    auditoria_decodificar_base64(cabecalhos ->> 'x-audit-user-name'),
    registro ->> 'atualizado_por_nome',
    registro ->> 'criado_por_nome',
    registro ->> 'responsavel_nome',
    'Sistema/integração'
  );
  email_usuario := coalesce(
    cabecalhos ->> 'x-audit-user-email',
    registro ->> 'atualizado_por_email',
    registro ->> 'criado_por_email',
    registro ->> 'responsavel_email'
  );
  begin
    id_usuario := nullif(cabecalhos ->> 'x-audit-user-id', '')::bigint;
  exception when others then
    id_usuario := null;
  end;

  modulo_evento := case
    when TG_TABLE_NAME in ('ordens_servico', 'os_pecas', 'os_fotos') then 'ORDENS_SERVICO'
    when TG_TABLE_NAME in ('contas_pagar', 'financeiro_historico', 'recebimento_parcelas') then 'FINANCEIRO'
    when TG_TABLE_NAME in ('pecas', 'pecas_movimentacoes', 'nfe_importacoes') then 'ESTOQUE'
    when TG_TABLE_NAME in ('vendas', 'venda_itens') then 'VENDAS'
    when TG_TABLE_NAME in ('rotas', 'rota_despesas', 'rota_ordens') then 'ROTAS'
    when TG_TABLE_NAME in ('comissao_fechamentos', 'comissao_fechamento_itens') then 'COMISSOES'
    when TG_TABLE_NAME in ('admin_usuarios', 'admin_usuario_unidades') then 'USUARIOS'
    when TG_TABLE_NAME = 'unidades' then 'UNIDADES'
    when TG_TABLE_NAME = 'clientes' then 'CLIENTES'
    when TG_TABLE_NAME = 'parceiros' then 'TECNICOS'
    when TG_TABLE_NAME = 'garantidores' then 'GARANTIDORES'
    when TG_TABLE_NAME in ('documentos_tecnicos', 'documento_emissores', 'documento_carimbos') then 'DOCUMENTOS'
    when TG_TABLE_NAME in ('academia_conteudos', 'academia_conteudo_tecnicos') then 'ACADEMIA'
    else 'SISTEMA'
  end;

  acao_evento := case TG_OP
    when 'INSERT' then 'CRIACAO'
    when 'UPDATE' then 'ALTERACAO'
    else 'EXCLUSAO'
  end;
  ip_evento := coalesce(
    cabecalhos ->> 'x-audit-ip',
    split_part(coalesce(cabecalhos ->> 'x-forwarded-for', ''), ',', 1)
  );
  agente_evento := auditoria_decodificar_base64(cabecalhos ->> 'x-audit-user-agent');

  insert into auditoria_eventos (
    unidade_id, modulo, entidade, entidade_id, acao, descricao,
    usuario_id, usuario_nome, usuario_email, valores_anteriores,
    valores_novos, campos_alterados, ip, user_agent
  ) values (
    unidade, modulo_evento, TG_TABLE_NAME, registro_id, acao_evento,
    acao_evento || ' em ' || TG_TABLE_NAME ||
      case when registro_id is not null then ' #' || registro_id else '' end,
    id_usuario, nome_usuario, email_usuario, anterior_filtrado,
    novo_filtrado, alterados, nullif(ip_evento, ''), agente_evento
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

do $$
declare
  tabela text;
  tabelas text[] := array[
    'ordens_servico', 'os_pecas', 'os_fotos',
    'contas_pagar', 'financeiro_historico', 'recebimento_parcelas',
    'pecas', 'pecas_movimentacoes', 'nfe_importacoes',
    'vendas', 'venda_itens',
    'rotas', 'rota_despesas', 'rota_ordens',
    'comissao_fechamentos', 'comissao_fechamento_itens',
    'clientes', 'parceiros', 'garantidores',
    'admin_usuarios', 'admin_usuario_unidades', 'unidades',
    'documentos_tecnicos', 'documento_emissores', 'documento_carimbos',
    'academia_conteudos', 'academia_conteudo_tecnicos',
    'empresas'
  ];
begin
  foreach tabela in array tabelas loop
    if to_regclass('public.' || tabela) is not null then
      execute format('drop trigger if exists auditoria_automatica on public.%I', tabela);
      execute format(
        'create trigger auditoria_automatica after insert or update or delete on public.%I for each row execute function auditoria_registrar_alteracao()',
        tabela
      );
    end if;
  end loop;
end;
$$;

comment on table auditoria_eventos is
'Registro central, automático e imutável das alterações administrativas do sistema.';
