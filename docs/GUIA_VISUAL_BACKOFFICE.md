# THE MILE — Guia Visual Oficial do Backoffice

**Versão consolidada 2.0 · 17 novembro 2026**  
**Âmbito:** Backoffice administrativo The Mile, `admin.themile.pt`, branch `production/the-mile-admin`; desktop, tablet, mobile; modo claro e escuro.  
**Estado:** decisões aprovadas consolidadas; a uniformização visual de Biblioteca > Receitas continua **pendente de validação no produto**.  
**Arquivo integral anterior:** [Guia pré-consolidação de 17/11](historico/GUIA_VISUAL_BACKOFFICE_pre_consolidacao_2026-11-17.md). O arquivo preserva todas as decisões intermediárias, os diagnósticos, os testes e as referências técnicas históricas.

> **Fonte normativa para novas alterações visuais:** este guia. Os valores correntes do CSS podem divergir; a existência de uma regra documental não demonstra que tenha sido aplicada. Não interpretar este documento como autorização para modificar código da app ou o Admin.

## 1. Identidade, tipografia e hierarquia

- Direção: produto unificado, discreto, funcional, sem molduras decorativas, brilhos, sombras ou contornos excessivamente destacados. O contraste provém da hierarquia de superfícies e texto.
- Fonte principal **Inter Tight**, com SF Pro Text e Arial como alternativas. Texto base do sistema **Medium 500** quando previsto nos componentes; títulos podem ser semibold conforme hierarquia. **Exceção obrigatória: todas as pills são Regular 400**, sem negrito.
- Texto principal: **#1C2633** claro / **#F2F3F5** escuro; secundário: **#596675** claro / **#A2A7B0** escuro.
- Não alterar dados, modelos clínicos, publicação, permissões, nutrição, associações ou endpoints para corrigir apenas a apresentação.
- Contornos de foco, avisos clínicos, seleção, categorias nutricionais e drag-and-drop têm significado funcional: nunca os remover por regras globais.

### Superfícies (design tokens)

| Papel | Claro | Escuro | Token |
|---|---|---|---|
| Fundo geral | `#F5F6F8` | `#101114` | `--tm-ui-bg` |
| Card principal | `#FFFFFF` | `#15161A` | `--tm-ui-card` |
| Subcard | `#F0F2F6` | `#1E2025` | `--tm-ui-subcard` |
| Campo dentro de subcard | `#E5EBF2` | `#282B33` | `--tm-ui-search` |
| Hover neutro | `#E3E7EE` | `#303239` | `--tm-ui-hover` |

**Contexto obrigatório:** campo diretamente na página → fundo de card; campo num card → fundo de subcard; campo num subcard → fundo de terceiro nível. Não aplicar o azul subtil a todos os campos indiscriminadamente. Sem bordas decorativas ou sombras. Listas pendentes acompanham a hierarquia real.

## 2. Padrão universal de pills — decisão final de 17/11

**Vale para todas as etiquetas informativas**: classificação de Planos, estado de publicação, categorias de Receitas e Pratos, receita associada, Jogos/Treinos nos eventos, estados de jogadores e restantes bibliotecas. Não criar tratamentos especiais de geometria entre módulos nem entre desktop e mobile.

| Propriedade | Valor único |
|---|---|
| Altura | **26 px** |
| Tipo de letra | **Inter Tight Regular 400, 11 px** |
| Raio | **999 px** |
| Padding horizontal | **9 px** |
| Fundo | Cor do texto da própria pill com **7% de opacidade** |
| Contorno | **1 px**, cor do texto com **12% de opacidade** |
| Sombra | **nenhuma** |
| Temas/dispositivos | Mesma geometria e opacidades no claro, escuro, desktop e mobile; só a tinta cromática é adaptada ao tema |

CSS de referência para implementação futura (não aplicado nesta atualização documental): `background:color-mix(in srgb,var(--pill-ink) 7%,transparent)`; `border:1px solid color-mix(in srgb,var(--pill-ink) 12%,transparent)`. O texto deve manter uma cor legível, não receber opacidade de 7%.

**Atenção:** o padrão das pills **não se aplica** aos cards nutricionais preenchidos, aos seletores coloridos das refeições, a dropzones, aos botões interativos nem às molduras funcionais de foco/seleção. Estados e categorias partilham geometria, mas mantêm cor e significado próprios.

### 2.1. Estados — tinta cromática oficial

| Família | Exemplo | Claro | Escuro |
|---|---|---|---|
| Positivo | Publicado, Ativo, Registado | `#317154` | `#8ED0AB` |
| Pendente | Rascunho, Por guardar, Por publicar | `#8A6327` | `#E2C17E` |
| Neutro | Inativo, Oculto, Arquivado | `#607082` | `#AAB4C2` |
| Atenção | Rever, Incompleto | `#AF6544` | `#E2A188` |
| Erro | Erro, Falha | `#A65362` | `#E5A0AC` |

A tintura acima gera **também o fundo a 7% e o contorno a 12%**. Estado não é botão. Nunca depender apenas da cor. **Guardar ≠ Publicar**, **Por guardar ≠ Por publicar**, **Registado ≠ Publicado**. Eliminar apaga definitivamente (com confirmação); Remover desfaz associação; Desativar preserva dados; Arquivar conserva histórico.

### 2.2. Categorias de Receitas — famílias cromáticas existentes

Manter as famílias cromáticas **e a correspondência real de cada categoria** já existente no projeto; não reatribuir cores arbitrariamente por ordenação. O nome/categoria mantém a mesma família em lista, cartão mobile, filtro e leitura. Texto por tema:

