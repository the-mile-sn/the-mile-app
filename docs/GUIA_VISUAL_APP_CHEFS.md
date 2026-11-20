# THE MILE — Guia Visual da App de Chefs

**Base normativa:** `docs/GUIA_VISUAL_APP_JOGADORES.md`, versão 20/11/2026.  
**Âmbito:** `static/chef.html`, `static/chef.css` e `static/chef.js`, servidos exclusivamente pela App de Jogadores.  
**Estado:** consolidação de código preparada; validação visual em iPhone e desktop **pendente**. Não é o Guia Visual do Backoffice.

## 1. Princípios inalteráveis

A App de Chefs partilha **identidade visual** com a dos jogadores, não permissões nem funcionalidades. A autenticação, a associação do chef ao jogador, as consultas de dados publicados, a edição de menus, as propostas de pratos, os registos de execução, o modo de pré-visualização administrativa de leitura apenas e os idiomas PT/EN continuam regidos pelo código/API existente. Não inventar kcal ou gráficos de consumos para chefs. Não apagar menus planeados quando a execução não corresponde ao planeado. Nenhuma edição do Chef representa aprovação automática da equipa de nutrição.

## 2. Fundação comum

| Categoria | Medida/regra | Notas |
|---|---|---|
| Família | `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui` | Sem dependência de Google Fonts / Inter Tight |
| Base | 14 px / 400 | Corpo de refeição, alimentos e instruções |
| Título universal | 16 px / 400 | Refeições, Menus e Planos quando o papel é equivalente |
| Título interno | 15 px / 600 quando a função o justifica | Não forçar nos títulos das opções que tenham hierarquia própria |
| Texto secundário | 12–13 px / 400 | Notas, microciclo, etiquetas |
| Card universal fechado | 61 px mínimos; raio 13 px | Sem fotografia: pode ser compacto; não truncar conteúdo real |
| Card universal aberto | cabeçalho mínimo 55 px; raio 18 px | Altura de conteúdo variável, seta partilhada |
| Ícone do cabeçalho | caixa 37 × 37 px, glifo 24 × 24 px, raio 11 px | Reutilizar Hugeicons aprovados |
| Formulário com etiqueta flutuante | 64 px, raio 20 px; etiqueta 16→12 px em 180 ms | Login Chef; mesmo campo visual do Login Jogador |
| Superfícies neutras | `#242429`, `#29292E`; fundo `#0D0D10` | Cards, inputs, controlo de navegação |
| Cores de plano | Laranja `#54281B/#FFA078`, Amarelo `#493713/#FFD76F`, Azul `#193F60/#8DD0FF`, Verde `#174631/#77E3A4`, preparação `#10251A/#4E996B` | Nunca substituir cores funcionais por cinzento |
| Microinterações | mesmas famílias de segmentados, calendário e navegação inferiores | Respeitar `prefers-reduced-motion` |
| Imagens | skeleton circular `#29292E`, brilho subtil de 1,5 s somente enquanto carrega | Não introduzir latência; erro remove fotografia indisponível |

A App de Chefs tem fonte própria `chef.css` apenas para os componentes que lhe pertencem. Não duplicar todo o CSS de Jogadores nem acrescentar regras paralelas `!important` para corrigir conflitos. A regra canónica é atualizada na origem e as declarações anteriores substituídas são removidas.

## 3. Áreas da App e exceções funcionais

**Login:** manter os `name`, `id`, `autocomplete`, campos, botão e erros. Mesmo campo com etiqueta flutuante e botão branco arredondado, sem card exterior antigo.

**Início → Dia:** resumo de data/microciclo e refeições disponíveis, incluindo Pequeno-almoço, Lanche e Ceia. O chef não recebe gráficos de consumo. Refeições fechadas de referência 61 px, com título 16/400, glifo 24 px em caixa 37 px e seta de 9 px. **Almoço/Jantar são exceção de altura**: o prato e eventual fotografia têm de aparecer mesmo com o card fechado. Uma opção nutricional única surge diretamente dentro do card aberto; várias opções permanecem recolhidas. Guardar/editar registos de execução mantém ações próprias e estados existentes, sem alterar dados do jogador.

