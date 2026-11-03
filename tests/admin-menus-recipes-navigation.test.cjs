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
 assert.match(html,/id="tm-admin-nav-recipe-library"/);
 assert.match(html,/id="tm-recipe-library-page"/);
 assert.doesNotMatch(html,/Biblioteca de receitas <small>Em breve<\/small>/);
 assert.match(html,/id="tm-admin-recipes-subnav" hidden/);
 assert.match(html,/id="tm-menu-recipes-page"[^>]* hidden/);
});

test("only one existing dish editor is mounted, outside individual planning",()=>{
 for(const id of ["dish-search","dish-category-filter","dish-editor-list","dish-add-toggle","dish-add-panel","dish-add-cancel","create-dish","new-dish-category","new-dish-photo","dish-new-feedback"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 const start=html.indexOf('id="tm-menu-recipes-page"');
 const end=html.indexOf('id="tm-admin-legacy"',start);
 assert.ok(start>0&&end>start);
 const library=html.slice(start,end);
 assert.match(library,/id="dish-editor-list"/);
 assert.match(library,/id="dish-category-filter"/);
 assert.match(library,/id="dish-add-toggle"/);
 assert.match(library,/id="dish-add-panel"[^>]*hidden/);
 assert.doesNotMatch(library,/id="dish-library-count"/);
 assert.doesNotMatch(library,/Exportar ZIP|Todos os pratos|<h3>Biblioteca de pratos<\/h3>/);
 assert.doesNotMatch(library,/id="dish-catalog-import"|id="dish-catalog-file"/);
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
 assert.match(admin,/dish-library-table/);
 assert.match(admin,/function refreshDishTableCategories\(\)/);
 assert.doesNotMatch(admin,/\$\("dish-catalog-import"\)\.addEventListener/);
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

test("dish add panel toggles from the table toolbar and rows are aligned left",()=>{
 const page=html.slice(html.indexOf('id="tm-menu-recipes-page"'),html.indexOf('id="tm-admin-legacy"'));
 assert.ok(page.indexOf('id="dish-search"')<page.indexOf('id="dish-add-panel"'));
 assert.ok(page.indexOf('id="dish-category-filter"')<page.indexOf('id="dish-add-panel"'));
 assert.match(admin,/function setDishAddPanel\(open\)/);
 assert.match(admin,/setDishAddPanel\(\$\("dish-add-panel"\)\.hidden\)/);
 assert.match(admin,/setDishAddPanel\(false\)/);
 assert.match(css,/\.dish-library-table th,#tm-menu-recipes-page \.dish-library-table td\{text-align:left!important\}/);
});

test("recipe library switches independently from dish catalogue and Planning",()=>{
 assert.match(dashboard,/function openRecipeLibrary\(\)/);
 assert.match(dashboard,/recipesPage\.hidden=true/);
 assert.match(dashboard,/recipeLibraryPage\.hidden=false/);
 assert.match(dashboard,/window\.tmLoadRecipeLibrary\(\)/);
 assert.match(dashboard,/recipeLibraryBtn\.addEventListener\("click",openRecipeLibrary\)/);
 assert.match(html,/admin-recipes\.js\?v=12/);
 assert.match(html,/admin-recipes\.css\?v=13/);
});

test("menu chooser submits stable dish IDs while preserving legacy labels",()=>{
 const backend=fs.readFileSync("app.py","utf8");
 const model=fs.readFileSync("microcycles_v2.py","utf8");
 assert.match(admin,/function resolveAdminMenuDish\(existing,library\)/);
 assert.match(admin,/if\(existing\.dish_id\)return library\.find\(item=>item\.id===existing\.dish_id\)/);
 assert.match(admin,/const matches=library\.filter\(item=>item\.name_pt===existing\.value\)/);
 assert.match(admin,/matches\.length===1\?matches\[0\]:null/);
 assert.match(admin,/kind\.value==="dish"\?\{dish_id:selectedDish\.id\}/);
 assert.match(admin,/resolveAdminMenuDish\(menu,dishes\.dishes\)/);
 assert.match(backend,/microcycles_v2\.resolve_menu_dish\(c,kind,value,dish_id\)/);
 assert.match(backend,/microcycles_v2\.menu_dish_id_audit\(c\)/);
 assert.match(backend,/body\.get\('dish_id'\)/);
 assert.match(backend,/m\.dish_id=d\.id/);
 assert.match(backend,/m\.dish_id IS NULL AND m\.value=d\.name_pt/);
 assert.match(model,/def menu_dish_id_audit\(c\):/);
 assert.match(model,/CREATE INDEX IF NOT EXISTS v2_weekly_menus_dish_id_idx/);
});

test("dish recipe association has a searchable, independent, admin-only editor",()=>{
 const model=fs.readFileSync("recipe_library_v2.py","utf8");
 const backend=fs.readFileSync("app.py","utf8");
 const recipes=fs.readFileSync("static/admin-recipes.js","utf8");
 const style=fs.readFileSync("static/admin-microcycles.css","utf8");
 assert.match(admin,/let dishRecipeChoices=\[\],dishRecipeLinks=\{\}/);
 assert.match(admin,/request\("\/api\/v2\/dishes\/recipe-links"\)/);
 assert.match(admin,/request\("\/api\/v2\/recipes"\)/);
 assert.match(admin,/dishRecipeLinks\[dish\.id\]/);
 assert.match(admin,/associationSearch\.addEventListener\("input",renderAssociationOptions\)/);
 assert.match(admin,/request\("\/api\/v2\/dishes\/recipe-link",\{method:"PUT"/);
 assert.match(admin,/dish_id:dish\.id,recipe_id:recipeId/);
 assert.match(admin,/window\.tmOpenAdminDishRecipe\(id\)/);
 assert.match(recipes,/window\.tmOpenAdminDishRecipe=async id=>/);
 assert.match(dashboard,/return loadPromise;/);
 assert.match(model,/def link_dish_recipe\(c, dish_id, recipe_id\):/);
 assert.match(model,/def list_dish_recipe_links\(c\):/);
 assert.match(model,/if _dish_has_recipe_link\(c, recipe_id\):/);
 assert.match(backend,/path == '\/api\/v2\/dishes\/recipe-links'/);
 assert.match(backend,/path == '\/api\/v2\/dishes\/recipe-link'/);
 assert.match(backend,/admin\(user\)/);
 assert.match(backend,/path\.startswith\('\/api\/v2\/dishes\/recipe-link'\)/);
 assert.match(style,/\.dish-recipe-association\{/);
 assert.match(style,/html\[data-admin-theme="light"\] #tm-menu-recipes-page \.dish-recipe-association/);
 assert.match(html,/admin-recipes\.js\?v=12/);
 assert.match(html,/admin-dashboard\.js\?v=33/);
 assert.match(html,/admin-microcycles\.js\?v=18234/);
 assert.match(html,/admin-microcycles\.css\?v=109/);
});
