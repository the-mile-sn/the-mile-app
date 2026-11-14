# The Mile Booking — registar webhook de pagamentos na própria aplicação

## Estado

A aplicação **The Mile Booking** já está instalada na loja Shopify, com a API de webhooks 2026-10.
O segredo da aplicação é introduzido diretamente no Render pela pessoa responsável; nunca deve ser transmitido por chat ou guardado no GitHub.

## Configuração segura no Render

No serviço **the-mile-admin**, configurar:

- `MILE_SHOPIFY_CLIENT_ID`: Client ID público da app The Mile Booking (verificado na Shopify; não confundir com o client ID da app ChatGPT).
- `MILE_SHOPIFY_APP_SECRET`: Client secret privado da **mesma app**; o valor só deve ser definido no Render.
- `MILE_SHOPIFY_SHOP_DOMAIN=the-mile-sports-nutrition.myshopify.com`.
- `MILE_SHOPIFY_WEBHOOK_ENABLED=1`: permite ao servidor verificar notificações oficiais da Shopify. Reservas pagas só podem ser confirmadas se existir uma retenção assinada e válida.
- **Manter** `MILE_SHOPIFY_CHECKOUT_ENABLED=0`.
- **Manter** `MILE_SHOPIFY_SESAMI_MIGRATED=0`.

A ativação do recetor de webhooks **não ativa o checkout**, nem publica novas vagas, nem altera o Sesami. Encomendas sem uma retenção The Mile assinada são ignoradas.

## Registo pelo backoffice

1. Entrar como administrador em `https://admin.themile.pt/admin-appointments#configuracao`.
2. Abrir a secção **Shopify e pagamentos**.
3. Verificar o estado de conexão e clicar em **Verificar e registar webhook Shopify**.
4. O backend usa o Client ID e o Client Secret diretamente no Render para solicitar um token de curta duração no domínio Shopify, consulta as subscrições pertencentes à aplicação The Mile Booking e, se não existir, regista uma única subscrição `orders/paid` para:
   `https://admin.themile.pt/api/v2/shopify/webhooks/orders-paid`
5. O painel apresenta «registado» ou «já registado». Clicar novamente é seguro e não duplica a subscrição.

A operação está limitada ao backoffice e protegida por sessão administrativa e CSRF. Nunca envia tokens de acesso para o navegador.

## Limites e testes

- Ainda não pode ser feita nenhuma compra de consultas através do novo checkout enquanto a migração do Sesami não for validada.
- A Shopify pode requerer validação adicional do acesso a dados pessoais protegidos ou autorização da aplicação para obter um token; se isso acontecer, o painel indica que a ligação não pôde ser concluída, sem alterar reservas.
- As notificações devem ser validadas através da assinatura HMAC original do Shopify e da loja de origem.
- As compras da loja **sem** identificador de retenção The Mile são ignoradas; notificações repetidas são tratadas de forma idempotente.
- Não usar as credenciais da app ChatGPT para registar a subscrição, pois a assinatura seria diferente e o backend não a reconheceria.
- Após o registo, testar uma entrega de webhook autenticada no ambiente controlado e só depois preparar as compras The Mile e a transição do Sesami.

Fontes:
- https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/webhookSubscriptionCreate
- https://shopify.dev/docs/apps/build/webhooks/subscribe