| Família | Claro | Escuro |
|---|---|---|
| Rosa | `#9D426A` | `#F0A8C7` |
| Vermelho | `#AC3038` | `#EF999B` |
| Turquesa | `#186A62` | `#8EDBD2` |
| Azul | `#265C9D` | `#A4C9FC` |
| Âmbar | `#94601C` | `#F0CC85` |
| Violeta | `#75409C` | `#CFB2F3` |
| Menta | `#2F7544` | `#A9E1BD` |
| Laranja | `#A65728` | `#F6B993` |
| Índigo | `#4C56A1` | `#B9C1FF` |
| Ciano | `#226D88` | `#9BD8EB` |
| Lima | `#5C731F` | `#C8DF98` |
| Ardósia | `#526477` | `#CCD5E1` |

Todas seguem **a mesma geometria e opacidades da secção 2**; não usar os fundos sólidos antigos. O mapa exato nome de categoria → cor deve ser lido dos registos e da implementação antes de qualquer alteração de código.

### 2.3. Cores dos planos nutricionais — preservadas

**Distinguir três papéis:** (1) a identidade cromática de uma classificação, (2) a sua *pill* translúcida conforme secção 2 e (3) o **card de refeição ou seletor nutricional preenchido**, que **não** deve ser tornado transparente. O tom dos cards muda entre temas para legibilidade, sem mudar a identidade do plano.

| Plano | Tom identificador usado nas etiquetas | Fundo card claro / texto | Fundo card escuro / texto |
|---|---|---|---|
| Amarelo | `#D4B651` | `#FFF0BB` / `#725313` | `#513C12` / `#FFDB77` |
| Laranja | `#D99555` | `#FFDFC3` / `#804717` | `#53351C` / `#FFCA95` |
| Azul | `#6FA9DA` | `#DCEEFF` / `#24577D` | `#203E54` / `#A8D8FB` |
| Verde | `#6EBC8D` | `#D9F1E2` / `#245E40` | `#234535` / `#A7E1B9` |
| Verde preparação (VP) | `#28543E` | `#D8E9DE` / `#24513A` | `#28543E` / `#BDE6CD` |

A pill usa a variante de texto legível do tema da classificação, com fundo 7% e borda 12%. A cor do card preenchido e a cor do seletor seguem as paletas existentes e os seus tokens por contexto. **Peri-treino e Peri-jogo** conservam as suas regras cromáticas existentes: não criar um HEX novo sem validar os tokens implementados. Os planos VP devem manter verde profundo e não voltar ao verde claro legado no cabeçalho de detalhe do dia.

## 3. Botões, ações, ícones e formulários

- **Ações não são pills**: principal 42–44 px, raio 12 px; secundário 38–40 px, raio 12 px; compacto com texto 32–36 px, raio 10 px; só ícone habitualmente 36 × 36 px, raio 10 px, com alvo móvel preferencial de 44 × 44 px. As dimensões especiais de seletores nutricionais não definem pills.
- Criar, Guardar, Publicar: botões com a cor semântica de ação aprovada; Cancelar/Voltar/Fechar: ação fantasma; Eliminar: perigo suave, com confirmação. Botões de criação: **Inter Tight Medium 500 / 13 px**, consistentes nos dois temas.
- Guardar pode dar feedback positivo transitório; não equivale a Publicar. No editor de Planos, o verde de confirmação após guardar é breve (1100 ms); Publicar só é ação positiva quando disponível.
- **Ícones oficiais das ações rápidas: Hugeicons** existentes no código; **PencilEdit01Icon** para editar, **TrashIcon** para eliminar. Outros ícones devem ser os próprios componentes Hugeicons aprovados, não desenhos improvisados, nem misturas arbitrárias com Lucide. Formato outline consistente, tipicamente ~18 px.
- Fechar modal: X pequeno e fino, **sem contorno nem preenchimento decorativo**, com foco de teclado acessível. O clique fora, Escape e proteção contra perda de dados dependem do formulário.
- Modais de criação/edição: card principal sem moldura ou sombra, raio habitual 18 px e backdrop preto de referência `rgba(0,0,0,.76)`; campos de duas linhas **etiqueta sobre valor**, com o mesmo recuo esquerdo, numa superfície de subcard única, sem input interno duplicado.
- Novo/Editar alimento: campos de pelo menos 72 px quando em cartão de duas linhas, controlo interno transparente; pesquisa em superfície dependente da sua profundidade real. Popups de Pratos seguem a estrutura do popup «Adicionar novo prato».
- Inputs editáveis no Safari/iPhone: pelo menos **16 px** quando recebem foco para evitar zoom. Preservar outline de foco funcional (normalmente 2 px) e rótulos acessíveis. Não abrir teclado mobile automaticamente sem necessidade.
- Um card clicável tem feedback discreto no próprio card e deve conservar ações internas independentes; não criar hover em linhas meramente informativas. Respeitar `prefers-reduced-motion`.

## 3A. Catálogo oficial de ícones Hugeicons — aprovado em 17/11

**Usar exclusivamente os ícones oficiais indicados pelos nomes de exportação abaixo**, sem redesenhar versões semelhantes nem trocar por Lucide ou emojis. O nome listado é a identidade normativa; a dimensão pode adaptar-se ao contexto sem alterar o desenho do ícone. No manual PDF visual, apresentar os SVG originais Hugeicons quando disponíveis.

### App dos jogadores

| Função | Hugeicons oficial |
|---|---|
| Pequeno-almoço | `Coffee03Icon` |
| Snack | `VegetarianFoodIcon` |
| Almoço / Jantar | `Restaurant02Icon` |
| Ceia | `Moon02Icon` |
| Jogo | `FootballIcon` |
| Treino | `FootballPitchIcon` |
| Pós-treino | `SoftDrink01Icon` |
| Pós-jogo | `SoftDrink01Icon` |
| Página inicial | `Home09Icon` |
| Planos | `Files01Icon` |
| Inserir novo | `AddCircleIcon` |
| Menus | `MenuRestaurantIcon` |
| Perfil | `User03Icon` |
| Formulário jogo | `FootballPitchIcon` |
| Formulário peso | `WeightScaleIcon` |

