"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const read=path=>fs.readFileSync(path,"utf8");
const adminHtml=read("static/admin-microcycles.html");
const legacyHtml=read("static/food-library.html");
const dashboard=read("static/admin-dashboard.js");
const nav=read("static/admin-nav-shell.js");
const library=read("static/food-library.js");
const css=read("static/admin-microcycles.css");
const app=read("app.py");

test("native Food Library mounts once as an internal Backoffice section",()=>{
 assert.match(adminHtml,/<section id="tm-food-library-page"[^>]* hidden/);
 assert.match(adminHtml,/id="tm-food-library-page"[\s\S]*?id="food-form"/);
 assert.match(adminHtml,/id="tm-food-library-page"[\s\S]*?id="food-pagination"|id="tm-food-library-page"/);
 assert.ok(adminHtml.indexOf('id="tm-food-library-page"')<adminHtml.indexOf('id="tm-admin-legacy"'));
 for(const id of ["rows","search","category","new","editor","food-form","cancel","empty","feedback"])
  assert.equal(adminHtml.split('id="'+id+'"').length-1,1,"Duplicate or missing element: "+id);
 const ids=[...adminHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,"DOM ids must be globally unique");
});

test("Food Library changes route in the admin shell, but Planos remains standalone",()=>{
 assert.match(nav,/const actions=\[[^\]]*"food-library"/);
 assert.match(nav,/page!=="create-plan"&&page!=="food-library"/);
 assert.match(dashboard,/function openFoodLibrary\(\)/);
 assert.match(dashboard,/navActive\(foodLibraryBtn\)/);
 assert.match(dashboard,/foodLibraryPage\.hidden=target!==foodLibraryBtn/);
 assert.match(dashboard,/window\.tmEnsureAdminFoodLibrary\(\)/);
 assert.match(dashboard,/"players","planning","food-library","menus-recipes"/);
 assert.match(adminHtml,/\/food-library\.js\?v=13/);
 assert.match(nav,/href=\\?"\/create-plan\\?"/);
});

test("native view retains the existing catalog operations and server authority",()=>{
 assert.match(library,/function archiveFood\(id\)/);
 assert.match(library,/function open\(food\)/);
 assert.match(library,/const data=Object\.fromEntries\(new FormData\(event\.target\)\)/);
 assert.match(library,/new URLSearchParams\(\{paged:"1"/);
 assert.match(library,/fetch\("\/api\/v2\/food-library"/);
 assert.match(library,/method:"DELETE"/);
 assert.match(library,/method:"POST"/);
 assert.match(library,/if\(embeddedRoot\)window\.tmEnsureAdminFoodLibrary=activate/);
 assert.match(library,/if\(document\.getElementById\("tm-food-library-page"\)\)return/);
 assert.match(app,/food_library_v2\.archive_food\(c,ident\)/);
 assert.match(app,/food_library_v2\.upsert\(c,read_json\(env\)/);
});

test("light and dark themes are confined to the food library panel",()=>{
 assert.match(css,/#tm-food-library-page\[hidden\]\{display:none!important\}/);
 assert.match(css,/html\[data-admin-theme="light"\] #tm-food-library-page/);
 assert.match(css,/#tm-food-library-page \.food-catalog-table/);
 assert.match(css,/#tm-food-library-page dialog/);
});

test("the old Food Library page and its script entry remain reachable",()=>{
 assert.match(app,/'\/food-library': 'food-library\.html'/);
 assert.match(app,/'\/food-library\.js': 'food-library\.js'/);
 assert.match(legacyHtml,/data-tm-nav-page="food-library"/);
 assert.match(legacyHtml,/\/food-library\.js\?v=13/);
 assert.match(legacyHtml,/<dialog id="editor">/);
});
