-- Importacao de XML de NF-e de compras para estoque e contas a pagar.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.pecas
  add column if not exists codigo_barras text,
  add column if not exists ncm text;

create table if not exists public.nfe_importacoes (
  id bigserial primary key,
  unidade_id bigint not null references public.unidades(id),
  chave_acesso text not null,
  modelo text,
  serie text,
  numero text,
  data_emissao timestamptz,
  fornecedor_cnpj text,
  fornecedor_nome text,
  valor_produtos numeric(14,2) not null default 0,
  valor_frete numeric(14,2) not null default 0,
  valor_seguro numeric(14,2) not null default 0,
  valor_desconto numeric(14,2) not null default 0,
  valor_outro numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null default 0,
  status text not null default 'CONFIRMADA',
  xml_original text not null,
  importado_por text not null,
  importado_em timestamptz not null default now()
);

create unique index if not exists nfe_importacoes_chave_uidx
  on public.nfe_importacoes (chave_acesso);
create index if not exists nfe_importacoes_unidade_idx
  on public.nfe_importacoes (unidade_id, importado_em desc);

create table if not exists public.nfe_importacao_itens (
  id bigserial primary key,
  importacao_id bigint not null references public.nfe_importacoes(id) on delete cascade,
  peca_id bigint not null references public.pecas(id),
  numero_item integer,
  codigo_fornecedor text,
  codigo_barras text,
  descricao text not null,
  ncm text,
  cfop text,
  unidade_comercial text,
  quantidade numeric(14,4) not null,
  valor_unitario_xml numeric(14,6) not null default 0,
  valor_total_xml numeric(14,2) not null default 0,
  custo_unitario_estoque numeric(14,6) not null default 0,
  estoque_anterior numeric(14,4) not null default 0,
  estoque_posterior numeric(14,4) not null default 0
);

alter table public.pecas_movimentacoes
  add column if not exists nfe_importacao_id bigint references public.nfe_importacoes(id);

alter table public.contas_pagar
  add column if not exists nfe_importacao_id bigint references public.nfe_importacoes(id),
  add column if not exists nfe_parcela_numero text;

create index if not exists contas_pagar_nfe_idx
  on public.contas_pagar (nfe_importacao_id, vencimento);

