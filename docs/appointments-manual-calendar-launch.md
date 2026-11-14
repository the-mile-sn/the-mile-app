# The Mile Booking — fase inicial com agenda interna, sem Google Calendar

Decisão de operação: a primeira compra será ensaiada na cópia **não publicada**
The Mile | Marcações (teste), sem integração Google Calendar. A aplicação
Sesami já não está instalada. Isto **não significa** que os compromissos antigos
do Sesami tenham sido migrados.

## Segurança do modo manual

A agenda interna inclui as disponibilidades publicadas, os bloqueios manuais,
as marcações The Mile e as retenções de checkout de 15 minutos. Também respeita
conflitos com profissional escolhido ou "Qualquer profissional".

Compromissos guardados **apenas** no Google Calendar não bloqueiam horários.
Até ativar OAuth, é obrigatório reproduzir os horários indisponíveis através
dos bloqueios manuais do backoffice. O período de teste não deve receber
clientes sem verificação dessa agenda.

## Controlo seguro do backend

Variáveis no serviço Render **the-mile-admin**:

- MILE_SHOPIFY_WEBHOOK_ENABLED=1 (já verificado, assinatura da Shopify)
- MILE_SHOPIFY_CHECKOUT_ENABLED=1 (abre a criação de retenções)
- MILE_SHOPIFY_MANUAL_CALENDAR_MODE=1 (aceite funcionamento manual, sem Google)
- MILE_SHOPIFY_SESAMI_MIGRATED=0 (continua falso; não declarar migração fictícia)

O checkout só é autorizado quando o recetor de webhooks está ativado e existe
pelo menos uma confirmação explícita de continuidade: migração de Sesami ou
modo manual. A opção manual é independente do Google; não concede acesso OAuth.

## Procedimento da compra de teste

1. Manter o tema público Symmetry inalterado.
2. Confirmar primeiro no backoffice o estado «Checkout The Mile ativo» e
   «Modo manual de agendamentos ativo (sem Google Calendar)».
3. Abrir a versão privada de /pages/consultas com os parâmetros do serviço.
4. Selecionar dia e horário que não coincidam com compromissos externos.
5. Clicar em «Continuar para pagamento», inspecionar a retenção (15 min),
   confirmar que a variante selecionada e a prova estão no carrinho.
6. Concluir uma encomenda de **teste controlado** (pode usar 100% de desconto)
   antes da retenção expirar.
7. Confirmar o webhook orders/paid, exatamente uma reserva Shopify no backoffice
   e a ausência de pagamentos para revisão. O evento Google **não** será criado.

**Atenção:** pagamentos feitos após a retenção expirar vão para revisão e não
confirmam uma reserva automaticamente. São necessárias ações manuais para
agendamento alternativo/reembolso.

Depois do ensaio: decidir publicar apenas o fluxo validado no tema principal,
com a proteção manual das agendas, e configurar Google Calendar numa fase posterior.
