# The Mile — teste seguro do webhook `orders/paid`

## Objetivo

Validar o processamento de uma notificação de pagamento de demonstração sem criar encomendas, cobrar clientes, confirmar consultas ou alterar a base de dados. Esta verificação confirma o comportamento **interno** do servidor; **não demonstra** que o Shopify entregou uma notificação real através da Internet.

## Como executar

No backoffice administrativo The Mile V2, abrir **Agendamentos → Configuração → Shopify e pagamentos** e premir **Testar webhook (simulação segura)**.

A operação usa a chave secreta da aplicação The Mile Booking, já guardada no Render. A chave não sai do servidor e nunca é devolvida ao browser.

O teste executa os mesmos validadores do webhook `orders/paid` com uma encomenda fictícia **sem linha de reserva The Mile**:

- assinatura HMAC válida sobre o corpo exato da notificação;
- identificação do domínio Shopify e do tópico `orders/paid`;
- evento não associado a consultas ignorado, sem marcação;
- repetição da mesma entrega aceite sem duplicação;
- rejeição de assinatura adulterada, loja errada, tópico errado e JSON inválido;
- todas as escritas de teste anuladas por um `SAVEPOINT` transacional;
- confirmação de que o registo de teste não permaneceu na base de dados.

Requer `MILE_SHOPIFY_APP_SECRET` e `MILE_SHOPIFY_WEBHOOK_ENABLED=1` no serviço administrativo. Mantém `MILE_SHOPIFY_CHECKOUT_ENABLED=0` e `MILE_SHOPIFY_SESAMI_MIGRATED=0`.

## Limites

O resultado só é positivo para a **simulação interna**. Para verificar uma entrega originada pela própria Shopify, utilizar os registos **The Mile Booking → Registos (Logs)** no Shopify Dev Dashboard, filtrando `Type = Webhook` e `Topic = orders/paid`, depois de ocorrer um evento real ou um envio sintético autorizado pelo Shopify CLI. Os registos podem demorar alguns minutos a aparecer. O comando CLI `shopify app webhook trigger` envia payloads sintéticos diretamente ao destino e **não valida a subscrição real**.

Um teste com um evento sem reserva não valida os casos de confirmação de uma vaga efetivamente paga. Antes de abrir o checkout, executar o circuito controlado com app proxy, carrinho, pagamento de teste, confirmação, recuperação de erros e migração Sesami.

**Nunca ativar o novo checkout público apenas porque este teste passou.** O Sesami continua ativo até à transição e validação completas.

Documentação Shopify:
- https://shopify.dev/docs/apps/build/webhooks/troubleshoot
- https://shopify.dev/docs/api/shopify-cli/app/app-webhook-trigger
