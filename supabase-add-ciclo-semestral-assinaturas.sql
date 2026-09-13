-- Execute uma única vez no SQL Editor do Supabase para habilitar o ciclo semestral.
-- ANUAL permanece somente para preservar eventuais assinaturas antigas; não é mais oferecido no sistema.
alter table saas_assinaturas
  drop constraint if exists saas_assinaturas_ciclo_check;

alter table saas_assinaturas
  add constraint saas_assinaturas_ciclo_check
  check (ciclo in ('MENSAL', 'SEMESTRAL', 'ANUAL'));
