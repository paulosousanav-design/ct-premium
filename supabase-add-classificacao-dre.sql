alter table public.contas_pagar
add column if not exists classificacao_dre text not null default 'DESPESA_OPERACIONAL';

update public.contas_pagar
set classificacao_dre = case
  when upper(coalesce(categoria, '')) = 'IMPOSTOS' then 'IMPOSTOS_SOBRE_VENDAS'
  when upper(coalesce(categoria, '')) in ('FORNECEDOR', 'PECAS_ESTOQUE') then 'CUSTO_DIRETO'
  when upper(coalesce(categoria, '')) in ('TAXAS_BANCARIAS') then 'DESPESA_FINANCEIRA'
  when upper(coalesce(categoria, '')) in ('ADMINISTRATIVO', 'ALUGUEL', 'CONTABILIDADE', 'SISTEMAS') then 'DESPESA_ADMINISTRATIVA'
  when upper(coalesce(categoria, '')) in ('MARKETING') then 'DESPESA_COMERCIAL'
  else 'DESPESA_OPERACIONAL'
end
where classificacao_dre is null
   or classificacao_dre = ''
   or classificacao_dre = 'DESPESA_OPERACIONAL';

alter table public.contas_pagar
drop constraint if exists contas_pagar_classificacao_dre_check;

alter table public.contas_pagar
add constraint contas_pagar_classificacao_dre_check check (
  classificacao_dre in (
    'CUSTO_DIRETO',
    'DESPESA_ADMINISTRATIVA',
    'DESPESA_COMERCIAL',
    'DESPESA_OPERACIONAL',
    'DESPESA_FINANCEIRA',
    'IMPOSTOS_SOBRE_VENDAS',
    'INVESTIMENTO',
    'NAO_OPERACIONAL'
  )
);

create index if not exists contas_pagar_classificacao_dre_idx
on public.contas_pagar (unidade_id, classificacao_dre, vencimento);
