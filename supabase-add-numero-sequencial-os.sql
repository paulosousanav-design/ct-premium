-- Numeração sequencial das ordens de serviço.
-- Mantém as OS antigas e inicia as novas após a quantidade total já cadastrada.

begin;

create sequence if not exists public.ordens_servico_numero_seq
  as bigint
  minvalue 1
  start with 1;

lock table public.ordens_servico in share row exclusive mode;

do $$
declare
  quantidade_ordens bigint;
  maior_numero_novo bigint;
  numero_base bigint;
begin
  select count(*)
    into quantidade_ordens
    from public.ordens_servico;

  select coalesce(max(substring(numero_os from 3 for 6)::bigint), 0)
    into maior_numero_novo
    from public.ordens_servico
   where numero_os ~ '^CT[0-9]{6}$';

  numero_base := greatest(quantidade_ordens, maior_numero_novo, 0);

  if numero_base = 0 then
    perform setval('public.ordens_servico_numero_seq', 1, false);
  else
    perform setval('public.ordens_servico_numero_seq', numero_base, true);
  end if;
end;
$$;

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
  -- Durante a transição, também substitui o formato antigo enviado por versões
  -- anteriores do sistema. Uma OS já informada no novo padrão é preservada.
  if new.numero_os is null
     or btrim(new.numero_os) = ''
     or new.numero_os !~ '^CT[0-9]{6}$' then
    loop
      proximo_numero := nextval('public.ordens_servico_numero_seq');

      if proximo_numero > 999999 then
        raise exception 'A numeração de OS ultrapassou o limite CT999999.';
      end if;

      numero_formatado := 'CT' || lpad(proximo_numero::text, 6, '0');
      exit when not exists (
        select 1
          from public.ordens_servico
         where numero_os = numero_formatado
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
