alter table public.ordens_servico
add column if not exists tecnico_agendado_para timestamptz;
