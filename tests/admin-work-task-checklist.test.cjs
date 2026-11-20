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
 assert.match(js,/const completed=all\.filter\(item=>item\.status==="done"\)/);
 assert.match(js,/pending\.slice\(0,2\)\.concat\(completed\.slice\(0,1\)\)/);
 assert.match(js,/Promise\.all\(\[refreshDashboardTasks\(\),refreshTasks\(\)\]\)/);
 assert.match(html,/<option value="all">Todas<\/option><option value="open">Por fazer<\/option>/);
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
