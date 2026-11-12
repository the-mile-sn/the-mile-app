"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const main=fs.readFileSync("static/admin-microcycles.css","utf8");
const visual=fs.readFileSync("static/visual-portions.css","utf8");
const light=fs.readFileSync("static/admin-light-theme.css","utf8");
const plans=fs.readFileSync("static/admin-plans-native.css","utf8");
test("matching two-line filters for both libraries",()=>{
 assert.ok(html.includes('class="tm-food-filter-field"'));
 assert.ok(html.includes('class="tm-food-filter-caption">Categoria'));
 assert.ok(html.includes('class="tm-food-filter-caption">Pesquisar'));
 assert.ok(html.includes('id="tm-portion-count" class="tm-portion-count" hidden'));
 assert.ok(main.includes("height:64px;min-height:64px"));
 assert.ok(visual.includes("height:64px;min-height:64px"));
 assert.ok(main.includes("#tm-admin-nav-food-library>span:not(.tm-admin-nav-icon)"));
});
test("mobile plan focus shades the whole card without changing published palettes",()=>{
 assert.ok(plans.includes("Mobile library: hover/selection belongs to the full card"));
 assert.ok(plans.includes("tr.plan-library-legacy-draft"));
 assert.ok(plans.includes("background:transparent!important"));
 assert.ok(plans.includes("background:#fff0bd!important"));
});
test("light planning surfaces and arrows are legible and scoped",()=>{
 assert.ok(light.includes("Planning clarity: restore light surfaces and arrow contrast"));
 assert.ok(light.includes("#calendar-mobile-event-toggle"));
 assert.ok(light.includes("#calendar-prev,#calendar-next"));
 assert.ok(light.includes("#nutrition-weekly-summary"));
 assert.ok(light.includes("#e6ebf2!important"));
 for(const v of ["admin-light-theme.css?v=30","admin-microcycles.css?v=188","visual-portions.css?v=7","admin-plans-native.css?v=7"])assert.ok(html.includes(v));
});
