# Contas Chef — auditoria técnica inicial (18-11-2026)

Estado: **análise de código concluída para a primeira fronteira arquitetural; implementação funcional ainda pendente**.

Base verificada: `production/the-mile-admin` no commit `ce93de50993e1dd2938e5939c13f8630a6d57562`.

## Reutilização confirmada

- `app.py::initialize`: tabela `users` com sessão e CSRF; PostgreSQL e SQLite usam `CHECK(role IN ('admin','player'))`. Introdução de novo papel requer migração segura, testada separadamente para os dois motores, **sem recriar a tabela nem perder dados**.
- `microcycles_v2.initialize`: `v2_athletes` guarda perfis desportivos; `v2_player_links` liga exclusivamente a conta do jogador ao perfil. Chef não deve entrar em `v2_player_links`; criar relação própria de um único atleta por chef.
- `/api/login`: consulta apenas `admin` por email ou `player` por username e restringe por `SITE_ROLE`. Ajustar para aceitar Chef apenas no domínio da app e sem tocar na autenticação administrativa.
- `/api/me`: jogadores têm dados próprios; criar resposta Chef mínima que não exponha dados clínicos.
- `/api/v2/player/*`: endpoints verificam explicitamente `user.role == 'player'` e associação em `v2_player_links`. **Não** remover nem alargar estas guardas. Criar API Chef dedicada com autorização no servidor por associação.
- `microcycles_v2`: `v2_weekly_menus`, `list_menus`, `save_menu` e `v2_menu_history` existentes. Reutilizar planeamento, acrescentar auditoria de autor e registo de execução independente (planeado vs servido).
- `static/jogador-v2.js`: vistas de dia, semana, menus e planos existentes; preservar; app Chef terá navegação própria.
- `static/app.js`: PT/EN parcial; `static/jogador-v2.js` contém textos PT fixos; internacionalização integral precisa de fase própria.
- Render `the-mile-admin`: branch `production/the-mile-admin`, deploy automático desligado; última publicação confirmada live no commit acima.

## Modelo incremental proposto

1. Migração compatível para admitir papel `chef` em `users`; auditar em staging antes de produção; `role` nunca alterado em jogadores existentes.
2. Tabela nova `v2_chef_links` (`user_id` chave primária e FK `users`, `athlete_id` FK `v2_athletes`, `linked_at`, `created_by`), permitindo um atleta por Chef e vários chefs por atleta no futuro, se autorizado.
3. Preferência `pt`/`en` associada à conta; senha com hash existente, username único e estado ativo.
4. API dedicada `/api/v2/chef/*`, cada operação resolvendo `athlete_id` **a partir da sessão**, nunca a partir de um parâmetro arbitrário da aplicação. Apenas endpoints de leitura necessários inicialmente.
5. Gestão das contas Chef por administrador, sem conceder `admin` ao chef.
6. Registo de alterações de menus com `actor_id`, versão anterior/seguinte e validação; execução das refeições em tabela separada, sem apagar o menu planeado.
7. Interface Chef na app: Início, Plano alimentar, Menus, Perfil. Entrada por tipo de conta.
8. Acompanhamento no backoffice em Planeamento → Menus e Receitas → Chefs.

## Verificações obrigatórias antes da publicação

- Não há acesso Chef a endpoints `/api/v2/athletes/*`, `/api/players/*`, ou `/api/v2/player/*` existentes.
- Chef A não consegue ler ou escrever dados de atleta B através de IDs manipulados.
- Criar/desativar Chef não modifica `users` existentes nem `v2_player_links`.
- Menu alterado por Chef preserva versão anterior, autoria, hora e estado de validação.
- «Jogador comeu fora» e «Chef de folga» preservam o planeamento.
- Nenhum registo «servido» é confundido com consumo confirmado.
- Testes de login, sessão, CSRF, jogadores e menus passam em PostgreSQL e SQLite.
- Testes visuais desktop/mobile e deploy manual somente após validação dos fluxos.

**Nota:** este documento e a branch de preparação não ativam novas contas nem alteram produção. Próximo passo: implementar e testar a migração de papel, separação de permissões e criação de conta Chef, antes de expor novos fluxos.
