# Planos — auditoria de reutilização segura (22/11/2026)

## Correção de interpretação

Um item em `snapshot.meals[].options[].foods[]` pode ter
`alternative_to` e `display_name` alterado. Um nome como «Queijo light»
não constitui prova de correspondência com o alimento da biblioteca:
pode ser uma alternativa ou uma apresentação individual.

A contagem `linked_food_count` deve incluir apenas referências por ID
cujo nome apresentado coincide com o nome canónico do mesmo ID, ou em que
não existe nome personalizado. A simples semelhança ou igualdade com
**outro** alimento não é suficiente.

## Diagnóstico (somente Admin, somente leitura)

O endpoint existente `GET /api/v2/admin/i18n/plans` inclui
`reuse_audit`, exclusivamente **contagens agregadas**, sem texto livre,
nome do jogador ou conteúdo clínico:

- versões publicadas e textos específicos visíveis;
- títulos de opções distintos e ocorrências repetidas;
- referências explícitas a alimentos e quantas têm inglês aprovado
  na biblioteca de origem;
- alternativas com `alternative_to` e nomes personalizados;
- notas individuais, rótulos de suplementos e quantidades apresentadas;
- possíveis sugestões de título já aprovado e unidades simples.

A consulta não escreve na base de dados nem altera publicações.

## Sugestões de preenchimento — nunca automáticas

Na revisão de um campo **ainda não traduzido**:
- `option_title`: sugerir apenas tradução *já aprovada* de um título
  cujo texto português tenha o **mesmo hash exato**, se não existir
  conflito entre diferentes traduções aprovadas;
- `display_quantity`: quando a expressão corresponder *integralmente*
  a um padrão simples `<n> un / <n> g` (ou forma equivalente admitida),
  sugerir `<n> units / <n> g`, preservando números e unidades;
- `alternative_override`, `food_override`, `individual_note`,
  `supplement_label`: **sem sugestão transversal automática**, mesmo
  quando o texto seja igual ao nome de um alimento existente.

É obrigatório clicar em «Usar sugestão» para a copiar. A cópia
**não guarda**; «Guardar proposta» cria apenas estado `pending`.
Aprovação exige a confirmação de revisão já existente. Alterar qualquer
número ou unidade de uma prescrição continua bloqueado no servidor.

Nenhuma tradução é ativada nas apps dos jogadores/chefs. A tradução
de nomes fixos e a resolução das bibliotecas nas apps permanecem uma
fase de integração distinta.

## Testes

- Alternativa `alternative_to` com nome próprio não deve contar como
  nome canónico ligado à biblioteca nem receber sugestão de alimento.
- Auditoria retorna contagens, sem nomes ou notas individuais.
- Título repetido em duas publicações: aprovar uma versão gera
  **sugestão**, não cria proposta na outra.
- Expressão de unidade simples: sugestão conserva os números,
  aprovação não é automática; a alteração de g para mg é rejeitada.
- Playwright mock desktop/mobile: métricas, botão «Usar sugestão»,
  preenchimento sem POST e posterior guardar/aprovar explícitos.