**Início → Semana:** sete colunas, datas e células de refeição com **76 px de altura mínima (64 px no mobile mais estreito)**, preservando a proporção já existente na App de Chefs e partilhando a linguagem de cores e tipografia com a vista semanal de Jogadores. A célula abre o detalhe existente sem card de refeição duplicado. A seleção e os gestos de deslizar continuam funcionais e independentes da vista Dia.

**Planos — paridade com Jogadores, correção 20/11 às 22h:** a implementação de Chef **não** utiliza uma coleção de novos cards neutros de 61 px com bolinhas coloridas. Reproduzir a hierarquia da App de Jogadores: filtros horizontais `Todos / Cores` (os dados Chef publicados disponíveis são apenas prescrições por cor; não apresentar categorias sem dados inventados de Treino, Jogo ou Suplementação); em `Todos` usar a **mesma família de card de categoria aprovada nos Jogadores** (`plans-all-group` e `plans-all-body`): altura mínima **86 px**, raio **18 px**, fundo `rgba(255,255,255,.055)`, título **16/500**, seta fina e sem fotografia nem círculo de cor. No interior, os cards de refeição mantêm a família universal colorida, opções e valores nutricionais publicados. Em `Cores`, usar os mesmos botões de subfiltro pill (35 px, 13/500) e cards coloridos. Energia média no cabeçalho de cada refeição; macros visíveis ao abrir; não repetir macros de opção única. **O calendário da antiga vista Chef Planos foi removido da marcação, JS e CSS**, não apenas ocultado. A consulta é sempre read-only, sem alterar API de planos, cores, refeições, kcal, ingredientes, autenticação nem associação do jogador. Não copiar os controlos de consumo do jogador. As opções múltiplas utilizam a mesma superfície da App de Jogadores: mistura `82%` da cor do plano e `18%` de branco, raio 18 px e padding 16 × 17 px, com as restantes cores-base oficiais do Guia de Jogadores.

**Menus e Receitas (navegação e editor corrigidos):** seletor `Menus / Receitas` com **38 px exteriores, botões de 32 px e fonte 13/500**; já existe uma lista dos sete dias, pelo que **não repetir o calendário de sete colunas** por cima. Usar apenas a faixa de **semana anterior ‹ / intervalo / semana seguinte ›**, com 40 px de área de toque nos controlos, preservando a carga da semana e os swipes sobre o controlo. Os sete cards mantêm data e classificação, pratos atribuídos, categorias, texto livre e fotografia circular com zoom, e a barra inferior mantém-se.

**Menus — estados e formulário (correção 20/11 às 22h):** manter os quatro tipos de menu já publicados na base de dados e no Backoffice. Na App Chef, **sem prato atribuído** é um card neutro `#303135`, com título 16/400 e texto secundário 12/400 «Menu por atribuir», como nos Jogadores; sem fotografia e sem inventar prescrição. Com prato, categoria histórica ou texto livre, manter a cor nutricional real, a foto apenas quando publicada e a altura dinâmica. Não alterar a cor de planos/menus existentes na base de dados. O editor de um menu novo mostra apenas **«Prato aprovado»** e **«Sugerir prato»**; a modalidade **Categoria** deixou de ser opção para novos registos Chef, mas os registos históricos de categoria continuam válidos e visíveis. A sugestão nunca altera diretamente o menu. O editor reutiliza a superfície tonal da exceção, a pesquisa interna e Cancelar/Guardar sem seletores do sistema. Esta decisão não substitui o modelo futuro de entrada/prato principal/sobremesa.

**Receitas:** consulta de pratos aprovados e pesquisa mantida. Nenhuma função de criação de pratos diretamente na biblioteca é introduzida por este lote. Nunca apresentar fotografia ou expandir receita se não houver ficheiro/prato correspondente.

**Perfil:** informação do Chef e do jogador associado, idioma PT/EN com preferência guardada, e terminar sessão. O perfil é intencionalmente mais simples que o do jogador; não inventar dados pessoais nem fotografias sem suporte.

**Navegação:** wordmark, barra inferior de quatro entradas e seletor Dia/Semana mantêm ícones, posições e comportamento aprovados na identidade da App. Não alterar a árvore de navegação ou os endpoints de sessão.

## 4. Evidência visual de referência — iPhone, 20/11/2026 (versão publicada, antes da PR #297)

**Esta secção documenta o estado observado nos cinco prints fornecidos, não certifica o resultado da refatoração.** Evitar reconstrução ou substituição indiscriminada de componentes que já trabalham corretamente.

