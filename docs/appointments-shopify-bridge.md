# The Mile — Shopify Booking Bridge (fase 6.1)

## Implementado nesta fase

- A base de dados tem uma tabela independente para bloqueios de checkout, associada aos serviços e profissionais da The Mile.
- O bloqueio dura 15 minutos e deixa de ocupar horários automaticamente ao atingir a hora de expiração, mesmo sem limpeza por cron.
- Os horários de início continuam de 15 em 15 minutos, sem intervalo obrigatório, com antecedência máxima de 60 dias.
- O motor de reservas internas, a pré-visualização diária e a mensal respeitam esses bloqueios. Presencial e online partilham o mesmo calendário do profissional.
- O início do bloqueio valida disponibilidades, exceções, reservas já registadas, sobreposição de bloqueios e (quando autorizados) períodos ocupados Google.
- Os bloqueios usam a mesma transação com lock por profissional usada nas reservas internas, evitando duas retenções ou uma retenção/consulta simultâneas.
- Há um identificador idempotente por tentativa de checkout e uma fotografia do identificador da variante e preço de referência no momento da retenção.
- Endpoints de simulação estão limitados à sessão de administrador da The Mile. Não existe endpoint público nem ligação de pagamento ativa.
- O cartão de Configuração mostra o estado e o número de bloqueios ainda ativos.

**Não se deve considerar um bloqueio como reserva paga.** Nenhuma linha deste módulo cria reservas reais de clientes ou marca pagamentos como concluídos.

## Confirmado na loja (14 novembro 2026)

A ligação à loja Shopify The Mile Sports Nutrition está disponível, com moeda EUR, plano Basic e produtos Wellness ativos. No catálogo da aplicação existem referências para variantes com durações de 90 e 45 minutos em formato presencial e online. A integração de checkout deverá rever os produtos associados aos restantes serviços antes de ativar a publicação.

O Sesami continua ativo. Os seus eventos ainda não são consultados pelo novo motor. Por isso, **não é seguro publicar já vagas reais no site**: um cliente poderia escolher no novo motor uma hora já marcada no Sesami.

## Próximas etapas necessárias antes da publicação pública

1. Criar e instalar uma aplicação privada/representante própria The Mile no Shopify, ou outro mecanismo suportado, para autenticar pedidos e receber eventos de pagamento. Escolher e validar a implementação de app proxy antes de usar os endpoints públicos.
2. Expor catálogo e calendário apenas através de endpoints autenticados pela integração Shopify, sem revelar dados de clientes.
3. Colocar o seletor mensal, já utilizado no backoffice, num template/tema de desenvolvimento Shopify, mantendo o tema atual e o Sesami intactos até aprovação.
4. Criar carrinho Shopify com variante correta e referência opaca ao bloqueio da vaga; encaminhar para o checkout standard Shopify.
5. Registar webhooks de pagamento de encomendas e verificar a assinatura HMAC do corpo original e a loja de origem. Tornar eventos idempotentes por identificador de entrega/encomenda.
6. Quando o pagamento confirmado chegar dentro de um bloqueio válido, criar a reserva confirmada e ligar-lhe a encomenda. Se chegar após expiração ou com conflito, guardar ocorrência para revisão e eventual reembolso, sem criar reserva sobreposta.
7. Distinguir pagamento pendente, reserva confirmada, cancelamento, reembolso e disputa. Verificar meios de pagamento assíncronos e a antiga regra Sesami de cancelamento de não pagas às 12 horas. Uma retenção de 15 minutos e uma ordem pendente de 12 horas são conceitos distintos.
8. Importar/reproduzir futuras reservas e bloqueios do Sesami; testar horários, datas e DST Europe/Lisbon; só depois substituir o sistema no site.

## Segurança e operação

- A retenção do horário é uma operação transacional; não confiar na hora apresentada no browser.
- Calendários Google sem conexão devem ser refletidos manualmente com bloqueios no backoffice.
- Não divulgar tokens Shopify, segredos de webhooks, emails de clientes nem outras credenciais em repositórios.
- Manter a chave única de bloqueio para tratar repetições e duplo clique.
- Mesmo após a abertura pública, um pagamento tardio não pode reservar uma vaga agora ocupada por outra pessoa.
- Recomenda-se uma tarefa periódica para relatórios/limpeza de bloqueios antigos, mas a libertação de vagas já se baseia no tempo de expiração guardado na base de dados e não depende dessa tarefa.

Referências oficiais:
- Shopify app proxies: https://shopify.dev/docs/apps/build/online-store/app-proxies
- Shopify assinatura de app proxy: https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
- Shopify Storefront Cart API: https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage
- Shopify verificação dos webhooks: https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
