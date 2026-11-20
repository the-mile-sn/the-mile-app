const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const app=fs.readFileSync("app.py","utf8");
const html=fs.readFileSync("static/admin-appointments.html","utf8");
const dashboard=fs.readFileSync("static/admin-microcycles.html","utf8");
const dashboardJs=fs.readFileSync("static/admin-dashboard.js","utf8");
const frontend=fs.readFileSync("static/admin-work.js","utf8");
const css=fs.readFileSync("static/admin-work.css","utf8");

test("admin-only event/task backend is separate from appointments and player events",()=>{
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

test("appointments use one agenda, separate task list and native edit dialogs",()=>{
 assert.match(html,/id="tm-appointments-tab-tarefas"/);
 assert.match(html,/id="tm-appointments-panel-tarefas"/);
 assert.match(html,/id="tm-work-agenda-list"/);
 assert.match(html,/id="tm-work-task-list"/);
 assert.match(html,/id="tm-work-event-dialog"/);
 assert.match(html,/id="tm-work-task-dialog"/);
 assert.match(html,/id="tm-work-event-responsible"/);
 assert.match(html,/id="tm-work-task-responsible"/);
 assert.match(html,/admin-work\.js\?v=1/);
 assert.match(html,/admin-work\.css\?v=1/);
 assert.match(frontend,/tm:appointments-range/);
 assert.match(frontend,/status==="done"\?"Reabrir":"Concluir"/);
 assert.match(frontend,/data-tm-work-close/);
 assert.match(frontend,/stale_record/);
});

test("dashboard quick add supports booking event task and keeps booking action",()=>{
 assert.match(dashboard,/id="tm-db-miniagenda-new"[^>]+aria-expanded="false"/);
 assert.match(dashboard,/data-work-quick="booking"/);
 assert.match(dashboard,/data-work-quick="event"/);
 assert.match(dashboard,/data-work-quick="task"/);
 assert.match(dashboard,/id="tm-db-tasks-list"/);
 assert.match(dashboard,/admin-work\.css\?v=1/);
 assert.match(dashboard,/admin-work\.js\?v=1/);
 assert.match(dashboardJs,/dataset\.bookingHref=bookingsLink\(day,true\)/);
 assert.match(dashboardJs,/api\/v2\/admin\/work\/events/);
 assert.match(dashboardJs,/merge\(bookings,activity,internalEvents\)/);
 assert.match(dashboardJs,/window\.tmDashboardWorkRefresh\?\.\(\)/);
 assert.match(frontend,/tm-db-miniagenda-new/);
 assert.match(frontend,/refreshDashboardTasks/);
});

test("status is shown only on real bookings; new internal events have no fake states",()=>{
 assert.match(dashboardJs,/const isBooking=item\.type==="appointment"\|\|item\.type==="assessment"/);
 assert.match(dashboardJs,/if\(isBooking&&item\.label\)/);
 assert.match(dashboardJs,/label:"",/);
 assert.match(css,/tm-work-task-state/);
 assert.match(css,/color-mix\(in srgb,var\(--tm-work-state\) 7%,transparent\)/);
 assert.match(css,/height:26px/);
});
