# The Mile — Google Calendar (Fase 5.1)

A implementação está preparada no backoffice, mas não fica ativa enquanto não existir um cliente Google OAuth da The Mile e cada profissional não autorizar a respetiva conta.

## Configuração Google Cloud

1. Criar ou utilizar um projeto Google Cloud gerido pela The Mile.
2. Ativar a Google Calendar API.
3. Configurar o ecrã de consentimento OAuth, com utilizadores de teste quando aplicável.
4. Criar credenciais OAuth do tipo Web application.
5. Adicionar este URI de redirecionamento exato: https://admin.themile.pt/api/v2/admin/appointments/google/callback
6. Opcionalmente, adicionar a origem JavaScript autorizada https://admin.themile.pt.

Scopes pedidos nesta fase:
- calendar.calendarlist.readonly: consulta a lista e os nomes dos calendários.
- calendar.freebusy: consulta períodos ocupados/livres.

O sistema não solicita ainda permissão de escrita em eventos Google.

Referências:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query

## Segredos do serviço Render the-mile-admin

Configurar apenas no ambiente do serviço de administração, nunca no GitHub ou em mensagens:

- MILE_GOOGLE_CLIENT_ID: client ID do Google Cloud.
- MILE_GOOGLE_CLIENT_SECRET: client secret do Google Cloud.
- MILE_GOOGLE_TOKEN_KEY: chave Fernet aleatória em base64, gerada em local seguro.
- MILE_GOOGLE_REDIRECT_URI: opcional (por omissão o URI exato apresentado acima).

Para gerar a chave localmente num terminal seguro:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Preservar a chave num gestor de segredos: a substituição invalida a desencriptação dos refresh tokens existentes. Se faltarem credenciais, a ligação aparece desativada sem interferir com o agendamento atual.

## Autorizar os profissionais

1. Entrar como administrador em https://admin.themile.pt/admin-appointments#configuracao.
2. Abrir a secção Google Calendar e escolher o profissional.
3. Ligar a conta Google e permitir os scopes apresentados pela Google; a palavra-passe nunca é recolhida pela The Mile.
4. Selecionar um ou mais calendários que bloqueiam horários.
5. Opcionalmente escolher o calendário para futuras consultas The Mile. A escrita de eventos só será ativada numa fase posterior.
6. Guardar e testar com um compromisso ocupado no Google em horário publicado.

Após a ativação, o calendário de reservas interno considera os intervalos ocupado/livre da Google. Uma falha na consulta bloqueia a confirmação da vaga em vez de a mostrar como livre.

## Limitações e segurança

- OAuth validado com estado aleatório de utilização única, expiração e sessão de administrador.
- Tokens Google guardados cifrados com Fernet e nunca enviados ao browser.
- Sem guardar títulos, descrições, convidados ou locais de compromissos pessoais: só são consultados intervalos ocupado/livre.
- Desligar elimina a ligação e as preferências locais, sem alterar o Google Calendar.
- Sesami, pagamentos Shopify e compromissos exclusivos do iCloud continuam fora desta integração.
- Marcação, reagendamento e cancelamento de eventos Google ficam para a fase de sincronização de escrita.
- Nesta fase o profissional autoriza a Google numa sessão iniciada no backoffice por administrador; o consentimento autónomo por convite será trabalhado quando existirem acessos profissionais.
