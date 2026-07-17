-- Controle de custodia, aviso e entrega de equipamentos.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.ordens_servico
  add column if not exists equipamento_entrega_status text not null default 'NAO_APLICAVEL',
  add column if not exists aguardando_retirada_em timestamptz,
  add column if not exists cliente_avisado_em timestamptz,
  add column if not exists cliente_aviso_meio text,
  add column if not exists equipamento_entregue_em timestamptz,
  add column if not exists entregue_para_nome text,
  add column if not exists entregue_para_documento text,
  add column if not exists entrega_observacao text,
  add column if not exists entrega_registrada_por text;

comment on column public.ordens_servico.equipamento_entrega_status is
  'NAO_APLICAVEL, PENDENTE_DEFINICAO, AGUARDANDO_RETIRADA, ENTREGUE ou ATENDIMENTO_LOCAL.';

create index if not exists ordens_servico_retirada_pendente_idx
  on public.ordens_servico (unidade_id, equipamento_entrega_status, aguardando_retirada_em);
