# THE MILE — Guia Visual Normativo da App de Jogadores
**Versão:** 19/11/2026 · **Estado:** decisões visuais aprovadas; implementação por lotes e validação no iPhone ainda em curso.
**Finalidade:** fonte de verdade para a App de Jogadores e base de identidade visual da futura App de Chefs. NÃO é o Guia Visual do backoffice.

> **Regra de precedência:** decisão expressa mais recente da utilizadora > medições e capturas do Safari/iPhone > continuidade P3 > registos FASE B e FASE A > código como evidência de implementação. Uma regra CSS antiga não revoga uma decisão aprovada. Propostas antigas do assistente não são norma.

## 1. Duas famílias distintas — classificação fechada

### A. Card universal (base unitária)
**Referência dimensional exclusiva:** Pequeno-almoço, Almoço e Jantar na **Página Inicial → Dia**, medidos em iPhone/Safari.

| Propriedade | Fechado | Aberto |
|---|---|---|
| Altura total | 61 px | variável conforme o conteúdo |
| Altura do cabeçalho | 61 px | 55 px |
| Raio exterior | 13 px | 18 px |
| Padding de cabeçalho | 12px 17px | 12px 17px 3px |
| Gap | 8 px | 8 px |
| Caixa de ícone de referência | 37 × 37 px | 37 × 37 px |
| Título | 16 px / 500 | 16 px / 500 |

Fechado, o cabeçalho da refeição mostra kcal, sem macronutrientes abaixo. Aberto, mantém kcal e apresenta macronutrientes imediatamente abaixo. **Não transformar os conteúdos de outras famílias na composição nutricional da vista Dia.** Um card informativo sem expansão continua sem expansão; a geometria aplica-se conforme couber sem inventar comportamento.

**Aplicar, com adaptações funcionais já aprovadas:**
- **Página Inicial:** refeições normais (incluindo lanches/ceia); treino; jogo/intra-jogo; peri e pós-treino/jogo; peso em jejum; questionário pós-jogo; suplementação e outros cards unitários.
- **Planos (por cor):** cards coloridos de cinco cores; manter kcal, macros, opções, suplementos, composição própria e expansão.
- **Avaliações:** todos os cards das vistas Resumo, Pregas e Perímetros; título 16/500 e valor principal 16/600; gráficos e histórico intocados.
- **Menus:** superfícies compactas, menus vazios, entradas com categoria apenas e outros cards unitários equivalentes. Não impor 61 px em itens cujo conteúdo exija mais espaço; preservar hierarquia e geometria aplicável.
- **Perfil:** acompanhamento, notificações e superfícies informativas unitárias equivalentes; **não acrescentar expansão** onde não exista.
- **Outras superfícies:** apenas as que tenham função e composição equivalentes. Não atribuir exceções porque o CSS atual é diferente.

### B. Card de categoria (NÃO card universal)
**Exclusivamente:** (1) cards de categoria em **Receitas** e (2) **agrupamentos cinzentos em Planos → Todos** (Laranja, Amarelo, Azul, Verde, Verde preparação, Treino, Jogo, Suplementação, etc.).

Referência de Receitas: **86 px**, **raio 18 px**, fundo cinzento subtil, título à esquerda e seta à direita. Na vista «Todos», **sem fotografia nem espaço reservado para fotografia**. Preservar os subcards coloridos no interior do grupo; estes continuam a pertencer à família universal.

**NÃO** classificar como «card de categoria» um mero cabeçalho que aparece quando um card universal é aberto.

## 2. Exceções expressas e limites

| Elemento | Porque é exceção / o que preservar |
|---|---|
| Painel nutricional inicial | Anéis, kcal/macros, gráficos, comparações, geometria e interações próprios; não forçar card universal |
| Menus com pratos completos | Estrutura rica, fotografias, lupa/ampliação, «Ver receita» só com receita associada e regresso ao menu |
| Cards de categoria | Apenas Receitas e Planos → Todos; ver família B |
| Grelha nutricional da vista Semana | Células por dia, refeições, kcal, treino, jogo e classificação próprias; partilhar linguagem, não altura de 61 px |
| Barra inferior e seletores/calendários | Componentes de navegação, não cards |
| Botões e ações de consumo | Famílias de controlo próprias, com estados e microinterações; não herdam 61 px |
| Login | Campos 56 px / raio 20 px e botão Entrar 54 px / pill 999 px; **não são cards universais**. Splash, autenticação, mensagens e fluxos inalterados |
| Formulários, gráficos e campos internos | Podem usar layouts e alturas variáveis; preservar dados, validações, acessibilidade e funções |

