# The Mile — Agenda, eventos internos e tarefas (Backoffice)

**Fase inicial: 20/11/2026. Apenas no ramo production/the-mile-admin.**

## Três registos diferentes

**Marcações:** consultas e avaliações de clientes mantêm o fluxo existente de Agendamentos, serviços, profissionais, disponibilidades e estados de confirmação. A criação rápida abre o formulário já existente.

**Eventos internos:** reuniões, formações, deslocações e outros compromissos da equipa. Campos: título, tipo, data, hora de início e fim, responsável, participantes opcionais e notas. Aparecem na Agenda e no painel Hoje, sem pill de confirmação. Não criam reservas, pagamentos, bloqueios Google nem registos nutricionais.

**Tarefas:** título, responsável, prazo opcional, notas e estado Por fazer/Concluída. Não ocupam horário de agenda. São geridas exclusivamente no Dashboard: card de tarefas e pop-ups para criar, editar, concluir, reabrir e consultar todas, incluindo as que não têm prazo.

Os eventos de jogadores e os eventos nutricionais de Planeamento continuam separados destes registos administrativos.

## Navegação e criação

No Dashboard, o atalho redondo Adicionar (+) apresenta Nova marcação, Novo evento e Nova tarefa. A opção Nova tarefa abre imediatamente um pop-up no próprio Dashboard, com título, responsável, prazo opcional (apenas data), estado e notas. O card Tarefas apresenta até três pendências, incluindo as sem prazo, com conclusão e edição. «Ver todas» abre outro pop-up com os filtros Por fazer/Todas/Concluídas, reabertura e eliminação. Tarefas não têm horário de início/fim nem ocupam vagas da Agenda.

Na página Agendamentos, os separadores mantêm-se Agenda, Reservas, Disponibilidades e Configuração. A Agenda mantém mês/semana/dia e as marcações originais; os eventos internos aparecem nas datas respetivas e numa lista diária com edição e eliminação. Não há separador Tarefas em Agendamentos.

## Segurança e persistência

As novas tabelas tm_internal_events e tm_admin_tasks são aditivas e idempotentes. Os endpoints /api/v2/admin/work/admins, /events e /tasks exigem sessão de administrador. Alterações exigem token CSRF e continuam abrangidas pelo bloqueio de origem existente.

Cada alteração verifica uma versão numérica, recusando edições desatualizadas (stale_record). Guardam-se autor de criação, autor da última alteração e timestamps, mas não existe ainda histórico completo de cada edição.

Só podem ser responsáveis contas de administrador ativas. Nesta fase, os administradores autorizados podem consultar e gerir os registos da equipa. Não há ainda regras de visibilidade granular por nutricionista.

**Limitação funcional consciente:** os eventos internos não bloqueiam automaticamente a disponibilidade de consultas e não sincronizam o Google Calendar. Não criam encomendas nem notificações. Estes comportamentos exigem uma fase própria de validação e consentimento.

## Padrões visuais

Os dois temas e os dois tamanhos de ecrã usam os tokens, a fonte Inter Tight e as superfícies do Guia Visual. Confirmações em pills pertencem exclusivamente às marcações. As tarefas têm estado Por fazer/Concluída com pill universal 26 px, 11 px Regular 400, fundo 7%, contorno 12%. Os eventos não recebem estados administrativos artificiais.

## Evolução prevista, ainda não implementada

1. Bloqueio opcional de disponibilidade por evento interno, com validação e prevenção de sobreposições.
2. Permissões de atribuição por nutricionista, visibilidade por equipa e histórico de edições.
3. Lembretes de reuniões, alertas de prazo, preferências de notificações e tarefas recorrentes.
4. Participantes estruturados, convites e sincronização bidirecional do calendário.

## Testes

O módulo test_admin_work_v2.py valida CRUD, versões, responsáveis, segurança, CSRF e isolamento das reservas. Os testes de Dashboard e tests/admin-work-v1.test.cjs verificam navegação e estados. A workflow validate-admin-work.yml testa Python e JavaScript no GitHub Actions.
