# Central de Traduções transversal — Backoffice (22/11/2026)

## Decisão de produto

**Traduções é uma área principal do backoffice**, ao mesmo nível de Biblioteca, Planos e Planeamento. Não é uma página autónoma nem um submenu de Biblioteca.

As bibliotecas e Planos mostram um ícone de Traduções que abre esta mesma Central com o contexto respetivo. Existe apenas **uma** fonte de propostas/estados de aprovação. Não existe tradução automática na app.

## Estado implementado neste lote

- Navegação principal: Traduções fora de Biblioteca, com iconografia e seleção independente em desktop/mobile.
- Ícone consistente em Alimentos, Pratos, Receitas, Suplementação e Planos, sem alterar as funcionalidades dos respetivos formulários.
- A Central continua a reunir todas as bibliotecas atuais, a revisão manual e a importação CSV.
- Área **Planos** acessível na Central, com inventário do número de publicações e limites de integração explícitos. **A edição de traduções de planos ainda não está implementada**; o ecrã não apresenta controlos enganadores.
- O plano de tradução de conteúdos próprios é documentado aqui, sem tocar na base de dados nem nas apps de jogadores e chefs.
- A API OpenAI mantém-se desligada.

## Inventário técnico de Planos — leitura do código

Fontes auditadas:
`food_plan_drafts_v2.py`, `food_plan_publications_v2.py`,
`food_plan_calendar_bridge_v2.py`, `app_translation_catalog_v2.py`.

Os Planos não são registos simples de biblioteca; alguns estão associados a um jogador. A publicação utiliza uma versão congelada de `v2_food_plan_editor_publications.snapshot_json` associada a `draft_id`, `athlete_id` e `plan_type`. A rascunho contém `name`, `meals[].name`, `meals[].options[].title`, `notes[]`, `foods[].display_name`, `display_quantity` e `label`, entre outros campos. O modelo inclui também quantidades, nutrientes e grupos peri-jogo.

Não se devem traduzir os snapshots completos através de uma API externa, porque podem conter identificação de jogadores e informação individualizada.

### Plano de implementação (lote posterior, depois de revisão)

1. **Reutilização por referência:** quando um item aponta para `v2_food_library`, usar a tradução aprovada daquele alimento e preservar o seu ID. Aplicar princípio semelhante a pratos, receitas e suplementos, mediante o componente real apresentado.
2. **Dicionário de interface:** nomes fixos das refeições, tipos de planos e rótulos da interface devem existir numa camada de traduções de interface, não ser recriados por plano ou jogador.
3. **Textos específicos do plano:** inventariar o nome visível do plano, títulos das opções, notas não sensíveis e nomes apresentados manualmente. Cada proposta deve estar ligada à **versão da publicação** e ao campo certo. Uma nova publicação ou alteração de português invalida a tradução anterior até revisão.
4. **Segurança clínica:** notas livres podem incluir informações clínicas/pessoais; mostrar apenas a administradores autorizados. Tradução inicial manual/importada, sem enviar estes textos para a OpenAI e sem sugestões automáticas até existir classificação e parecer de privacidade.
5. **Aprovação independente:** texto original sempre preservado; tradução proposta -> revisão -> aprovação; registo de autoria/histórico e estado desatualizado por hash de origem, sem editar quantidades, doses, horários, prescrição ou cálculo de nutrientes.
6. **Consumo pelas apps:** separar claramente a tradução da fonte do momento em que a app do jogador/chef a utiliza. Esta passagem só ocorre após testes de idioma e autorização de lançamento.
7. **Importação CSV:** só estender a Planos depois de garantir chave estável por campo, controlo de versão e privacidade. Nunca importar conteúdo de planos pela rota genérica das bibliotecas antes dessas salvaguardas.

## Âmbito excluído deste lote

Este PR **não** implementa tradução completa de planos, nem ativa API, modelos de IA, contas externas, permissões adicionais, schemas, ou mudanças de conteúdo. Nunca afirmar que Planos já está traduzível: é uma secção de preparação da Central.

## QA

