# The Mile — Guia Visual do Backoffice

Versão 1.2 · Aprovado em 12 novembro 2026  
Âmbito: Backoffice unificado da The Mile V2, incluindo Dashboard, Jogadores, Planos, Planeamento, Menus e Receitas, Biblioteca Alimentar, Porções Visuais, Avaliações, Formulários, Definições e Contas.  
Suportes: desktop, tablet e mobile; modo claro e escuro.  
Fonte técnica: static/admin-surface-palette.css, carregado após os estilos das restantes abas.  
Tipografia: Inter Tight Medium 500; alternativas SF Pro Text e Arial.

## 1. Princípios de identidade visual

1. Seguir a linguagem visual do Dashboard e do Planeamento: áreas definidas por preenchimentos suaves, não por molduras decorativas.
2. Nunca acrescentar sombras aos cartões, botões ou listas pendentes.
3. Usar quatro níveis estáveis de profundidade: fundo geral, card principal, subcard e pesquisa/seletor.
4. Os estados informativos são pills. As ações são botões com cantos de 12 px (ou 10 px nos ícones compactos). Não tornar ações normais em pills.
5. Preservar contornos com significado: foco, seleção, aviso, erro, classificação nutricional, MD/Off, Geral por definir e drag-and-drop.
6. Usar os mesmos estilos em todas as abas e nos dois temas. Não criar cores novas para um único módulo sem aprovação.
7. Não alterar comportamentos, dados, permissões, cálculos ou nomenclaturas clínicas por razões meramente estéticas.

## 2. Paleta neutra oficial

| Elemento | Modo claro | Modo escuro | Token |
|---|---|---|---|
| Fundo geral | #F5F6F8 | #101114 | --tm-ui-bg |
| Card principal | #FFFFFF | #15161A | --tm-ui-card |
| Subcard | #F0F2F6 | #1E2025 | --tm-ui-subcard |
| Pesquisa no subcard (terceiro nível) | #E5EBF2 | #282B33 | --tm-ui-search |
| Hover neutro | #E3E7EE | #303239 | --tm-ui-hover |
| Texto principal | #1C2633 | #F2F3F5 | --tm-ui-text |
| Texto secundário | #596675 | #A2A7B0 | --tm-ui-muted |

Divisores entre linhas muito subtis, usando --tm-ui-divider. Fundos de estados nutricionais e alertas não são substituídos por esta paleta.

## 2A. Regra contextual de superfície (regra definitiva)

O Backoffice tem **três superfícies encaixadas**, sem contornos ou sombras: fundo geral, card principal e subcard. A pesquisa ou filtro recebe o **nível seguinte de preenchimento**.

| Localização do campo | Modo claro | Modo escuro | Token |
|---|---|---|---|
| Diretamente sobre o fundo geral | Cor de **card principal**: #FFFFFF | Cor de **card principal**: #15161A | `--tm-ui-field-on-page` |
| Dentro de um card principal | Cor de **subcard**: #F0F2F6 | Cor de **subcard**: #1E2025 | `--tm-ui-field-on-card` |
| Dentro de um subcard | **Azul muito subtil**: #E5EBF2 | **Grafite-azulado subtil**: #282B33 | `--tm-ui-field-on-subcard` |

**Exemplo aprovado:** fundo #F5F6F8 → card branco #FFFFFF → subcard #F0F2F6 → campo azul subtil #E5EBF2. Em modo escuro: fundo #101114 → card #15161A → subcard #1E2025 → campo #282B33.

Não aplicar azul a todas as pesquisas. **Dentro de um card principal a pesquisa não é azul; usa a cor do subcard.** Só quando inserida num subcard usa azul muito subtil. A separação entre níveis faz-se pelo preenchimento, margens e espaçamento. Mantêm-se os contornos funcionais de foco, seleção e alertas.

Classes de implementação: `tm-ui-on-page`, `tm-ui-on-card`, `tm-ui-on-subcard`, `tm-ui-field`. As listas pendentes acompanham o contexto de superfície.

## 3. Paleta oficial de estados

| Estado | Claro (fundo / texto) | Escuro (fundo / texto) |
|---|---|---|
| Positivo — Publicado, Ativo, Registado | #DDEFE4 / #317154 | #183428 / #8ED0AB |
| Pendente — Rascunho, Por guardar, Por publicar | #F5E8C9 / #8A6327 | #3B2D16 / #E2C17E |
| Neutro — Inativo, Oculto, Arquivado | #E7ECF2 / #607082 | #2A3038 / #AAB4C2 |
| Atenção — Rever, Incompleto | #F8E3D8 / #AF6544 | #42261E / #E2A188 |
| Erro — Erro, Falha | #F5DCE0 / #A65362 | #3D2128 / #E5A0AC |

Geometria das etiquetas: altura 26–28 px, raio total (999 px), texto de 11 px, peso 500–550, padding horizontal 10 px, sem contorno e sem sombra. O estado deve estar sempre escrito; não depender só da cor.

## 4. Ações e botões

| Tipo | Funções | Claro (fundo / texto) | Escuro (fundo / texto) |
|---|---|---|---|
| Principal | Criar, Guardar, Publicar, Novo alimento | #DCE5EF / #2E4157 | #2D3440 / #F2F3F5 |
| Secundário | Ver, Editar, Duplicar, Abrir | #E8EDF3 / #425468 | #23272F / #D6DCE5 |
| Destrutivo | Eliminar | #F4E0E3 / #B15665 | #3A2128 / #F0A3AF |
| Fantasma | Cancelar, Voltar, Fechar | transparente / #596675 | transparente / #A2A7B0 |
| Ícone neutro | Ver perfil, App, Editar | #E6EBF1 | #242830 |

Hover do botão principal: #D2DDE8 (claro), #38414E (escuro). Ações destrutivas têm um vermelho suave mais evidente ao passar o cursor, sem contornos ou sombras.

Dimensões:
- Principal: 42–44 px de altura, raio 12 px.
- Secundário: 38–40 px, raio 12 px.
- Compacto com texto: 32–36 px, raio 10 px.
- Ícone isolado: 36 × 36 px, raio 10 px; área de toque mobile preferencialmente 44 × 44 px.
- Estado: pill (999 px), não botão.