### Backoffice

| Função | Hugeicons oficial |
|---|---|
| Eliminar / caixote do lixo | `TrashIcon` |
| Editar | `PencilEdit01Icon` |
| Biblioteca | `LibraryBigIcon` |
| Criar planos | `ClipboardPlusIcon` |
| Alterações e execução (Chef) | `ChefHatIcon` |

**Nota:** esta lista documenta decisões aprovadas para duas interfaces diferentes. **Não autoriza alterações à app dos jogadores nem ao Backoffice.** A branch do Admin continua `production/the-mile-admin` e a da app `main`. O uso do `FootballIcon` em «Ajustes pós-jogo» no Admin mantém-se conforme a secção Modelo.

## 3B. Ações rápidas, hover desktop e microinterações mobile — 17/11

### Ações rápidas: geometria e semântica

- **Editar:** usar o componente Hugeicons `PencilEdit01Icon`, outline; botão compacto em **superfície neutra de subcard** (modo claro `#E6EBF1` como referência de ação neutra; escuro `#242830`), com cor de texto/ícone principal, sem borda ou sombra decorativa.
- **Eliminar:** usar **`TrashIcon` sempre dentro de um botão/card de ação vermelho suave**, não um ícone vermelho solto nem um botão neutro. Referência de botão destrutivo: **claro fundo `#F4E0E3`, ícone `#B15665`; escuro fundo `#3A2128`, ícone `#F0A3AF`**. O vermelho de fundo é uma superfície de ação, **não uma pill informativa** e não segue a regra de fundo a 7%.
- **Uniformização:** par Editar/Eliminar com a mesma dimensão, raio e alinhamento na mesma área. Referência para ações rápidas isoladas: **36 × 36 px, raio 12 px, ícone outline ~18 px**, alvo táctil alargado a ~44 × 44 px no mobile quando possível. Distinguir esta referência global de geometrias de editor específicas já existentes e validadas.
- Preservar `aria-label`, tooltip onde útil, foco de teclado e confirmação antes de eliminar. Se «Remover» significa apenas desassociar, a ação continua semanticamente destrutiva relativamente à ligação, sem eliminar o objeto de origem. Não propagar clique do botão para o card pai.

### Hover, rato e teclado (desktop)

- **Ações rápidas:** alterar **apenas o próprio botão** em hover; Editar passa para um neutro ligeiramente mais evidente (hover neutro `#E3E7EE` claro / `#303239` escuro como referência); Eliminar ganha vermelho suave um pouco mais marcado, sem sombras, deslocações, brilho ou contornos decorativos. Não alterar a cor do card completo ao passar o cursor sobre uma ação rápida.
- **Cards navegáveis:** quando o card inteiro abre detalhe, aplicar mudança **subtil da superfície do próprio card**, não sublinhar o título. A ação interna Editar/Eliminar continua independente.
- **Linhas informativas (ex.: Eventos do mês) e cartões informativos (ex.: coluna dos dias no Modelo):** **sem hover da linha/card**; hover só nos controlos realmente editáveis.
- **Seletores editáveis** no Modelo e Ajustes pós-jogo: hover discreto na superfície do seletor sem mudar a cor prescrita. Sidebar: expande por hover/foco com reflow do conteúdo, sem sobreposição.
- **Teclado:** `:focus-visible` com contorno funcional legível; não confundir contorno de acessibilidade com moldura decorativa.

### Microinterações (mobile e toque)

- Não usar comportamento de hover como principal sinal de interação. O **feedback táctil aparece na superfície do elemento realmente acionado** e mantém-se brevemente após o toque.
- **Cards navegáveis de Jogadores e Planos:** preenchimento de subcard e escala discreta `scale(.992)` durante cerca de **140 ms**, conforme decisão aprovada; não deslocar layout nem alterar dados. O botão interno acionado não deve também abrir o card.
- **Ações rápidas:** feedback breve no **fundo do próprio botão** neutro ou destrutivo, preservando a cor vermelha do lixo. Manter ícones centrados e alvos confortáveis; não animar a linha toda quando só se toca em Editar/Eliminar.
- **Ajustes pós-jogo:** feedback na própria superfície do card, **nunca overlay retangular dentro do `summary`**. Nas revisões históricas foi usada a classe `tm-mobile-card-press` e uma duração aproximada de **360 ms** no card principal para resistir a cancelamentos por scroll; não generalizar essa duração a todos os componentes sem validação.
- Seletores nativos preservam a abertura normal do picker e foco; evitar highlight retangular do Safari nos cards aprovados, sem retirar indicadores de foco acessível.
- **`prefers-reduced-motion`:** retirar/atenuar transições e escalas, mantendo feedback de estado e acessibilidade.

**Nota de verificação:** as cores e comportamentos acima foram recuperados das decisões previamente aprovadas e do histórico documental. Este guia define como a interface **deve** ser; não certifica que todos os módulos atuais já correspondam à regra. O PDF visual inclui exemplos estáticos de estado normal/hover/toque, não animações executáveis.

## 4. Navegação e estrutura partilhada

- **Branches separadas:** Admin = `production/the-mile-admin`; app dos jogadores = `main`. A uniformização do Admin não altera a app.
- Dashboard é a referência para o **início horizontal da área de conteúdo e recuos internos**. Desktop: área `#admin-workspace > .tm-admin-work-area` fluida, com `padding-inline:clamp(16px,2vw,34px)`; recuo interno base de cards 24 px. Mobile (até 830 px) preserva as margens dos cards de Início, uniformes entre bibliotecas.
- Sidebar desktop com cursor: **compacta por predefinição (72 px)**, expande automaticamente por hover/foco (aprox. 226 px), **refluindo a grelha e o conteúdo sem cobrir os cards**; submenus abrem automaticamente ao passar o cursor/foco. **Não há botão de colapso**. Desktop tátil sem hover mantém alternativa navegável. Mobile conserva barra de navegação própria.
- Desktop a partir de 831 px; mobile até 830 px, salvo disposições específicas de componente. Em janelas desktop estreitas, manter tabelas onde aprovado com scroll horizontal interno; no mobile usar cartões verdadeiros onde definidos.
- Comandos de regresso contextuais «‹ Início» / «‹ Planos» sem duplicação. Manter proteção de alterações por guardar ao sair do editor.
- Não confundir validação de sintaxe, testes, deploy Render e validação visual autenticada: são verificações diferentes.

