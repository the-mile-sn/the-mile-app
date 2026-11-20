"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const recipeCss=fs.readFileSync("static/player-recipes.css","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const guide=fs.readFileSync("docs/GUIA_VISUAL_APP_JOGADORES.md","utf8");

test("Início and Menus calendar geometry share the same CSS selectors",()=>{
 assert.match(css,/:is\(#week-strip,#menu-week-strip\)\.week\{/);
 assert.match(css,/:is\(#week-strip,#menu-week-strip\) \.week-day\.selected/);
 assert.match(css,/:is\(#week-strip,#menu-week-strip\) \.week-day \.day-number/);
 assert.doesNotMatch(css,/#menu-week-strip\.week\{/);
 assert.doesNotMatch(css,/#menu-week-strip \.week-day\{/);
 assert.match(css,/#player-panel #menus #menus-recipe-switch\{[^}]*margin-bottom:10px!important/s);
 assert.match(js,/const mileLastCalendarSelectionByStrip=new WeakMap\(\)/);
 assert.match(js,/animateCalendarSelection\(strip,menuSelectedDate\)/);
 assert.match(js,/selectMenuDay\(key\);animateCalendarSelection\(strip,key\)/);
});

test("Unassigned menus render without manufactured data; assigned categories, dishes and free text remain supported",()=>{
 const fragment=js.slice(js.indexOf("async function menusView()"),js.indexOf("function error(e)"));
 assert.match(fragment,/const isUnassigned=!menu/);
 assert.match(fragment,/menu-entry--unassigned/);
 assert.match(fragment,/menu\?\.value\|\|"Menu por atribuir"/);
 assert.match(fragment,/if\(menu\?\.kind==="text"\)/);
 assert.match(fragment,/if\(menu\?\.kind==="dish"\)/);
 assert.match(fragment,/dish-photo-frame/);
 assert.match(fragment,/menu-view-recipe/);
 assert.match(css,/#menus \.day-menu \.menu-entry--unassigned\{/);
 assert.match(css,/min-height:61px!important/);
});

test("Recipes category geometry and title follow the approved visual guide",()=>{
 assert.match(recipeCss,/#menus \.recipe-item\{[^}]*min-height:86px/s);
 assert.match(recipeCss,/#menus \.recipe-item\{[^}]*--recipe-list-title-weight:var\(--mile-type-card-title,400\)/s);
 assert.match(recipeCss,/#menus \.recipe-item--category\{--recipe-list-title-weight:var\(--mile-type-medium,500\);\}/);
 assert.match(recipeCss,/#menus \.recipe-item-body strong\{font-size:16px;line-height:1\.35;font-weight:var\(--recipe-list-title-weight\);\}/);
 const recipeJS=fs.readFileSync("static/player-recipes.js","utf8");
 assert.match(recipeJS,/if\(small\)button\.classList\.add\("recipe-item--category"\)/);
 assert.match(recipeJS,/list\.append\(card\(r\.name,"",r\.has_photo\?r\.id:null/);
 assert.match(html,/jogador-v2\.css\?v=\d+/);
 assert.match(html,/player-recipes\.css\?v=\d+/);
 assert.match(html,/player-recipes\.js\?v=\d+/);
 assert.match(guide,/Menu por atribuir/);
 assert.match(guide,/listas de Receitas partilham agora/);
 assert.match(guide,/Receitas individuais — decisão 20\/11/);
});