Validar submenu Biblioteca intacto, Traduções como item de topo, estado ativo correto no desktop e mobile, atalhos das bibliotecas e Planos, seleção do âmbito Planos sem pedidos ao endpoint `/catalog?entity_kind=plan`, e retorno aos conteúdos já integrados.


## Ordem aprovada de execução — decisão de 22/11/2026

**Primeiro: Alimentos.** A biblioteca de alimentos é a única fonte canónica para os nomes visíveis dos alimentos: `v2_food_library.display_name` (somente `active=1`). A Central já suporta os nomes da biblioteca, revisão manual e CSV. A exportação produz `entity_kind,entity_id,field_path,source_text,translated_text` e apenas o último campo deve ser preenchido. A UI valida e importa em lotes até 100 propostas, sempre com estado `pending` e aprovação independente. Não introduzir qualquer tradução diretamente nas tabelas nutricionais.

É necessário o **CSV exportado de Alimentos de uma sessão admin**, porque o inventário está na base de dados e não consta do repositório. A pessoa responsável pela revisão envia esse CSV à equipa de tradução; produzir o ficheiro PT/EN preenchido sem alterar `entity_id`, `field_path` ou `source_text`. Validar terminologia em português europeu/inglês britânico com contexto nutricional antes de importar. Não utilizar a API da OpenAI enquanto desligada.

**Em seguida: tradução de Planos.** O editor `food_plan_drafts_v2.validate` usa `plan_type`, `meals[].name` e `applies_to` para correspondências de refeições; o `food_plan_calendar_bridge_v2` usa nomes canónicos das refeições para resolver os momentos alimentares e protocolos peri-jogo. **Nunca reescrever essas chaves**, mesmo quando existe tradução inglesa. A publicação `v2_food_plan_editor_publications.snapshot_json` conserva uma versão da prescrição; é necessário resolver traduções na leitura/apresentação, mantendo o snapshot original e a nutrição imutáveis.

Inventário dos tipos de texto:

| Texto | Origem | Abordagem proposta |
|---|---|---|
| Nome comum do alimento | `foods[].id` → `v2_food_library.display_name` | Reutilizar tradução aprovada da biblioteca pelo ID, sem duplicar |
| Nome alternativo personalizado | `foods[].display_name` | Detetar sobreposição; se diferente do nome canónico, exigir tradução do texto específico do plano |
| Nomes fixos de refeições/momentos/tipos de plano | `plan_type`, `meals[].name`, rótulos de interface | Traduzir só no apresentador (dicionário de interface); preservar código e nomes PT usados no agendamento |
| Títulos de opções | `meals[].options[].title` | Proposta humana por publicação/caminho/versão |
| Notas de uma opção | `meals[].options[].notes[]` | Classificação de privacidade e aprovação clínica; sem API externa |
| Quantidade descrita em texto | `foods[].display_quantity` | Separar valores, unidade e texto; nunca alterar quantidade numérica ou dosagem |
| Nome de suplemento no plano | `foods[].label` | Verificar equivalência com biblioteca; se instrução/dose específica, revisão clínica manual |
| Nome do plano | `name` | Confirmar se aparece ao jogador; tradução somente quando for texto de apresentação |
| Nutrição, gramas, `timing_splits`, `applies_to` | Campos estruturais | **Não traduzir nem modificar** |

A identidade da tradução específica deve incluir `draft_id`, localização dentro da publicação e uma impressão digital do snapshot e do texto original. Uma nova publicação deve marcar como desatualizadas as propostas feitas para a versão anterior. Não presumir que índices de refeições ou opções permanecem estáveis entre versões; um índice só identifica uma posição dentro do mesmo snapshot.

**Critérios para implementação posterior:** catálogo de Planos que leia snapshots completos apenas para os administradores autorizados, separação explícita de campos seguros/sensíveis, sem exposição de `athlete_id` ou `player_name` no CSV de tradução, fluxo proposta/revisão/aprovação, testes de alterações de versões e regressão nutricional, ligação de consumo pelas apps apenas num lançamento posterior e aprovado.