## 5. Dashboard, Jogadores e Conta

- Dashboard: microciclo semanal sem scroll vertical próprio; a página faz scroll. Em largura estreita, sete dias podem deslizar horizontalmente.
- Dashboard → «Eventos e tarefas» (20/11/2026): ícones oficiais Hugeicons à esquerda, alinhados com nome e descrição, 24 × 24 px: **jogos `FootballIcon`**, **aniversários `CakeIcon`**, **avaliações `ChartEvaluationIcon`**, **viagens `Airplane01Icon`**, **outros eventos `Calendar03Icon`**. Aniversários deixam de usar emoji. Manter as cores existentes dos jogos (verde MD) e aniversários (âmbar), o mesmo comportamento de clique, responsividade e suporte a ambos os temas. `other` e `travel` são os únicos tipos de calendário comum apresentados neste bloco; treinos regulares continuam excluídos.
- Dashboard → **«Hoje» consolidado (20/11/2026)**: um único painel de duas colunas, aprovado visualmente. Coluna esquerda: cabeçalho sem título exterior redundante; subcard apresenta **«Hoje»** quando a data escolhida é a atual e **`21 novembro 2026`** (ou outra data correspondente) ao navegar; seletor **‹ Hoje ›** permanece à direita e regressa ao dia atual; sem calendário mensal nem legendas auxiliares; lista cronológica de consultas, avaliações agendadas, jogos, viagens, aniversários e outros eventos, com cores e Hugeicons próprios. Dados da coluna esquerda apenas para leitura: marcações vindas de Agendamentos (`/api/v2/admin/appointments/bookings`) e acontecimentos do jogador vindos de Planeamento/Clientes (`/api/v2/admin/dashboard/activity?date=`). «Nova marcação» abre o formulário de Agendamentos na data selecionada (`?date=AAAA-MM-DD&view=day&new=1`); «Ver agenda completa» abre a vista Dia. Coluna direita: «Formulários recentes» existentes e «Chat e pedidos» com estado futuro discreto, sem dados fictícios nem botões inativos. Registos clínicos em Avaliações continuam separados dos agendamentos. Estilos construídos com tokens de tema claro/escuro e responsive; sem segunda agenda nem duplicação das regras de marcação. Futuras contas de nutricionistas usam `admin.themile.pt` e devem ser filtradas por atribuições; clientes, jogadores e chefs usam `app.themile.pt`.
- Dashboard → **Mobile compacto (20/11/2026; ajustado após teste real)**: manter o desktop em duas colunas e os subcards mobile empilhados, sem altura mínima forçada no resumo diário. «Formulários recentes» usa lista de altura natural quando há até duas respostas; quando existem mais, apresenta **duas respostas completas** com scroll interno, sem botão «Ver mais», preservando todas as respostas e as suas ações originais. A altura máxima é medida a partir das linhas reais e do espaçamento, sem cortar conteúdos. No desktop, a lista segue o mesmo princípio até **quatro respostas completas**. O «Chat e pedidos», ainda sem backend, mantém uma nota breve sem scroll ou pedidos fictícios. Usar tokens dos dois temas, dimensões cómodas e scroll natural no iPhone.
- Dashboard → **Acontecimentos com altura máxima adaptativa (20/11/2026)**: lista diária até **3 cards inteiros no mobile** e **4 no desktop**, sem altura fixa em dias menos preenchidos. O limite é calculado a partir da altura real dos cards e do espaçamento, para evitar recortar texto ou cartões; scroll vertical apenas quando há mais acontecimentos. O cabeçalho/data e os atalhos «Nova marcação»/«Ver agenda completa» ficam fora da lista e sempre visíveis. Preservar o encadeamento natural do scroll no iPhone, snap suave por card, navegação por teclado, e reagir a redimensionamentos/mudanças de fonte. «Formulários recentes» segue o mesmo princípio adaptativo (2 mobile/4 desktop); «Chat e pedidos» permanece compacto sem scroll até existir integração.
- Dashboard → **Cards de acontecimentos «Hoje» (20/11/2026; novo padrão aprovado)**: uma única estrutura de card para desktop e mobile nos dois temas: ícone oficial no badge discreto à esquerda, **nome do cliente/jogador em destaque (14 px/600; 13 px/600 mobile)**, serviço ou tipo de evento na segunda linha (12 px/400), profissional na terceira linha apenas em marcações (11 px/400); se não existir pessoa associada, o título real do evento assume o primeiro nível. **Retirar todas as barras verticais cromáticas à esquerda**, preservando as superfícies/categorias existentes, incluindo jogo verde e aniversário âmbar, e respetivos Hugeicons. **Horário/momento à direita em texto simples 12 px/400**, sem coluna rígida, sem negrito nem pill de hora; as linhas podem quebrar sem truncar nomes. **Só as marcações (consultas e avaliações agendadas) mostram estado**, abaixo do horário, com o padrão universal da secção 2 (26 px, 11/400, raio 999, tinta legível, fundo 7%/contorno 12%). As etiquetas presentes conservam os estados reais existentes «Agendada» e «Confirmada»; «Por confirmar» fica preparada visualmente como pendente para quando houver um fluxo funcional real de confirmação, sem inventar confirmações, alterar endpoints ou aplicar estado a jogos, viagens, aniversários e outros eventos. Cliques, navegação, acessibilidade, scroll adaptativo e responsividade mantêm-se intactos.
- Dashboard → **Navegação compacta e indicação de mais conteúdo (20/11/2026)**: manter a superfície MD verde e o ícone de jogo, mas reduzir a intensidade da linha de contorno a **25% da tinta de contorno anterior** (30% no hover) em ambos os temas; a identidade visual do acontecimento é transmitida sobretudo pelo preenchimento. Em «Hoje» e «Formulários recentes», apresentar apenas quando há overflow um discreto **«Mais» com chevron descendente**, fora da lista e sem recortar cartões: o utilizador pode tocar/clicar para deslizar uma área completa, também com teclado; esconder o indicador no fim do scroll, reativando-o se o utilizador voltar acima. Manter os limites existentes de 3/4 acontecimentos e 2/4 formulários, respetivamente mobile/desktop. Substituir «Nova marcação» e «Ver agenda completa» por dois atalhos **redondos, apenas com ícones de calendário**, alinhados à direita, fundo neutro e sem pills: 40 × 40 px desktop, 42 × 42 px mobile; usar nome acessível, title, hover/foco e destinos originais com data selecionada. Não criar aqui um novo modelo de reuniões ou tarefas sem conceção e aprovação funcional; os bloqueios de disponibilidade e os acontecimentos de jogador não são equivalentes a esses futuros registos.
- Dashboard → **Agenda de trabalho e Tarefas (20/11/2026; revisto)**: o atalho redondo «Adicionar» abre as escolhas Marcação, Evento e Tarefa; **Nova tarefa abre um pop-up no próprio Dashboard**, sem mudar de página. O card Tarefas da Página Inicial mostra até três tarefas por fazer, incluindo sem prazo, e permite concluir ou editar. «Ver todas» abre um segundo pop-up no Dashboard com filtros, reabertura e eliminação. Prazo = **data opcional, nunca uma hora de reserva**. Agendamentos mantém apenas Agenda, Reservas, Disponibilidades e Configuração: eventos internos (reuniões, formações e deslocações) podem ter horário, mas tarefas não ocupam a agenda nem bloqueiam vagas. Estados de confirmação continuam exclusivos das marcações, sem confundir com o estado operacional da tarefa. Ver docs/AGENDA_EVENTOS_TAREFAS_BACKOFFICE.md.
- Dashboard → **Pop-ups de tarefas (uniformização 20/11/2026)**: apresentação de criação/edição pela família universal de modais: card principal com raio 18 px sem sombra/borda, **um subcard de duas linhas por campo** (etiqueta em cima, valor em baixo, input interno transparente), tokens de superfície e ações dos temas claro/escuro, foco funcional à volta do subcard, fonte input 15 px desktop / 16 px mobile. Botões Guardar (ação principal 42 px/13 px Medium 500), Cancelar (fantasma) e Eliminar (vermelho suave) substituem texto sem superfície; X de fechar fino/sem decoração. Não mostrar «Erro desconhecido.» ao iniciar ou reabrir: limpar a mensagem sem criar uma mensagem nova. O mesmo padrão visual é partilhado com eventos internos; nenhuma alteração ao funcionamento ou dados.
- Dashboard → **Checklist de tarefas — correção de estado e cores (20/11/2026)**: pendente mostra quadrado vazio e tem ação Concluir; concluída passa a quadrado com visto e texto mais discreto, permanece visível na Página Inicial e pode ser reaberta no mesmo local. O card contém até três tarefas, conservando uma concluída recente quando existir. O pop-up «Tarefas» inicia em «Todas», com filtros opcionais Por fazer/Concluídas. O estado não equivale a apagar ou remover. Pop-ups seguem exatamente o padrão «Novo alimento»: um único subcard por campo em ambos os temas, sem controlos brancos por dentro, Cancelar em fundo secundário, Guardar em fundo principal, Eliminar em vermelho suave e oculto na criação; X neutro compacto. Não criar estilos novos de ação nem alterar regras clínicas.
- Jogadores: **um cartão individual por jogador**, sem linhas de tabela; fotografia, nome, utilizador, estado e renovação. Card inteiro abre perfil, com foco/teclado; «Entrar na app» é ação independente no canto superior direito. Sem botão de olho «Ver perfil». No mobile: identidade e app na primeira linha; renovação e estado na segunda.
- Filtros de jogadores: card principal com pesquisa e filtro em subcard, sem azul do terceiro nível nesse contexto. Pesquisa compacta com um só X. Não mostrar avatar vazio quando não existe jogador selecionado.
- Perfil: um único card principal com quatro secções irmãs: Dados pessoais, Permissões e definições da conta, Imagem App e Gerir acesso. Subcards internos só nos locais apropriados, não grandes contornos adicionais.
- Criar jogador: modal centrado, campos label/valor em subcard e ações Cancelar/Criar; layouts responsivos sem alterar validação e segurança.
- Clicar/tocar em cartões navegáveis tem feedback no card, não no texto nem em botões vizinhos; ícones acessíveis e ações independentes.