Exceção: em Porções Visuais, Ativa/Inativa é uma interação real com aria-pressed; pode manter o aspeto de etiqueta pill, mas continua a ser um botão acessível. Um botão de Guardar confirmado pode usar verde de sucesso sem alterar a cor neutra da ação ainda não concluída.

## 5. Terminologia — o significado prevalece

| Termo | Significado |
|---|---|
| Publicado / Publicada | Conteúdo efetivamente publicado e disponível |
| Rascunho | Conteúdo existente ainda não publicado |
| Por guardar | Alterações locais não persistidas |
| Por publicar | Alterações guardadas mas ainda sem publicação |
| Ativo / Ativa | Jogador, conta ou referência disponível |
| Inativo / Inativa | Funcionalidade ou referência preservada mas desligada |
| Arquivado / Arquivada | Item preservado para histórico |
| Registado / Registada | Registo concluído, não sinónimo de publicado |
| Rever | Informação a validar, diferente de erro |
| Erro / Falha | Falha efetiva, não simples estado pendente |

Usar concordância de género quando se refere a um objeto: receita publicada, porção ativa, jogador ativo. Não trocar Visível, Ativo e Publicado arbitrariamente.

Ações:
- Eliminar = eliminação definitiva; confirmar e explicar consequências.
- Remover = retirar uma seleção, foto ou associação sem apagar necessariamente o objeto original.
- Desativar = suspender disponibilidade, preservando os dados.
- Arquivar = manter em histórico.
- Guardar = persistir dados; não pressupõe publicação.
- Publicar = disponibilizar versão validada.
- Bloquear / Reativar acesso = modificar permissões/sessões, não apagar contas.

## 6. Ícones oficiais

Estilo outline, traço ~1,8 px, normalmente 18 px, mesma família Lucide/SVG já aprovada e sem mistura de ícones sólidos ou emojis decorativos. Utilizar texto nos botões de formulários e ícones isolados apenas em ações compactas.

| Ação | Ícone |
|---|---|
| Criar | plus |
| Editar | pencil |
| Ver | eye |
| Ocultar | eye-off |
| Duplicar | copy |
| Guardar | save |
| Confirmar | check |
| Eliminar | trash-2 |
| Arquivar | archive |
| Cancelar/Fechar | x |
| Entrar na App | smartphone |
| Rever/Alerta | triangle-alert |

Um botão só com ícone precisa de nome acessível específico e tooltip no desktop. Não acrescentar ícones a estados quando estes não ajudam a leitura.

## 7. Desktop, tablet, mobile e acessibilidade

Desktop (a partir de 831 px): tabela completa, filtros alinhados, botões compactos. Tablet: manter a mesma paleta e reorganizar filtros quando faltar espaço. Mobile (até 830 px): preservar os cartões responsivos aprovados, áreas de toque acessíveis e consistência nas ações. As listas pendentes devem abrir sem sobreposição inadequada e sem cortar conteúdo.

No Safari do iPhone, campos que recebem foco devem usar pelo menos 16 px de letra para evitar zoom automático. Manter foco de teclado visível, com outline de 2 px; esse contorno é funcional e não deve ser removido. Respeitar movimento reduzido; verificar contraste de texto e ícones. Não usar apenas cor para comunicar estado.

## 8. Exceções obrigatórias

Preservar cores nutricionais de refeições e macros; indicador VP verde-garrafa #28543E; dias MD e Off, folgas, dia selecionado, hoje e o tracejado de Geral por definir. Preservar estados e métricas clínicas (favoráveis/desfavoráveis), avisos, validação, indicação amarela de cópias antigas dos planos, dropzones, foco de teclado e seleção ativa. Não remover estes contornos com uma regra global.

## 9. Implementação e manutenção

- Fonte única: static/admin-surface-palette.css, com tokens de superfície, estado e ação.
- Classes reutilizáveis para novos componentes: tm-ui-state e data-state; tm-ui-action-icon; tm-ui-action-danger; tm-ui-action-ghost.
- Classes de ação existentes: tm-action-primary, tm-action-secondary, tm-action-new, tm-action-danger, tm-action-success.
- Entradas técnicas que carregam o tema comum: admin-microcycles.html, create-plan.html e food-library.html. São partes do mesmo Backoffice unificado, não páginas separadas na experiência do utilizador.
- A folha partilhada deve ser carregada por último. Atualizar a versão do CSS nos três HTML sempre que mudar, devido à cache dos browsers.
- Evitar valores HEX copiados em componentes; usar os tokens semânticos em novos módulos.
- Novos estados ou ações devem receber nome, ícone e significado acordados antes de entrarem na app.

## 10. Checklist para cada alteração

- [ ] Quatro níveis de superfície e cores do tema corretos.
- [ ] Sem sombras nem contornos meramente decorativos.
- [ ] Estado em pill; ação com 12 px; ícone compacto com 10 px.
- [ ] Terminologia fiel à função; Eliminar diferente de Remover e Desativar.
- [ ] Ícones outline consistentes, com etiquetas acessíveis.
- [ ] Navegação e foco de teclado corretos.
- [ ] Desktop, tablet, mobile, claro, escuro e Safari sem zoom verificados.
- [ ] Estados clínicos/nutricionais e alertas preservados.
- [ ] Nenhuma alteração acidental a dados, publicação, acesso ou cálculos.
- [ ] Asset versionado; testes e Render verificados.

**Direção definitiva:** o Backoffice The Mile deve parecer um único produto: discreto, funcional e legível, com fundos suaves, sem sombras, etiquetas claras e ações consistentes em todos os dispositivos.


## 11. Dashboard e Jogadores — regras de layout aprovadas em 12 novembro 2026

