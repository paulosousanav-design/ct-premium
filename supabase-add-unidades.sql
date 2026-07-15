create table if not exists unidades (
  id bigserial primary key,
  codigo text not null unique,
  tipo text not null check (tipo in ('MATRIZ', 'FILIAL')),
  nome_fantasia text not null,
  razao_social text,
  cnpj text,
  telefone text,
  whatsapp text,
  email text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  estado text,
  complemento text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists unidades_unica_matriz_idx
on unidades (tipo) where tipo = 'MATRIZ';

insert into unidades (
  codigo, tipo, nome_fantasia, razao_social, cnpj, telefone, whatsapp,
  email, cep, logradouro, numero, bairro, cidade, estado, complemento
)
select
  'MATRIZ', 'MATRIZ', coalesce(nullif(nome_fantasia, ''), 'Chame o Tecnico'),
  razao_social, cnpj, telefone, whatsapp, email, cep, logradouro,
  numero, bairro, cidade, estado, complemento
from empresas
where ativa = true and not exists (select 1 from unidades where tipo = 'MATRIZ')
order by id
limit 1;

insert into unidades (codigo, tipo, nome_fantasia)
select 'MATRIZ', 'MATRIZ', 'Chame o Tecnico'
where not exists (select 1 from unidades where tipo = 'MATRIZ');

alter table admin_usuarios
add column if not exists unidade_padrao_id bigint references unidades(id);

create table if not exists admin_usuario_unidades (
  admin_usuario_id bigint not null references admin_usuarios(id) on delete cascade,
  unidade_id bigint not null references unidades(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (admin_usuario_id, unidade_id)
);

insert into admin_usuario_unidades (admin_usuario_id, unidade_id)
select usuario.id, matriz.id
from admin_usuarios usuario
cross join lateral (select id from unidades where tipo = 'MATRIZ' limit 1) matriz
on conflict do nothing;

update admin_usuarios
set unidade_padrao_id = (select id from unidades where tipo = 'MATRIZ' limit 1)
where unidade_padrao_id is null;

update admin_usuarios
set permissoes = array_append(permissoes, 'unidades')
where 'usuarios' = any(permissoes)
  and not ('unidades' = any(permissoes));

create index if not exists admin_usuario_unidades_unidade_idx
on admin_usuario_unidades (unidade_id, admin_usuario_id);

alter table unidades enable row level security;
alter table admin_usuario_unidades enable row level security;
