"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");

test("weekly overview has seven columns and equal-height lunch and dinner rows",()=>{
 assert.match(css,/\.tm-menu-week-table\{[\s\S]*?grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
 assert.match(css,/grid-template-rows:auto repeat\(2,minmax\(215px,1fr\)\)!important/);
 assert.match(css,/\.tm-menu-week-table :is\(thead,tbody,tr\)\{\s*display:contents!important/);
 assert.match(css,/\.tm-menu-week-cell\{[\s\S]*?height:100%!important/);
 assert.match(css,/\.tm-menu-week-name>span:last-child\{\s*display:block;overflow-wrap:anywhere;white-space:normal/);
});

test("weekly cards show muted meal labels and visible nutritional color squares",()=>{
 assert.match(js,/button\.dataset\.color=color\|\|"none"/);
 assert.match(js,/mealHeader\.append\(mealHeading,colorBadge\)/);
 assert.match(css,/\.tm-menu-week-meal-label\{[\s\S]*?color:var\(--tm-ui-muted\)!important/);
 assert.match(css,/\.tm-menu-week-color-badge\{[\s\S]*?width:19px;height:19px/);
 assert.doesNotMatch(js,/dot\.className="tm-menu-week-dot"/);
});

test("day editor moves unchanged native controls into a left column and image to the right",()=>{
 assert.match(js,/for\(const field of \[kind,category,dish,freeText,dishFilter,picker,lastUseNote\]\)mealFields\.append\(field\)/);
 assert.match(js,/photoWrap\.append\(preview\);mealLayout\.append\(mealFields,photoWrap\);line\.append\(mealLayout\)/);
 assert.match(js,/mealLayout\.classList\.toggle\("has-menu-photo",show\)/);
 assert.match(css,/\.tm-menu-meal-layout\.has-menu-photo\{\s*grid-template-columns:minmax\(0,1fr\) minmax\(130px,24%\)!important/);
 assert.match(css,/@media\(max-width:680px\)\{[\s\S]*?\.tm-menu-meal-layout\.has-menu-photo\{\s*grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(js,/\?thumb=1&menu=1/);
});

test("day dish-search uses one reliably positioned clear button without native Safari cross",()=>{
 assert.match(js,/clearDishSearch\.className="tm-menu-dish-search-clear"/);
 assert.match(js,/clearDishSearch\.addEventListener\("click",/);
 assert.match(js,/const updateClearDishSearch=\(\)=>\{clearDishSearch\.hidden=!dishSearch\.value;\}/);
 assert.match(css,/\.menu-combobox>input\[type="search"\]::-webkit-search-cancel-button/);
 assert.match(css,/\.menu-combobox>\.tm-menu-dish-search-clear\{/);
 assert.match(css,/\.tm-menu-dish-search-clear\[hidden\]\{\s*display:none!important/);
});

test("week and day assets are cache-bumped",()=>{
 assert.match(html,/admin-microcycles\.js\?v=18319/);
 assert.match(html,/admin-surface-palette\.css\?v=97/);
 assert.doesNotThrow(()=>new Function(js));
});
