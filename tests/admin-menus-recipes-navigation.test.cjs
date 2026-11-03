"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const dashboard=fs.readFileSync("static/admin-dashboard.js","utf8");
const admin=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");

test("Menus e Receitas is a separate admin page, with two intended subsections",()=>{
 for(const id of ["tm-admin-nav-menus-recipes","tm-admin-recipes-subnav","tm-admin-nav-dishes","tm-menu-recipes-page"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(html,/Biblioteca de receitas <small>Em breve<\/small>/);
 assert.match(html,/id="tm-admin-recipes-subnav" hidden/);
 assert.match(html,/id="tm-menu-recipes-page"[^>]* hidden/);
});

test("only one existing dish editor is mounted, outside individual planning",()=>{
 for(const id of ["dish-search","dish-editor-list","create-dish","dish-catalog-import","dish-catalog-file","new-dish-category","new-dish-photo","dish-new-feedback"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 const start=html.indexOf('id="tm-menu-recipes-page"');
 const end=html.indexOf('id="tm-admin-legacy"',start);
 assert.ok(start>0&&end>start);
 const library=html.slice(start,end);
 assert.match(library,/id="dish-editor-list"/);
 assert.match(library,/id="dish-catalog-import"/);
 const menuStart=html.indexOf('id="menus-panel"');
 const menuEnd=html.indexOf('id="matrix"',menuStart);
 assert.ok(menuStart>0&&menuEnd>menuStart);
 assert.doesNotMatch(html.slice(menuStart,menuEnd),/class="menu-library-card"/);
 assert.match(html.slice(menuStart,menuEnd),/id="menu-grid"/);
});

test("navigation loads dishes without requiring a selected player",()=>{
 assert.match(dashboard,/function openMenusRecipes\(\)/);
 assert.match(dashboard,/navActive\(recipesBtn\)/);
 assert.match(dashboard,/window\.tmLoadDishLibrary\(\)\.catch/);
 assert.match(admin,/async function loadDishLibrary\(\)/);
 assert.match(admin,/window\.tmLoadDishLibrary=loadDishLibrary/);
 assert.match(admin,/request\("\/api\/v2\/dishes"\)/);
 assert.match(admin,/await loadDishLibrary\(\)/);
});

test("published plans and player-facing endpoints are not touched in navigation step",()=>{
 const nav=html.match(/<nav class="calendar-panel" id="backoffice-nav"[^>]*>([\s\S]*?)<\/nav>/);
 assert.ok(nav);
 const tabs=[...nav[1].matchAll(/data-view="([^"]+)"/g)].map(v=>v[1]);
 assert.deepEqual(tabs,["calendar","plans","supplements","matrix","menus","player-preview"]);
 assert.match(admin,/function showBackofficeView\(view\)/);
 assert.match(css,/#tm-menu-recipes-page/);
 assert.match(css,/html\[data-admin-theme="light"\]/);
});