## 6. Planos

### Listagem

- Desktop: tabela com filtros Jogador e Tipo de plano, sem pesquisa redundante, com divisores e hover quase impercetíveis; linha clicável abre visualização; Editar e eliminação especial são ações independentes. Desktop estreito: scroll horizontal, sem cartões artificiais.
- Mobile: cartões `article` individuais; **pesquisa de jogador + Criar** na primeira linha do painel de filtros, Tipo de plano abaixo. O cartão abre a visualização; Editar no canto superior direito, estado e tipo na segunda linha. Não converter linhas de tabela em cartões apenas com CSS.
- Classificação e estado usam **pills universais secção 2**, mesmo onde a documentação histórica dizia 32 px / 13 px; proteger paletas nutricionais e estados reais.
- Cópias antigas mantêm aviso específico e confirmação de eliminação.

### Visualização

- Desktop: cabeçalho Jogador → Plano → Referência, quatro valores nutricionais alinhados, com cores e rácios preservados; remover títulos de classificação repetidos no segundo card. Edição por botão com lápis + «Editar», não ícone de olho.
- Mobile: conservar resumo nutricional em quatro colunas, título sem repetição, botão Editar compacto. A navegação contextual «‹ Planos» permanece disponível sem duplicação.

### Edição

- Novo plano no topo, não duplicado no rodapé. Resumo com seletores e quatro totais; kcal/proteína/hidratos/gordura preservam cores e cálculos. Seleção ativa muda discretamente a superfície da opção, sem barra lateral.
- Metadados e estado **fora do card nutricional**, em faixa contextual. Desktop: estado à esquerda, «Guardado em» e «Ref.» à direita. Mobile publicado: mostrar pill «Publicado» e ocultar referência/data de gravação nesse estado, sem eliminar informação dos cálculos.
- Refeições: ações independentes, sem sobreposições com macros ou seta. Mobile: duas linhas estáveis, nome e ações em cima, macros em baixo, seta na coluna lateral centrada; abrir/fechar sem saltos de layout. A região livre do cabeçalho também expande, sem interferir com botões.
- Macros da refeição e da opção alinhadas pela grelha nutricional real dos alimentos **em fluxo CSS, nunca com `position:absolute`**. Recalcular em resize. Conteúdo compacto do editor a partir do limite intermédio de 1240 px; em 831–1100 px reorganizar alimentos em duas linhas conforme espaço. Não alterar o breakpoint geral da navegação (830 px).
- Campos e ações de adicionar alimento e nota com 48 px; preservar opções, gramagens, estados e validações. Guardar neutro com feedback positivo transitório; Publicar conforme disponibilidade; Apagar destrutivo. Não empilhar novas regras responsivas contraditórias.

