const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/admin-work.js","utf8");
const css=fs.readFileSync("static/admin-work.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("Dashboard checklist shows an empty open task and tick only when completed",()=>{
 assert.match(js,/const isDone=item\.status==="done"/);
 assert.match(js,/toggle\.setAttribute\("aria-pressed",String\(isDone\)\)/);
 assert.match(js,/if\(isDone\)toggle\.innerHTML=/);
 assert.match(js,/taskBody\(item,isDone\?"open":"done"\)/);
 assert.match(css,/#tm-dashboard \.tm-db-task-check\.is-done\{/);
 assert.match(css,/\.tm-db-task-row\.is-done \.tm-db-task-title\{/);
 assert.doesNotMatch(js,/done\.innerHTML='<svg/);
});
test("completed tasks stay accessible on Dashboard and All is the initial popup filter",()=>{
 assert.match(js,/api\("\/tasks\?status=all"\)/);
 assert.match(js,/const pending=all\.filter\(item=>item\.status==="open"\)/);
 assert.match(js,/const completed=all\.filter\(item=>item\.status==="done" &&/);
 assert.match(js,/nowSeconds-Number\(item\.completed_at\)<24\*60\*60/);
 assert.match(js,/sort\(\(a,b\)=>Number\(b\.completed_at\)-Number\(a\.completed_at\)\)/);
 assert.match(js,/taskExpiryTimer=setTimeout\(refreshDashboardTasks/);
 assert.match(js,/pending\.slice\(0,2\)\.concat\(completed\.slice\(0,1\)\)/);
 assert.match(js,/Promise\.all\(\[refreshDashboardTasks\(\),refreshTasks\(\)\]\)/);
 assert.match(html,/data-tm-task-filter="all" aria-pressed="true"/);
 assert.match(html,/data-tm-task-filter="open" aria-pressed="false"/);
 assert.match(html,/data-tm-task-filter="done" aria-pressed="false"/);
 assert.doesNotMatch(html,/id="tm-work-task-filter"/);
 assert.doesNotMatch(js,/api\("\/tasks\?status=open"\)/);
});
test("two-line fields never have native white inner blocks and actions have approved colors",()=>{
 assert.match(css,/dialog\.tm-work-dialog \.tm-work-field > :is\(input,select,textarea\)\{/);
 assert.match(css,/background:transparent!important/);
 assert.match(css,/box-shadow:none!important/);
 assert.match(css,/dialog\.tm-work-dialog button\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.tm-work-line-action\.is-primary\{/);
 assert.match(css,/var\(--tm-action-main-bg\)!important/);
 assert.match(css,/var\(--tm-action-secondary-bg\)!important/);
 assert.match(css,/var\(--tm-action-danger-bg\)!important/);
});

test("Tasks have their own add action and history popup has only list and segmented filters",()=>{
 assert.match(html,/id="tm-db-tasks-add"/);
 assert.match(html,/id="tm-db-tasks-open"[^>]*>Ver todas<\/button>/);
 assert.doesNotMatch(html,/data-work-quick="task"|id="tm-work-new-task"/);
 assert.doesNotMatch(html,/Tarefas da equipa, com prazo opcional e sem horário de reserva/);
 assert.match(js,/\$\("tm-db-tasks-add"\)\.addEventListener\("click",\(\)=>openTask\(\)\)/);
 assert.match(js,/function setTaskFilter\(value\)/);
 assert.match(js,/setTaskFilter\("all"\)/);
 assert.match(css,/\.tm-work-task-segments button\.is-selected/);
});
