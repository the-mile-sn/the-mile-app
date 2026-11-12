"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const nav=fs.readFileSync("static/admin-nav-shell.js","utf8");
const mobile=fs.readFileSync("static/admin-mobile-nav.js","utf8");
const admin=fs.readFileSync("static/admin-dashboard.js","utf8");
const visual=fs.readFileSync("static/visual-portions.js","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const visualCss=fs.readFileSync("static/visual-portions.css","utf8");
test("food library has two submenu destinations",()=>{
 for(const name of ["tm-admin-food-subnav","tm-admin-nav-foods","tm-admin-nav-visual-portions"])assert.ok(nav.includes(name));
 assert.ok(nav.includes('"foods","visual-portions"'));
 assert.ok(mobile.includes("foodExpanded"));
 assert.ok(mobile.includes("foods.hidden=!foodExpanded"));
 assert.ok(admin.includes('foodPortionsBtn.addEventListener("click",()=>openFoodLibrary("portions"))'));
 assert.ok(admin.includes('foodFoodsBtn.addEventListener("click",()=>openFoodLibrary("foods"))'));
 assert.ok(admin.includes('window.tmShowAdminFoodLibrarySection?.(selected)'));
});
test("portions catalogue stays functional without legacy switch and testing controls",()=>{
 assert.ok(!html.includes('class="tm-portion-tabs"'));
 assert.ok(html.includes('class="tm-portion-toolbar" hidden aria-hidden="true"'));
 assert.ok(html.includes('class="tm-portion-plan-preview" hidden aria-hidden="true"'));
 for(const name of ["tm-portion-file","tm-portion-preview-toggle","tm-portion-grid","tm-portion-search","tm-portion-category"])assert.ok(html.includes('id="'+name+'"'));
 assert.ok(visual.includes("window.tmShowAdminFoodLibrarySection=mode"));
 assert.ok(visual.includes('window.tmOpenAdminFoodLibrary("portions")'));
 assert.ok(visual.includes('"/api/v2/visual-portions/"'));
 assert.ok(visual.includes('toggle.addEventListener("click",async()=>'));
 assert.ok(html.includes('class="tm-portion-catalog-header"'));
 assert.ok(visualCss.includes(".tm-portion-catalog-header"));
 assert.ok(css.includes("#tm-admin-food-subnav"));
});
test("navigation assets use matching cache versions",()=>{
 for(const ver of ["admin-nav-shell.js?v=4","admin-dashboard.js?v=66","admin-mobile-nav.js?v=10","visual-portions.js?v=4","admin-microcycles.css?v=186","visual-portions.css?v=6"])assert.ok(html.includes(ver));
});