## 7. Bibliotecas

### Regras transversais

- Cards e filtros acompanham superfície contextual da secção 1. Em mobile, margens iguais às aprovadas em Início, **cards independentes por item**, sem contornos fortes.
- Ações rápidas editar/eliminar em posição e dimensões uniformes, normalmente no topo direito do cartão mobile; usar Hugeicons oficiais. Campo label/valor sem recuos internos divergentes. Fotografias sem fundo CSS opaco e com `object-fit:contain` onde aprovado.
- **Todas** as categorias, associações e estados em pills seguem secção 2 (26 px, 11 px/400, 7%/12%), sem exceções por biblioteca.

### Alimentos

- Filtros Pesquisa + Categoria num card principal; cada controlo em subcard de duas linhas, sem barra de input interna. «Novo alimento» fora do card de filtros.
- Desktop: tabela com scroll interno em janela estreita, dados nutricionais tabulares. Mobile: um card por alimento com quatro valores kcal/P/HC/G em subcards neutros; ações no topo direito.
- Novo/Editar alimento: campos label/valor com uma única superfície, sem bordas decorativas nem zoom Safari.

### Suplementos

- Manter os cards e formulários já aprovados, alinhamento dos botões «Novo» e das ações rápidas com as restantes bibliotecas; prescrições, doses e dados funcionais intocados. Estados informativos seguem pill universal.

### Porções Visuais

- Filtros Categoria/Pesquisar no mesmo card e superfícies de subcard, com disposição responsiva. Carregamento inicial de 16 cartões; «Ver mais (16)» e carregamento lazy de imagens. Ativa/Inativa é **controlo interativo**, mesmo que visualmente se pareça com etiqueta; preservar `aria-pressed`.
- Preservar a marcação VP verde-garrafa `#28543E` e o comportamento já aprovado, sem publicar porções por alterações cosméticas.

### Pratos

- Desktop: tabela e miniaturas sem fundo CSS opaco. Mobile: **um card por prato**; categoria e receita associada junto ao cabeçalho, ações topo direito; nome/descrição à esquerda e fotografia à direita; sem nome inglês na listagem mobile.
- Modal «Adicionar novo prato» é a referência para editar: Categoria → Nome PT → Nome EN opcional → Fotografia; upload e Guardar no mesmo fluxo, sem botão «Alterar fotografia».
- Associar receita: campo de pesquisa dentro de subcard, com lista vertical, uma receita por linha. Associação existente em subcard, nome clicável sem olho ou sublinhado; caixote independente para **desassociar**, sem eliminar a receita da biblioteca.

### Receitas — **pendente de QA visual final**

- Biblioteca > Receitas é distinta de Planeamento > Menus e receitas (gestão por jogador).
- Uniformizar categorias, estados, ações, cards mobile, fotografias e formulários pelo padrão acima. Pills no desktop **não podem voltar a ter contorno forte, peso bold ou dimensão maior que o padrão universal**. A conversa de 17/11 P2 reportou repetidas inconsistências apesar de correções; **não declarar resolvido sem validação visual**.
- A associação categoria → família cromática deve permanecer estável; a paleta textual está na secção 2.2.
- Modal Nova/Editar receita: manter estrutura e funcionalidades existentes; rever X, Cancelar, Guardar, campos, pesquisa e leitura segundo os componentes aprovados, sem modificação funcional nesta consolidação.

## 8. Planeamento

### Pesquisa de jogador

- Card principal com pesquisa em subcard e lista de resultados adequada; sem divisória decorativa entre pesquisa e abas. Sem avatar reservado quando vazio; X único discreto; subsecção ativa em preenchimento suave, sem azul intenso.

### Microciclos — calendário e eventos

