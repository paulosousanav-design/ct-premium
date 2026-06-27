alter table ordens_servico
add column if not exists forma_recebimento text;

alter table ordens_servico
add column if not exists forma_pagamento_tecnico text;
