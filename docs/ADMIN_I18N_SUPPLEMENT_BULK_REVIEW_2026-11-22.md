# Revisão em lote de Suplementação — The Mile · 22/11/2026

## Objetivo
Estender o fluxo já aprovado de Receitas e Alimentos à biblioteca de
Suplementação. O formulário individual continua intacto; o backoffice
passa a permitir rever PT/EN em conjunto, por suplemento e por grupos de 100.

## Âmbito e apresentação
- Apenas campos visíveis que constam de `app_translation_sources_v2.fields_for`
  para `supplement`: `name`, `dose`, `note`, `timing_text` e
  `prescriptions/<index>/(dose|note|timing_text)`.
- Propostas elegíveis: apenas `pending`, que já foram importadas ou
  propostas por um administrador; nunca são criadas automaticamente.
- A previsualização GET mantém os pares PT/EN, nome do suplemento e etiqueta
  do campo; agrupamento por produto, botão «Selecionar textos visíveis»,
  «Selecionar 100» cumulativo, pesquisa e «Selecionar todas».
- Cada mudança de seleção invalida a confirmação explícita de revisão.
  A aprovação não acontece ao selecionar nem ao abrir o painel.
- São admitidas até 2500 propostas na previsualização de bibliotecas
  de vários campos. Cada pedido POST aprova no máximo 100 campos,
  transacionalmente, com auditoria individual; conflito reverte apenas
  o grupo afetado.

## Segurança clínica
- Sem alterações aos suplementos originais, quantidades, `moment`,
  `rule`, prescrições JSON ou qualquer dado nutricional/clínico.
- A tradução textual de uma dose NÃO altera o valor prescrito.
- O servidor revalida o administrador ativo, origem/CSRF, campo realmente
  existente na fonte canónica, hash do português e hash do inglês pendente.
- Não são aceites traduções enviadas pelo navegador durante a aprovação.
- As apps de jogadores e chefs continuam sem ativação automática
  de novas traduções ou seletores antigos.
- Nada é aprovado/importado pela publicação desta funcionalidade.

## Testes
- WSGI com suplemento contendo nome, dose, nota, instrução e prescrição:
  preview sem gravação, aprovação e histórico, invariantes clínicas,
  campos não permitidos, hashes e concorrência, CSRF e sessão.
- Browser mock desktop/mobile: dois suplementos, 218 textos,
  seleção de um produto, pesquisa, 100+100+18 e confirmação obrigatória.