- **Layout atual aprovado por fotografia em 17/11 (prevalece sobre esquemas antigos):** na linha superior **«Novembro de 2026» à esquerda** e controlos **‹ Hoje › à direita**; **calendário abaixo**; botão **«+ Adicionar evento» no fundo, à direita do card do calendário**. Não mover o botão para a linha do mês nem para o topo.
- Calendário de sete colunas também no mobile; manter cores das refeições, MD/Off, hoje e seleção. **Geral por definir:** fundo transparente, contorno tracejado e barras nutricionais; dias definidos têm preenchimento de estado.
- Detalhe do dia em card independente abaixo do calendário, com cartões de refeição nas cores de Planos, incluindo VP com fundo `#28543E` e texto `#BDE6CD` no cabeçalho. Peri-treino/peri-jogo identificam o período real e mostram nutrientes sem duplicação. X do dia sem fundo nem contorno decorativo.
- **Eventos do mês — preservar imagem aprovada em 17/11:** card principal colapsável, título e contagem no cabeçalho, lista vertical simples com divisórias ténues; cada linha tem pill de evento, data/detalhe e Editar/Eliminar à direita. **Hover apenas nos botões reais**, nunca na linha informativa. Identidade de evento: Jogo verde, Treino azul, Folga rosa suave; restantes tipos com cores coerentes. Preservar a eliminação com confirmação e as regras existentes dos overrides de suplementação.
- Média semanal em card principal próprio, quatro indicadores e cálculos preservados.

### Modelo e Ajustes pós-jogo

- **Modelo — preservar a fotografia aprovada em 17/11:** matriz desktop com coluna esquerda «Dias do microciclo» em **cartões individuais por dia**, separados visualmente dos seletores coloridos de Pequeno-almoço, Almoço, Lanche, Jantar e Ceia. Sem faixa contínua a atravessar toda a linha. MD com cartão verde suave, Off rosa suave, restantes neutros; ponto de estado próprio. «Sem refeição» transparente com contorno funcional subtil; seletor com raio 12 px e chevron. No mobile manter os cartões expansíveis com cinco barras e campos, sem contagem redundante.
- Seletores nutricionais têm preenchimento cromático próprio (não são pills). As alterações de cor no Modelo são guardadas automaticamente, com herança e endpoint existentes.
- «Ajustes pós-jogo»: card principal colapsável, cenários em subcards; designação **«Igual ao modelo»**, sem «3 intervalos» redundante. Três linhas «0 min · Não jogou», «1–29 min», «30–59 min» sem barras ou indicadores adicionais.
- Ícone de cabeçalho: **Hugeicons FootballIcon**, substituindo apito desenhado à mão. Apenas o chevron roda. Feedback mobile na **superfície do próprio card** nos dois temas, não em pseudo-overlays retangulares; preservar scroll de abertura e foco. Desktop: hover nos seletores editáveis, não nos cartões informativos de dias.

### Menus e receitas (Planeamento)

- Menus diários e semanais conservam gravação automática e histórico por jogador. A semana tem sete dias (Seg–Dom) e refeições Almoço/Jantar, com nome completo, cores nutricionais e fotografias de pratos efetivos; categorias genéricas **não recebem fotografia placeholder**.
- Vista diária: controlos à esquerda, fotografia do prato à direita quando existe; apenas um X acessível na pesquisa. Cards e inputs usam superfícies contextualizadas.
- Histórico: desktop com **Data | Microciclo | Almoço | Jantar**. Mobile com **um cartão por data**. Pesquisa só por pratos completos realmente correspondentes, mostrando apenas almoço/jantar que coincide; sem resultados acessórios. Paginação por 12 datas e realce subtil das ocorrências; sem filtro repõe as duas refeições.
- Vista semanal no mobile com scroll horizontal e snap por dia; manter alturas e legibilidade. Em Planeamento > Receitas, o card colapsável e os filtros de categorias seguem as superfícies corretas; não confundir com a Biblioteca > Receitas.

### Registos

- Comparar consumo com prescrição guardada, respeitando a alternativa `option_index` efetivamente escolhida; não marcar alternativas não escolhidas como alimentos omitidos. «Parcial» quando há omissão ou redução; aumentos apenas com alimentos previstos consumidos podem ser «Consumido + Alterações». Preservar cautela quando o snapshot não permite comparação segura.
- Energia e totais de macros no resumo sem casas decimais **apenas na apresentação**; cálculos internos com precisão integral. Anéis kcal/proteína/hidratos/gordura; valores consumidos de proteína `#47B7F5`, hidratos `#FF9872`, gordura `#EED072`, com leve destaque semibold 600; objetivos neutros e mais discretos.

## 9. Acessibilidade, QA e manutenção

- Validar: desktop largo/estreito, tablet, mobile, temas claro/escuro, Safari/iPhone, teclado, foco e áreas de toque; não sacrificar acessibilidade para remover contornos decorativos.
- Distinguir **regra documentada**, **código alterado**, **testes aprovados**, **deploy Live** e **QA visual autenticado**. Nenhuma destas etapas substitui outra.
- Tokens principais: `static/admin-surface-palette.css`; estilos partilhados `static/tm-design-system.css`; Planos `static/admin-plans-native.css`; Receitas `static/admin-recipes.css`. Os pontos de entrada do Admin referenciam os assets com versões de cache: atualizar apenas quando houver alteração autorizada de código.
- Manter alterações visuais isoladas no Admin; nunca modificar o código da branch `main` para resolver questões estéticas do Backoffice.
- **Histórico:** [arquivo integral de decisões e correções anteriores](historico/GUIA_VISUAL_BACKOFFICE_pre_consolidacao_2026-11-17.md). Em caso de divergência entre uma regra histórica e este guia, prevalece a regra atual aqui registada.

## 10. Pendências documentais e de implementação

