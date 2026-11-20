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

**Início → Semana:** sete colunas, datas e células compactas à imagem da vista semanal de Jogadores. A célula abre o detalhe existente sem card de refeição duplicado. A seleção e os gestos de deslizar continuam funcionais e independentes da vista Dia.

**Planos:** reutilizar card universal colorido para prescrições publicadas de cada refeição, preservando opções, alimentos, notas, kcal e macros publicados. Nenhuma ação de consumo do jogador.

**Menus e Receitas:** calendário/menu semanal, dia e classificações de microciclo, pratos atribuídos, categorias, texto livre, fotografias circulares e zoom, pesquisa de pratos aprovados; estilo de categoria de Menus distinto do card universal. A edição de um menu pelo Chef mantém o fluxo de aprovação/auditoria e o modo de pré-visualização administrativa não o permite. Nunca apresentar fotografia ou expandir receita se não houver ficheiro/prato correspondente.

**Perfil:** informação do Chef e do jogador associado, idioma PT/EN com preferência guardada, e terminar sessão. O perfil é intencionalmente mais simples que o do jogador; não inventar dados pessoais nem fotografias sem suporte.

**Navegação:** wordmark, barra inferior de quatro entradas e seletor Dia/Semana mantêm ícones, posições e comportamento aprovados na identidade da App. Não alterar a árvore de navegação ou os endpoints de sessão.

## 4. Critérios de regressão obrigatórios

Antes de integrar/publicar: testes Python do contrato Chef (isolamento do jogador, leitura de prescrições, alterações de menus, auditoria, execução, acesso read-only de administrador); migração PostgreSQL; sintaxe de `chef.js`; testes estáticos da estrutura visual; regressão da App de Jogadores; CI completo. Validar manualmente iPhone Safari/PWA e desktop em Dia, Semana, Planos, Menus/Receitas e Perfil, nos estados vazio/com dados, com Almoço/Jantar e fotografia, com execução e edição abertas, e em PT/EN. Sem validação manual, não declarar paridade visual concluída.

## 5. Limites do lote

Este lote altera apenas apresentação, pequenas classes de carregamento de imagens e testes/documentação. Funcionalidades existentes não são redesenhadas. Pendências funcionais (responsabilidade por alterações de menu, eventual confirmação pelo nutricionista, outras atribuições de profissionais) continuam em planeamento separado.
