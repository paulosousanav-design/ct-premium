-- Isolamento das ordens de serviço por organização SaaS.
-- Execute este arquivo no SQL Editor do Supabase antes de usar OS em oficinas clientes.

begin;

alter table public.ordens_servico
  add column if not exists organizacao_id bigint references public.saas_organizacoes(id);

-- As OS existentes são do grupo interno, exceto quando a unidade já indicar outra organização.
update public.ordens_servico os
set organizacao_id = u.organizacao_id
from public.unidades u
where os.unidade_id = u.id
  and os.organizacao_id is null
  and u.organizacao_id is not null;

update public.ordens_servico
set organizacao_id = (
  select id from public.saas_organizacoes where slug = 'grupo-interno' limit 1
)
where organizacao_id is null;

alter table public.ordens_servico
  alter column organizacao_id set not null;

create index if not exists ordens_servico_organizacao_idx
  on public.ordens_servico (organizacao_id, created_at desc);

-- A sequência fica em uma linha por organização. O UPDATE do UPSERT é atômico,
-- portanto duas OS abertas ao mesmo tempo não recebem o mesmo número.
create table if not exists public.organizacao_sequencias_os (
  organizacao_id bigint primary key references public.saas_organizacoes(id) on delete cascade,
  ultimo_numero bigint not null default 0 check (ultimo_numero >= 0)
);

create unique index if not exists ordens_servico_organizacao_numero_unico
  on public.ordens_servico (organizacao_id, numero_os);

create or replace function public.atribuir_numero_sequencial_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proximo_numero bigint;
  numero_formatado text;
begin
  if new.organizacao_id is null then
    raise exception 'A organização da OS é obrigatória.';
  end if;

  -- Preserva números históricos e gera novos no padrão neutro OS000001.
  if new.numero_os is null
     or btrim(new.numero_os) = ''
     or new.numero_os !~ '^OS[0-9]{6}$' then
    loop
      insert into public.organizacao_sequencias_os (organizacao_id, ultimo_numero)
      values (new.organizacao_id, 1)
      on conflict (organizacao_id) do update
        set ultimo_numero = public.organizacao_sequencias_os.ultimo_numero + 1
      returning ultimo_numero into proximo_numero;

      if proximo_numero > 999999 then
        raise exception 'A numeração de OS ultrapassou o limite OS999999.';
      end if;

      numero_formatado := 'OS' || lpad(proximo_numero::text, 6, '0');
      exit when not exists (
        select 1
        from public.ordens_servico
        where organizacao_id = new.organizacao_id
          and numero_os = numero_formatado
      );
    end loop;

    new.numero_os := numero_formatado;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_atribuir_numero_sequencial_os on public.ordens_servico;

create trigger trg_atribuir_numero_sequencial_os
before insert on public.ordens_servico
for each row
execute function public.atribuir_numero_sequencial_os();

commit;