**Ritmo vertical da Página Inicial → Dia:** **10 px entre cards unitários consecutivos** (refeições, peri/pós-treino, treino/jogo, peso, suplementação e formulário pós-jogo), independentemente da classe técnica. Não uniformizar deste modo o painel nutricional inicial, os subcards internos nem a grelha semanal. Confirmar na captura do iPhone.

**Peso em jejum aberto:** apesar de o cabeçalho passar de 61 px para 55 px, os centros óticos do ícone, título, valor e seta devem permanecer na mesma coordenada relativa ao topo do card; o conteúdo expandido não se desloca artificialmente. Solução CSS atual: compensação com padding de cabeçalho aberto 12 px no topo e 6 px no fundo, mantendo a altura de 55 px; validar visualmente no iPhone.

**Não inventar novas exceções.** A suplementação **não** foi aprovada como exceção ao card universal apenas por ter CSS legado de 65 px; os conteúdos próprios continuam protegidos.

## 3. Tipografia oficial e categorias semânticas

**Fonte em toda a App de Jogadores:** `system-ui, -apple-system, sans-serif` (San Francisco no iPhone). Não impor Inter Tight; remover usos residuais ao intervir na zona correspondente.

| Categoria | Regra | Nota |
|---|---|---|
| Título página/detalhe | 21–23 px / 600 | tamanho exato ainda não fechado por componente; não inventar |
| Título de categoria | **17 px / 600** | Receitas, Planos → Todos |
| Título de card universal | **16 px / 500** | todas as zonas equivalentes |
| Título de secção interna / pergunta | **15 px / 600** | Ingredientes, Preparação, Dicas úteis, perguntas pós-jogo |
| Texto principal | **14 px / 400** | descrições, alimentos, respostas |
| Texto secundário | **12–13 px / 400** | notas, estados e legendas contextuais |
| Legenda pequena | **10–11 px / 400** | quando necessário |
| Campo de escrita / seletor | **16 px / 400** | evitar zoom automático no iPhone |

Valores numéricos possuem papéis próprios: principal, contextual, complementar, variação, legenda gráfica e estado; não os converter mecanicamente em texto de título. Exemplos aprovados: Avaliações valor principal 16/600; peso 16/600, variação 12/400; kcal de refeições Dia 11/500 e macros 10/400. Preservar a composição específica de Planos, gráficos e painel nutricional.

## 4. Cor e ícones
Cinco planos, com fundo / texto de destaque:
- Laranja `#54281B` / `#FFA078`;
- Amarelo `#493713` / `#FFD76F`;
- Azul `#193F60` / `#8DD0FF`;
- Verde `#174631` / `#77E3A4`;
- Verde preparação `#10251A` / `#4E996B`.
Verde preparação deve ser distinguível de verde normal também no seletor «Alterar cor», sem afetar as outras cores.

Ícones aprovados: Pequeno-almoço Coffee03Icon; snack VegetarianFoodIcon; almoço/jantar Restaurant02Icon; ceia Moon02Icon; jogo FootballIcon; treino e formulário jogo FootballPitchIcon; pós-treino/jogo SoftDrink01Icon; Início Home09Icon; Planos Files01Icon; Inserir AddCircleIcon; Menus MenuRestaurantIcon; Perfil User03Icon; formulário peso WeightScaleIcon. Não substituir por arte genérica.