- O **Microciclo semanal do Dashboard** não tem altura máxima nem scroll vertical interno. Mostra todas as linhas e utiliza a rolagem vertical da página. Em ecrãs estreitos, os sete dias podem deslizar horizontalmente sem comprimir excessivamente as colunas; nunca criar uma segunda barra vertical.
- A **lista de Jogadores** usa cartões individuais (elementos article/listitem), um por jogador, sem linhas de tabela, contornos ou sombras. Fotografia, nome, utilizador, estado, data de renovação e ações continuam visíveis.
- **Filtros de Jogadores** formam uma secção própria colocada diretamente sobre o fundo geral: são um **card principal**, e a pesquisa de nome e o filtro de estado no interior usam **cor de subcard**. Não aplicar azul de terceiro nível neste contexto.
- O botão **Criar jogador** fica no topo à direita no desktop; no mobile integra o painel de filtros, sem duplicar o botão ou criar novos handlers.
- No **mobile**, cada jogador é apresentado em duas linhas: **identidade + botão Entrar na app** (canto superior direito); **renovação + estado de acesso** (segunda linha, estado à direita). O cartão inteiro abre o perfil, exceto o botão da app. O filtro de estado permanece utilizável em mobile.
- **Não apresentar o ícone de olho «Ver perfil»** na lista: o cartão inteiro abre o perfil, com hover discreto em desktop (preenchimento de subcard), cursor interativo e navegação por teclado. O botão de **Entrar na app** é a única ação de ícone e mantém a verificação de acesso e o comportamento independente.
- Aplicar estas regras nos temas claro/escuro e em tablet e mobile sem recorrer a tabelas artificialmente redimensionadas nem scroll vertical dentro de uma lista.

- **Densidade no desktop:** cartões de jogador com altura mínima de 94 px e padding vertical de 19 px; o mobile mantém o layout de duas linhas e a altura necessária ao conteúdo.

- **Interação mobile e desktop:** utilizar um botão real com área de toque sobre todo o cartão de Jogadores, reservando o botão do telemóvel como ação independente. Não depender apenas de eventos `click` no elemento `article`.
- **Pesquisa de Jogadores em modo claro:** resultados apresentados numa única lista pendente branca, sem cartões internos, divisores fortes ou sombras; realce discreto da linha no hover/foco. O modo escuro mantém o aspeto previamente aprovado.

- **Pesquisa de Jogadores em linha única:** placeholder «Pesquisar jogador...», sem subtítulo, seguindo a altura e cor dos filtros. Para evitar a duplicação do X no Safari, usar um campo `type="text"` com `inputmode="search"` e apenas o botão de limpeza personalizado. A lista pendente fecha ao tocar fora, ao voltar a tocar no campo, por Escape ou ao escolher um resultado; o CSS respeita `[hidden]`. O X é centrado sem animação.


## 12. Perfil de Jogador — hierarquia aprovada em 13 novembro 2026

- O perfil permanece dentro de **um único card principal**; as quatro secções **Dados pessoais**, **Permissões e definições da conta**, **Imagem App** e **Gerir acesso** são irmãs, com títulos alinhados ao mesmo nível, sem cartões grandes adicionais à volta das secções.
- **Dados pessoais:** manter os campos em subcards individuais, sem alterar o conteúdo ou a edição.
- **Permissões e definições da conta:** título com ícone de escudo, sem fundo próprio; cada uma das duas opções constitui um subcard individual. Inativas usam a superfície de subcard oficial; ativadas preservam a indicação verde e os respetivos estados.
- **Imagem App:** título com ícone outline de imagem, sem divisória decorativa; abaixo, um subcard apenas para pré-visualização da fotografia e respetivas ações. Não agrupar este módulo com Permissões.
- **Gerir acesso:** título com ícone de cadeado; preservar os botões existentes, cores semânticas, textos, ações e autorizações, sem fundo de secção adicional.
- Esta hierarquia é igual nos modos claro e escuro e adapta-se a desktop, tablet e mobile, respeitando espaçamento vertical equilibrado.
- **Microinteração de Jogadores em mobile:** ao tocar no cartão, apresentar brevemente preenchimento de subcard e escala subtil, preservando a abertura do perfil e a ação independente «Entrar na app». Respeitar `prefers-reduced-motion`.


## 13. Biblioteca Alimentar — estrutura aprovada em 13 novembro 2026

- Manter **Novo alimento** como ação principal fora do painel de filtros.
- **Pesquisa e Categoria** pertencem a um único **card principal de filtros**, separado dos resultados; cada controlo usa uma só superfície de subcard, com rótulo e campo integrados. Sem borda decorativa nem barra adicional dentro do campo.
- **Desktop (mesmo com janela estreita):** manter sempre a tabela legível, com largura mínima e deslocação horizontal dentro dos resultados quando necessário; nunca converter o desktop em cartões apenas por redução da janela. **Mobile / tablet pequeno tátil:** mostrar cartões nos ecrãs compactos com pointer coarse. O cabeçalho da tabela usa a mesma superfície de card principal, não subcard; divisórias entre alimentos quase impercetíveis.
- Na tabela, todos os nomes/categorias/notas devem poder quebrar linha sem sobreposição; números nutricionais permanecem alinhados e tabulares. A rolagem horizontal é o comportamento deliberado para desktop estreito.
- Nos cartões estreitos, nome, categoria, notas e quatro valores nutricionais ficam legíveis, sem contorno exterior ou divisórias decorativas. Os valores kcal/P/HC/G usam quatro subcards neutros alinhados.
- Os botões **Editar** e **Eliminar** posicionam-se no **canto superior direito do cartão**, independentes do texto e com alvos de toque confortáveis. «Eliminar» mantém a cor semântica de perigo.
- Não alterar endpoints nem comportamentos de pesquisa, paginação, edição, proteção da eliminação de alimentos em planos, nem os valores e associações nutricionais.
- Manter a mesma hierarquia e tokens de superfícies em modo claro e escuro, desktop, tablet e mobile.

## 14. Criação de jogador — modal aprovado em 13 novembro 2026

- A ação **+ Criar jogador** mantém a localização aprovada na lista, incluindo a integração com os filtros em mobile; abre um **modal nativo centrado**, não um formulário expansível sobre a lista.
- O modal tem a mesma linguagem do editor **Novo alimento**: card principal e campos de **duas linhas na mesma superfície de subcard** (etiqueta discreta em cima; valor/controlo em baixo). Nenhuma etiqueta fica fora do preenchimento; sem contornos decorativos ou sombras.
- Desktop: **Nome completo** ocupa a primeira linha; **Peso inicial / Sexo** e **Utilizador / Palavra-passe inicial** ocupam duas linhas de duas colunas. Mobile: uma única coluna, scroll interno somente se necessário, campos de 16 px para impedir zoom no Safari.
- Rodapé com **Cancelar** e **Criar jogador**, alinhados à direita. A navegação por teclado e o foco permanecem funcionais; Escape, Cancelar e clique fora pedem confirmação se existirem dados introduzidos.
- Preservar sem mudanças o endpoint de criação, as validações existentes, os campos obrigatórios, os limites de peso, utilizador e palavra-passe, as permissões e a atualização da lista. Erros surgem no próprio modal, sem depender de mensagens ocultas noutra aba.
- Respeitar ambos os temas, a preferência de movimento reduzido e os tokens oficiais do Backoffice.

