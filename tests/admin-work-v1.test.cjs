const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const app=fs.readFileSync("app.py","utf8");
const agenda=fs.readFileSync("static/admin-appointments.html","utf8");
const agendaJs=fs.readFileSync("static/admin-appointments.js","utf8");
const dashboard=fs.readFileSync("static/admin-microcycles.html","utf8");
const dashboardJs=fs.readFileSync("static/admin-dashboard.js","utf8");
const work=fs.readFileSync("static/admin-work.js","utf8");
const css=fs.readFileSync("static/admin-work.css","utf8");
const db=fs.readFileSync("admin_work_v2.py","utf8");

test("private work API stays admin-only and independent of customer bookings",()=>{
 assert.match(app,/import admin_work_v2/);
 assert.match(app,/admin_work_v2\.initialize\(c\)/);
 assert.match(app,/path\.startswith\('\/api\/v2\/admin\/work\/'\)/);
 assert.match(app,/admin_work_v2\.create_event/);
 assert.match(app,/admin_work_v2\.create_task/);
 assert.match(app,/admin_work_v2\.update_task/);
 assert.match(app,/admin_work_v2\.delete_event/);
 assert.match(app,/admin\(user\)/);
 assert.match(app,/'\/admin-work\.js': 'admin-work\.js'/);
 assert.match(app,/'\/admin-work\.css': 'admin-work\.css'/);
});

test("Agendamentos contains timed events but no task tab, list, or dialog",()=>{
 assert.match(agenda,/id="tm-work-agenda-list"/);
 assert.match(agenda,/id="tm-work-event-dialog"/);
 assert.doesNotMatch(agenda,/tm-appointments-tab-tarefas|tm-appointments-panel-tarefas/);
 assert.doesNotMatch(agenda,/tm-work-task-dialog|tm-work-task-list|tm-work-task-form/);
 assert.doesNotMatch(agendaJs,/"tarefas"/);
 assert.match(agenda,/admin-appointments\.js\?v=8/);
 assert.match(agenda,/admin-work\.js\?v=5/);
});

test("tasks are managed exclusively in Dashboard and opened in native dialogs",()=>{
 assert.match(dashboard,/id="tm-db-tasks-list"/);
 assert.match(dashboard,/id="tm-db-tasks-open"/);
 assert.match(dashboard,/id="tm-work-tasks-dialog"/);
 assert.match(dashboard,/id="tm-work-task-dialog"/);
 assert.match(dashboard,/id="tm-work-task-list"/);
 assert.match(dashboard,/id="tm-work-task-form"/);
 assert.match(dashboard,/id="tm-work-task-delete"/);
 assert.match(dashboard,/data-tm-task-filter="all"/);
 assert.match(dashboard,/id="tm-work-task-responsible"/);
 assert.match(work,/function openTasksManager\(\)/);
 assert.match(work,/\$\("tm-work-task-dialog"\)\.showModal\(\)/);
 assert.match(work,/\$\("tm-work-task-form"\)\.addEventListener\("submit"/);
 assert.match(work,/refreshDashboardTasks/);
});

test("quick-create task opens local popup without navigation or mandatory times",()=>{
 assert.match(dashboard,/id="tm-db-tasks-add"/);
 assert.match(work,/\$\("tm-db-tasks-add"\)\.addEventListener\("click",\(\)=>openTask\(\)\)/);
 assert.doesNotMatch(dashboard,/data-work-quick="task"/);
 assert.doesNotMatch(work,/new:"task"|admin-appointments#tarefas/);
 assert.match(dashboard,/id="tm-work-task-date"/);
 assert.doesNotMatch(dashboard,/tm-work-task-start|tm-work-task-end/);
 assert.match(db,/due_date TEXT/);
 assert.match(work,/api\("\/tasks\?status=all"\)/);
 assert.match(work,/Sem prazo/);
 assert.match(css,/\.tm-db-task-edit/);
 assert.match(css,/\.tm-work-tasks-dialog/);
 assert.match(dashboard,/admin-work\.js\?v=5/);
 assert.match(dashboard,/admin-work\.css\?v=4/);
});

test("new internal events remain without appointment confirmation pills",()=>{
 assert.match(dashboard,/data-work-quick="event"/);
 assert.match(dashboardJs,/api\/v2\/admin\/work\/events/);
 assert.match(dashboardJs,/merge\(bookings,activity,internalEvents\)/);
 assert.match(dashboardJs,/const isBooking=item\.type==="appointment"\|\|item\.type==="assessment"/);
 assert.match(dashboardJs,/if\(isBooking&&item\.label\)/);
 assert.match(css,/tm-work-task-state/);
 assert.match(css,/color-mix\(in srgb,var\(--tm-work-state\) 7%,transparent\)/);
});
