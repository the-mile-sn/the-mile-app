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
 assert.match(html,/class="recipe-category-create"/);
});
test("recipe editor remains separate from legacy dish and athlete menu state",()=>{
 assert.match(ui,/window\.tmLoadRecipeLibrary=/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications|\/api\/v2\/athletes\//);
 assert.match(backend,/if path == '\/api\/v2\/dishes' and method == 'GET'/);
});

test("ingredient editor renders quantity, unit, food in order without changing stored keys",()=>{
 const head='for(const name of ["Quantidade","Unidade","Alimento",""])';
 const row='[["quantity","Ex.: 10, q.b. ou 1 un / 120 g"],["unit","Ex.: g, ml, un"],["name","Ex.: Azeite"]]';
 assert.ok(ui.includes(head));
 assert.ok(ui.includes(row));
 assert.match(ui,/ingredient\[key\]=input\.value/);
 assert.match(ui,/quantity:i\.quantity,unit:i\.unit/);
});
test("recipe category management opens from toolbar in compact separate panel",()=>{
 const start=html.indexOf('id="tm-recipe-library-page"');
 const search=html.indexOf('id="recipe-search"',start);
 const category=html.indexOf('id="recipe-category-manage"',start);
 const table=html.indexOf('id="recipe-list"',start);
 assert.ok(search>start&&category>search&&table>category);
 assert.match(html,/id="recipe-category-toggle"[^>]*aria-expanded="false"/);
 assert.match(html,/id="recipe-category-manage"[^>]*hidden/);
 assert.match(ui,/function setRecipeCategoriesOpen\(open\)/);
 assert.match(ui,/recipe-category-toggle"\)\.addEventListener\("click"/);
 assert.doesNotMatch(html,/<details class="recipe-category-manage"/);
});
test("accessory paragraphs removed without changing explanatory field labels",()=>{
 assert.doesNotMatch(html,/A fotografia é opcional no rascunho/);
 assert.doesNotMatch(html,/Usa procedimentos simples, sem quantidades no texto/);
 assert.doesNotMatch(html,/Uma receita simples pode ter um único bloco/);
 assert.match(html,/Fotografia da receita \(vista de cima\)/);
 assert.match(html,/id="recipe-sections"/);
 assert.match(html,/id="recipe-steps"/);
});

test("PDF importer remains a review-first admin workflow",()=>{
 for(const id of ["recipe-pdf-panel","recipe-pdf-toggle","recipe-pdf-file","recipe-pdf-category",
                  "recipe-pdf-analyze","recipe-pdf-results","recipe-pdf-save","recipe-pdf-actions"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(html,/id="recipe-pdf-panel"[^>]*hidden/);
 assert.match(ui,/function analyzePdf\(\)/);
 assert.match(ui,/recipe-pdf-results/);
 assert.match(ui,/preview.*PDF|pdf\/preview/);
 assert.match(ui,/pdf\/import/);
 assert.match(ui,/recipe\.recipe_type="standard"/);
 assert.match(backend,/recipe_pdf_import_v2\.preview_pdf/);
 assert.match(backend,/recipe_pdf_import_v2\.commit_drafts/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications/);
});

test("recipe list offers confirmed deletion using admin-only endpoint",()=>{
 assert.match(ui,/button\("Eliminar",\(\)=>deleteRecipe\(r\),"recipe-delete"\)/);
 assert.match(ui,/window\.confirm\(/);
 assert.match(ui,/method:"DELETE"/);
 assert.match(ui,/await loadLibrary\(\)/);
 assert.match(backend,/recipe_library_v2\.delete_recipe\(c,recipe_id\)/);
 assert.match(model,/def delete_recipe\(c, recipe_id\):/);
 assert.match(model,/DELETE FROM v2_shared_images WHERE image_key=/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications/);
});

test("PDF review always exposes editable ingredients, steps and tips",()=>{
 assert.match(ui,/function preparePdfReview\(recipe\)/);
 assert.match(ui,/function paintPdfDetail\(recipe,detail\)/);
 assert.match(ui,/\+ Adicionar bloco/);
 assert.match(ui,/Remover bloco/);
 assert.match(ui,/\+ Adicionar alimento/);
 assert.match(ui,/Remover alimento/);
 assert.match(ui,/\+ Adicionar passo/);
 assert.match(ui,/\+ Adicionar dica/);
 assert.match(ui,/recipe\.reviewTips\.splice\(ti,1\)/);
 assert.match(ui,/recipe\.sections\.splice\(si,1\)/);
 assert.match(ui,/section\.ingredients\.splice\(ii,1\)/);
 assert.match(ui,/recipe\.steps\.splice\(si,1\)/);
 assert.match(ui,/preparePdfReview\(recipe\)/);
 assert.match(ui,/syncPdfTips\(recipe\)/);
 assert.match(ui,/notes:x\.notes\|\|""/);
 assert.match(html,/id="recipe-notes"/);
 assert.match(ui,/\$\("recipe-notes"\)\.value=current\.notes/);
});

test("PDF review header matches manual recipe fields including editable doses",()=>{
 const start=ui.indexOf('const fields=node("div","recipe-editor-grid recipe-pdf-edit-fields")');
 const end=ui.indexOf('const detail=node("details","recipe-pdf-details")',start);
 assert.ok(start>=0&&end>start);
 const header=ui.slice(start,end);
 for(const label of ["Nome da receita","Categoria","Tipo","Doses","Estado","Fotografia da receita (vista de cima)"]){
  assert.ok(header.includes(label),label);
 }
 assert.match(header,/servings\.type="number"/);
 assert.match(header,/servings\.min="1"/);
 assert.match(header,/servings\.max="100"/);
 assert.match(header,/recipe\.servings=Number\(servings\.value\)/);
 assert.match(header,/categorySelect\.disabled=true/);
 assert.match(header,/state\.disabled=true/);
 assert.match(ui,/photoFile\.addEventListener\("change",async\(\)=>/);
 assert.match(ui,/recipe\.photo_webp=converted/);
 assert.match(ui,/recipe\.photo_webp=null/);
 assert.match(ui,/!Number\.isInteger\(x\.servings\)/);
 assert.match(ui,/servings:x\.servings,sections:x\.sections/);
 assert.match(html,/id="recipe-servings"/);
});

test("both recipe editors offer stable linked-recipe search and retain identifiers",()=>{
 assert.match(ui,/function paintRecipeLink\(ingredient,options=/);
 assert.match(ui,/inlineRecipeLink\(ingredient,\{ownerId:current\.id\}\)/);
 assert.match(ui,/inlineRecipeLink\(ingredient,\{pdfRecipe:recipe\}\)/);
 assert.match(ui,/actions\.append\(link\.button,remove\)/);
 assert.match(ui,/row\.append\(actions\);block\.append\(row,link\.panel\)/);
 assert.match(ui,/row\.append\(actions\);box\.append\(row,link\.panel\)/);
 assert.match(ui,/trigger\.classList\.toggle\("is-linked",linked\)/);
 assert.match(ui,/trigger\.setAttribute\("aria-expanded",String\(panel\.open\)\)/);
 assert.match(ui,/recipe_ref_id:i\.recipe_ref_id\|\|null/);
 assert.match(ui,/ingredient\.recipe_ref_page=Number\(value\.slice\(5\)\)/);
 assert.match(ui,/ingredient\.recipe_ref_id=value\.slice\(3\)/);
 assert.match(ui,/recipe\.selected=checkbox\.checked;paintPdfPreview\(\)/);
 assert.match(ui,/ver receita\|receita anterior/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications/);
 assert.match(backend,/cyclic_recipe_reference/);
 assert.match(backend,/recipe_in_use/);
 assert.match(model,/def _assert_reference_graph\(c, replacements\)/);
 assert.match(model,/recipe_ref_id/);
});
