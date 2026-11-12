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
- No **mobile**, cada jogador é apresentado em duas linhas: identidade + estado; renovação + ação de entrar na app. O cartão inteiro abre o perfil, exceto os botões internos. O filtro de estado permanece utilizável em mobile.
- **Não apresentar o ícone de olho «Ver perfil»** na lista: o cartão inteiro abre o perfil, com hover discreto em desktop (preenchimento de subcard), cursor interativo e navegação por teclado. O botão de **Entrar na app** é a única ação de ícone e mantém a verificação de acesso e o comportamento independente.
- Aplicar estas regras nos temas claro/escuro e em tablet e mobile sem recorrer a tabelas artificialmente redimensionadas nem scroll vertical dentro de uma lista.

- **Densidade no desktop:** cartões de jogador com altura mínima de 94 px e padding vertical de 19 px; o mobile mantém o layout de duas linhas e a altura necessária ao conteúdo.

- **Interação mobile e desktop:** utilizar um botão real com área de toque sobre todo o cartão de Jogadores, reservando o botão do telemóvel como ação independente. Não depender apenas de eventos `click` no elemento `article`.
- **Pesquisa de Jogadores em modo claro:** resultados apresentados numa única lista pendente branca, sem cartões internos, divisores fortes ou sombras; realce discreto da linha no hover/foco. O modo escuro mantém o aspeto previamente aprovado.

- **Pesquisa de Jogadores em duas linhas:** título «Pesquisar» em cima e o nome/placeholder «Pesquisar jogador...» em baixo, com a mesma altura e hierarquia do seletor Estado. A lista pendente fecha ao tocar fora, ao voltar a tocar no campo, por Escape ou ao escolher um resultado; o CSS deve respeitar `[hidden]` mesmo com regras `display:flex!important`. O X de limpeza fica centrado por `top:0;bottom:0;margin:auto`, sem transformações ou animações.
