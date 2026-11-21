# The Mile — preparação segura da base de traduções

Estado: documentação e SQL preparados num ramo isolado. **Nada foi executado no Render.**

## Evidência e bloqueio
A base Render the-mile-db (PostgreSQL 18) está disponível, mas a allowlist de IPs é vazia e o conector remoto não consegue abrir uma ligação. **Não alterar essa proteção.** **Em 21/11/2026 foi executada com sucesso uma auditoria de leitura no Shell interno do serviço `the-mile-admin`**, sem modificar a allowlist. O acesso externo pelo conector continua indisponível.

A auditoria interna confirmou a existência destas tabelas: `users`, `v2_food_library`, `v2_dish_library`, `v2_recipe_library`, `v2_recipe_categories`, `v2_supplement_library` e `v2_food_plan_editor_publications`. Os campos relevantes são compatíveis com o contrato em código: `users.id` e campos das bibliotecas de alimentos e pratos, incluindo `v2_dish_library.name_pt` e `name_en`.

**Ainda não existem** `v2_content_translations`, `v2_content_translation_history` e `v2_player_language_preferences`. Isto corresponde ao estado esperado, porque nenhuma migração foi aplicada.

### Contagens reais da auditoria interna
- 700 alimentos ativos.
- 277 pratos ativos.
- 276 pratos com `name_en` preenchido (99,6%); 1 prato ativo sem nome inglês preenchido.
- Estes 276 textos existentes são **candidatos a revisão**, não aprovações automáticas.
- A quantidade de notas de alimentos com texto, a cobertura de receitas, categorias, suplementos e notas dos planos não foi contada nesta execução.

A auditoria foi comunicada por captura do Shell interno do Render; os resultados são agregados e não incluem dados pessoais de clientes.

## Ficheiros de revisão
- sql/i18n/01_readonly_schema_audit.sql: consultas que só devolvem esquema e contagens agregadas; não expõem dados pessoais, notas clínicas nem prescrições.
- sql/i18n/02_translation_backoffice_additive_review.sql: migração **só para duas tabelas novas e índices de traduções**. Não modifica dados originais.
- Testes PostgreSQL com esquema descartável garantem idempotência, compatibilidade e bloqueio de tabelas com forma inesperada.

## Condições para aplicação futura (NÃO aplicar nesta etapa)
1. **Concluído:** diagnóstico read-only executado numa sessão interna autorizada ao serviço, sem abrir a BD à Internet.
2. **Concluído para o conjunto mínimo:** existência das tabelas essenciais e colunas relevantes e contagens agregadas de Alimentos/Pratos. **Ainda por verificar:** índices, constraints e compatibilidade completa do esquema antes da aplicação.
3. Validar cópia de segurança e recuperação, permissões e janela de aplicação.
4. Ensaiar a migração numa base de teste. Corrigir qualquer incompatibilidade antes de tocar na produção.
5. Após aprovação, aplicar explicitamente a transação. O SQL usa tempos limite de lock e execução e aborta em esquemas inesperados.
6. Validar os objetos e testar o backoffice sem ligar as apps. As flags permanecem desligadas até aprovação.
7. Para desativar, voltar a desligar a flag do backoffice. Não eliminar automaticamente as tabelas: terão histórico de aprovação.

A preferência do jogador está fora desta migração: a prioridade é a central do backoffice. Não houve escrita, migração, deploy nem alteração de configurações, credenciais ou permissões de produção.
