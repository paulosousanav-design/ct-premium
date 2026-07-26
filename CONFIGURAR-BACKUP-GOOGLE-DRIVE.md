# Configurar o backup automático no Google Drive

## 1. Preparar o Google Cloud

1. Acesse o Google Cloud Console e crie ou selecione um projeto.
2. Em APIs e serviços, ative a **Google Drive API**.
3. Configure a tela de consentimento OAuth.
4. Crie uma credencial **OAuth Client ID** do tipo **Web application**.
5. Em **Authorized redirect URIs**, informe o endereço mostrado na Central de Backups.

Referências oficiais:

- https://developers.google.com/drive/api/guides/manage-uploads
- https://developers.google.com/identity/protocols/oauth2/web-server

## 2. Configurar a hospedagem

Cadastre estas variáveis no ambiente de produção:

- `GOOGLE_DRIVE_CLIENT_ID`: Client ID criado no Google Cloud.
- `GOOGLE_DRIVE_CLIENT_SECRET`: Client Secret criado no Google Cloud.
- `CRON_SECRET`: senha aleatória com pelo menos 32 caracteres.
- `BACKUP_ENCRYPTION_KEY`: senha aleatória diferente, com pelo menos 32 caracteres.

Não coloque os valores em arquivos versionados e não envie essas credenciais por WhatsApp.

## 3. Conectar e testar

1. Publique o sistema após cadastrar as variáveis.
2. Abra **Central de Backups**.
3. Clique em **Conectar meu Google Drive**.
4. Autorize a pasta do Chame o Técnico.
5. Clique em **Testar envio agora**.
6. Confirme o arquivo no Drive e então ative o backup diário.

O agendamento executa diariamente às 08:00 UTC, aproximadamente 04:00 em Cuiabá. No plano Hobby da Vercel, a execução pode ocorrer dentro da hora programada.
