-- CT Premium - correcao da importacao de XML da NF-e
-- Corrige: column "atualizado_em" of relation "pecas" does not exist
-- Pode ser executado com o sistema em uso e nao altera os dados das pecas.

alter table public.pecas
add column if not exists atualizado_em timestamptz not null default now();
