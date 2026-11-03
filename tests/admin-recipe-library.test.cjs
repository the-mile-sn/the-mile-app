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
 assert.ok(table>start&&search>table&&category>search);
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
 assert.match(ui,/actions\.append\(link\.button,ingredientMoveButtons\(section,ii,\(\)=>paintPdfDetail\(recipe,detail\)\),remove\)/);
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

test("categories can be renamed by stable ID and empty ones removed safely",()=>{
 assert.match(model,/def rename_category\(c, category_id, name\)/);
 assert.match(model,/def delete_category\(c, category_id\)/);
 assert.match(model,/raise ValueError\("category_in_use"\)/);
 assert.match(ui,/async function editCategory\(entry\)/);
 assert.match(ui,/async function removeCategory\(entry\)/);
 assert.match(ui,/recipe-category-pending/);
 assert.match(ui,/Editar receita/);
 assert.match(ui,/method:"PUT",body:JSON\.stringify\(\{name\}\)/);
 assert.match(ui,/method:"DELETE",body:"\{\}"/);
 assert.match(html,/id="recipe-category-edit"/);
 assert.match(backend,/recipe_library_v2\.rename_category\(c,category_id,body\.get\('name'\)\)/);
 assert.match(backend,/recipe_library_v2\.delete_category\(c,category_id\)/);
 assert.doesNotMatch(ui,/Transferir e eliminar/);
});
test("only draft and published statuses use restrained colored tags",()=>{
 assert.match(ui,/recipe-status-tag/);
 assert.match(ui,/recipe-status-draft/);
 assert.match(ui,/recipe-status-published/);
 assert.match(ui,/r\.status==="draft"\?"Rascunho":"Publicada"/);
 assert.match(html,/<option value="published">Publicada<\/option>/);
 assert.doesNotMatch(html,/Aprovada para utilização futura/);
});

test("manual editor and PDF review reorder ingredients without recreating IDs",()=>{
 assert.match(ui,/function moveRecipeIngredient\(ingredients,index,offset,onMove\)/);
 assert.match(ui,/ingredients\.splice\(next,0,ingredients\.splice\(index,1\)\[0\]\)/);
 assert.match(ui,/ingredientMoveButtons\(section,ii,paintSections\)/);
 assert.match(ui,/ingredientMoveButtons\(section,ii,\(\)=>paintPdfDetail\(recipe,detail\)\)/);
 assert.match(ui,/action\.disabled=delta<0\?index===0:index===section\.ingredients\.length-1/);
 assert.match(ui,/Mover ingrediente para /);
 assert.match(ui,/recipe-ingredient-movers/);
 assert.match(ui,/recipe-move-button/);
 assert.match(ui,/recipe_ref_id:i\.recipe_ref_id\|\|null/);
 assert.match(model,/ingredients_json|sections_json/);
});

