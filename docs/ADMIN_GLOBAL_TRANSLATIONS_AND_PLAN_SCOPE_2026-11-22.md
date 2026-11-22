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