## 15. Modal Novo/Editar alimento — dois níveis no mesmo campo (13 novembro 2026)

- **Todos os campos** do formulário, incluindo o seletor **Tipo de pesagem**, têm uma só superfície neutra de subcard (altura mínima 72 px), com **etiqueta na primeira linha e valor/controlo na segunda**.
- Não colocar as etiquetas fora do preenchimento nem inserir uma segunda barra dentro do subcard; inputs e select são transparentes e têm a mesma altura interna (30 px). No mobile, texto de entrada de 16 px para evitar zoom do Safari.
- Preservar as duas colunas de campos no desktop, a primeira linha Nome e a última Notas em largura completa; no mobile manter uma coluna, foco acessível no bloco e scroll do modal quando necessário.
- As opções do seletor, dados nutricionais, cálculos, validações e comportamento da criação/edição mantêm-se exatamente iguais. Alteração restrita ao modal da Biblioteca Alimentar do Backoffice.

## 16. Modais de criação — superfície e backdrop uniformizados em 13 novembro 2026

- **Novo jogador** e **Novo/Editar alimento** usam o mesmo card principal: claro `#FFFFFF`, escuro `#15161A`, sem bordas/contornos decorativos e sem sombras; raio de 18 px.
- O fundo atrás de ambos os modais usa o mesmo overlay preto `rgba(0,0,0,.76)`, para reduzir o ruído visual em desktop e mobile.
- Os títulos seguem o mesmo estilo de Inter Tight semibold; campos, dimensões específicas e comportamentos funcionais mantêm-se.
- As alterações são estritamente de apresentação dos dois modais. Contornos funcionais de foco dos campos continuam visíveis.

## 17. Tipografia das ações de criação — standard final (13 novembro 2026)

- Botões de criação com classe `tm-action-new` (por exemplo **+ Novo alimento**, **+ Criar jogador**, **+ Nova receita**, **+ Novo prato**, **+ Novo plano** e **+ Nova avaliação**) devem utilizar sempre **Inter Tight Medium (500), 13 px, line-height 1.3**, em modo claro e escuro, desktop, tablet e mobile.
- A mesma fonte e peso são aplicados independentemente do CSS específico de cada módulo; diferenças de perceção entre temas não se corrigem com pesos tipográficos diferentes.
- Não alterar por esta regra ícones, estado clínico, outros botões sem função de criação ou dimensões das superfícies. Preserve-se o estilo de cada ação e as suas funcionalidades.

## 18. Porções Visuais — filtros e carregamento progressivo (13 novembro 2026)

- Filtros **Categoria** e **Pesquisar** usam o mesmo **card principal** e as mesmas **superfícies de subcard** da Biblioteca Alimentar, com etiqueta na primeira linha e seleção/pesquisa transparente na segunda. Não existe barra adicional nem contorno interior.
- Categoria primeiro, pesquisa mais larga no desktop; quando a largura disponível do módulo deixa de ser suficiente (incluindo janelas desktop estreitas), os campos passam a uma coluna através de uma container query. Respeitar os modos claro e escuro.
- A listagem apresenta inicialmente **16 cartões**, com botão discreto **Ver mais (16)** (ou quantidade restante). A pesquisa e a seleção continuam a abranger todas as referências e repõem a apresentação inicial em 16 cartões.
- Os metadados leves são consultados uma vez, mas as **fotografias** só são requisitadas para os cartões criados e à medida que entram na zona visível (`loading="lazy"`). O botão Ver mais acrescenta cartões sem recriar os anteriores.
- Alterar Ativa/Inativa atualiza apenas o cartão correspondente, sem reconstruir a grelha ou voltar a solicitar todas as fotografias visíveis.
- Manter intactas as fotografias, pesos, categorias, dados nutricionais, associações, pré-visualizações dos planos, endpoints e permissões. Não publicar porções na app dos jogadores.

## 19. Lista de Planos — desktop e mobile (13 novembro 2026)

- A lista usa **Inter Tight** e mantém o padrão de ações de criação com **13 px e peso Medium 500** em modo claro e escuro.
- **Filtros:** eliminar a pesquisa da apresentação da lista; manter **Jogador** e **Tipo de plano** no mesmo card principal (branco no claro, grafite oficial no escuro), cada um num subcard de duas linhas. Os dois filtros partilham a mesma estética da Biblioteca Alimentar. A pesquisa técnica existente permanece desligada da interface sem modificar a listagem, os filtros ou os dados.
- **Criar novo:** um único botão e handler, colocado separadamente à direita, fora do card de filtros, tanto em desktop como em mobile.
- **Desktop:** manter tabela tradicional, cabeçalho com a mesma superfície do card principal e divisórias quase invisíveis (**2,4% claro / 3,2% escuro**). O hover das linhas deve ser **muito subtil** (**1,8% claro / 2% escuro**), nunca uma faixa cinzenta forte. Garantir precedência sobre o CSS antigo do tema claro. Em janelas desktop estreitas, manter tabela com deslocamento horizontal; não converter apenas por largura.
- **Mobile/touch:** cada plano ocupa um **card `<article>` verdadeiro**, separado da tabela desktop, sem bordas, sombras, títulos redundantes «PLANO» e «ESTADO» ou divisórias internas. A conversão visual de elementos `<tr>` em cartões através de CSS não é suficientemente estável no Safari iOS e não deve voltar a ser usada. Primeira linha: nome à esquerda e Ver/Editar à direita; segunda linha: classificação do plano e estado de publicação. Botões visíveis de 36 × 36 px, ícones outline de 16 px, com área de toque alargada. Desativar a seleção acidental de texto nos cartões sem impedir o foco dos botões. As duas vistas devem utilizar exatamente os mesmos dados, estados, cores e handlers.
- **Cores nutricionais imutáveis:** nunca redefinir fundos, contornos ou cores de texto de `.plan-type-tag[data-palette]`. Conservar distinções oficiais por tema para Amarelo, Laranja, Azul, Verde, Verde preparação (VP), Peri-treino e Peri-jogo; Verde preparação mantém verde mais escuro que Verde. Não modificar a função `previewPalette`, os ícones de categoria, os tokens nutritivos nem estados `data-state` (Publicado/Rascunho/Alterações por publicar/Em uso).
- **Cópias antigas:** manter o aviso visual especial, eventual botão Eliminar e o comportamento de confirmação existente.
- Não alterar editor, pré-visualização, planos, valores, publicação, dados, APIs nem a app dos jogadores. Efeitos hover só em desktop, feedback discreto em mobile; manter foco de teclado visível.

