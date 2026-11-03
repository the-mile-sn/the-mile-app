"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const dashboard=fs.readFileSync("static/admin-dashboard.js","utf8");
const ui=fs.readFileSync("static/admin-recipes.js","utf8");
const backend=fs.readFileSync("app.py","utf8");
const model=fs.readFileSync("recipe_library_v2.py","utf8");
test("recipe library lives in a dedicated sidebar page with a single editor",()=>{
 for(const id of ["tm-admin-nav-recipe-library","tm-recipe-library-page","recipe-list","recipe-editor-panel","recipe-category","recipe-add","recipe-save","recipe-add-section","recipe-add-step","recipe-create-category","recipe-photo-file"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(html,/id="tm-recipe-library-page"[^>]*hidden/);
 assert.match(html,/id="recipe-editor-panel"[^>]*hidden/);
 assert.match(dashboard,/function openRecipeLibrary\(\)/);
 assert.match(dashboard,/recipeLibraryPage\.hidden=false/);
 assert.match(dashboard,/recipesPage\.hidden=true/);
});
test("recipe API and assets are explicitly admin-only",()=>{
 assert.match(backend,/recipe_library_v2\.initialize\(c\)/);
 assert.match(backend,/or path\.startswith\('\/api\/v2\/recipes'\)/);
 assert.match(backend,/if path\.startswith\('\/api\/v2\/recipes'\):\s*if not user: raise Problem\(401, 'unauthorized'\)\s*admin\(user\)/);
 assert.match(backend,/\/admin-recipes\.js/);
 assert.match(backend,/\/admin-recipes\.css/);
 assert.match(backend,/if SITE_ROLE == 'player':/);
});
test("recipe fields support variable blocks, editable instructions, and no nutritional calculation",()=>{
 assert.match(model,/CREATE TABLE IF NOT EXISTS v2_recipe_categories/);
 assert.match(model,/CREATE TABLE IF NOT EXISTS v2_recipe_library/);
 assert.match(model,/sections_json/);
 assert.match(model,/steps_json/);
 assert.match(model,/recipe_type/);
 assert.match(model,/status/);
 assert.doesNotMatch(model,/\b(kcal|calories|carbohydrate|protein_g|fat_g)\b/);
 assert.match(ui,/recipe-section-head/);
 assert.match(ui,/recipe-ingredient-row/);
 assert.match(ui,/recipe-step-row/);
 assert.match(ui,/recipe-photo-preview/);
 assert.match(ui,/recipe-category-create/);
});
test("recipe editor remains separate from legacy dish and athlete menu state",()=>{
 assert.match(ui,/window\.tmLoadRecipeLibrary=/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications|\/api\/v2\/athletes\//);
 assert.match(backend,/if path == '\/api\/v2\/dishes' and method == 'GET'/);
});
