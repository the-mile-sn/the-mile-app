# The Mile — Shopify preview com disponibilidades reais

## Estado da fase

A cópia não publicada do tema Shopify **The Mile | Marcações (teste)** (theme ID `199499186558`) lê os serviços, profissionais, preços de referência e vagas **efetivamente publicadas no backoffice** através da API de leitura `/api/v2/public/appointments/`.

O calendário mantém o layout mensal aprovado. Os dias apresentados são calculados pelo mesmo motor do backoffice, com o fuso `Europe/Lisbon`, consulta de 15 em 15 minutos, durações configuradas (90/45 minutos nos serviços relevantes), bloqueios manuais, marcações internas, retenções de checkout ativas e ocupações Google quando a integração desse profissional está autorizada.

**O botão Continuar para pagamento permanece desativado.** A interface ainda não usa o Sesami nem tem app proxy ou confirmação de pagamentos, pelo que não é seguro permitir marcações públicas.

## Configuração no Render (serviço de administração apenas)

Para ativar a API read-only da cópia de teste definir:

`MILE_BOOKING_PREVIEW_ENABLED=1`

O valor omisso é `0`: a API devolve HTTP 404. Não ativar no serviço da app do jogador. O código verifica adicionalmente `MILE_SITE_ROLE=player` e impede exposição nesse serviço.

A API pública apenas aceita `GET`. O corpo dos resultados é construído com uma allowlist de campos; não devolve emails, contactos, dados de clientes, motivos dos bloqueios, encomendas, tokens, IDs de variantes ou informações internas. Não aceita pedidos para reservar, bloquear, cancelar ou pagar.

Permite CORS apenas das origens Shopify da The Mile (`themile.pt`, `www.themile.pt` e `the-mile-sports-nutrition.myshopify.com`) e não permite cookies cross-origin. CORS é uma proteção de browser, não autenticação: os nomes dos serviços/profissionais e os horários disponibilizados são intencionalmente dados que poderão vir a ser apresentados publicamente. Os filtros e limites de datas impedem consultas a datas arbitrárias.

## Endpoints

- `GET /api/v2/public/appointments/catalog` — serviços/profissionais ativos associados, formatos, preços de referência, data atual e último dia de reserva permitido. Não inclui dados privados.
- `GET /api/v2/public/appointments/calendar-month?professional_id=…&service_id=…&mode=presencial&month=AAAA-MM` — marca cada dia como disponível/indisponível; até 60 dias.
- `GET /api/v2/public/appointments/slots?professional_id=…&service_id=…&mode=presencial&date=AAAA-MM-DD` — pares início/fim disponíveis desse dia.

Uma vaga exibida não representa uma reserva bloqueada ou garantida. As disponibilidades são recalculadas sempre que se navega no calendário.

## Validação e passagem à fase seguinte

1. Abrir a pré-visualização do tema e confirmar que apenas aparecem serviços e profissionais ativos.
2. Publicar uma disponibilidade no backoffice e verificar que o dia surge no calendário de teste.
3. Criar um bloqueio ou reserva manual e confirmar que os horários correspondentes desaparecem do calendário de teste.
4. Confirmar o preço e formato segundo o catálogo do backoffice.
5. Validar computador e telemóvel. Se a API não responder, o cliente vê mensagem de erro e **não** recebe horários inventados.

Antes da publicação do site para clientes, é indispensável integrar o Sesami (ou reproduzir todas as marcações futuras e bloqueios no motor The Mile), configurar um app proxy Shopify autenticado, o carrinho com a variante correspondente, a retenção transacional de 15 minutos e os webhooks verificados de pagamento. Só depois será ativado o botão de checkout.

## Limites explícitos desta fase

- Não modificamos produtos, encomendas, preços do Shopify, checkout ou pagamentos.
- Não alteramos o tema publicado nem o Sesami.
- Não ligamos Google Calendar obrigatoriamente: os compromissos externos podem continuar a ser refletidos por bloqueios manuais.
- Os dados desta pré-visualização referem-se às reservas **The Mile**, sem consulta do Sesami.
