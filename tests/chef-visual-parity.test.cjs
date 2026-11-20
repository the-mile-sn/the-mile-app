"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/chef.html","utf8");
const css=fs.readFileSync("static/chef.css","utf8");
const js=fs.readFileSync("static/chef.js","utf8");
const guide=fs.readFileSync("docs/GUIA_VISUAL_APP_CHEFS.md","utf8");

test("Chef and Player share a system font, tokens and dark palette with no remote font dependency",()=>{
 assert.doesNotMatch(html,/fonts\.googleapis\.com|Inter\+Tight/);
 assert.doesNotMatch(css,/Inter Tight/);
 assert.match(css,/--mile-app-font:-apple-system,BlinkMacSystemFont/);
 for(const [bg,ink] of [["#54281B","#FFA078"],["#493713","#FFD76F"],["#193F60","#8DD0FF"],["#174631","#77E3A4"],["#10251A","#4E996B"]]){
  assert.ok(css.includes(bg)&&css.includes(ink),bg+" Chef colour pair");
 }
 assert.equal((css.match(/\/\* THE MILE \/ Chef — canonical dark App foundation/g)||[]).length,1);
 assert.doesNotMatch(css,/background:#fafafa|background:#fafafb/);
 assert.match(html,/chef\.css\?v=14/);
});

test("Chef login retains its identities, safe password fields and player floating labels",()=>{
 assert.match(html,/class="mile-floating-field" for="username"/);
 assert.match(html,/class="mile-floating-input" id="username" name="identifier"/);
 assert.match(html,/class="mile-floating-field" for="password"/);
 assert.match(html,/class="mile-floating-input" id="password" name="password" type="password"/);
 assert.match(html,/id="password-label"/);
 assert.match(html,/autocomplete="current-password"/);
 assert.match(css,/label\.mile-floating-field\{[^}]*height:64px/);
 assert.match(css,/border-radius:20px;background:#242429/);
 assert.match(css,/top:9px;transform:translateY\(0\);font-size:12px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(js,/el\("password-label"\)\.textContent=txt\(\)\.password/);
});

test("canonical compact card measures preserve Chef lunch/dinner preview and inline single-option",()=>{
 assert.match(css,/\.chef-meal-card\{[^}]*border-radius:var\(--mile-radius-card\)/);
 assert.match(css,/\.chef-meal-card\[open\]\{border-radius:var\(--mile-radius-open\)\}/);
 assert.match(css,/\.chef-meal-head\{[^}]*min-height:var\(--mile-card-header\)/);
 assert.match(css,/\.chef-meal-heading>strong\{[^}]*font-size:16px;[^}]*font-weight:var\(--mile-type-regular\)/);
 assert.match(css,/\.chef-meal-icon\{[^}]*width:var\(--mile-card-icon\);height:var\(--mile-card-icon\)/);
 assert.match(css,/\.chef-week-cell\{[^}]*min-height:76px/s);
 assert.match(css,/\.chef-option-food\{[^}]*font-weight:400/);
 assert.match(js,/if\(!onlyPrescription&&\(meal==="lunch"\|\|meal==="dinner"\)\)\{/);
 assert.match(js,/appendChefMenuDish\(preview,plannedMenu\(date,meal\),txt\(\)\.pending\)/);
 assert.match(js,/if\(options\.length===1\)\{/);
 assert.match(js,/const inline=node\("div","chef-single-option"\)/);
 assert.match(js,/chefOptionCards\(date,meal\)/);
});

test("image skeleton is conditional and does not change Chef photo zoom/error policy",()=>{
 assert.match(js,/photo\.addEventListener\("load",\(\)=>frame\.classList\.remove\("chef-photo-pending"\)/);
 assert.match(js,/if\(photo\.complete&&photo\.naturalWidth>0\)frame\.classList\.remove/);
 assert.match(js,/photo\.onerror=\(\)=>frame\.remove\(\)/);
 assert.match(js,/frame\.onclick=event=>/);
 assert.match(css,/\.chef-dish-photo-frame\.chef-photo-pending::before/);
 assert.match(css,/animation:chef-photo-shimmer 1\.5s ease-in-out infinite/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.chef-dish-photo-frame\.chef-photo-pending::after\{animation:none\}\}/);
});

test("visual changes keep role-scoped Chef endpoints, four tabs and edit rules intact",()=>{
 for(const fragment of ["/api/v2/chef/me","/api/v2/chef/plans","/api/v2/chef/calendar","/api/v2/chef/menus","/api/v2/chef/menu-executions","/api/v2/chef/preferences"]){
  assert.ok(js.includes(fragment),fragment);
 }
 assert.match(js,/previewReadOnly&&method!=="GET"/);
 assert.match(js,/if\(!previewReadOnly&&key>=dateKey\(new Date\(\)\)\)/);
 assert.match(js,/if\(chefViewMode==="week"\)renderChefWeekly\(root\);else renderChefDaily\(root\)/);
 for(const tab of ["home","plans","menus","profile"])assert.match(html,new RegExp('data-tab="'+tab+'"'));
 assert.match(js,/el\("chef-nav"\)\.querySelectorAll\("\[data-tab\]"\)/);
 assert.match(guide,/validação visual em iPhone e desktop \*\*pendente\*\*/);
});
