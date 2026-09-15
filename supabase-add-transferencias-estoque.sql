-- Execute após supabase-add-unidades.sql e supabase-add-unidades-operacao.sql.
-- Transfere estoque entre CNPJs sem apagar histórico ou permitir saldo negativo.
begin;

create table if not exists public.estoque_transferencias (
  id bigserial primary key,
  unidade_origem_id bigint not null references public.unidades(id),
  unidade_destino_id bigint not null references public.unidades(id),
  peca_origem_id bigint not null references public.pecas(id),
  peca_destino_id bigint not null references public.pecas(id),
  quantidade numeric(12,2) not null check (quantidade > 0),
  valor_custo_unitario numeric(12,2) not null default 0,
  observacao text,
  responsavel text,
  criado_em timestamptz not null default now(),
  check (unidade_origem_id <> unidade_destino_id)
);
alter table public.pecas_movimentacoes add column if not exists transferencia_id bigint references public.estoque_transferencias(id);
create index if not exists estoque_transferencias_origem_idx on public.estoque_transferencias(unidade_origem_id, criado_em desc);
create index if not exists estoque_transferencias_destino_idx on public.estoque_transferencias(unidade_destino_id, criado_em desc);

create or replace function public.transferir_estoque_entre_empresas(
  p_unidade_origem bigint, p_unidade_destino bigint, p_peca_origem bigint,
  p_quantidade numeric, p_observacao text, p_responsavel text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_origem public.pecas%rowtype; v_destino public.pecas%rowtype; v_id bigint; v_anterior numeric; v_dest_anterior numeric;
begin
  if p_unidade_origem = p_unidade_destino or p_quantidade is null or p_quantidade <= 0 then raise exception 'Origem, destino e quantidade devem ser válidos.'; end if;
  select * into v_origem from public.pecas where id=p_peca_origem and unidade_id=p_unidade_origem for update;
  if not found then raise exception 'Peça de origem não encontrada.'; end if;
  if coalesce(v_origem.estoque,0) < p_quantidade then raise exception 'Saldo insuficiente para transferência.'; end if;
  select * into v_destino from public.pecas where unidade_id=p_unidade_destino and ((nullif(v_origem.codigo,'') is not null and codigo=v_origem.codigo) or (nullif(v_origem.codigo,'') is null and lower(descricao)=lower(v_origem.descricao) and coalesce(marca,'')=coalesce(v_origem.marca,''))) order by id limit 1 for update;
  if not found then
    insert into public.pecas(codigo,descricao,categoria,marca,valor_custo,valor_venda,estoque,estoque_minimo,localizacao,ativo,unidade_id)
    values(v_origem.codigo,v_origem.descricao,v_origem.categoria,v_origem.marca,v_origem.valor_custo,v_origem.valor_venda,0,v_origem.estoque_minimo,v_origem.localizacao,v_origem.ativo,p_unidade_destino) returning * into v_destino;
  end if;
  v_anterior:=coalesce(v_origem.estoque,0); v_dest_anterior:=coalesce(v_destino.estoque,0);
  update public.pecas set estoque=v_anterior-p_quantidade, atualizado_em=now() where id=v_origem.id;
  update public.pecas set estoque=v_dest_anterior+p_quantidade, atualizado_em=now() where id=v_destino.id;
  insert into public.estoque_transferencias(unidade_origem_id,unidade_destino_id,peca_origem_id,peca_destino_id,quantidade,valor_custo_unitario,observacao,responsavel)
  values(p_unidade_origem,p_unidade_destino,v_origem.id,v_destino.id,p_quantidade,coalesce(v_origem.valor_custo,0),nullif(p_observacao,''),nullif(p_responsavel,'')) returning id into v_id;
  insert into public.pecas_movimentacoes(peca_id,unidade_id,transferencia_id,tipo,quantidade,estoque_anterior,estoque_posterior,observacao) values
   (v_origem.id,p_unidade_origem,v_id,'TRANSFERENCIA_SAIDA',p_quantidade,v_anterior,v_anterior-p_quantidade,coalesce(p_observacao,'Transferência entre empresas')),
   (v_destino.id,p_unidade_destino,v_id,'TRANSFERENCIA_ENTRADA',p_quantidade,v_dest_anterior,v_dest_anterior+p_quantidade,coalesce(p_observacao,'Transferência entre empresas'));
  return v_id;
end $$;
commit;
