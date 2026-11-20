# The Mile — Agenda, eventos internos e tarefas (Backoffice)

**Fase inicial: 20/11/2026. Apenas no ramo production/the-mile-admin.**

## Três registos diferentes

**Marcações:** consultas e avaliações de clientes mantêm o fluxo existente de Agendamentos, serviços, profissionais, disponibilidades e estados de confirmação. A criação rápida abre o formulário já existente.

**Eventos internos:** reuniões, formações, deslocações e outros compromissos da equipa. Campos: título, tipo, data, hora de início e fim, responsável, participantes opcionais e notas. Aparecem na Agenda e no painel Hoje, sem pill de confirmação. Não criam reservas, pagamentos, bloqueios Google nem registos nutricionais.

**Tarefas:** título, responsável, prazo opcional, notas e estado Por fazer/Concluída. Não ocupam horário de agenda. Têm separador próprio e um resumo no Dashboard para tarefas com prazo hoje ou vencido.

Os eventos de jogadores e os eventos nutricionais de Planeamento continuam separados destes registos administrativos.

## Navegação e criação

No Dashboard, o atalho redondo Adicionar (+) apresenta Nova marcação, Novo evento e Nova tarefa. O segundo atalho continua a abrir a Agenda. Os links transportam a data escolhida em Hoje. Um card próprio de Tarefas mostra até três pendências do dia/vencidas e permite concluí-las.

Na página Agendamentos, os separadores são Agenda, Tarefas, Reservas, Disponibilidades e Configuração. A Agenda mantém mês/semana/dia e as marcações originais; os eventos internos aparecem nas datas respetivas e numa secção diária com edição e eliminação. Tarefas têm filtros Por fazer/Todas/Concluídas, edição, conclusão, reabertura e eliminação.

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
