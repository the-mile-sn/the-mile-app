"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const visual=fs.readFileSync("static/visual-portions.css","utf8");
const light=fs.readFileSync("static/admin-light-theme.css","utf8");
test("both catalogues present category before search and align controls",()=>{
 const foods=html.indexOf('id="category"'),foodsSearch=html.indexOf('id="search"');
 const portions=html.indexOf('id="tm-portion-category"'),portionsSearch=html.indexOf('id="tm-portion-search"');
 assert.ok(foods>=0&&foodsSearch>foods);
 assert.ok(portions>=0&&portionsSearch>portions);
 assert.match(visual,/grid-template-columns:minmax\(0,35%\) minmax\(0,1fr\)/);
 assert.match(css,/\.tm-food-filter-field :is\(input,select\)/);
});
test("search clear stays anchored to player input in all viewports",()=>{
 assert.match(css,/#tm-admin-legacy \.tm-planning-search-wrap > \.tm-search-clear/);
 assert.match(css,/left:auto!important;right:10px!important/);
 assert.match(css,/top:50%!important;transform:translateY\(-50%\)!important/);
});
test("desktop event section rises without altering the mobile height",()=>{
 assert.match(css,/@media\(min-width:831px\)/);
 assert.match(css,/#tm-admin-legacy #status:empty\{display:none!important/);
 assert.match(css,/#calendar-section #calendar-mobile-event-toggle\{[\s\S]*?min-height:67px!important/);
});
test("selected light-mode day has a blue cue while off/match colors remain semantic",()=>{
 assert.match(light,/\.calendar-day\.calendar-selected:not\(\.calendar-today\)/);
 assert.match(light,/outline:2px solid #78a7d0!important/);
 assert.match(light,/\.calendar-selected\.calendar-today/);
 assert.match(light,/:not\(\.calendar-match\):not\(\.calendar-off\)/);
 assert.match(light,/\.tm-planning-unified-header\{/);
 assert.match(light,/background:#e5ebf2!important/);
 for(const name of ["admin-microcycles.css?v=189","admin-light-theme.css?v=31","visual-portions.css?v=7"])assert.ok(html.includes(name));
});
