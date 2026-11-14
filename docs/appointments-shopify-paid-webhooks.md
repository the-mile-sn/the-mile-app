# The Mile — Shopify checkout + pagamento (fase 6.2)

## O que foi desenvolvido

Esta fase prepara a ponte segura entre o motor de agendamentos The Mile e uma **aplicação Shopify própria da The Mile**:

- `POST /api/v2/shopify/app-proxy/hold`: o pedido da loja só é aceite após validação HMAC dos parâmetros do app proxy, do domínio Shopify, do timestamp (5 min) e das regras de ativação. Cria a retenção transacional já existente de 15 minutos e devolve apenas variante, quantidade 1 e propriedades de linha com identificador opaco de retenção e assinatura.
- `POST /api/v2/shopify/webhooks/orders-paid`: verifica a assinatura HMAC do **corpo exato** do webhook, domínio da loja, tópico `orders/paid` e ID de entrega antes de ler ou processar uma encomenda.
- O webhook só confirma uma reserva após verificar a assinatura opaca da retenção, a variante, quantidade, preço de referência, EUR, pagamento `paid`, validade da retenção e inexistência de marcação sobreposta. Mantém a atribuição definitiva de profissional, incluindo «Qualquer profissional».
- A confirmação Shopify fica numa tabela separada, associada à encomenda, e aparece **em modo de leitura** em Reservas e Agenda do backoffice. A origem é «Shopify», o pagamento «pago». Não é editável através das rotas de marcação manual.
- Entregas duplicadas são idempotentes; pagamentos tardios, preços alterados, conflitos e assinaturas de linha inválidas geram **registo para revisão manual**. Nunca é criada automaticamente uma reserva concorrente.
- O painel de Configuração pode mostrar contagens de reservas pagas e casos para revisão.
- Os compromissos Google podem continuar a ser bloqueados manualmente; ainda não são criados eventos Google nesta fase.

**Importante: nada disto está ativo para compradores reais.** O código funciona sob chaves próprias e sinalizadores desligados por predefinição. A conexão existente do ChatGPT ao Shopify é uma aplicação diferente e o seu segredo não pode ser usado nesta integração.

## Aplicação Shopify própria — dependência de ativação

Criar na [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) uma aplicação dedicada **The Mile Booking**, instalar na loja `the-mile-sports-nutrition.myshopify.com` e configurar um app proxy.

Definir **um único app proxy** com:

- *Storefront route*: `/apps/the-mile-booking`.
- *Proxy destination*: `https://admin.themile.pt/api/v2/shopify/app-proxy`.
- Chamadas a `/apps/the-mile-booking/hold` são encaminhadas para `/api/v2/shopify/app-proxy/hold`.

Em configuração baseada em TOML, os campos correspondentes são:

```toml
[app_proxy]
url = "https://admin.themile.pt/api/v2/shopify/app-proxy"
prefix = "apps"
subpath = "the-mile-booking"

[webhooks]
api_version = "2026-10"

[[webhooks.subscriptions]]
topics = ["orders/paid"]
uri = "https://admin.themile.pt/api/v2/shopify/webhooks/orders-paid"
```

A aplicação precisa de ser instalada e a subscrição efetivamente ativada. Não usar as credenciais nem registar os webhooks da app Shopify ChatGPT MCP. A configuração de notificações GDPR obrigatórias da app deve ser tratada à parte.

### Variáveis no Render — apenas no serviço administrativo The Mile

- `MILE_SHOPIFY_APP_SECRET`: segredo da **aplicação própria** da The Mile, com pelo menos 32 caracteres.
- `MILE_SHOPIFY_SHOP_DOMAIN=the-mile-sports-nutrition.myshopify.com`.
- `MILE_SHOPIFY_WEBHOOK_ENABLED=0` por omissão; só ativar após testes de assinatura e subscrição.
- `MILE_SHOPIFY_CHECKOUT_ENABLED=0` por omissão; só ativar após validação end-to-end e app proxy instalado.
- `MILE_SHOPIFY_SESAMI_MIGRATED=0` por omissão. Só passar a `1` depois de importar/reproduzir e confirmar todas as reservas futuras e bloqueios do Sesami.

O checkout só pode ser ativado quando **os três flags e o segredo** estiverem válidos. Não colocar segredos em temas, GitHub, mensagens nem no browser.

## O que o código **não** deve ainda fazer

- Não publicar o novo tema nem substituir o Sesami antes da transição.
- Não processar encomendas do site real usando os webhooks de outra app.
- Não marcar como paga uma reserva com base no regresso do cliente do checkout.
- Não confirmar automaticamente pagamentos recebidos após expiração: vão para revisão manual, para potencial remarcação/reembolso pelo processo apropriado.
- Não interpretar cancelamento de consulta como reembolso automático.
- Não criar ainda eventos Google Calendar.
- Não assumir que a retenção garante um horário além de 15 minutos.

## Checklist de validação antes da ativação

1. Confirmar na Shopify as variantes e preços dos serviços que podem ser marcados.
2. Criar a aplicação da The Mile e instalar o app proxy e webhook no ambiente aprovado.
3. Testar retenção de 15 min, seleção «Qualquer profissional», carrinho, compra e pagamento numa experiência controlada.
4. Confirmar que o `orders/paid` assinado cria **uma** reserva na Agenda, com ID da encomenda.
5. Repetir a mesma entrega e confirmar que não gera nova reserva.
6. Testar compra modificada, pagamento tardio, pagamento pendente, variante errada, desconto e dois clientes em simultâneo.
7. Confirmar que avisos de pagamento em revisão são vistos e resolvidos pela equipa.
8. Reproduzir as futuras reservas e bloqueios do Sesami, validar `Europe/Lisbon` e hora de verão, e só depois abrir o checkout The Mile ao público.
9. Preparar a criação e atualização de eventos Google após confirmação de pagamento.

## Referências Shopify

- [App proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies)
- [Autenticar app proxy](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies)
- [Shopify Ajax Cart API](https://shopify.dev/docs/api/ajax/reference/cart)
- [Validar webhooks](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Configurar subscrições](https://shopify.dev/docs/apps/build/webhooks/subscribe)

Nota: a própria cópia de teste Shopify pode continuar a apresentar horários reais sem confirmar compras, até esta checklist estar concluída.
