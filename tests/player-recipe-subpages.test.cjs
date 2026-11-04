"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/player-recipes.js","utf8");
const css=fs.readFileSync("static/player-recipes.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");

test("segment is reserved for the main Menus and Recipes views",()=>{
 assert.match(js,/const secondary=screen\.kind==="list"\|\|screen\.kind==="detail"\|\|screen\.kind==="dish"/);
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
 assert.match(js,/p\.clientX<=38/);
 assert.match(js,/p\.clientX-start\.x<90/);
 assert.match(js,/Math\.abs\(p\.clientY-start\.y\)>65/);
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
 assert.match(js,/\{includePhoto:false,includeTitle:false,includeServings:true,standalone:false\}/);
 assert.doesNotMatch(js,/if\(dishPhotoUrl\)/);
 assert.match(js,/if\(includePhoto&&recipe\.has_photo\)identity\.append\(thumb\(recipe\.id,true\)\)/);
});

test("multiple recipe panels remain expandable and compact",()=>{
 assert.match(js,/const section=node\("details","recipe-accordion"\)/);
 assert.match(js,/section\.addEventListener\("toggle"/);
 assert.match(css,/#menus \.recipe-accordion summary\{/);
 assert.match(css,/min-height:65px/);
});

test("library recipe header places a small photo next to name and portions",()=>{
 assert.match(js,/const identity=node\("div","recipe-identity"\)/);
 assert.match(js,/identity\.append\(copy\)/);
 assert.match(js,/identity\.append\(thumb\(recipe\.id,true\)\)/);
 assert.match(css,/#menus \.recipe-identity\{/);
 assert.match(css,/width:clamp\(76px,23vw,92px\)/);
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
test("multiple linked recipes reuse borderless Assessment-style cards",()=>{
 assert.match(js,/const label=node\("span","recipe-accordion-label"\)/);
 assert.match(js,/label\.append\(node\("strong","",entry\.name\)\)/);
 assert.match(css,/#menus details\.recipe-accordion\{/);
 assert.match(css,/background:#242429;\s*border:0;/);
 assert.match(css,/#menus details\.recipe-accordion>summary:after\{/);
 assert.match(css,/border-width:0 2px 2px 0;/);
});

test("portions only appear after expanding a multi-recipe entry",()=>{
 assert.match(js,/label\.append\(node\("strong","",entry\.name\)\)/);
 assert.doesNotMatch(js,/label\.append\(node\("strong","",entry\.name\),node\("small"/);
 assert.match(js,/includeServings:true,standalone:false/);
 assert.match(js,/if\(includeServings\)copy\.append\(node\("div","recipe-servings"/);
});
test("the final ingredient does not have a divider",()=>{
 assert.match(css,/#menus \.recipe-content-section \.recipe-ingredient:last-child\{\s*border-bottom:0;/);
 assert.match(css,/border-bottom:1px solid rgba\(255,255,255,\.09\)/);
});

test("section headings have quiet grayscale icon tiles and medium weight",()=>{
 assert.match(js,/const tile=node\("span","recipe-icon-tile"\)/);
 assert.match(js,/tile\.append\(sectionIcon\(kind\)\)/);
 assert.match(css,/#menus \.recipe-section-title > \.recipe-icon-tile\{/);
 assert.match(css,/background:#222228;/);
 assert.match(css,/color:#b8b8c0;/);
 assert.match(css,/font-weight:var\(--mile-type-medium,500\);/);
});
test("library photo aligns to the top of recipe name; menu-linked details remain photoless",()=>{
 assert.match(css,/#menus \.recipe-identity\{\s*align-items:flex-start;/);
 assert.match(js,/\{includePhoto:false\}/);
 assert.match(js,/includePhoto:false,includeTitle:false,includeServings:true,standalone:false/);
 assert.match(css,/border-bottom:1px solid rgba\(255,255,255,\.045\)/);
});

test("final heading hierarchy is smaller in every recipe detail",()=>{
 const finalRules=css.slice(css.lastIndexOf("/* Recipe-only visual finish:"));
 assert.match(css.slice(css.lastIndexOf("/* Menus: photo enlargement")),/#menus \.recipe-content-section \.recipe-section-title\{\s*font-size:14px;/);
 assert.match(finalRules,/font-weight:var\(--mile-type-medium,500\)/);
 assert.doesNotMatch(finalRules,/#tabs[\s.{>]/);
});

test("multiple-recipe insets match the dark Assessment expanded inset",()=>{
 const finalRules=css.slice(css.lastIndexOf("/* Recipe-only visual finish:"));
 assert.match(finalRules,/#menus details\.recipe-accordion \.recipe-content-section\{\s*background:#1b1b20;/);
 assert.match(css,/#menus details\.recipe-accordion\{[\s\S]*?background:#242429;/);
 assert.match(js,/\{includePhoto:false,includeTitle:false,includeServings:true,standalone:false\}/);
});

test("the library image gets optical top alignment only in standalone details",()=>{
 const finalRules=css.slice(css.lastIndexOf("/* Recipe-only visual finish:"));
 assert.match(finalRules,/#menus \.recipe-detail-standalone \.recipe-identity \.recipe-detail-photo\{\s*margin-top:7px;/);
 assert.doesNotMatch(finalRules,/#menus details\.recipe-accordion \.recipe-detail-photo/);
 assert.match(js,/if\(includePhoto&&recipe\.has_photo\)identity\.append\(thumb\(recipe\.id,true\)\)/);
});

test("menu dish photos always open the same zoom, independent of recipes",()=>{
 const player=readFileSync(join(__dirname,"../static/jogador-v2.js"),"utf8");
 assert.match(player,/const activate=\(\)=>openDishPhoto\(src,photo.alt\)/);
 assert.doesNotMatch(player,/recipeCount>0&&window\.themileRecipes/);
 assert.match(player,/photo\.setAttribute\("aria-label","Ampliar fotografia: "\+photo.alt\)/);
});
test("only dishes with linked recipes get a separate recipe action",()=>{
 const player=readFileSync(join(__dirname,"../static/jogador-v2.js"),"utf8");
 assert.match(player,/if\(Number\(dish\.recipe_count\|\|0\)>0\)/);
 assert.match(player,/recipeAction\.textContent=Number\(dish\.recipe_count\|\|0\)>1\?"Ver receitas":"Ver receita"/);
 assert.match(player,/window\.themileRecipes\.openDish\(dish.id,menu.value\)/);
 assert.match(player,/dish-photo-zoom/);
});