## 20. Regresso ao Início e navegação de Planos — 13 novembro 2026

- O comando global **‹ Início**, já existente em Jogadores, Planeamento, Avaliações e Formulários, fica igualmente visível **em desktop** na Biblioteca Alimentar (incluindo Porções Visuais) e em Planos. Deve reutilizar o mesmo botão, ícone SVG, posição, tipografia e callback do Dashboard; não criar uma segunda implementação nem introduzir botões de navegação adicionais dentro das bibliotecas.
- Em mobile, respeitar a navegação horizontal existente: o regresso global permanece oculto tal como nas outras secções.
- Na visualização, edição e eventual seleção de planos, as setas antigas isoladas `←` são substituídas pelo controlo **‹ Planos**, com SVG outline de 19 px e tipografia Inter Tight 600/13, geometria e superfícies idênticas ao comando global. Preservar os IDs e handlers, incluindo o aviso de alterações por guardar antes de abandonar o editor.
- Na lista de Planos, ampliar apenas a geometria e tipografia das pills **Plano** e **Estado** para **13 px, Medium (500), altura mínima 32 px**, mantendo todas as cores nutricionais e os estados oficiais nos dois temas. Não alterar outras pills do Backoffice.

## 21. Planos: visualização pela linha/cartão e regresso contextual (13 novembro 2026)

- **Lista desktop**: clicar em qualquer zona da linha abre o plano em modo de **visualização**; a linha é acessível via teclado (Enter/Espaço). Remover o botão separado com ícone de olho. A ação **Editar** continua independente, à direita, sem propagar para visualização. A ação especial **Eliminar cópia antiga**, quando aplicável, mantém-se independente.
- **Mobile/touch**: clicar/tocar no card principal individual abre a mesma visualização. Um único botão **Editar** no canto superior direito, com 36 × 36 px de superfície visível, ícone outline de 16 px e área de toque alargada; não colocar a ação abaixo das informações. Manter a classificação nutricional na **segunda linha, à esquerda** e o estado de publicação na **segunda linha, à direita**. Preservar a distinção entre as cores oficiais de todos os planos e temas.
- **Navegação desktop**: o botão global superior é contextual — **‹ Início** na lista e **‹ Planos** na visualização, edição ou pesquisa interna. Não mostrar outro botão de regresso por baixo. O regresso a partir de edição mantém a proteção para alterações por guardar e operações em curso.
- **Navegação mobile**: dado que a barra global superior está oculta na navegação móvel atual, manter o controlo interno **‹ Planos** na visualização/edição, sem o duplicar.
- As interações da lista utilizam os **mesmos dados, handlers e IDs** da criação, edição e visualização já existentes. Não alterar API, conteúdo dos planos, estado de publicação, valores nutricionais, paletas, filtros ou app dos jogadores.

## 22. Afinamento dos cartões mobile — Planos e Jogadores (13 novembro 2026)

- **Planos:** ao tocar no card, apresentar uma microinteração percetível mas elegante, igual à de Jogadores: realce da superfície em subcard e `scale(.992)` durante cerca de 140 ms. Usar `pointerdown` para resposta imediata no Safari e manter brevemente o estado depois de levantar o dedo. A abertura da visualização, o botão Editar e as cores das pills continuam inalterados. Respeitar `prefers-reduced-motion` e manter a cor de aviso das cópias antigas.
- **Jogadores:** o único botão de ação, **Entrar na app**, fica sempre no **canto superior direito** no mobile, alinhado com a identidade, tal como o Editar de Planos e os botões da Biblioteca Alimentar. Botão visível de **36 × 36 px**, ícone outline de **16 px**, com área de toque ampliada para cerca de **44 × 44 px**.
- **Jogadores, segunda linha:** data de renovação à esquerda e badge de estado (Ativo/Inativo/Sem conta) à direita. Não posicionar o botão por baixo do estado; não alterar cores, estados, permissões nem ações de acesso à app.
- Desktop, filtros, dados dos jogadores, perfis, conteúdos dos planos e app dos jogadores ficam fora do âmbito.

## 23. Visualização de Planos — uniformização desktop (13 novembro 2026)

- **Âmbito desta revisão: apenas desktop (largura a partir de 831 px)**. Preservar integralmente a visualização mobile aprovada, incluindo dimensão e disposição da informação nutricional, botão «Editar plano», refeições expansíveis e opções.
- **Botão de edição desktop:** substituir o texto isolado «Editar plano» pelo botão secundário neutro **ícone outline de lápis + «Editar»**, com Inter Tight Medium 500/13 px, canto de 12 px e sem contorno ou sombra. Manter o ID `preview-edit`, o handler de edição e o alinhamento à direita na mesma faixa da navegação superior «‹ Planos».
- **Resumo desktop:** dentro do card principal, apresentar **Jogador → Plano → Referência** à esquerda e depois uma fila equilibrada de **quatro macros**. A referência continua disponível (fundamental para cálculos): formato discreto `Referência: [peso] kg · [data por extenso]` sob o título, em vez de estar isolada no canto superior direito. Não alterar o cálculo dos rácios; alterações só na string de apresentação do resumo.
- Valores nutricionais desktop com **26 px**, etiquetas com **13 px** e rácios com **12 px**, todos alinhados e com espaço consistente entre colunas. Separação horizontal de baixíssima opacidade entre contexto e totais; manter as quatro cores nutricionais oficiais e os modos claro/escuro.
- A classificação («Amarelo», «Laranja», etc.) **não se repete como título** no segundo card no desktop, porque já integra «Plano [tipo]» no resumo. O segundo card começa diretamente pelas refeições com margens equilibradas.
- **Opções das refeições desktop:** manter os preenchimentos por paleta já aprovados e remover totalmente contornos e sombras decorativos das opções, em especial no tema claro. Manter foco visível e a expansão dos elementos `details/summary`.
- Não alterar os dados, alimentos, gramagens, associações, editor, endpoints nem a app dos jogadores. As alterações de conteúdo limitam-se ao HTML do botão e à formatação da referência no próprio resumo.



