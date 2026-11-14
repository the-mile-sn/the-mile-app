# The Mile Booking — instalação da aplicação própria no Shopify

> Preparado em 14/11/2026. **O Sesami e o checkout público continuam ativos apenas no fluxo atual.** Não publicar o novo checkout antes de migrar as reservas futuras.

## Confirmado por leitura

- Loja: `the-mile-sports-nutrition.myshopify.com`, EUR, Europe/Lisbon, Shopify Basic.
- O Sesami Booking App está instalado.
- **Não foi encontrada uma aplicação instalada chamada The Mile Booking** na lista de aplicações Shopify consultada.
- As oito variantes correspondentes aos quatro serviços iniciais de marcação existem, estão ativas, disponíveis e com os preços esperados na loja. Isto **não substitui** uma confirmação dos preços e variantes no catálogo interno imediatamente antes da ativação.

## Ação de proprietário no Shopify Dev Dashboard

A Shopify exige que um utilizador autorizado da organização crie e instale uma aplicação própria. A ligação Shopify da conversa do ChatGPT é de uma aplicação diferente e **não pode** criar ou instalar a The Mile Booking.

1. Abrir **[Shopify Dev Dashboard](https://dev.shopify.com/dashboard)** (conta com permissão para criar aplicações).
2. **Apps → Create app → Start from Dev Dashboard**. Nome: **The Mile Booking**.
3. Abrir **Versions → Create version**. Aplicação para integração com backend externo; não é necessário construir um novo painel administrativo dentro do Shopify, pois o backoffice é o The Mile V2.
4. Conceder apenas os âmbitos necessários: **`read_orders`** (encomendas pagas) e **`write_app_proxy`** (ligação loja→The Mile). Se a Shopify solicitar validação de acesso a dados pessoais de clientes, completar essa configuração oficial antes de receber esses dados.
5. **App proxy** (na configuração da versão):
   - Prefix: `apps`
   - Subpath: `the-mile-booking`
   - Proxy URL: `https://admin.themile.pt/api/v2/shopify/app-proxy`
   - O pedido `POST /apps/the-mile-booking/hold` deverá chegar à rota `POST /api/v2/shopify/app-proxy/hold` do backend.
6. **Webhook** `orders/paid` com destino HTTPS:
   - `https://admin.themile.pt/api/v2/shopify/webhooks/orders-paid`
   - API webhooks: **2026-10** (versão já prevista na documentação técnica; rever se for alterada na Shopify).
7. **Release** da versão. **Install app → escolher The Mile Sports Nutrition → Install** e aceitar os âmbitos solicitados.
8. No dashboard da aplicação, recolher **a chave secreta da própria aplicação The Mile Booking**. **Não enviar essa chave pelo ChatGPT, por email, WhatsApp nem adicioná-la ao GitHub.** Guardar diretamente como variável secreta no Render da The Mile, no serviço **the-mile-admin**: `MILE_SHOPIFY_APP_SECRET`.
9. Manter as variáveis de ativação em **0** até estarem concluídos os testes da ligação e a reprodução das futuras reservas Sesami.

## Endpoints e variáveis (já implementados)

| Item | Valor |
| --- | --- |
| Domínio da loja | `the-mile-sports-nutrition.myshopify.com` |
| Shopify app proxy | `/apps/the-mile-booking` |
| Destino do proxy | `https://admin.themile.pt/api/v2/shopify/app-proxy` |
| Receção de pagamentos | `https://admin.themile.pt/api/v2/shopify/webhooks/orders-paid` |
| `MILE_SHOPIFY_SHOP_DOMAIN` | `the-mile-sports-nutrition.myshopify.com` |
| `MILE_SHOPIFY_APP_SECRET` | **Chave secreta gerada pela aplicação, apenas no Render** |
| `MILE_SHOPIFY_WEBHOOK_ENABLED` | **0**, até confirmar assinatura e subscrição |
| `MILE_SHOPIFY_CHECKOUT_ENABLED` | **0**, até validar checkout e controlo de pagamentos |
| `MILE_SHOPIFY_SESAMI_MIGRATED` | **0**, até validar reservas e bloqueios futuros |

A presença da chave no servidor **não prova** que a aplicação esteja instalada; essa confirmação tem de ser feita no dashboard Shopify.

## Testes obrigatórios após instalação

- Fazer um pedido de **teste sem cobrança real**, com serviço/variante correta, cliente de teste e profissional definido, verificando o app proxy.
- Validar que o webhook verdadeiro `orders/paid` chega com assinatura HMAC válida e só gera uma reserva.
- Confirmar idempotência de notificações duplicadas; falhas de assinatura e pagamentos tardios geram revisão, nunca ocupação dupla.
- Confirmar na aba **Agendamentos** que a reserva identifica encomenda, estado de pagamento e profissional atribuído.
- Reproduzir antecipadamente as marcações futuras do Sesami como bloqueios ou reservas internas, evitando disponibilizar vagas já ocupadas.
- Validar online e presencial no mesmo profissional; 45/90 min, janela 60 dias, intervalos 15 min, fuso Europe/Lisbon e transição de hora.
- Só depois de passar esta checklist considerar `MILE_SHOPIFY_SESAMI_MIGRATED=1`, `MILE_SHOPIFY_WEBHOOK_ENABLED=1` e `MILE_SHOPIFY_CHECKOUT_ENABLED=1`. A publicação do novo template é um passo separado.

## Recursos oficiais

- [Criar apps no Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard)
- [Configurar app proxy](https://shopify.dev/docs/apps/build/online-store/app-proxies)
- [Gerir subscrições de webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe)
- [Validar assinaturas de webhook](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Dados de clientes protegidos](https://shopify.dev/docs/apps/launch/protected-customer-data)
