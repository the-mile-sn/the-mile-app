"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");
const html=read("static/admin-microcycles.html"),legacy=read("static/create-plan.html");
const nav=read("static/admin-nav-shell.js"),dashboard=read("static/admin-dashboard.js");
const editor=read("static/create-plan.js"),css=read("static/admin-plans-native.css");
const app=read("app.py");
test("Planos is mounted as one native editor without duplicate HTML IDs",()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ["tm-plan-page","plan-entry","plan-search-selection","plan-preview","plan-editor","tm-plan-status","plan-player","plan-type","save-plan","assign-player","library-plan-rows"])assert.ok(ids.includes(id),id);
 assert.match(html,/<section id="tm-plan-page"[^>]*hidden/);
 assert.match(html,/\/create-plan\.js\?v=78/);
 assert.match(html,/\/admin-plans-native\.css\?v=4/);
 assert.match(legacy,/id="status"/);
 assert.match(legacy,/data-tm-nav-page="create-plan"/);
});
test("Backoffice navigation activates Planos without a new document and protects dirty editors",()=>{
 assert.match(nav,/const actions=\[[^\]]*"create-plan"/);
 assert.match(dashboard,/function openPlans\(\)/);
 assert.match(dashboard,/navActive\(plansBtn\)/);
 assert.match(dashboard,/plansPage\.hidden=target!==plansBtn/);
 assert.match(dashboard,/tmEnsureAdminPlans/);
 assert.match(dashboard,/tmPlanCanLeave/);
 assert.match(editor,/window\.tmPlanCanLeave=/);
 assert.match(editor,/beforeunload/);
 assert.match(editor,/!planIsDirty\(\)/);
 assert.match(editor,/if\(saveBusy\|\|publishBusy\)/);
});
test("Native Planos retains the existing draft and publication endpoints unmodified",()=>{
 for(const api of ["/api/v2/food-library","/api/v2/athletes","/api/v2/food-plan-drafts","/publish"])assert.ok(editor.includes(api),api);
 assert.match(editor,/async function loadDrafts\(/);
 assert.match(editor,/async function saveCurrentDraft\(/);
 assert.match(editor,/if\(!plan\.id\|\|planIsDirty\(\)\)/);
 assert.match(editor,/if\(nativeRoot\)\{\s*window\.tmEnsureAdminPlans/);
 assert.match(editor,/nativeRoot\?nativeRoot\.querySelector/);
 assert.match(app,/food_plan_drafts_v2/);
});
test("Planos CSS is isolated without importing its old rules globally",()=>{
 assert.doesNotMatch(css,/@scope\s*\(/,"Style must work without @scope support");
 assert.match(css,/#tm-plan-page\[hidden\]\{display:none!important\}/);
 assert.match(css,/#tm-plan-page\[data-admin-theme="light"\]/);
 assert.match(css,/#tm-plan-page \.plan-library-filters\{display:grid/);
 assert.match(css,/#tm-plan-page #plan-entry \.plan-type-tag \.plan-peri-icon\{width:19px/);
 assert.match(css,/#tm-plan-page \.tm-library-layout/);
 assert.doesNotMatch(html,/\/create-plan\.css\?/);
 assert.doesNotMatch(html,/\/nutrition-theme\.css\?/);
});

test("Production WSGI explicitly serves the native Planos stylesheet",()=>{
 assert.match(app,/'\/admin-plans-native\.css': 'admin-plans-native\.css'/);
 const roleGuard=app.slice(app.indexOf("if SITE_ROLE == 'player':"),app.indexOf("elif SITE_ROLE == 'admin':"));
 assert.match(roleGuard,/'\/admin-plans-native\.css'/);
 assert.ok(css.length>140000,"Native Planos CSS file must not be empty");
});
