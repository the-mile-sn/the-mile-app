# The Mile — preparação segura da base de traduções

Estado: documentação e SQL preparados num ramo isolado. **Nada foi executado no Render.**

## Evidência e bloqueio
A base Render the-mile-db (PostgreSQL 18) está disponível, mas a allowlist de IPs é vazia e o conector remoto não consegue abrir uma ligação. **Não alterar essa proteção.** Contagens e esquema da produção continuam por confirmar.

O código atual define users(id TEXT), v2_food_library e v2_dish_library. Isso não prova que a produção está exatamente igual.

## Ficheiros de revisão
- sql/i18n/01_readonly_schema_audit.sql: consultas que só devolvem esquema e contagens agregadas; não expõem dados pessoais, notas clínicas nem prescrições.
- sql/i18n/02_translation_backoffice_additive_review.sql: migração **só para duas tabelas novas e índices de traduções**. Não modifica dados originais.
- Testes PostgreSQL com esquema descartável garantem idempotência, compatibilidade e bloqueio de tabelas com forma inesperada.

## Condições para aplicação futura (NÃO aplicar nesta etapa)
1. Executar o diagnóstico read-only dentro de uma sessão autorizada, no ambiente Render; nunca abrir a BD à Internet por conveniência.
2. Confirmar esquema efetivo, ausência de conflitos, totais reais e eventual inglês legado nos pratos.
3. Validar cópia de segurança e recuperação, permissões e janela de aplicação.
4. Ensaiar a migração numa base de teste. Corrigir qualquer incompatibilidade antes de tocar na produção.
5. Após aprovação, aplicar explicitamente a transação. O SQL usa tempos limite de lock e execução e aborta em esquemas inesperados.
6. Validar os objetos e testar o backoffice sem ligar as apps. As flags permanecem desligadas até aprovação.
7. Para desativar, voltar a desligar a flag do backoffice. Não eliminar automaticamente as tabelas: terão histórico de aprovação.

A preferência do jogador está fora desta migração: a prioridade é a central do backoffice. Nenhuma configuração, credencial, permissão ou dado de produção foi alterado.