## 24. Planos — ajustes mobile aprovados em 13 novembro 2026

- **Lista mobile:** «Criar novo» fica na mesma linha da pesquisa de jogador, dentro do card de filtros. A pesquisa substitui o filtro redundante «Jogador» no mobile; fica apenas «Tipo de plano» na segunda linha. Ambos os níveis têm altura de 60 px e intervalo vertical uniforme de 12 px. A pesquisa filtra os planos por jogador (e continua a poder encontrar o tipo). O seletor de jogador e a ação de criação originais permanecem no desktop.
- **Pré-visualização mobile:** o botão «Editar» passa a exibir o lápis outline à esquerda e o texto curto «Editar», seguindo o botão desktop, sem mudar o handler.
- **Resumo nutricional do dia:** alinhar o primeiro valor (calorias totais) e o respetivo rácio à esquerda, pela mesma margem do nome do jogador e título do plano. Preservar as quatro colunas, os valores e as cores.
- **Título repetido:** ocultar «Amarelo»/classificação como título do segundo card também no mobile; a classificação já consta em «Plano amarelo» no resumo. Preservar refeições, opções, cores e espaço de respiro.
- Nenhuma alteração aos dados, cálculos, gramagens, estados, permissões, publicação, nem à branch main da app dos jogadores.


## 25. Edição de Planos — uniformização integral (13 novembro 2026)

- **Âmbito:** editor do Backoffice V2 nas combinações desktop/mobile × claro/escuro. Preservar dados, cálculo de calorias e macros, pesos de referência, gramagens, alternativas, ordem e reordenação, opções, ações de edição, estados de publicação, validações, confirmações e endpoints. Nunca alterar a app do jogador (branch main).
- **Navegação e criação:** único botão «+ Novo plano» no canto superior direito, na faixa contextual de «‹ Planos». ID e confirmação anterior preservados; não repetir no rodapé.
- **Resumo e seletores:** um único card principal, com seletores no subcard oficial. No desktop: seletores à esquerda, macros afastadas à direita; cada total usa apenas duas linhas: **valor + unidade** na mesma cor, depois **nome da macro · rácio em g/kg** num único nível neutro (para kcal, apenas o rácio). No mobile: seletores lado a lado, quatro totais na mesma linha com calorias à esquerda e os rácios por baixo. Preservar cores, unidades e rácios em todos os níveis, sem mudar a fórmula.
- **Metadados:** indicador de estado compacto e data de gravação na zona superior direita do card de resumo; referência «Ref. 56,1 kg · 13 nov 2026», usando dia/mês curto em português, sem ISO bruto. Data de gravação «Guardado em 05 nov, 15:42». O antigo painel verde do rodapé não existe; estados de erro, alterações por guardar e por publicar continuam explícitos na área superior. Não repetir «Publicado» noutras zonas.
- **Refeições:** card principal neutro, sem contorno/sombra. No mobile, o nome e a seta de expansão ficam separados das ações; em ecrãs pequenos, macros e ações usam linhas distintas para preservar legibilidade e área de toque. No desktop, manter totais alinhados pelos nutrientes dos alimentos. Preservar expansão, renomear, apagar e opções.
- **Opções alimentares:** subcard neutro nas opções inativas; opção ativa com preenchimento ligeiramente diferente, **sem barra lateral**. «Opção X» é etiqueta secundária (400, neutra); o **nome da opção** tem destaque. Nunca alterar as cores de kcal, proteína, hidratos e gordura ao selecionar uma opção; unidades kcal e g herdam a cor do valor correspondente em cartões, cabeçalhos e linhas.
- **Ações por alimento:** alternativa, lápis e lixo com **a mesma geometria 34×34 px e alinhamento**; alternativa e edição usam superfície neutra subtil, lixo utiliza a cor destrutiva oficial. Remoção de nota e de refeição também usa o lixo outline, sem alterar handlers nem apagar registos da biblioteca.
- **Adicionar alimento e nota:** campos e botões com a **mesma altura (48 px)** e linguagem visual. OK passa a «+ Adicionar nota», mantendo a validação de nota existente. No desktop cada campo e respetivo botão ficam na mesma linha, com largura consistente do botão; no mobile pesquisa + porção na primeira linha e botão de adição abaixo, seguido de campo de nota e botão de adição abaixo, ambos da mesma largura.
- **Adicionar opção e refeição:** mesmos preenchimentos e alturas. No mobile ficam lado a lado, com «Apagar opção» destrutivo numa segunda linha alinhado à direita. Sem botões brancos excessivos no tema escuro.
- **Rodapé:** apenas «Apagar plano» com ícone de lixo outline, «Guardar» e «Publicar». Guardar em preenchimento principal neutro; verde apenas na confirmação imediata de um guardar bem-sucedido (1100 ms), sem verde fixo depois. Publicar mantém o estado desativado quando já publicado e as validações/autorizações existentes.
- **Verificação:** confirmar visualmente desktop claro, desktop escuro, mobile claro e mobile escuro; Safari/touch/rato; estados guardado, alterações por guardar, alterações por publicar e erros; seleção/foco e remoção/adição; evitar qualquer interferência na visualização de Planos aprovada.


## 26. Edição de Planos — correção das regressões de alinhamento e estados (13 novembro 2026)

Esta secção substitui as indicações anteriores que colocavam estado e referência dentro do card nutricional, ou que criavam uma terceira linha de ícones nas refeições mobile.