- **Início → Dia, cards fechados:** a barra Dia/Semana surge sob o wordmark; um resumo único apresenta data, classificação MD-1 e quatro refeições disponíveis representadas por ícones e faixas coloridas. No exemplo, Pequeno-almoço é amarelo; Almoço, Jantar e Ceia são verdes. Não gerar ícones ou refeições para períodos sem programação.
- **Alturas intencionalmente diferentes:** Pequeno-almoço e Ceia são compactos. Almoço apresenta mesmo fechado a designação longa do prato e fotografia circular ampliável; Jantar apresenta texto livre («Estágio») sem fotografia. Não impor 61 px aos cards que contêm pratos, fotos ou texto livre real, nem truncar esse conteúdo.
- **Almoço aberto:** mantém fotografia e prato; abaixo aparecem os valores nutricionais publicados (kcal, proteína, hidratos, gordura), alimentos e quantidades, seguidos das ações «Editar» e «Confirmar». Não duplicar informações nutricionais no cabeçalho nem alterar o planeamento ou a origem dos valores.
- **Editor de alterações:** após «Editar» surge o formulário numa subsuperfície mais escura, com descrição do que foi servido, estados «Jogador comeu fora» / «Chef de folga», observações e ações «Cancelar» / «Guardar». Preservar a separação entre alteração de prato, motivo de não execução e observações; não remover os estados nem mudar os seus efeitos no registo.
- **Início → Semana:** sete colunas, datas, classificações e células coloridas por refeição; a coluna do dia selecionado recebe destaque subtil e o número do dia surge num círculo claro. Abrir uma célula apresenta um detalhe único com data/microciclo, título da refeição, botão fechar, prato/foto, prescrição e ações, sem segundo card exterior de refeição. O menu inferior mantém quatro opções.
- **Percurso de scroll no iPhone:** a barra inferior fixa utiliza transparência; validar que os últimos controlos e a base do editor são alcançáveis e não ficam cobertos. Capturas durante scroll mostram conteúdo sob a região superior do sistema: distinguir comportamento normal de scroll de uma eventual sobreposição indevida antes de alterar safe areas.

**Diferenças a validar visualmente após a publicação e as correções de 22h:** fontes de sistema em vez de Inter Tight, títulos de cards 16/400, dimensões de cabeçalho/ícones, versão compacta das células semanais, dimensões do título do detalhe, campos do Login e fotografia em carregamento. Os cinco prints são referência da versão anterior; não devem ser apresentados como aprovação do novo código. Exigir validação dos ecrãs de Planos, Menus/Receitas, Perfil e Login e de pelo menos um estado de erro antes de publicar.

## 5. Em estudo — componentes da refeição (ainda não autorizados)

A futura organização de cada refeição em **sopa ou entrada / prato principal / sobremesa** deverá ser discutida com a equipa antes de qualquer alteração. Determinar se cada componente é opcional ou obrigatório, se admite escolha por biblioteca, texto livre e categoria, e como se refletem responsabilidades, aprovações, disponibilidade por dia, histórico, visualização do jogador e comportamento do Backoffice. **Não adicionar campos, payloads, migrações ou categorias de refeição neste lote.** Os três modos já existentes (Prato aprovado, Categoria, Sugerir prato) referem-se a formas alternativas de definir o menu atual, não a estes três componentes futuros.

## 6. Critérios de regressão obrigatórios

Antes de integrar/publicar: testes Python do contrato Chef (isolamento do jogador, leitura de prescrições, alterações de menus, auditoria, execução, acesso read-only de administrador); migração PostgreSQL; sintaxe de `chef.js`; testes estáticos da estrutura visual; regressão da App de Jogadores; CI completo. Validar manualmente iPhone Safari/PWA e desktop em Dia, Semana, Planos, Menus/Receitas e Perfil, nos estados vazio/com dados, com Almoço/Jantar e fotografia, com execução e edição abertas, e em PT/EN. Sem validação manual, não declarar paridade visual concluída.

## 7. Limites do lote

Este lote altera apenas apresentação, pequenas classes de carregamento de imagens e testes/documentação. Funcionalidades existentes não são redesenhadas. Pendências funcionais (responsabilidade por alterações de menu, eventual confirmação pelo nutricionista, outras atribuições de profissionais) continuam em planeamento separado.
