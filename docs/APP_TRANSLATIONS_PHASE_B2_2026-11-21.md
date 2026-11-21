# App PT/EN - fase B2: operacoes seguras e preferencias por conta

Data: 2026-11-21

## Estado

Esta entrega continua exclusivamente no ramo `feature/app-translation-foundation-20261121`, sem merge, deploy, modificacao a `app.py`, alteracao de APIs existentes nem migracoes contra bases de dados reais. O percurso legado de importacao PDF de planos continua fora de ambito.

## Operacoes propostas, ainda NAO montadas como rotas HTTP

`app_translation_admin_v2.py` apresenta a seguinte interface interna:

- `inspect(c, session_user, entity_kind, entity_id, field_path)`: le o texto original da biblioteca e a proposta associada para revisao.
- `propose(c, session_user, body)`: grava uma proposta pendente. O pedido tem: `entity_kind`, `entity_id`, `field_path`, `language=en`, `expected_source_hash`, `translated_text`.
- `approve(c, session_user, body)`: aprova somente se o original e a proposta nao tiverem mudado. O pedido tem: `entity_kind`, `entity_id`, `field_path`, `language=en`, `expected_source_hash`, `expected_candidate_hash`.
- `audit(c, session_user, ...)`: historico de propostas e aprovacoes.

O `session_user` e obrigatoriamente o ator obtido de uma sessao ja autenticada no servidor. O codigo verifica no proprio banco de dados que o administrador permanece ativo. As tabelas e campos traduziveis sao uma lista fechada: `food.display_name`, `food.notes`, `dish.name_pt`. O cliente nao escolhe SQL, nao envia o texto portugues original, nem define o autor.

**Antes de montar estas operacoes em APIs reais**, `app.py` devera impor ainda todas as suas protecoes atuais: cookie/sessao autenticados, permissao de administrador, controlo `SITE_ROLE`, metodo HTTP, protecao CSRF nas escritas, tratamento de erros e limites de pedido. Nao criar routes publicas sem estas verificacoes. As operacoes chamam `translations.initialize` apenas em testes; a migracao de producao requer um passo explicito e validado.

## Idioma persistente

`app_language_preferences_v2.py` cria, quando invocado explicitamente, somente uma tabela de preferencias para utilizadores com role `player`: `v2_player_language_preferences`. Nao modifica a tabela `users` nem as suas contas.

Para `chef`, reutiliza a mesma `v2_chef_links.language` que a app atual ja utiliza. As operacoes de leitura e escrita rejeitam contas inativas, chef arquivado, identidade errada e roles indevidos. **O endpoint atual `/api/v2/chef/preferences` nao foi modificado.**

A API dos jogadores e o seu seletor de idioma ainda nao estao ligados. Permanecem integralmente em portugues ate ativacao explicita e testada.

## Preservacao dos dados

A proposta de traducao nunca escreve nos alimentos, pratos, menus ou planos publicados. A apresentacao PT/EN continua isolada do `option_ref`, gramagens, calculo nutricional e snapshots. O texto portugues e sempre fallback quando nao ha traducao aprovada e atual.

## Testes

Os testes SQLite criam registos inteiramente ficticios, verificam permissoes, bloqueio de fonte antiga, rejeicao de proposta que mudou, preferencias por utilizador, compatibilidade da preferencia dos chefs e inalterabilidade dos dados. O teste PostgreSQL utiliza uma instancia LOCAL de CI e recusa qualquer outro hostname ou nome de base de dados; cria e apaga apenas o seu proprio schema descartavel. Nenhum teste liga ao Render.

## Proxima etapa

1. Validar a execucao automatica de ambos os motores e rever a protecao de erros HTTP.
2. Validar a estrutura do PostgreSQL real apenas atraves de acesso autorizado, antes de migracoes.
3. Montar as novas rotas com feature flag desligada por defeito num ambiente de teste, sem mudar `/api/v2/chef/preferences`.
4. Ligar a apresentacao autorizada apenas depois de o plano e as opcoes originais estarem resolvidos.
5. Rever visualmente o seletor PT/EN da app e o fluxo de aprovacao do Backoffice antes de ativar.
