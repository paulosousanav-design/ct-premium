alter table parceiros
add column if not exists foto_cracha_url text,
add column if not exists cracha_codigo text unique,
add column if not exists cracha_status text not null default 'SEM_FOTO',
add column if not exists cracha_validade date,
add column if not exists cracha_aprovado_por text,
add column if not exists cracha_aprovado_em timestamptz;

insert into storage.buckets (id, name, public)
values ('tecnico-crachas', 'tecnico-crachas', true)
on conflict (id) do update set public = excluded.public;
