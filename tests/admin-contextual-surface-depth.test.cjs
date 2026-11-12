const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const guide=fs.readFileSync("docs/GUIA_VISUAL_BACKOFFICE.md","utf8");
const html=["admin-microcycles.html","create-plan.html","food-library.html"].map(path=>fs.readFileSync("static/"+path,"utf8"));
const context=css.slice(css.lastIndexOf("/* ================================================================\n   CONTEXTUAL SURFACE DEPTH"));
test("three context-specific field surfaces for both themes",()=>{
 assert.match(context,/--tm-ui-field-on-page:#15161a/);
 assert.match(context,/--tm-ui-field-on-card:#1e2025/);
 assert.match(context,/--tm-ui-field-on-subcard:#282b33/);
 assert.match(context,/--tm-ui-field-on-page:#ffffff/);
 assert.match(context,/--tm-ui-field-on-card:#f0f2f6/);
 assert.match(context,/--tm-ui-field-on-subcard:#e5ebf2/);
});
test("subcard fields are subtly blue, while card fields take subcard fill",()=>{
 assert.match(context,/#tm-food-library-page \.tm-portion-catalog-header \.tm-portion-filters/);
 assert.match(context,/#tm-plan-page #plan-entry \.plan-library-filters/);
 assert.match(context,/#tm-recipe-library-page \.recipe-library-toolbar/);
 assert.match(context,/#tm-players-page \.tm-players-list-surface \.tm-players-table thead/);
 assert.match(context,/#tm-food-library-page \.food-catalog-table \.food-filter-row/);
 assert.match(context,/#tm-recipe-library-page \.recipe-table-filter-row/);
 assert.match(context,/#menus-panel #profile-recipe-category-search/);
 assert.match(context,/background:var\(--tm-ui-field-on-page\)!important/);
 assert.match(context,/background:var\(--tm-ui-field-on-card\)!important/);
 assert.match(context,/background:var\(--tm-ui-field-on-subcard\)!important/);
});
test("no new outlines shadows or changed semantic selection states",()=>{
 assert.doesNotMatch(context,/border\s*:\s*1px/);
 assert.doesNotMatch(context,/box-shadow:\s*0\s+\d/);
 assert.doesNotMatch(context,/\.tm-db-general-pending\{/);
 assert.doesNotMatch(context,/\.meal-vp\{/);
 assert.match(context,/font-size:16px!important/);
});
test("docs and all entrypoints reflect the contextual design",()=>{
 for(const s of html)assert.match(s,/admin-surface-palette\.css\?v=9/);
 assert.match(guide,/Regra contextual de superfície/);
 assert.match(guide,/--tm-ui-field-on-page/);
 assert.match(guide,/--tm-ui-field-on-card/);
 assert.match(guide,/--tm-ui-field-on-subcard/);
});