- **Estado e metadados:** estado do plano, data de gravação e referência ficam em faixa contextual compacta, fora dos cards de resumo nutricional e de refeições. Não ocupar espaço dos valores diários. No mobile, distribuir em linhas discretas, sem painel verde nem grandes espaçamentos. Estados de erro, por guardar e por publicar mantêm-se explícitos. Referência na forma «Ref. 56,1 kg · 13 nov 2026» e gravação «Guardado em 05 nov, 15:42» (dia/mês curto/ano em português, sem formato ISO).
- **Desktop:** cabeçalho da refeição com três áreas estáveis: à esquerda o nome e respetivas ações; à direita as quatro macros; no limite direito, a seta de expandir. Não sobrepor macros ou ícone de expansão. O alinhamento programático da informação nutricional continua possível na lista de ingredientes, mas **não deve reposicionar o cabeçalho da refeição**, que usa layout próprio.
- **Mobile:** cabeçalho igual em aberto e fechado, sem salto horizontal. Primeira linha com nome à esquerda e grupo de ações à direita; segunda linha com macros à esquerda e seta de expansão à direita. Margens internas consistentes com o subcard do resumo nutricional.
- **Opções:** aumentar diferença de superfície para a selecionada sem barra lateral; hover exclusivamente neutro e subtil em claro e escuro, sem branco ou efeitos de brilho.
- **Adicionar alimento, nota, opção ou refeição:** base de ação da paleta oficial e hover subtil sem azul vivo, sem sombras ou efeitos de brilho. Mesma altura para os dois formulários e botões associados.
- **Apagar opção:** botão com fundo vermelho suave e ícone trash-2 outline no estado normal e hover; seguir a mesma semântica de «Apagar plano», «Apagar refeição» e «Remover alimento».
- **Guardar / Publicar:** Guardar neutro/principal quando acionável e secundário quando já guardado; só surge verde durante a confirmação imediata. Publicar verde semântico apenas quando acionável, secundário quando desativado (plano já publicado). Apagar plano sempre destrutivo com lixo. Manter validações, confirmações e permissões existentes.
- **Limites:** alterações de apresentação apenas em production/the-mile-admin, sem mexer no branch main, dados, gramagens, macros, cálculos ou navegação da app dos jogadores.


## 27. Edição de Planos — mobile estável (13 novembro 2026)

**Âmbito exclusivo: mobile até 830 px, modo claro e escuro; desktop aprovado fica intacto.**

- **Estado:** no mobile, quando já publicado, mostrar apenas uma pill «Publicado», fora do card nutricional. Ocultar data de gravação e referência nesse contexto (permanecem no desktop e nos cálculos). Se existirem alterações por guardar ou publicar, mostrar a respetiva pill de aviso sem parágrafo extenso; em caso de erro, conservar também a explicação do problema.
- **Card de resumo:** sem divisor entre os seletores e as macros, mantendo os quatro valores, cores e rácios.
- **Refeições, abertas e fechadas:** usar a mesma grelha fixa de duas linhas. Primeira linha: nome à esquerda e ações de eliminar/renomear numa zona reservada imediatamente a seguir, sem se sobrepor ao nome mesmo quando ele quebra de linha. Segunda linha: quatro macros. A seta fica isolada na extremidade direita e centrada verticalmente entre as duas linhas, com alvo de 44×44 px. Nome, valores e setas não saltam ao expandir. Manter margens internas compactas coerentes com o card de resumo.
- **Expansão acessível:** além da seta, tocar na área livre do cabeçalho ou no título abre/fecha a refeição no mobile. O toque nos botões de eliminar, renomear ou no menu não pode acionar a expansão. Continuar a permitir foco e acionamento do botão pela navegação de teclado.
- **Menu de renomear:** abrir ancorado à direita do lápis (menu estende-se para dentro do ecrã), com largura limitada à viewport e altura limitada com scroll interno. A abertura não altera o nome do plano nem assinala alterações por guardar: apenas a seleção efetiva de outro nome pode mudar os dados.
- **Adicionar nota:** a linha do campo e a do botão «+ Adicionar nota» ocupam a mesma largura disponível e mantêm 48 px de altura, contrariando a regra legada de 62 px na refeição expandida.
- **Compatibilidade:** remover/substituir a última camada de CSS mobile anterior antes de publicar nova correção; não empilhar variantes contraditórias. Manter alimentação, dados, cálculos, cores nutricionais e o branch main inalterados. Verificar visualmente em Safari/iPhone e em modo claro/escuro antes de fechar a validação.


## 28. Planos — correção de especificidade do cabeçalho mobile (13 novembro 2026)

- **Causa identificada:** regras do editor anteriores utilizavam `:is(.meal, .meal.tm-mobile-expanded)`, cuja especificidade CSS incluía a variante mais específica mesmo para refeições fechadas. As regras mobile posteriores com `.meal` simples perdiam a cascata; ao expandir, `.tm-mobile-expanded` mudava a prioridade e deslocava botões e seta.
- **Correção estrutural:** os cards da edição recebem a classe estável `tm-editor-meal` em ambos os estados. A última secção mobile de `admin-surface-palette.css` usa esse seletor para todas as refeições, com **uma única geometria**, sem regras alternativas por estado.
- **Cabeçalho mobile:** duas linhas fixas (nome + lixo/lápis imediatamente adjacentes; macros abaixo) e uma coluna lateral de 44 px com a seta centrada verticalmente nas duas linhas. O título pode reduzir largura e quebrar quando necessário sem colidir com as ações. A grelha, o padding e a posição dos ícones não dependem de aberto/fechado.
- **Menu de renomear:** ancorado à direita do lápis, a abrir para dentro do ecrã. A interação de expandir no título/área livre não interfere com os botões.
- **Âmbito:** CSS restrito a `max-width:830px`. Respeitar modos claro/escuro e conservar a apresentação desktop aprovada, os IDs/handlers, cálculos, gramagens, valores, estados nutricionais e app dos jogadores.
- **QA:** verificar visualmente em Safari iOS, com card fechado, aberto, menu do lápis aberto e alternância repetida; distinguir sempre QA de código, deploy Render e QA real no browser.


## 29. Edição de Planos — alinhamento responsivo das macros desktop (14 novembro 2026)

- **Problema:** o cabeçalho da refeição, o total da opção selecionada e as quatro colunas nutricionais dos alimentos tinham referências geométricas diferentes. O JavaScript só alinhava o total da opção, usando coordenadas absolutas. Ao reduzir a largura, surgiam sobreposições e deslocações.
- **Correção:** o editor passa a medir a grelha nutricional real da primeira linha de alimento visível e a aplicar a mesma origem e largura às quatro macros do cabeçalho da refeição e do resumo da opção. As quatro colunas mantêm valores/unidades e cores semânticas sem transformação.
- **Responsive:** se a largura medida for insuficiente para acomodar os nomes e as macros lado a lado, a refeição recebe a classe funcional CSS `tm-editor-nutrition-stacked` e o cabeçalho e o resumo da opção passam a duas linhas. Não usar valores absolutos nem forçar uma grelha horizontal que sobreponha texto em janelas estreitas. Ao voltar a alargar, recuperar o alinhamento horizontal automaticamente.
- **Rerender e resize:** sincronizar depois do render da refeição e ao redimensionar, recalculando a partir de `getBoundingClientRect` e removendo posições inline anteriores antes de aplicar o novo modo. Os cards fechados partilham a referência quando houver uma refeição aberta.
- **Mobile:** não modificar o layout aprovado até 830 px; preservar os quatro valores, a seta e as ações, sem sobrepor esta rotina de desktop ao CSS mobile.
- **Âmbito:** exclusivamente CSS e geometria de apresentação na branch `production/the-mile-admin`; não alterar dados, gramagens, cálculos nutricionais, tipo de plano, associações, estados ou a app dos jogadores (`main`).
- **QA:** verificar largura desktop normal, janela reduzida e retorno à largura inicial, incluindo opções com nomes longos e alimentos com notas extensas; confirmar código e deploy Render separadamente da validação visual no browser.


