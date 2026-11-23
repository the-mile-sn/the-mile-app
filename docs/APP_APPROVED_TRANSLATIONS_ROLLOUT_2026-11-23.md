# Internacionalização PT-PT / EN-GB — integração protegida (23/11/2026)

## Regra absoluta: zero alterações visuais
**Nunca redesenhar nenhum componente aprovado.** Cor, fonte, peso, tamanho,
paddings, margens, alinhamentos, grelhas, animações, swipes, scroll, ícones,
comportamentos de toque, HTML estrutural e CSS mantêm-se. Apenas as cadeias
textuais e a lógica de leitura da língua mudam. **Não criar um novo seletor
visual** sem um acordo específico sobre o componente já aprovado.

## Estado
Trabalho preparado na PR #364, **sem publicação nem ativação**.
O backoffice tem 4.149 campos de tradução aprovados; os serviços Render
`the-mile-admin` e `the-mile-app` usam ramos de código distintos. Não
existem atualmente ferramentas com leitura das variáveis secretas de ambiente
que confirmem a ligação efetiva do serviço público à tabela de traduções.
A ausência desta confirmação impede a ativação em produção.

## Infraestrutura de leitura pronta (flag MILE_APP_TRANSLATIONS_ENABLED=1)
- Apenas PT/EN; falha de acesso à tabela de traduções, campo não aprovado ou
  hash desatualizado devolve português original.
- Os campos dos Planos são vinculados à publicação exata, por SHA256 do
  `draft_id + NUL + snapshot_json`. Em nova publicação, traduções antigas
  não são reutilizadas silenciosamente.
- Os identificadores de opções alimentares para escolhas e consumos são
  preservados a partir do conteúdo original antes da tradução. Quantidades
  nutricionais, horários, códigos de momento, receitas estruturadas, menus
  e snapshots permanecem intocados.
- Fontes de texto: Planos, alimentos canónicos, nomes de pratos usados em
  Menus (nunca menus em texto livre), receitas autorizadas e ingredientes/
  secções/passos/notas aprovados, categorias e nomes/doses/instruções de
  suplementos apenas quando idênticos à fonte aprovada na biblioteca.
- Todos os endpoints continuam autenticados e limitados ao jogador atribuído
  ou chef associado. Não existem endpoints públicos novos de traduções.

## Preferência do jogador (flag MILE_PLAYER_LANGUAGE_SELECTION_ENABLED=1)
- Tabela `v2_player_language_preferences`, por utilizador autenticado,
  com `language=pt|en` e predefinição `pt`.
- API privada `GET/PUT /api/v2/player/preferences`, com controlo de função
  e CSRF. Não aceita ID de jogador no pedido.
- A língua efetiva em `/api/v2/player/me` e nos Planos só pode ser EN quando
  **ambas** as flags estão ativas e a tabela aprovada está acessível.
- A interface do jogador traduz os **mesmos nós existentes**, começando por
  navegação, Perfil e filtros de Planos; não acrescenta botões ou cartões.
- Ainda não há seletor visual aprovado para o jogador. A preferência fica
  pronta no backend; a ativação dependerá de decisão separada que respeite
  o design existente.
- O Chef conserva o seletor já existente e a sua preferência; depois de
  alterar o idioma recarrega os Planos.

## Condições obrigatórias antes do merge e da ativação
1. Confirmar **mesma fonte autorizada** para as traduções aprovadas nos
   serviços administrativo e público. Nunca replicar dados clínicos ou
   exportar snapshots por rotas públicas.
2. Completar o inventário e a tradução dos textos nativos restantes (vista
   Dia/Semana, formulários, estados, menus, consumos, receitas e suplementos),
   mantendo rigorosamente a composição aprovada de todas as vistas.
3. Testar em contas privadas PT e EN, no desktop e mobile, largura dos textos,
   acessibilidade, seleção de opções, consumos, cálculo nutricional, menus
   livres vs pratos, prescrições de suplementos e republicação.
4. Confirmar regressão visual a partir de capturas de referência. Se um texto
   mais longo não couber, rever a tradução em vez de alterar o layout.
5. Lançar gradualmente só depois de confirmação; rollback imediato através
   das flags `MILE_APP_TRANSLATIONS_ENABLED=0` e
   `MILE_PLAYER_LANGUAGE_SELECTION_ENABLED=0`.

## Garantias verificadas por testes de unidade
- PT permanece intacto quando as flags estão desligadas.
- Conteúdo traduzido somente se aprovado e hash coincidente.
- IDs de opções, escolhas, consumos, receitas, suplementação, quantidades e
  nutrientes não são modificados.
- Preferências isoladas por sessão, CSRF e permissão.
- Substituição textual nos elementos já existentes sem inserir/remover
  componentes nem alterar classes e estilos.
- **Nenhum .html ou .css está incluído nesta PR.**

Esta PR é base técnica, **não uma ativação de inglês em produção**.
