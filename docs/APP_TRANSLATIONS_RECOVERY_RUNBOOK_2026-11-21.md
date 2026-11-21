# Procedimento de recuperação e validação antes da migração PT/EN

## Confirmado
A exportação lógica de 21/11/2026 às 15:56 está assinalada como concluída na página Recovery. O Render documenta uma janela PITR de 3 dias para o workspace Hobby. **Isto não prova que se conseguiu restaurar.** Na captura disponibilizada o botão Restore database estava cinzento; não inferir que o restauro está disponível.

Conforme a documentação oficial do Render (https://render.com/docs/postgresql-backups), o PITR cria uma NOVA base de dados para validação; não substitui imediatamente a original. Os exports .dir.tar.gz ficam disponíveis 7 dias após serem criados e podem ser descarregados e restaurados numa base vazia. A recuperação para uma nova instância pode gerar custos.

## O que é obrigatório antes de qualquer escrita em produção
1. Ter uma cópia lógica descarregada em armazenamento privado apropriado, ou recuperação PITR confirmada como operacional. Não enviar credenciais ou ficheiros com dados clínicos por chat ou GitHub.
2. Validar a integridade do export descarregado (e, idealmente, restaurá-lo numa base temporária vazia e isolada, com acesso restrito). **Não usar --clean sobre a base original.**
3. Confirmar explicitamente a capacidade de recuperação e o impacto operacional/custo da instância temporária antes de criar qualquer serviço Render.
4. Confrontar o diagnóstico de esquema de 21/11 com os requisitos do SQL de migração. Não supor que as contagens se mantiveram.
5. Planear o ponto de reversão: desligar MILE_BACKOFFICE_TRANSLATIONS_ENABLED se houver falha. Os dados novos permanecem nas tabelas para preservar o histórico; não fazer DROP por defeito.
6. Só depois aprovar a execução manual e transacional do SQL aditivo; manter as apps desligadas.

## O que já foi testado
- Em PostgreSQL 18 efémero, a migração adiciona duas tabelas, é idempotente e não modifica bibliotecas.
- A migração aborta se faltar uma tabela essencial ou uma tabela homónima for incompatível.
- O script tools/i18n_preflight_readonly.py garante sessão somente de leitura, confirma colunas relevantes, permissões de esquema e contagens agregadas, e não mostra nomes de jogadores nem prescrições.

## Limitacões de acesso
O conector Render não consegue aceder à base real devido à allowlist vazia. **Não modificar a allowlist.** Os instrumentos desta PR são entregues para execução apenas numa sessão interna autorizada, sem segredos em logs. Este documento não autoriza a migração real nem um restauro de produção.