## 30. Edição de Planos — estabilidade da média nutricional em desktop (14 novembro 2026)

- **Regressão corrigida:** o alinhamento anterior posicionava a média da refeição (`.meal-header-macros`) e o total da opção com `position:absolute`, mesmo quando eram filhos de uma grelha CSS. Em janelas largas, o total da refeição podia deixar de aparecer; quando a janela estreitava, reaparecia no fallback de duas linhas.
- **Regra nova:** os totais da refeição e da opção permanecem sempre **dentro do fluxo das suas próprias grelhas**. O JavaScript mede as colunas nutricionais reais da primeira linha visível de alimento e atribui a mesma largura e origem às colunas 2 do cabeçalho e da opção através de `grid-template-columns`; nunca posiciona estes valores por coordenadas absolutas.
- **Larguras intermédias:** quando a largura disponível não permite separar devidamente nome/ações, quatro macros e seta, ativa-se `tm-editor-nutrition-stacked` para passar os totais para a segunda linha sem os esconder ou sobrepor. Voltar a aumentar a janela recupera a disposição normal através de uma nova medição; remover estilos inline anteriores antes de aplicar os novos.
- **Mobile:** até 830 px, a rotina limpa apenas os estilos inline de desktop e não modifica o desenho mobile aprovado.
- **Preservação:** não alterar valores, fórmulas, gramagens, opções, ações, estado de publicação, paleta nutricional, vista de leitura ou a branch `main`.
- **QA:** testar refeição aberta e fechada em janela larga, intermédia e estreita, com redução/ampliação repetidas. Confirmar sempre separadamente revisão de código, deploy e visualização efetiva no browser.


## 31. Planos — corrigir deslocação e deformação dos totais na edição desktop (14 novembro 2026)

- **Problema observado após a revisão 30:** os totais da refeição mudavam de linha mesmo em janelas largas e os totais da opção selecionada apareciam muito à esquerda, porque o critério de fallback avaliava mal o espaço e gerava grelhas de duas linhas cedo demais.
- **Correção:** no editor desktop, medir a primeira linha real de nutrientes dos alimentos e usar a sua largura e margem direita como referência comum ao cabeçalho da refeição e ao resumo da opção selecionada. Reproduzir esta posição com três colunas CSS calculadas (nome, quatro macros, margem lateral), mantendo os totais em fluxo normal, **sem qualquer posição absoluta**.
- **Responsividade:** eliminar o breakpoint fixo de empilhamento. Passar a duas linhas apenas quando faltar espaço real para o nome ou para a área da seta. O critério não deve mudar só porque a janela passou por uma largura arbitrária. Ao redimensionar em ambos os sentidos, limpar as medidas inline anteriores antes de reaplicar a grelha.
- **Precisão e proteção:** as quatro colunas internas usam o mesmo gap e alinhamento do rail dos alimentos. Nenhuma alteração a valores, fórmulas, refeições, opções, estados ou botões. No mobile (até 830 px), preserva-se a grelha aprovada sem alterações visuais.
- **QA:** verificar refeição expandida em largura desktop e reduzir/aumentar gradualmente a janela, comparando a primeira coluna (kcal) e as três macros da refeição, da opção e dos alimentos. Distinguir verificações de sintaxe/código, deploy Render e validação no browser.


## 32. Edição de Planos — total da opção e transição compacta (14 novembro 2026)

**Problemas observados:** a média da refeição já estava correta, mas o resumo da opção selecionada continuava muito deslocado para a esquerda em desktop; em janelas intermédias, o card principal comprimido sobrepunha valores e rótulos.

- **Causa da opção:** um estilo antigo reservava `padding-right:calc(var(--nutrition-rail) + var(--nutrition-actions))` no `.option-summary`. Esse espaço era descontado pelo cálculo de posicionamento do total, fazendo a grelha arrancar demasiado à esquerda. Apenas no editor desktop (mais de 830 px), repor um padding normal de 14 px em ambos os lados. A rotina de alinhamento continua a usar a posição real das quatro macros dos alimentos para alinhar cabeçalho da refeição e opção.
- **Breakpoint da edição:** a partir de 1240 px de largura de viewport, ao reduzir a janela, entrar numa apresentação **compacta do conteúdo da edição de Planos**, mantendo o comportamento mobile existente até 830 px. Entre 831 e 1240 px: colocar a dupla de filtros lado a lado em cima e os quatro totais nutricionais por baixo, em largura total; retirar divisória adicional; usar as duas linhas do cabeçalho das refeições tanto abertas como fechadas; renderizar as opções em duas colunas; mostrar nome da opção e as suas macros em linhas próprias.
- **Alimentos na faixa mais estreita (831–1100 px):** nome e três ações na primeira linha, quatro macros na segunda, para não comprimir as colunas. Conservar drag-handle e ações, sem alterar dados.
- **Navegação global:** **não** antecipar o breakpoint da sidebar e da barra de navegação em todas as páginas; o novo breakpoint de 1240 px afeta apenas o conteúdo do editor de Planos. A navegação mobile real continua a partir de 830 px.
- **Modos e segurança:** aplicar em claro e escuro, com as mesmas cores nutricionais, valores, gramagens, relações e handlers. Não alterar a vista de leitura ou `main`.
- **QA:** comparar valores da opção e dos alimentos em desktop largo com refeição aberta; reduzir gradualmente até 1240 px, testar opções e lista de alimentos em 1200, 1100, 900 e 830 px e confirmar a transição para o mobile. Validar código, Render e apresentação no browser como fases separadas.
