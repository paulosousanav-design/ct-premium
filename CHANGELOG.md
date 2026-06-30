# CT Premium - Changelog

## V1.2.0 - 2026-06-30

Versao de consolidacao da plataforma apos publicacao inicial com abertura de chamados temporariamente fechada para clientes e auto cadastro de tecnicos ativo.

### Seguranca

- Ativacao de Row Level Security nas tabelas publicas do Supabase.
- Remocao do acesso anonimo direto as tabelas principais.
- Validacao no Supabase Security Advisor sem erros criticos.

### Operacao

- Cadastro e revisao de tecnicos pelo painel administrativo.
- Auto cadastro de tecnico com aceite LGPD e termo de prestador terceirizado.
- Fluxo de OS com garantia, garantidor e OS/sinistro do garantidor.
- Edicao administrativa de categoria, marca, modelo e numero de serie da OS.
- Impressao de OS ajustada para garantia e atendimento particular.

### Financeiro

- Separacao de recebimentos de cliente e garantidor/seguradora.
- Contas a pagar e contas pagas.
- Pagamento de tecnico com exigencia de NF/recibo.
- Ticket medio e indicadores financeiros.
- Relatorios financeiros com despesas, resultado liquido e visao mensal.

### Estoque

- Cadastro e edicao de pecas.
- Uso de peca do estoque ou peca avulsa na OS.
- Valor de custo para peca avulsa.
- Movimentacao de estoque por entrada, saida e ajuste.
- Relatorio de custo, venda, lucro e margem.

### Relatorios e cadastros

- Relatorio de clientes cadastrados automaticamente pelas OS.
- Relatorios operacionais e financeiros.
- Cadastro de garantidores com edicao.
- Cadastro de usuarios administrativos com permissoes por area.

### Portal publico

- Pagina inicial publicada em `www.chameotecnico.com.br`.
- Abertura de chamados exibindo aviso de liberacao futura.
- Auto cadastro de tecnicos ativo para formacao da rede de parceiros.
- Banner de cookies e aceite LGPD.

