-- Encerramento administrativo de OS sem execucao do reparo.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.ordens_servico
  add column if not exists encerramento_motivo text,
  add column if not exists encerramento_observacao text,
  add column if not exists encerramento_taxa_diagnostico numeric(12,2) not null default 0,
  add column if not exists encerrada_sem_reparo_em timestamptz,
  add column if not exists encerrada_sem_reparo_por text;

comment on column public.ordens_servico.encerramento_motivo is
  'Motivo do encerramento da OS sem execucao do reparo.';
comment on column public.ordens_servico.encerramento_taxa_diagnostico is
  'Valor cobrado somente pelo diagnostico/visita quando a OS e encerrada sem reparo.';

create index if not exists ordens_servico_status_encerrada_idx
  on public.ordens_servico (status, encerrada_sem_reparo_em desc);
