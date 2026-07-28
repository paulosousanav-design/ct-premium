alter table rotas
add column if not exists km_planejado numeric(12,2) not null default 0
check (km_planejado >= 0);

alter table rotas
add column if not exists duracao_planejada_min integer not null default 0
check (duracao_planejada_min >= 0);

alter table rotas
add column if not exists retorna_origem boolean not null default true;

alter table rotas
add column if not exists ordem_otimizada jsonb not null default '[]'::jsonb;

alter table rotas
add column if not exists rota_calculada_em timestamptz;

comment on column rotas.km_planejado is
'Distancia estimada automaticamente pela Google Routes API.';

comment on column rotas.km_total is
'Quilometragem real informada no fechamento da rota.';

comment on column rotas.ordem_otimizada is
'Sequencia otimizada dos IDs das OS calculada pelo mapa.';