## 5. Navegação e microinterações
- **Calendário superior:** a referência é **Início → Dia**; mesma aparência e microinteração nos calendários superiores de Início/Dia, Início/Semana e Menus. A grelha semanal abaixo é distinta. Preservar deslocação do círculo de seleção e evitar mexer em JavaScript sem necessidade.
- **Seletores superiores:** Dia/Semana, Resumo/Pregas/Perímetros, Menus/Receitas partilham a mesma família (medidos ~38 px, padding 3 px, fundo #202024, ativo #55555B, raio 999 px, transição ~0,34 s). Filtros e subfiltros de Planos são uma família funcional diferente.
- **Barra inferior:** normal e compacta ao fazer scroll, flutuante, ícones e animações já aprovados; preservar o estado reduzido e retorno. Medições são observações, não tamanhos universais.
- **Retrocesso:** detalhe de Receitas com botão circular 40 × 40 px, sem contorno evidente, é referência para Notificações e Alterar palavra-passe. Não criar retrocesso em Planos por existirem regras CSS legadas.
- **X de fechar:** pequeno, fino, mesma família em todos os modais, rodas e bottom sheets; não confundir com retrocesso.
- **Hover e toque:** manter os estados efetivos aprovados, documentar início/fim, duração, easing, direção, condições e `prefers-reduced-motion` sempre que medidos. Não inventar animações.

## 6. Formulários e consumos
- **Pós-jogo:** três etapas; minutos obrigatórios; «Não joguei»; guardar mostra «Preenchido» em vez de «Por preencher»; editar preservado. Erro «Seleciona os minutos jogados.» apenas quando se tenta avançar sem responder; não persistir após selecionar «Não joguei». Título 16/500; perguntas 15/600; respostas 14/400; controlos de escrita 16/400. Retrocesso neutro; check de confirmação da família visual de «Cumpri», mantendo a ação distinta.
- **Peso:** título 16/500, peso 16/600 e variação 12/400; preservar formulário, histórico, gráfico e marcadores de menstruação quando aplicáveis; controlo de guardar circular próprio.
- **Consumos:** «Cumpri» pill e sucesso com check verde/confetti existente; «Editar», «Registado», «Anular» preservados; «Ver porções» e «Alterar cor» como links discretos 13/400 com seta. Guardar 46 px / 14/600, Cancelar 46 px / 14/500, ambos centrados; nomes de alimentos 14/400; gramas 16/400; checkbox visível circular 22 px. Não alterar lógica de registo.
- **Adicionar alimento:** manter sheet, pesquisa 48 px / fonte 16/400, X/check, teclado e seleção; substituir contorno azul de foco por foco visível discreto acessível; melhorar lista de sugestões (espaçamento, toque, separadores, seleção, tipografia) sem modificar dados.
- **Roda de gramas:** manter roda, valor central, X/check e entrada manual. Uniformizar apenas X equivalentes e eventuais inconsistências aprovadas.

## 7. Pendências funcionais — FORA do lote visual
Imagens de suplementos (erros 404); segurança das palavras-passe; pontos de corte de avaliações para sexo/posição; notificações ainda não ativadas; ações de consumo de peri-treino/jogo; possível mudança do calendário de Menus; particularidades de «Anular» com uma opção. Sem alterações clínicas, API, credenciais, autenticação, persistência ou cálculos num lote estético.

## 8. Mapa técnico e verificação por lotes

A app carrega `static/jogador-v2.css`, `static/player-recipes.css`, `static/player-visual-portions.css` e `static/player-consumption.css`, nessa ordem. Seletores relevantes: `.daily-meal`, `.peri-meal`, `.match-intra-card`, `.daily-event-card`, `.daily-weight-card`, `.post-match-inline`, `.daily-supplements`, `.plan-overview-meal`, `.plans-all-group`, `.assessment-measure-card`, `.day-menu`, `.menu-entry`, `.profile-plan-card`, `.profile-notifications-card`.

**Método obrigatório em TODOS os lotes:** (1) classificar família/exceção pela presente norma; (2) identificar regras ativas, especificidade, media queries, estados e overrides posteriores; (3) corrigir na origem e remover apenas regras antigas comprovadamente redundantes; (4) verificar que o HTML publica a versão correta do CSS; (5) testar sintaxe e regressões; (6) confirmar no iPhone fechado/aberto, longo/curto, Dia/Semana, planos, avaliação, menus e perfil conforme impacto. Uma confirmação estática no GitHub **não equivale** a validação Safari/Render.

**Estado técnico conhecido a 19/11/2026:** commits anteriores introduziram geometrias de refeições/jogo e Avaliações; validação visual ainda pendente. Há valores não conformes remanescentes no CSS (por exemplo, 65 px em suplementação, 65 px em grupos Planos, pesos/alturas 56 px, 58 px e raios 12/17 px no Perfil e formulário de peso). Estes números **não se tornam exceções** pela simples existência no código. Verificar estrutura real antes de os alterar. Os cards ricos de menus, os cards de categoria e o painel nutricional requerem tratamento separado da família base.

## 9. Aplicação à App de Chefs
A App de Chefs deve reutilizar a **identidade visual** dos jogadores nos componentes equivalentes: login, tipografia, bottom navigation, cards, cores, botões, estados, transições. Não copiar automaticamente lógica nutricional/funcional do jogador. Chef pode trabalhar com pequeno-almoço e lanches, além de almoço/jantar; Página Inicial apresenta as refeições e plano colapsado, sem gráficos de consumo do jogador. As correspondências de pratos e responsabilidades de alteração de menus são assuntos funcionais próprios; não reinventar estilos.

---
**Rastreabilidade documental:** `The_Mile_Fase_A_Inventario_App_Atual(3).md`, `The_Mile_Fase_B_Registo_Decisoes_Corrigido(1).md`, continuidade P3 `Texto colado(20261119-161438).txt`, e `The_Mile_Guia_Visual_App_Jogadores_Consolidado_2026-11-19.md`. A FASE B inicial contém valores *observados* e propostas depois revogadas; as decisões P3 e posteriores prevalecem. Este documento é normativo para decisões aprovadas; os resultados técnicos só mudam de estado após validação.