1. **Pills:** o padrão único 26/11/400, 7%/12% está **aprovado como documentação**, mas a aplicação real pode conter estilos legados; a uniformização de CSS necessita de autorização própria.
2. **Receitas no desktop:** o contorno e as dimensões das categorias ainda não tinham sido validados visualmente na conversa P2; não declarar concluído.
3. **Mapeamento de categorias:** as 12 famílias cromáticas estão documentadas, mas não declarar uma correspondência nome → cor como garantida sem verificar os registos reais.
4. **Peri-treino/Peri-jogo:** preservar os tokens cromáticos existentes; completar uma tabela de cores específicas apenas após a respetiva verificação.
5. **Guia vs CSS:** esta consolidação **não modifica nem audita exaustivamente a cascata CSS**. Corrigir divergências no código só mediante pedido explícito.

**Nota de edição:** esta versão retira do manual operativo cronologias e tentativas substituídas; elas permanecem no arquivo integral e nos commits GitHub. Nenhum comportamento do produto foi alterado pela edição deste documento.


## The Mile Select — listas e pesquisa de pessoas (18/11/2026)
**Decisão aprovada:** uma família visual de listas para Jogadores, Biblioteca (Alimentos, Porções Visuais, Pratos e Receitas), Planos, Planeamento, Avaliações e Formulários; desktop/mobile, temas claro/escuro.
- **Seleção simples:** campo com seta ChevronDown, superfície e borda suaves, painel com raio 14 px, opções com mínimo 44 px, selecionada com fundo neutro suave e visto; hover apenas em dispositivos com rato, foco visível, Escape para fechar. Listas longas (mais de 9 opções) têm pesquisa no painel; máximo 300–320 px com scroll.
- **Pesquisa + sugestões:** manter a barra de pesquisa *e* a lista suspensa dependente do texto; não substituir por um select simples. A lista usa a mesma superfície e linhas da seleção simples. O filtro e a seleção continuam associados ao ID interno da pessoa.
- **Pessoas:** avatar circular de 40 px com fotografia real quando existir; caso contrário, iniciais num círculo neutro; se não houver nome, ícone User03Icon. Nome completo sem username por defeito. Apenas quando existirem nomes iguais mostrar username como segunda linha, tanto nos resultados como no valor selecionado onde haja risco de ambiguidade. Não proibir nomes iguais; todas as operações usam o ID único do cliente, nunca o nome.
- **Performance:** miniaturas otimizadas quando disponíveis, lazy loading, cache e sem descarregar fotografias originais para avatares. Não criar URLs de imagens artificiais nem expor identificadores privados.
- **Implementação progressiva:** o select nativo continua a ser a fonte de verdade, e eventos input/change devem chegar aos handlers existentes; seletores já personalizados (Planeamento, Avaliações, Formulários, pesquisa de Jogadores) mantêm os handlers e precisam de verificação funcional antes de acrescentar avatar/username condicional. Não converter os selects ocultos usados como suporte desses componentes.
- **QA obrigatória:** verificar abertura, seleção, teclado, Escape, clique fora, scroll, filtros dependentes, criação/edição, temas e viewport; nenhuma alteração visual equivale a validação funcional concluída.

### Decisões de listas confirmadas (18/11/2026)
- Até 10 opções: abrir diretamente, sem pesquisa interna. Mais de 10: pesquisa interna com campo destacado, separação das opções e scroll.
- Seleção de pessoas: apenas uma barra de pesquisa com sugestões; nunca duplicar pesquisas.
- Manter a pesquisa geral ao lado do filtro Categoria nas bibliotecas, pois pesquisa o nome do alimento/prato/receita e não a categoria.
- Opção selecionada: destaque neutro de fundo, sem visto. Campos fechados preservam as duas linhas, cor e chevron originais. Não substituir o invólucro visual aprovado por um botão adicional.


## Registos de consumo — integração com a app (20/11/2026)

- A app de jogadores e o backoffice administrativo são publicados em **branches e serviços separados**. Os registos de Intra-jogo gravados por timing são disponibilizados numa tabela independente, `v2_consumption_timing_records`.
- A consulta de registos do backoffice é **exclusivamente de leitura**. Os registos antigos de `v2_consumption_records` têm precedência quando coexistem com um agregado de timing do mesmo atleta, dia e evento; não duplicar energia nem criar/migrar registos no serviço administrativo.
- Dentro de um único card **Jogo**, mostrar os momentos registados (Pré-aquecimento, Pós-aquecimento, Intervalo, etc.), cada um com estado, valores consumidos e lista dos alimentos. O resumo do dia soma cada parcela exatamente uma vez e os indicadores de alterações distinguem registos editados de confirmações completas.
- Os identificadores internos são traduzidos apenas na interface, mantendo os valores originais da API: `pre_training` → **Pré-treino**, `post_training` → **Pós-treino**, `pre_match` → **Pré-jogo**, `intra_match` → **Jogo**, `post_match` → **Pós-jogo**.
- Ao consultar um dia sem registos, apresentar «Sem registos» como atualmente. O seletor de data permanece independente: **20/11 e 21/11 não são intercambiáveis**. Se a tabela de timings ainda não existir num ambiente de teste, manter a leitura de registos legados, sem erro nem alterações à base de dados.
- O layout dos timings reutiliza a família de cards da área Registos e os tokens existentes. Não modificar o card universal da app nem a prescrição.

- **Intra-jogo — timing adicionado pelo jogador (20/11):** registo independente sinalizado por `prescription.origin='player_added'`; no detalhe do momento apresentar etiqueta neutra **«Adicionado pelo jogador»**, alimentos/gramagens da biblioteca, kcal calculadas e estado **Consumido** quando foram ingeridos. O estado técnico `partial` continua guardado para contabilização; não o interpretar como incumprimento de um alimento prescrito quando o timing inteiro foi acrescentado. Os momentos planeados permanecem inalterados; o resumo do dia agrega os consumos uma vez. Compatível apenas de leitura, sem editar prescrição ou criar dados no backoffice.
