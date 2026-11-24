const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("daily cards prioritize person and retain service, professional, time and actions",()=>{
 assert.match(js,/item\.person\|\|item\.title/);
 assert.match(js,/tm-db-activity-name/);
 assert.match(js,/if\(hasPerson&&item\.title\)/);
 assert.match(js,/tm-db-activity-professional/);
 assert.match(js,/tm-db-activity-time/);
 assert.match(js,/target\.href=item\.href/);
 assert.match(js,/tmDashboardOpenActivity/);
 assert.match(js,/const isBooking=item\.type==="appointment"\|\|item\.type==="assessment"/);
 assert.match(js,/if\(isBooking&&item\.label\)/);
});
test("time is normal text and labels are universal pills only for bookings",()=>{
 assert.match(css,/grid-template-columns:29px minmax\(0,1fr\) max-content/);
 assert.match(css,/\.tm-db-activity-time\{[\s\S]*?font:400 12px/);
 assert.match(css,/\.tm-db-activity-status\{[\s\S]*?height:26px;padding:0 9px;border-radius:999px/);
 assert.match(css,/color-mix\(in srgb,var\(--tm-db-state-ink\) 7%,transparent\)/);
 assert.match(css,/color-mix\(in srgb,var\(--tm-db-state-ink\) 12%,transparent\)/);
 assert.doesNotMatch(css,/#tm-dashboard \.tm-db-activity-row::before/);
 assert.doesNotMatch(css,/#tm-dashboard \.tm-db-activity-status\{display:none/);
 assert.doesNotMatch(css,/border-left:3px solid #e4c85d/);
 assert.match(js,/status\.dataset\.state=item\.label==="Por confirmar"\?"pending"/);
});
test("cache keys are refreshed only for admin dashboard assets",()=>{
 assert.match(html,/admin-microcycles\.css\?v=\d+/);
 assert.match(html,/admin-dashboard\.js\?v=\d+/);
});
