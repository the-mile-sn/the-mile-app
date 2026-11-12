const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("Dashboard player picker uses full-header search with a portal listbox",()=>{
 assert.match(js,/function setupDashboardPlayerPicker\(search,players,applyPlayerFilter\)/);
 assert.match(js,/dashboardPickerCleanup\?\.\(\)/);
 assert.match(js,/document\.body\.append\(results\)/);
 assert.match(js,/search\.setAttribute\("aria-expanded","false"\)/);
 assert.match(js,/search\.addEventListener\("input"/);
 assert.match(js,/results\.contains\(event\.target\)/);
 assert.match(js,/setupDashboardPlayerPicker\(search,data\.players\|\|\[\],applyPlayerFilter\)/);
 assert.match(css,/#tm-dashboard \.tm-db-search-wrap\{/);
 assert.match(css,/\.tm-db-player-results\[hidden\]/);
});
test("Directory desktop borderless filters preserve mobile and status lines",()=>{
 assert.match(css,/@media\(min-width:831px\)/);
 assert.match(css,/\.tm-players-table tbody tr:not\(\[class\*="warning"\]\)/);
 assert.match(css,/border-radius:14px!important;box-shadow:none!important/);
 assert.match(css,/border-bottom:1px solid rgba\(154,166,182,.075\)/);
 assert.match(css,/@media\(max-width:830px\)/);
});
test("Profile permissions match Gerir acesso without altering switches",()=>{
 assert.match(css,/#tm-players-page #tm-players-settings-slot\{/);
 assert.match(css,/#tm-players-page \.tm-players-access-management\{/);
 assert.match(css,/\.tm-player-permissions-shield\{/);
 assert.match(css,/border:0!important;box-shadow:none!important/);
 assert.match(js,/profilePanel/);
 assert.match(html,/admin-dashboard\.js\?v=72/);
 assert.match(html,/admin-microcycles\.css\?v=195/);
});
