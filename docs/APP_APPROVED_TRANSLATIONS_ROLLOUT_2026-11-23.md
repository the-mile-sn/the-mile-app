# Internacionalização PT-PT / EN-GB — integração protegida (23/11/2026)

## Regra absoluta: preservar toda a app, exceto o novo seletor autorizado
**Nunca redesenhar nenhum componente aprovado.** Cores, fontes, tamanhos,
paddings, margens, alinhamentos, animações, swipes, scroll, ícones e gestos
mantêm-se. Apenas os textos visíveis e a lógica do idioma mudam. **Única
exceção aprovada:** acrescentar no Perfil dos jogadores um card de Idioma
igual ao da app dos chefs, imediatamente abaixo de Notificações.
O card é a única adição ao HTML e ao CSS; os ficheiros anteriores devem
continuar literalmente iguais em todos os restantes pontos.

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
  navegação, Perfil e filtros de Planos.
- Seletor de idioma **PT / EN** autorizado no Perfil dos jogadores, seguindo
  a localização, geometria, cores e tipografia do card já aprovado na app
  dos chefs. Apenas aparece quando ambas as flags e o acesso à tabela
  de traduções aprovadas estiverem disponíveis.
- Ao escolher o idioma, a preferência é gravada no próprio utilizador,
  através do endpoint privado com CSRF, e o carregamento existente atualiza
  textos e conteúdos sem criar uma segunda lógica de renderização.
- O Chef conserva o seletor já existente e a sua preferência; depois de
  alterar o idioma recarrega os Planos.

## Condições obrigatórias antes do merge e da ativação
1. Confirmada pela responsável a **mesma base de dados** no Render para
   os dois serviços. Antes de ativar, confirmar por leitura interna protegida
   que o serviço público vê a tabela de traduções aprovadas. Nunca replicar
   dados clínicos nem exportar snapshots por rotas públicas.
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
- Substituição textual nos componentes existentes, sem alterar as suas
  classes, estilos ou estrutura.
- Exceção: um único card no Perfil dos jogadores. Os testes comparam
  o HTML e o CSS com o estado anterior, permitindo apenas a inserção
  do card e os estilos estritamente isolados deste componente.

Esta PR é base técnica, **não uma ativação de inglês em produção**.

## Progresso adicional da internacionalização nativa
- As etiquetas da interface existentes nas áreas de consumo, Mensagens/estados de Menus
  e o formulário pós-jogo foram associadas ao idioma da sessão. Não foram
  adicionados controlos nem alterados códigos de respostas, limites ou escalas.
- A UI de Receitas reutiliza a função bilingue de texto que já existia
  no ramo de trabalho; os testes antigos foram atualizados para preservar
  explicitamente os títulos PT e EN, as dimensões e as interações.
- A deteção do cartão de jogo usada para posicionar o questionário também
  reconhece o texto localizado sem alterar a posição do cartão.
- O teste de interface dos sliders continua a exigir o mesmo CSS e os
  mesmos valores de 1 a 10. O teste de UI de Receitas continua a exigir
  os mesmos ícones, cards, separadores, fotografia e navegação.
- Nenhum componente visual existente pode ser modificado. O novo seletor
  do Perfil é a única exceção aprovada e tem testes de isolamento.

## Validação do armazenamento e lançamento
A leitura externa de `the-mile-db` via Render está bloqueada pela própria
política de acesso da base de produção; **não alterar essa política apenas
para executar testes**. Os registos do serviço público confirmam que a app
consegue ler a tabela de Planos publicados (63 prescrições / 13 jogadores
nos arranques inspecionados em 21/11), mas isso **não comprova** o acesso
à tabela `v2_content_translations`. A confirmação deve ser feita por
uma verificação read-only dentro do serviço autenticado, sem conteúdo
individual e com acesso restrito, antes de ativar o idioma EN.

## Ainda não concluído
A internacionalização completa das opções do editor de consumos,
pesquisa em inglês de alimentos, mensagens menos frequentes e
verificação visual de todos os estados PT/EN continuam pendentes.
**Não publicar nem ativar esta PR até concluir e testar estes pontos.**

## Diagnóstico interno seguro da fonte de traduções
- Foi preparado o endpoint `GET /api/v2/admin/translation-readiness` no
  serviço público, exclusivamente para uma sessão `admin` e com a flag
  `MILE_APP_TRANSLATION_DIAGNOSTIC=1`. Por defeito responde 404.
- A leitura utiliza a mesma ligação de base de dados da app, devolvendo
  apenas disponibilidade da tabela e contagens de traduções aprovadas por
  tipo. Nunca revela nomes, conteúdo de planos, traduções, dados clínicos
  nem URL de ligação à base de dados.
- **Ainda não foi executado na produção**: a PR continua sem merge e
  esta flag permanece desligada. Após testes finais, permite confirmar
  a ligação sem alterar a política de IP do PostgreSQL.
- Após confirmação, a flag de diagnóstico deverá voltar a `0`.
