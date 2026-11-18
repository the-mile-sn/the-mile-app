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
## Clientes — visual e filtros aprovados em 18/11/2026

- A lista usa um filtro «Tipo de conta» na mesma linha de Pesquisar cliente e Estado. A vista «Todos» apresenta Acompanhamentos e Chefs na mesma listagem de cards (sem separadores permanentes).
- Cada card identifica o seu tipo com uma pill de categoria do Guia Visual: 26 px, Inter Tight Regular 400 / 11 px, fundo à cor do texto 7% e contorno 12%.
- No mobile continuam os cartões individuais de duas linhas de Acompanhamentos; o filtro ocupa uma segunda linha sem reduzir as dimensões de pesquisa nem provocar zoom iOS.
- Novo cliente mantém os três caminhos de criação; modal e campos usam os mesmos tokens de superfícies e de tipografia dos restantes formulários, em ambos os temas.
- Consultas continua uma categoria identificável, sem credenciais ou contas próprias até estarem definidas as respetivas regras.
- A tipificação visual não altera roles, endpoints, permissões, dados já existentes ou a responsabilidade de Planeamento → Menus.

## Perfil Chef e visualização administrativa — 18/11/2026

- Os cards Chef têm o mesmo comportamento navegável dos acompanhamentos: clicar no card abre **Clientes → Perfil Chef**; no desktop usam o hover neutro do Guia Visual, no mobile o feedback tátil `scale(.992)` (~140 ms).
- Na listagem, a única ação independente é o **ícone de telemóvel** (a mesma geometria dos jogadores), para abrir a app Chef em modo de visualização administrativa temporária e **apenas de leitura**. Não existem ações rápidas de bloquear ou alterar palavra-passe no card.
- O perfil Chef apresenta nome, utilizador, jogador associado, idioma, estado da conta, controlo de bloqueio/ativação e alteração da palavra-passe, preservando os endpoints e o comportamento de revogação de sessões.
- A visualização administrativa reutiliza bilhetes de acesso de 60 segundos e sessões de 1 hora, com proteção de escrita no **servidor**; a app esconde botões de alteração de menus/execuções/preferências nessa sessão.
- O bloco de arquivo da área de Clientes tem o título **«Arquivados»**. Esta mudança é só de apresentação; as operações atuais de arquivo continuam restritas aos acompanhamentos, até existir suporte explícito para outros tipos.
