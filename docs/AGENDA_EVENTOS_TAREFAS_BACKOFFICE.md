# The Mile — Agenda, eventos internos e tarefas (Backoffice)

**Fase inicial: 20/11/2026. Apenas no ramo production/the-mile-admin.**

## Três registos diferentes

**Marcações:** consultas e avaliações de clientes mantêm o fluxo existente de Agendamentos, serviços, profissionais, disponibilidades e estados de confirmação. A criação rápida abre o formulário já existente.

**Eventos internos:** reuniões, formações, deslocações e outros compromissos da equipa. Campos: título, tipo, data, hora de início e fim, responsável, participantes opcionais e notas. Aparecem na Agenda e no painel Hoje, sem pill de confirmação. Não criam reservas, pagamentos, bloqueios Google nem registos nutricionais.

**Tarefas:** título, responsável, prazo opcional, notas e estado Por fazer/Concluída. Não ocupam horário de agenda. São geridas exclusivamente no Dashboard: card de tarefas e pop-ups para criar, editar, concluir, reabrir e consultar todas, incluindo as que não têm prazo.

Os eventos de jogadores e os eventos nutricionais de Planeamento continuam separados destes registos administrativos.

## Navegação e criação

No Dashboard, o atalho redondo + da área «Hoje» permite criar **apenas marcações e eventos internos com horário**. O card «Tarefas» tem um + independente que abre diretamente «Nova tarefa» com título, responsável, data de prazo opcional (sem horas), estado e notas. «Ver todas» no mesmo cabeçalho abre um diálogo compacto com título, filtros horizontais **Todas / Por fazer / Concluídas** e lista; não há texto introdutório nem segundo botão de criação no diálogo. O resumo contém até três linhas, com prioridade às pendentes e até uma concluída mais recente dentro das **24 horas após a conclusão**. Depois das 24h, a concluída sai do resumo, mas nunca do histórico e pode sempre ser reaberta. O filtro inicial do pop-up é Todas.
A checklist apresenta caixa vazia para tarefa por fazer e visto verde para concluída. A conclusão é reversível e não apaga dados. A interface de criação continua com os campos de duas linhas do modelo «Novo alimento» e com a paleta de botões aprovada.

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

## Confirmação de presença (26/11/2026)

«Confirmada» significa apenas que o cliente confirmou a presença ou que a equipa a assinalou em Agendamentos («Marcar como confirmada» / «Anular confirmação»). O pagamento na Shopify **não** confirma a presença: uma marcação paga entra como «Agendada». Ao mudar o dia ou a hora (reagendamento interno ou de marcação paga), a confirmação é anulada e volta a «Agendada». Cores: Confirmada verde (`--tm-state-success-fg`), Agendada âmbar (`--tm-state-pending-fg`). Registo aditivo em `appt_booking_attendance` (origem, marcação, método admin/cliente, autor, data); endpoint `POST /api/v2/admin/appointments/bookings/{id}/confirmation` com `{"source":"manual"|"shopify","confirmed":true|false}`, só administradores e com CSRF. A confirmação pelo próprio cliente (método `client`) fica preparada para uma fase futura.
