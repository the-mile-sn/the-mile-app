"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/player-recipes.js","utf8");
const css=fs.readFileSync("static/player-recipes.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");

test("segment is reserved for the main Menus and Recipes views",()=>{
 assert.match(js,/const secondary=\["list","detail","dish","dish-detail"\]\.includes\(screen\.kind\)/);
 assert.match(js,/switcher\.hidden=secondary/);
 assert.match(js,/screen=\{kind:"categories"\};renderCategories/);
});

test("subpages use only back navigation, without duplicate titles or recipe count",()=>{
 assert.match(js,/function goBack\(callback\)/);
 assert.doesNotMatch(js,/goBack\(group\.name/);
 assert.doesNotMatch(js,/goBack\("Receita"/);
 assert.doesNotMatch(js,/goBack\(dishName/);
 assert.match(js,/root\.append\(goBack\(/);
 assert.match(js,/if\(includeTitle\)copy\.append\(node\("h2","",recipe\.name/);
});

test("recipe body retains ingredient values, portions and plain numbered steps",()=>{
 assert.match(js,/\[entry\.quantity,entry\.unit\]\.filter\(Boolean\)\.join\(" "\)/);
 assert.match(js,/recipe\.servings/);
 assert.match(js,/recipe-step-number/);
 assert.match(css,/#menus \.recipe-detail-photo\{/);
 assert.match(css,/height:clamp\(76px,23vw,92px\)/);
});

test("back swipe is edge-only and does not capture ordinary vertical scrolling",()=>{
 assert.match(js,/p\.clientX<=Math\.min\(145,window\.innerWidth\*\.4\)/);
 assert.match(js,/dx<72/);
 assert.match(js,/Math\.abs\(dy\)>55/);
 assert.match(js,/restoreScroll\(listScroll\)/);
 assert.match(js,/restoreScroll\(categoryScroll\)/);
 assert.match(js,/restoreScroll\(returnScroll\)/);
});

test("bottom navigation remains in original layout",()=>{
 assert.match(html,/<nav id="tabs"/);
 assert.match(html,/<button data-tab="menus"/);
 assert.match(html,/<div id="player-recipes-area" hidden><\/div>/);
 assert.doesNotMatch(css,/#tabs\s*\{/);
});

test("menu-linked recipe details omit duplicate photographs and titles",()=>{
 assert.match(js,/\{includePhoto:false\}/);
 assert.match(js,/\{includePhoto:false\}/);
 assert.doesNotMatch(js,/if\(dishPhotoUrl\)/);
 assert.match(js,/if\(includePhoto&&recipe\.has_photo&&!showHero\)identity\.append\(thumb\(recipe\.id,true\)\)/);
});

test("multi-recipe dish opens a separate list with library-style cards",()=>{
 assert.match(js,/const list=node\("div","recipe-list"\)/);
 assert.match(js,/card\(entry\.name,"",entry\.has_photo\?entry\.id:null/);
 assert.match(js,/screen=\{kind:"dish-detail",dishId,dishName,entries,recipeId:entry\.id\}/);
 assert.doesNotMatch(js,/const section=node\("details","recipe-accordion"\)/);
});

test("library recipe displays a 170-190px hero above the full-width page title",()=>{
 assert.match(js,/const showHero=standalone&&includePhoto&&includeTitle&&recipe\.has_photo/);
 assert.match(js,/const hero=thumb\(recipe\.id,true\)/);
 assert.match(js,/hero\.classList\.add\("recipe-hero"\)/);
 assert.match(js,/hero\.loading="eager"/);
 const code=js.slice(js.indexOf("function detail("),js.indexOf("async function loadDetail("));
 assert.ok(code.indexOf("root.append(hero)")<code.indexOf('const identity=node("div","recipe-identity")'));
 assert.match(css,/#menus \.recipe-detail-standalone > \.recipe-hero\{[^}]*width:100%;[^}]*height:clamp\(170px,46vw,190px\);[^}]*object-fit:cover;[^}]*border-radius:18px;/s);
 assert.match(css,/#menus \.recipe-detail-standalone \.recipe-identity\{[^}]*min-height:0;/s);
 assert.match(css,/#menus \.recipe-identity h2\{[^}]*font-size:clamp\(21px,5\.3vw,23px\);[^}]*font-weight:var\(--mile-type-semibold,600\)/s);
 assert.match(html,/player-recipes\.css\?v=22/);
 assert.match(html,/player-recipes\.js\?v=14/);
});
test("recipe sections have subtle cards and separated ingredients",()=>{
 assert.match(js,/sectionTitle\("Ingredientes","ingredients"\)/);
 assert.match(js,/sectionTitle\("Preparação","preparation"\)/);
 assert.match(js,/sectionTitle\("Dicas úteis","tips"\)/);
 assert.match(js,/if\(recipe\.notes&&recipe\.notes\.trim\(\)\)/);
 assert.match(css,/#menus \.recipe-content-section \.recipe-ingredient\{/);
 assert.match(css,/border-bottom:1px solid rgba\(255,255,255,\.09\)/);
 assert.match(css,/#menus \.recipe-content-section\{/);
 assert.match(css,/background:rgba\(255,255,255,\.035\);\s*border:0;\s*box-shadow:none;/);
});
test("multi-recipe cards reuse the library card styling and thumbnails",()=>{
 assert.match(js,/function card\(name,small,photoId,callback\)/);
 assert.match(js,/button\.append\(thumb\(photoId\)\)/);
 assert.match(js,/button\.append\(info,node\("span","recipe-chevron","›"\)\)/);
 assert.match(css,/#menus \.recipe-item\{/);
});

test("multi-recipe list omits portions, detail preserves portions without photo",()=>{
 assert.match(js,/card\(entry\.name,"",entry\.has_photo\?entry\.id:null/);
 assert.match(js,/loadDetail\(state\.recipeId,content,/);
 assert.match(js,/\{includePhoto:false\}/);
 assert.match(js,/if\(includeServings\)copy\.append\(node\("div","recipe-servings"/);
});
test("the final ingredient does not have a divider",()=>{
 assert.match(css,/#menus \.recipe-content-section \.recipe-ingredient:last-child\{\s*border-bottom:0;/);
 assert.match(css,/border-bottom:1px solid rgba\(255,255,255,\.09\)/);
});

test("section headings have grayscale icon tiles and universal 16px/400 type",()=>{
 assert.match(js,/const tile=node\("span","recipe-icon-tile"\)/);
 assert.match(js,/tile\.append\(sectionIcon\(kind\)\)/);
 assert.match(css,/#menus \.recipe-section-title > \.recipe-icon-tile\{/);
 assert.match(css,/background:#222228;/);
 assert.match(css,/color:#b8b8c0;/);
 assert.match(css,/#menus \.recipe-content-section \.recipe-section-title\{\s*display:flex;\s*align-items:center;\s*gap:11px;\s*margin:0 0 10px;\s*font-size:16px;\s*font-weight:var\(--mile-type-card-title,400\);/);
 assert.equal((css.match(/#menus \.recipe-content-section \.recipe-section-title\{/g)||[]).length,1);
});
test("menu-linked recipes remain photo-free and preserve the existing return behavior",()=>{
 assert.match(js,/loadDetail\(entries\[0\]\.id,detailRoot,[\s\S]*?\{includePhoto:false\}\)/);
 assert.match(js,/loadDetail\(state\.recipeId,content,[\s\S]*?\{includePhoto:false\}\)/);
 assert.match(js,/const showHero=standalone&&includePhoto&&includeTitle&&recipe\.has_photo/);
 assert.match(js,/if\(includePhoto&&recipe\.has_photo&&!showHero\)identity\.append\(thumb\(recipe\.id,true\)\)/);
 assert.match(css,/border-bottom:1px solid rgba\(255,255,255,\.045\)/);
 assert.match(js,/restoreScroll\(returnScroll\)/);
});
test("final heading hierarchy is smaller in every recipe detail",()=>{
 const finalRules=css.slice(css.lastIndexOf("/* Recipe-only visual finish:"));
 assert.match(css,/#menus \.recipe-content-section \.recipe-section-title\{[^}]*font-size:16px;[^}]*font-weight:var\(--mile-type-card-title,400\);/s);
 assert.match(css,/#menus \.recipe-identity h2\{[^}]*font-size:clamp\(21px,5\.3vw,23px\);[^}]*font-weight:var\(--mile-type-semibold,600\);/s);
 assert.doesNotMatch(finalRules,/#tabs[\s.{>]/);
});

test("multi-recipe dish has explicit back navigation and preserves menu scroll",()=>{
 assert.match(js,/function renderDishList\(entries\)/);
 assert.match(js,/function renderDishDetail\(\)/);
 assert.match(js,/restoreScroll\(dishListScroll\)/);
 assert.match(js,/restoreScroll\(returnScroll\)/);
 assert.match(js,/\["list","detail","dish","dish-detail"\]\.includes\(screen\.kind\)/);
});

test("hero replaces the previous inline photo offset without altering recipe body",()=>{
 assert.equal((css.match(/#menus \.recipe-detail-standalone > \.recipe-hero\{/g)||[]).length,1);
 assert.doesNotMatch(css,/#menus \.recipe-detail-standalone \.recipe-identity \.recipe-detail-photo\{/);
 assert.match(js,/if\(showHero\)\{\s*const hero=thumb\(recipe\.id,true\)/);
 assert.match(js,/if\(includePhoto&&recipe\.has_photo&&!showHero\)identity\.append\(thumb\(recipe\.id,true\)\)/);
 assert.match(js,/ingredientList\(ingredients,recipe\.sections\)/);
 assert.match(js,/sectionTitle\("Preparação","preparation"\)/);
});
test("menu dish photos always open the same zoom, independent of recipes",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/const activate=\(\)=>openDishPhoto\(src,photo.alt\)/);
 assert.doesNotMatch(player,/recipeCount>0&&window\.themileRecipes/);
 assert.match(player,/photo\.setAttribute\("aria-label","Ampliar fotografia: "\+photo.alt\)/);
});
test("only dishes with linked recipes get a separate recipe action",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/if\(Number\(dish\.recipe_count\|\|0\)>0\)/);
 assert.match(player,/recipeAction\.textContent=Number\(dish\.recipe_count\|\|0\)>1\?"Ver receitas":"Ver receita"/);
 assert.match(player,/window\.themileRecipes\.openDish\(dish.id,menu.value\)/);
 assert.match(player,/dish-photo-zoom/);
});

test("zoom icon remains a rounded square and gets softer translucent fill",()=>{
 assert.match(css,/#menus \.menu-entry-body \.dish-photo-zoom\{/);
 assert.match(css,/border-radius:8px;/);
 assert.match(css,/background:rgba\(18,18,21,\.43\)/);
});

test("menu recipe action is slightly smaller, separated and provides pressed feedback",()=>{
 const refinements=css.slice(css.lastIndexOf("/* Small, more detached recipe CTA"));
 assert.match(refinements,/margin-top:6px;/);
 assert.match(refinements,/min-height:24px;/);
 assert.match(refinements,/font-size:11px;/);
 assert.match(refinements,/:active\{/);
 assert.match(refinements,/background:rgba\(255,255,255,\.18\)/);
 assert.match(refinements,/prefers-reduced-motion:reduce/);
 assert.match(html,/player-recipes\.css\?v=[^"\s]+/);
});

test("menu recipe pressed state is applied on initial touch and survives until navigation",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/recipeAction\.addEventListener\("pointerdown",press\)/);
 assert.match(player,/recipeAction\.addEventListener\("touchstart",press,\{passive:true\}\)/);
 assert.match(player,/recipeAction\.classList\.add\("is-pressed"\)/);
 assert.match(player,/window\.setTimeout\(\(\)=>\{/);
 assert.match(css,/#menus \.menu-entry-body \.menu-view-recipe\.is-pressed\{/);
 assert.match(css,/#menus \.menu-entry-body \.dish-photo-zoom\{\s*border:0!important;/);
 assert.match(html,/jogador-v2\.js\?v=[^"\s]+/);
});

test("recipe subpages support left-edge swipe and horizontal page transitions",()=>{
 assert.match(js,/p\.clientX<=Math\.min\(145,window\.innerWidth\*\.4\)/);
 assert.match(js,/dx<72/);
 assert.match(js,/function showRecipePage\(root\)/);
 assert.match(js,/back\.onclick=callback/);
 assert.match(css,/animation:recipe-subpage-enter 500ms/);
 assert.match(css,/animation:recipe-subpage-leave 380ms/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/player-recipes\.css\?v=[^"\s]+/);
 assert.match(html,/player-recipes\.js\?v=[^"\s]+/);
});

test("menu CTA cleans pressed state before showing a subpage; resting state has no border",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/const clearPress=\(\)=>\{recipeAction\.classList\.remove\("is-pressed"\);recipeAction\.blur\(\);\}/);
 assert.match(player,/recipeAction\.dataset\.navigating="false"/);
 assert.match(css,/border:0!important;/);
 assert.match(css,/background:rgba\(255,255,255,\.105\)/);
 assert.match(css,/background:rgba\(255,255,255,\.25\)!important/);
});
test("swipe is captured from the outer gutter, preserves vertical scrolling, and returns quickly",()=>{
 assert.match(js,/document\.addEventListener\("touchstart"/);
 assert.match(js,/document\.addEventListener\("touchmove"/);
 assert.match(js,/passive:false,capture:true/);
 assert.match(js,/event\.cancelable\)event\.preventDefault\(\)/);
 assert.doesNotMatch(js,/window\.setTimeout\(finish,245\)/);
 assert.match(css,/animation-duration:180ms;/);
 assert.match(html,/player-recipes\.js\?v=[^"\s]+/);
});

test("recipe subpage return has no extra animation delay",()=>{
 assert.match(js,/back\.onclick=callback/);
 assert.doesNotMatch(js,/page\.classList\.add\("recipe-page-leave"\)/);
 assert.match(js,/if\(back&&!back\.hidden\)back\.click\(\)/);
});

test("menu recipe pill uses a dark resting surface close to the zoom tile",()=>{
 const finalCss=css.slice(css.lastIndexOf("/* Recipe CTA: dark translucent fill"));
 assert.match(finalCss,/background:rgba\(11,14,17,\.22\)/);
 assert.match(finalCss,/border:0!important/);
 assert.match(finalCss,/background:rgba\(8,10,13,\.56\)!important/);
 assert.match(html,/player-recipes\.css\?v=[^"\s]+/);
});

test("recipe back action lives in the shared The Mile header with no blank content row",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(html,/<header class="player-top"><button type="button" id="recipe-header-back" class="recipe-header-back" aria-label="Voltar" hidden>‹<\/button><div class="player-header-brand"/);
 assert.match(js,/const headerBack=document\.getElementById\("recipe-header-back"\)/);
 assert.match(js,/const back=headerBack;\s*back\.onclick=callback;/);
 assert.match(js,/return document\.createDocumentFragment\(\)/);
 assert.doesNotMatch(js,/node\("div","recipe-topline"\)/);
 assert.doesNotMatch(js,/node\("button","recipe-back"/);
 assert.match(css,/\.player-top > #recipe-header-back\{/);
 assert.match(css,/position:absolute;/);
 assert.match(css,/inset-inline-start:0;/);
 assert.match(css,/top:50%;/);
 assert.match(player,/window\.themileRecipes\?\.syncHeaderBack\?\.\(\)/);
 assert.match(js,/headerBack\.hidden=!\(subpage&&!document\.getElementById\("menus"\)\.hidden/);
 assert.match(js,/if\(!secondary\)headerBack\.onclick=null/);
 assert.match(js,/syncHeaderBack\};/);
});
