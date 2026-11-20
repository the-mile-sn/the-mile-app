const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");

test("subtle calendar shortcuts retain booking navigation and accessible names",()=>{
 for(const id of ["tm-db-miniagenda-new","tm-db-miniagenda-open"]){
  assert.match(html,new RegExp('id="'+id+'"[^>]*aria-label="'));
 }
 assert.match(css,/width:40px;height:40px;min-height:40px/);
 assert.match(css,/border:0;border-radius:50%/);
 assert.match(css,/width:42px;height:42px;min-height:42px/);
 assert.match(js,/\$\("tm-db-miniagenda-new"\)\.dataset\.bookingHref=bookingsLink\(day,true\)/);
 assert.match(js,/\$\("tm-db-miniagenda-open"\)\.href=bookingsLink\(day\)/);
});

test("scroll prompts only show for overflow, and can advance lists accessibly",()=>{
 assert.match(html,/id="tm-db-miniagenda-more" class="tm-db-scroll-hint" aria-controls="tm-db-miniagenda-bookings"/);
 assert.match(html,/id="tm-db-recent-more" class="tm-db-scroll-hint" aria-controls="tm-db-recent"/);
 assert.match(js,/list\.classList\.contains\("is-scrollable"\)/);
 assert.match(js,/list\.scrollHeight-list\.clientHeight-list\.scrollTop>3/);
 assert.match(js,/list\.scrollBy\(/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(css,/\.tm-db-scroll-hint\[hidden\]\{display:none!important\}/);
});

test("game identity survives with restrained dark and light outlines",()=>{
 assert.match(css,/color-mix\(in srgb,#78d4a0 25%,transparent\)/);
 assert.match(css,/color-mix\(in srgb,#70c18f 25%,transparent\)/);
 assert.doesNotMatch(css,/color:#dcf3e4;border:1px solid #78d4a0/);
 assert.match(html,/admin-microcycles\.css\?v=213/);
 assert.match(html,/admin-dashboard\.js\?v=92/);
});
