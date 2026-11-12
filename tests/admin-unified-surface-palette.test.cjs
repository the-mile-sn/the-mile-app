const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const css = fs.readFileSync("static/admin-surface-palette.css","utf8");
const html = ["admin-microcycles.html","create-plan.html","food-library.html"]
 .map(p=>fs.readFileSync("static/"+p,"utf8"));
const extract=(name,theme)=>{
 const start = theme === "light" ? css.indexOf('html[data-admin-theme="light"]{') :
   css.indexOf(':root,html[data-admin-theme="dark"]{');
 assert.ok(start >= 0);
 const until = css.indexOf("}",start);
 const block=css.slice(start,until);
 const line=block.split("\n").find(line=>line.trim().startsWith(name+":"));
 assert.ok(line, "Missing token "+name+" for "+theme);
 return line.trim().split(":")[1].replace(";","").trim();
};
test("same four-level colour hierarchy exists in light and dark themes",()=>{
 for(const [key,light,dark] of [
  ["--tm-ui-bg","#f5f6f8","#101114"],
  ["--tm-ui-card","#fff","#15161a"],
  ["--tm-ui-subcard","#f0f2f6","#1e2025"],
  ["--tm-ui-search","#e5ebf2","#282b33"],
  ["--tm-ui-hover","#e3e7ee","#303239"]
 ]) {
  assert.equal(extract(key,"light"),light);
  assert.equal(extract(key,"dark"),dark);
 }
});
test("all three Backoffice entrypoints load palette last",()=>{
 for(const [i,doc] of html.entries()){
  assert.match(doc,i===0?/admin-surface-palette\.css\?v=10/:/admin-surface-palette\.css\?v=5/);
  const head=doc.slice(0,doc.indexOf("</head>"));
  assert.ok(head.lastIndexOf("admin-surface-palette.css")>head.lastIndexOf("tm-design-system.css"));
 }
});
test("palette targets dashboard, profiles, plans, libraries, forms and menus",()=>{
 for(const selector of [
 "#tm-dashboard .tm-db-panel",
 "#tm-players-page .tm-players-list-surface .tm-players-table-scroll",
 "#tm-players-page .tm-player-permission-row:not(.is-enabled)",
 ".tm-assessment-registry-panel",
 ".tm-clinical-search-wrap input",
 "#tm-admin-legacy .tm-planning-unified-header",
 "#menus-panel .menu-day-card",
 "#tm-menu-recipes-page .menu-create-section",
 "#tm-recipe-library-page",
 "#tm-food-library-page .tm-portion-card",
 "#tm-plan-page",
 ".tm-library-layout .shell",
 "#tm-admin-settings #tm-settings-appearance",
 "#admin-account-panel",
 "#scenario-editor .scenario-day-group",
 "#consumption-panel .tm-consumption-card"
 ]) assert.ok(css.includes(selector),"Missing area "+selector);
});
test("semantic outlines and focus remain, and no artificial shadows are added",()=>{
 assert.ok(css.includes("legacy-copy"));
 assert.ok(css.includes("calendar-day"));
 assert.ok(css.includes(".has-photo"));
 assert.ok(css.includes(".tm-monitoring-target"));
 assert.ok(css.includes(":focus-visible"));
 assert.ok(css.includes("box-shadow:none!important"));
 assert.doesNotMatch(css, /box-shadow:\s*0\s+\d/);
 assert.doesNotMatch(css, /\.calendar-day\s*\{[^}]*background:/);
});
test("iPhone filters remain at least 16px and no separate responsive palette exists",()=>{
 assert.match(css, /@media\(max-width:830px\)/);
 assert.match(css, /font-size:16px!important/);
 assert.ok(css.includes("--tm-ui-card"));
});

test("new stylesheet is served on admin and protected from player deployment",()=>{
 const app=fs.readFileSync("app.py","utf8");
 assert.match(app,/['"]\/admin-surface-palette\.css['"]\s*:\s*['"]admin-surface-palette\.css['"]/);
 assert.match(app,/if SITE_ROLE == 'player':/);
 const guarded=app.slice(app.indexOf("if SITE_ROLE == 'player':"),app.indexOf("elif SITE_ROLE == 'admin':"));
 assert.match(guarded,/\/admin-surface-palette\.css/);
});