create or replace function public.confirmar_importacao_nfe(
  p_importacao jsonb,
  p_itens jsonb,
  p_parcelas jsonb,
  p_gerar_contas boolean,
  p_responsavel text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacao_id bigint;
  v_item jsonb;
  v_parcela jsonb;
  v_peca_id bigint;
  v_estoque_anterior numeric(14,4);
  v_estoque_posterior numeric(14,4);
  v_quantidade numeric(14,4);
  v_custo numeric(14,6);
  v_total_parcelas numeric(14,2);
  v_unidade_id bigint := (p_importacao->>'unidade_id')::bigint;
  v_fornecedor text := nullif(p_importacao->>'fornecedor_nome', '');
  v_numero text := nullif(p_importacao->>'numero', '');
begin
  if v_unidade_id is null or coalesce(p_importacao->>'chave_acesso', '') = '' then
    raise exception 'Unidade ou chave de acesso da NF-e ausente.';
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A NF-e nao possui itens para importar.';
  end if;

  insert into public.nfe_importacoes (
    unidade_id, chave_acesso, modelo, serie, numero, data_emissao,
    fornecedor_cnpj, fornecedor_nome, valor_produtos, valor_frete,
    valor_seguro, valor_desconto, valor_outro, valor_total,
    xml_original, importado_por
  ) values (
    v_unidade_id, p_importacao->>'chave_acesso', p_importacao->>'modelo',
    p_importacao->>'serie', v_numero, nullif(p_importacao->>'data_emissao', '')::timestamptz,
    p_importacao->>'fornecedor_cnpj', v_fornecedor,
    coalesce((p_importacao->>'valor_produtos')::numeric, 0),
    coalesce((p_importacao->>'valor_frete')::numeric, 0),
    coalesce((p_importacao->>'valor_seguro')::numeric, 0),
    coalesce((p_importacao->>'valor_desconto')::numeric, 0),
    coalesce((p_importacao->>'valor_outro')::numeric, 0),
    coalesce((p_importacao->>'valor_total')::numeric, 0),
    p_importacao->>'xml_original', p_responsavel
  ) returning id into v_importacao_id;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_quantidade := coalesce((v_item->>'quantidade')::numeric, 0);
    v_custo := coalesce((v_item->>'custo_unitario')::numeric, 0);
    if v_quantidade <= 0 then raise exception 'Quantidade invalida no item %.', v_item->>'descricao'; end if;

    v_peca_id := nullif(v_item->>'peca_id', '')::bigint;
    if v_peca_id is null then
      insert into public.pecas (
        unidade_id, codigo, codigo_barras, descricao, categoria, marca, ncm,
        valor_custo, valor_venda, estoque, estoque_minimo, localizacao, ativo
      ) values (
        v_unidade_id, nullif(v_item->>'codigo', ''), nullif(v_item->>'codigo_barras', ''),
        v_item->>'descricao', nullif(v_item->>'categoria', ''), nullif(v_item->>'marca', ''),
        nullif(v_item->>'ncm', ''), v_custo,
        coalesce((v_item->>'valor_venda')::numeric, 0), 0,
        coalesce((v_item->>'estoque_minimo')::numeric, 0), nullif(v_item->>'localizacao', ''), true
      ) returning id, estoque into v_peca_id, v_estoque_anterior;
    else
      select estoque into v_estoque_anterior
      from public.pecas
      where id = v_peca_id and unidade_id = v_unidade_id
      for update;
      if not found then raise exception 'Peca % nao encontrada na unidade selecionada.', v_peca_id; end if;
    end if;

    v_estoque_anterior := coalesce(v_estoque_anterior, 0);
    v_estoque_posterior := v_estoque_anterior + v_quantidade;

    update public.pecas set
      estoque = v_estoque_posterior,
      valor_custo = case when coalesce((v_item->>'atualizar_custo')::boolean, true) then v_custo else valor_custo end,
      codigo_barras = coalesce(nullif(codigo_barras, ''), nullif(v_item->>'codigo_barras', '')),
      ncm = coalesce(nullif(ncm, ''), nullif(v_item->>'ncm', '')),
      atualizado_em = now()
    where id = v_peca_id;

    insert into public.nfe_importacao_itens (
      importacao_id, peca_id, numero_item, codigo_fornecedor, codigo_barras,
      descricao, ncm, cfop, unidade_comercial, quantidade, valor_unitario_xml,
      valor_total_xml, custo_unitario_estoque, estoque_anterior, estoque_posterior
    ) values (
      v_importacao_id, v_peca_id, nullif(v_item->>'numero_item', '')::integer,
      v_item->>'codigo', v_item->>'codigo_barras', v_item->>'descricao',
      v_item->>'ncm', v_item->>'cfop', v_item->>'unidade', v_quantidade,
      coalesce((v_item->>'valor_unitario_xml')::numeric, 0),
      coalesce((v_item->>'valor_total_xml')::numeric, 0), v_custo,
      v_estoque_anterior, v_estoque_posterior
    );

    insert into public.pecas_movimentacoes (
      peca_id, unidade_id, nfe_importacao_id, tipo, quantidade,
      estoque_anterior, estoque_posterior, observacao
    ) values (
      v_peca_id, v_unidade_id, v_importacao_id, 'ENTRADA_XML_NFE', v_quantidade,
      v_estoque_anterior, v_estoque_posterior,
      format('NF-e %s - %s - importada por %s', coalesce(v_numero, '-'), coalesce(v_fornecedor, '-'), p_responsavel)
    );
  end loop;

  if p_gerar_contas then
    if jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb)) = 0 then
      raise exception 'Informe ao menos uma parcela para contas a pagar.';
    end if;
    select coalesce(sum((value->>'valor')::numeric), 0)
      into v_total_parcelas
      from jsonb_array_elements(p_parcelas);
    if abs(v_total_parcelas - coalesce((p_importacao->>'valor_total')::numeric, 0)) > 0.02 then
      raise exception 'A soma das parcelas deve ser igual ao total da NF-e.';
    end if;
    for v_parcela in select value from jsonb_array_elements(p_parcelas)
    loop
      if coalesce((v_parcela->>'valor')::numeric, 0) <= 0 then raise exception 'Valor de parcela invalido.'; end if;
      if coalesce(v_parcela->>'vencimento', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Vencimento de parcela invalido.'; end if;
      insert into public.contas_pagar (
        unidade_id, nfe_importacao_id, nfe_parcela_numero, descricao, fornecedor,
        categoria, classificacao_dre, valor, vencimento, status, observacao
      ) values (
        v_unidade_id, v_importacao_id, nullif(v_parcela->>'numero', ''),
        format('NF-e %s - parcela %s', coalesce(v_numero, '-'), coalesce(nullif(v_parcela->>'numero', ''), '-')),
        v_fornecedor, 'PECAS_ESTOQUE', 'CUSTO_DIRETO',
        (v_parcela->>'valor')::numeric, nullif(v_parcela->>'vencimento', '')::date,
        'PENDENTE', format('Importada automaticamente da NF-e. Chave: %s', p_importacao->>'chave_acesso')
      );
    end loop;
  end if;

  return v_importacao_id;
exception
  when unique_violation then
    raise exception 'Esta NF-e ja foi importada anteriormente.';
end;
$$;

revoke all on function public.confirmar_importacao_nfe(jsonb, jsonb, jsonb, boolean, text) from public;
grant execute on function public.confirmar_importacao_nfe(jsonb, jsonb, jsonb, boolean, text) to service_role;
