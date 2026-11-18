# Clientes — arquitetura de contas (The Mile)

Decisão consolidada em 18/11/2026: o menu Jogadores passa a chamar-se **Clientes**, e toda a criação/gestão de contas fica centralizada nessa área.

## Tipos
- **Acompanhamentos**: mantém os perfis existentes de jogador e a app, com os campos e validações atuais.
- **Consultas**: o espaço está reservado na interface, mas a criação de um acesso próprio depende das regras de Agendamentos; não inventar contas ou sessões.
- **Chefs**: criar, bloquear e gerir contas Chef associadas a um jogador em Clientes → Chefs.

## Responsabilidades
- Clientes: identidade, tipos de conta, associações, perfis e acessos.
- Planeamento → Menus: menus previstos, edições feitas por chefs, auditoria e validações. A execução mantém-se distinta do planeado.
- Os tipos de serviço não são necessariamente papéis de autenticação. Não criar um novo role para consultas sem definir o fluxo clínico e o acesso.
- Chefs não têm acesso de administrador nem podem alterar prescrições nutricionais.
- Preservar os utilizadores e jogadores existentes; os IDs técnicos e a base de dados não são renomeados nesta revisão.
- No futuro, suportar nutricionistas atribuídos a clientes, com experiências e responsabilidades próprias, sem ativar perfis ainda não especificados.

## Próximos requisitos
- Definir relação entre clientes e marcações, incluindo identidade única quando o mesmo cliente faz consulta e acompanhamento.
- Definir os tipos de credencial e acesso à app para consultas.
- Associar nutricionistas com autorização explícita e auditoria.

A experiência Chef continua no mesmo serviço da app do jogador; os dados e menus não são duplicados.