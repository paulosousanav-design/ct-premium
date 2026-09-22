-- Correção pontual das duas OS abertas com numeração incorreta em 22/09/2026.
-- Altera SOMENTE as OS 305 (OS000001) e 306 (OS000002), preservando todos os demais dados.

begin;

lock table public.ordens_servico in share row exclusive mode;

do $$
declare
  os_alvo record;
  proximo_numero bigint;
  numero_ct text;
  encontradas integer;
begin
  select count(*) into encontradas
  from public.ordens_servico
  where (id = 305 and numero_os = 'OS000001')
     or (id = 306 and numero_os = 'OS000002');

  if encontradas <> 2 then
    raise exception 'As OS 305 e 306 não estão mais no estado esperado. Nenhum registro foi alterado.';
  end if;

  for os_alvo in
    select id
    from public.ordens_servico
    where id in (305, 306)
    order by id
  loop
    loop
      proximo_numero := nextval('public.ordens_servico_numero_seq');
      if proximo_numero > 999999 then
        raise exception 'A numeração de OS ultrapassou o limite CT999999.';
      end if;

      numero_ct := 'CT' || lpad(proximo_numero::text, 6, '0');
      exit when not exists (
        select 1 from public.ordens_servico where numero_os = numero_ct
      );
    end loop;

    update public.ordens_servico
    set numero_os = numero_ct
    where id = os_alvo.id;
  end loop;
end;
$$;

commit;

select id, numero_os, created_at, status
from public.ordens_servico
where id in (305, 306)
order by id;