test("recipe toolbar filters all displayed metadata and keeps actions secondary",()=>{
 for(const id of ["recipe-search","recipe-filter-category","recipe-filter-type","recipe-filter-status",
                  "recipe-clear-filters","recipe-result-count","recipe-category-toggle"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(ui,/const status=\$\("recipe-filter-status"\)\.value/);
 assert.match(ui,/status===r\.status/);
 assert.doesNotMatch(html,/id="recipe-filter-photo"/);
 assert.doesNotMatch(ui,/recipe-filter-photo/);
 assert.match(html,/class="recipe-table-filter-row"/);
 assert.match(html,/id="recipe-list-body"/);
 assert.match(html,/id="recipe-list-empty"/);
 assert.match(ui,/const host=\$\("recipe-list-body"\);host\.replaceChildren\(\)/);
 assert.match(ui,/recipe-category-cell/);
 assert.match(ui,/recipeCategoryBadge\(r\.category_id,r\.category\)/);
 assert.match(ui,/function recipeCategoryTone\(categoryId\)/);
 assert.match(ui,/norm\(r\.name\)\.includes\(q\)/);
 assert.match(ui,/function activeRecipeFilters\(\)/);
 assert.match(ui,/recipe-clear-filters"\)\.addEventListener\("click"/);
 assert.match(html,/id="recipe-add"[^>]*>\+ Nova<\/button>/);
 assert.match(html,/id="recipe-pdf-toggle"[^>]*aria-label="Importar receitas de PDF"/);
 assert.ok(html.indexOf('id="recipe-category-toggle"')>html.indexOf('class="recipe-library-utilities"'));
});
test("read-only recipe view uses real saved fields and lets linked recipes be opened",()=>{
 for(const id of ["recipe-reader-panel","recipe-reader-back","recipe-reader-edit","recipe-reader-close",
                  "recipe-reader-content","recipe-reader-feedback"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(ui,/button\("Ver",\(\)=>openReadRecipe\(r\.id\),"recipe-view"\)/);
 assert.match(ui,/recipeListIcon\("edit"\)/);
 assert.match(ui,/recipeListIcon\("trash"\)/);
 assert.match(ui,/class="recipe-reader-panel"/);
 assert.match(ui,/async function openReadRecipe\(id,linked=false\)/);
 assert.match(ui,/await request\("\/api\/v2\/recipes\/"\+encodeURIComponent\(id\)\)/);
 assert.match(ui,/recipe\.sections\|\|\[\]/);
 assert.match(ui,/recipe\.steps\|\|\[\]/);
 assert.match(ui,/recipe\.notes\|\|""/);
 assert.match(ui,/recipe\.servings/);
 assert.match(ui,/item\.recipe_ref_id/);
 assert.match(ui,/openReadRecipe\(linkId,true\)/);
 assert.match(ui,/recipeReaderHistory\.pop\(\)/);
 assert.match(ui,/recipe-reader-back"\)\.addEventListener\("click",readerBack\)/);
 assert.match(ui,/recipe-reader-close"\)\.addEventListener\("click",closeReadRecipe\)/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications/);
 assert.match(backend,/if path\.startswith\('\/api\/v2\/recipes'\):\s*if not user: raise Problem\(401, 'unauthorized'\)\s*admin\(user\)/);
});

test("recipe reader typography increases content size while quantities stay subtle",()=>{
 const css=fs.readFileSync("static/admin-recipes.css","utf8");
 assert.match(css,/\.recipe-reader-ingredient\{font-size:14px/);
 assert.match(css,/\.recipe-reader-quantity\{font-size:13px;font-weight:400;color:var\(--recipe-muted\)/);
 assert.match(css,/\.recipe-reader-food\{font-size:14px;font-weight:400/);
 assert.match(css,/\.recipe-reader-ingredient-link\{font-size:14px!important;font-weight:400!important/);
 assert.match(css,/\.recipe-reader-steps li\{font-size:14px/);
 assert.match(css,/\.recipe-reader-notes p\{font-size:14px/);
});

test("table header is also the first interactive filter row, with compact action icons",()=>{
 const start=html.indexOf('id="recipe-library-toolbar"');
 const table=html.indexOf('id="recipe-list"',start);
 const end=html.indexOf('id="recipe-list-body"',table);
 const content=html.slice(table,end);
 assert.ok(start>=0&&table>start&&end>table);
 const toolbar=html.slice(start,table);
 assert.doesNotMatch(toolbar,/id="recipe-search"|id="recipe-filter-category"|id="recipe-filter-type"|id="recipe-filter-status"/);
 assert.match(toolbar,/id="recipe-pdf-toggle"/);
 assert.match(toolbar,/id="recipe-add"/);
 for(const id of ["recipe-filter-category","recipe-search","recipe-filter-type","recipe-filter-status"]){
  assert.ok(content.includes('id="'+id+'"'),id);
 }
 assert.ok(content.indexOf('id="recipe-filter-category"')<content.indexOf('id="recipe-search"'));
 assert.ok(content.indexOf('id="recipe-search"')<content.indexOf('id="recipe-filter-type"'));
 assert.ok(content.indexOf('id="recipe-filter-type"')<content.indexOf('id="recipe-filter-status"'));
 assert.match(ui,/tr\.append\(actions\);host\.append\(tr\)/);
 assert.match(ui,/recipe-icon-button recipe-edit-action/);
 assert.match(ui,/recipe-icon-button recipe-delete/);
 assert.match(ui,/edit\.setAttribute\("aria-label","Editar receita "\+r\.name\)/);
 assert.match(ui,/remove\.setAttribute\("aria-label","Eliminar receita "\+r\.name\)/);
 assert.match(ui,/window\.confirm\("Eliminar definitivamente/);
 assert.doesNotMatch(ui,/v2_weekly_menus|v2_plan_publications/);
});
test("recipe categories keep stable semantic colors and are accessible in both themes",()=>{
 const css=fs.readFileSync("static/admin-recipes.css","utf8");
 assert.match(ui,/\["carne branca","rose"\]/);
 assert.match(ui,/\["carne vermelha","red"\]/);
 assert.match(ui,/recipeCategoryBadge\(recipe\.category_id,recipe\.category\)/);
 assert.match(css,/\.recipe-category-rose\{/);
 assert.match(css,/\.recipe-category-red\{/);
 assert.match(css,/html\[data-admin-theme="light"\] #tm-recipe-library-page \.recipe-category-rose/);
 assert.match(css,/html\[data-admin-theme="light"\] #tm-recipe-library-page \.recipe-category-red/);
 assert.match(css,/\.recipe-table-filter-row input:focus-visible/);
});
