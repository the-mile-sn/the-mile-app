const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("recent forms scroll at two complete rows on mobile or four on desktop",()=>{
 assert.match(js,/const visibleCount=window\.matchMedia\("\(max-width:650px\)"\)\.matches\?2:4/);
 assert.match(js,/getBoundingClientRect\(\)\.height/);
 assert.match(js,/--tm-db-recent-max-height/);
 assert.match(js,/recentHost\.classList\.add\("is-scrollable"\)/);
 assert.match(js,/recentHost\.setAttribute\("tabindex","0"\)/);
 assert.match(css,/#tm-dashboard \.tm-db-today-recent #tm-db-recent\.is-scrollable\{/);
 assert.match(css,/scroll-snap-type:y proximity/);
 assert.match(css,/scroll-snap-align:start/);
});
test("all form responses remain navigable, with no old disclosure controls",()=>{
 assert.doesNotMatch(js,/tm-db-recent-expand|tm-db-form-extra|recentPanel\.classList\.toggle/);
 assert.doesNotMatch(css,/tm-db-recent-expand|tm-db-form-extra/);
 assert.doesNotMatch(html,/tm-db-recent-expand/);
 assert.match(js,/else for\(const item of recent\)/);
 assert.match(js,/openClinical\("forms"/);
 assert.match(html,/admin-microcycles\.css\?v=213/);
 assert.match(html,/admin-dashboard\.js\?v=92/);
});
