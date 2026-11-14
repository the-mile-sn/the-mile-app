# The Mile — «Qualquer profissional» (pré-visualização Shopify)

## Comportamento aprovado

No campo Profissional da cópia de teste Shopify existe **Qualquer profissional**, selecionado por omissão. As opções seguintes são os profissionais individuais ativos associados ao serviço escolhido.

Quando o cliente mantém «Qualquer profissional», o motor calcula o calendário e os horários com base na **união das disponibilidades** dos profissionais aptos a realizar aquele serviço e formato. Um horário que exista em duas agendas é apresentado **uma única vez**, com a capacidade interna respeitada. Quando seleciona uma pessoa nominalmente, só aparecem os seus horários.

As vagas respeitam a duração real do serviço, os períodos disponíveis, bloqueios manuais, reservas The Mile, retenções temporárias de checkout e Google Calendar quando ligado. A disponibilidade continua limitada a 60 dias no fuso Europe/Lisbon.

## Atribuição sugerida

Na pré-visualização, após selecionar um horário em «Qualquer profissional», o resumo apresenta o **profissional sugerido**.

O sistema ordena os candidatos aptos pelo número de **minutos de trabalho já ocupados nesse dia**, contabilizando reservas internas, bloqueios temporários de checkout ainda ativos e reservas de checkout confirmadas. Em caso de empate, considera a carga dos sete dias a partir da data pretendida e, por último, uma ordem estável de IDs. Assim, uma consulta de 90 minutos pesa o dobro de uma de 45.

**A sugestão não é uma reserva nem uma garantia.** O profissional só é atribuído de forma definitiva quando for criada uma retenção efetiva, após nova verificação da disponibilidade real.

## Atribuição efetiva no motor

O mecanismo interno de retenção de 15 minutos aceita o valor especial `professional_id=any`, mantendo intacta a funcionalidade de escolha nominal.

1. Identifica os profissionais ativos do serviço e formato.
2. Obtém os bloqueios transacionais de todos os profissionais elegíveis em **ordem estável** (PostgreSQL advisory transaction locks), prevenindo conflitos entre várias tentativas de reserva ao mesmo tempo.
3. Ordena os candidatos pela carga real e volta a validar cada um — disponibilidade, reservas, bloqueios, Google Calendar quando ligado e retenções pendentes.
4. Atribui ao primeiro candidato realmente disponível, guardando na retenção o seu **ID real**.
5. Se todos estiverem ocupados, devolve conflito. Repetições idempotentes devolvem a mesma retenção.

Esta retenção está, nesta fase, limitada às rotas autenticadas de administração. **Não está ainda ligada ao checkout do cliente Shopify**.

## Limites de segurança da fase

- A cópia de teste permanece **não publicada**; o tema principal e o Sesami não são alterados.
- O pagamento Shopify permanece desativado.
- A API pública continua exclusivamente de leitura; a resposta de horas agregadas não divulga emails, contactos de clientes ou motivos de bloqueios.
- As disponibilidades **não incluem** reservas futuras que permaneçam só no Sesami, pelo que a abertura pública exige primeiro migração/replicação.
- A confirmação real de profissional e o bloqueio da vaga no checkout dependem da aplicação Shopify autenticada e da integração de pagamento.
- A interface deixa claro que a atribuição no resumo é apenas sugerida e será confirmada quando a vaga for bloqueada.

## Validar

No tema de teste, escolher um serviço atribuído a dois profissionais que tenham horários publicados. Em «Qualquer profissional», verificar que o mesmo horário não aparece duplicado; ao selecionar um profissional nominal, verificar que a agenda é filtrada. Criar uma marcação interna para um profissional e confirmar que uma vaga ainda é apresentada em «Qualquer» se o outro estiver disponível.
