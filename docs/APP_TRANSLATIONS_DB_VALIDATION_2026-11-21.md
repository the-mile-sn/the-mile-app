# The Mile — preparação segura da base de traduções

Estado: a migração SQL aditiva **já foi aplicada na base de dados real** pela equipa no Shell interno. Os ficheiros da central continuam no ramo isolado, sem deploy.

## Evidência e bloqueio
A base Render the-mile-db (PostgreSQL 18) está disponível, mas a allowlist de IPs é vazia e o conector remoto não consegue abrir uma ligação. **Não alterar essa proteção.** **Em 21/11/2026 foi executada com sucesso uma auditoria de leitura no Shell interno do serviço `the-mile-admin`**, sem modificar a allowlist. O acesso externo pelo conector continua indisponível.

A auditoria interna confirmou a existência destas tabelas: `users`, `v2_food_library`, `v2_dish_library`, `v2_recipe_library`, `v2_recipe_categories`, `v2_supplement_library` e `v2_food_plan_editor_publications`. Os campos relevantes são compatíveis com o contrato em código: `users.id` e campos das bibliotecas de alimentos e pratos, incluindo `v2_dish_library.name_pt` e `name_en`.

À data da primeira auditoria, as três tabelas ainda não existiam. **Após a migração de 21/11, as duas tabelas de tradução passaram a existir**, de acordo com o resultado confirmado do Shell. A tabela de idioma do jogador permanece por criar.

### Contagens reais da auditoria interna
- 700 alimentos ativos.
- 277 pratos ativos.
- 276 pratos com `name_en` preenchido (99,6%); 1 prato ativo sem nome inglês preenchido.
- Estes 276 textos existentes são **candidatos a revisão**, não aprovações automáticas.
- A quantidade de notas de alimentos com texto, a cobertura de receitas, categorias, suplementos e notas dos planos não foi contada nesta execução.

A auditoria foi comunicada por captura do Shell interno do Render; os resultados são agregados e não incluem dados pessoais de clientes.

## Migração na base real — confirmada por captura do Shell (21/11/2026, ~18h07)
A equipa executou, no Shell interno de `the-mile-admin`, a versão fixa `fc2bf6b2.../sql/i18n/02_translation_backoffice_additive_review.sql`, com verificação SHA Git blob `6bb22bf587760c9c068651478beb8094df55c0a8`. A captura apresenta: «Base de dados confirmada», «MIGRACAO CONCLUIDA», «Traducoes: 0», «Historico: 0».

**Estado agora:** as duas tabelas `v2_content_translations` e `v2_content_translation_history` foram criadas na base `the_mile_db` segundo o resultado do comando. Nenhuma tradução foi ainda inserida. A tabela de preferência de jogador continua fora do âmbito.

**Limitação:** a confirmação provém da saída do comando apresentada pela equipa, não de uma nova consulta independente à base. Não há deploy da central, ativação de flags ou merge. O backup foi descarregado mas o restauro não foi testado.

## Ficheiros de revisão
- sql/i18n/01_readonly_schema_audit.sql: consultas que só devolvem esquema e contagens agregadas; não expõem dados pessoais, notas clínicas nem prescrições.
- sql/i18n/02_translation_backoffice_additive_review.sql: migração **só para duas tabelas novas e índices de traduções**. Não modifica dados originais.
- Testes PostgreSQL com esquema descartável garantem idempotência, compatibilidade e bloqueio de tabelas com forma inesperada.

## Verificações de segurança e passos seguintes (migração já aplicada)
1. **Concluído:** diagnóstico read-only executado numa sessão interna autorizada ao serviço, sem abrir a BD à Internet.
2. **Concluído para o conjunto mínimo:** existência das tabelas essenciais e colunas relevantes e contagens agregadas de Alimentos/Pratos. **Ainda por verificar:** índices, constraints e compatibilidade completa do esquema antes da aplicação.
3. **Parcialmente verificado:** export lógico concluído em 21/11/2026 às 15h56, com indicação verde no ecrã Recovery do Render. A interface anuncia Point-in-Time Recovery de 3 dias, mas o botão de restauro aparece desativado na captura; a capacidade efetiva de restauro **não foi testada**. Antes de migrar, confirmar arquivo acessível e procedimento seguro de recuperação, permissões e janela de aplicação.
4. **Concluído:** migração aditiva ensaiada em PostgreSQL 18 descartável com testes de idempotência, rollback e compatibilidade.
5. **Concluído pela equipa:** aplicação da transação SQL no Shell e contagens imediatamente após a execução: 0 traduções e 0 eventos de histórico.
6. Validar os objetos e testar o backoffice sem ligar as apps. As flags permanecem desligadas até aprovação.
7. Para desativar, voltar a desligar a flag do backoffice. Não eliminar automaticamente as tabelas: terão histórico de aprovação.

A preferência do jogador está fora desta migração: a prioridade é a central do backoffice. Houve apenas a migração SQL controlada das duas tabelas no banco real, confirmada pela equipa. Não houve deploy, merge, ativação de flags nem alteração de configurações, credenciais ou permissões.

## Confirmação funcional das traduções existentes (21/11/2026)
A equipa confirmou que os nomes ingleses pré-existentes estão **apenas na biblioteca de Pratos**. Alimentos, Receitas, Categorias, Suplementos e Planos não dispõem atualmente de um processo de traduções equivalente. Os 276 valores de `v2_dish_library.name_en` preenchidos deverão entrar como candidatos a revisão, sem pressupor correção clínica ou linguística, sem duplicar pratos e sem se tornarem aprovações automáticas.

## Segurança do backup
O export assinalado como concluído não constitui, por si só, um teste de restauro; não devemos executar um restauro destrutivo sobre a base de produção. A migração aditiva das duas tabelas já foi executada. A aplicação da central e os seus acessos continuam desativados até à validação de integração.
