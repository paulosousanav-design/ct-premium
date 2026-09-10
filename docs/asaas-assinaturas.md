# Assinaturas CT Premium pelo Asaas

Esta integração recebe as mensalidades e anuidades do **CT Premium**. Ela é separada do financeiro usado pelas oficinas no dia a dia.

## 1. Banco de dados

No SQL Editor do Supabase, execute uma vez o arquivo `supabase-add-assinaturas-asaas.sql`.

## 2. Variáveis seguras

Cadastre no ambiente de hospedagem (Vercel, por exemplo), sem expor no navegador:

```env
ASAAS_ENV=sandbox
ASAAS_API_KEY=sua_chave_de_api_do_sandbox
ASAAS_WEBHOOK_TOKEN=um_token_forte_com_ao_menos_32_caracteres
```

Comece sempre com `ASAAS_ENV=sandbox`. Só mude para `production` depois de validar o fluxo e trocar pela chave de produção do Asaas.

## 3. Webhook no Asaas

Em **Integrações → Webhooks**, crie um webhook para:

```text
https://www.chameotecnico.com.br/api/webhooks/asaas
```

Use exatamente o valor de `ASAAS_WEBHOOK_TOKEN` como token de autenticação. Nunca use a chave de API como token do webhook.

Selecione, no mínimo, estes eventos:

- `PAYMENT_RECEIVED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`

## 4. Uso

No menu administrativo, abra **Assinaturas CT Premium**, informe o cliente, plano, ciclo, forma de pagamento e primeiro vencimento. O Asaas cria a primeira cobrança e as seguintes recorrências. O webhook atualiza o status local para ativa, em atraso ou cancelada.

Na primeira versão há Pix e boleto. Cobrança recorrente no cartão depende de tokenização segura do cartão e será adicionada numa etapa própria.
