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
 assert.match(html,/chef\.css\?v=15/);
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
 assert.match(js,/chefOptionCards\(date,meal,colorOverride\)/);
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

test("Planos follows published nutritional colours, not only the selected day's colour",()=>{
 assert.match(js,/function publishedChefColors\(\)/);
 assert.match(js,/validColors\.filter\(color=>mealOrder\.some/);
 assert.match(js,/prescriptions\[color\]\?\.\[meal\]/);
 assert.match(js,/chefPlanSelectedColor=null/);
 assert.match(js,/node\("button","chef-plan-category"\)/);
 assert.match(js,/renderChefMeal\(date,meal,false,true,chefPlanSelectedColor\)/);
 assert.match(js,/function chefOptionCards\(date,meal,colorOverride=null\)/);
 assert.match(js,/function renderChefMeal\(date,meal,expanded=false,onlyPrescription=false,colorOverride=null\)/);
 assert.match(js,/chefPlanSelectedColor=null;render\(\)/);
 assert.doesNotMatch(js,/function renderPlan\(root\)\{\s*const date=dateKey\(selectedDay\);/);
 assert.match(css,/\.chef-plan-category\{[^}]*min-height:61px/);
 assert.match(guide,/**Planos \(estrutura corrigida\):**/);
});

test("Menus uses a compact 38px switch and real week navigation without a duplicated day strip",()=>{
 assert.match(css,/\.chef-view-mode,\.chef-menu-switch\{[^}]*height:38px;min-height:38px/);
 assert.match(css,/\.chef-view-mode button,\.chef-menu-switch button\{[^}]*height:32px;min-height:32px/);
 assert.match(js,/function renderChefMenuWeekNavigation\(root\)/);
 assert.match(js,/renderChefMenuWeekNavigation\(root\)/);
 assert.match(js,/selectedDay=shift\(selectedDay,delta\*7\)/);
 assert.match(js,/if\(activeTab==="menus"&&!target\.closest\?\.\("\.chef-menu-week-navigation"\)\)return/);
 assert.doesNotMatch(js,/renderChefMenuDateStrip|chef-menu-week-strip|chef-menu-week-day/);
 assert.doesNotMatch(css,/\.chef-menu-week-strip\{|\.chef-menu-week-day\{/);
 assert.match(css,/\.chef-menu-week-navigation\{/);
 assert.match(guide,/não repetir o calendário de sete colunas/);
});
test("defining, changing and suggesting dishes preserves existing Chef API shapes",()=>{
 assert.match(js,/item\?"Alterar prato":"Definir prato"/);
 assert.match(js,/\["dish",pt\?"Prato aprovado"/);
 assert.match(js,/\["category",pt\?"Categoria"/);
 assert.match(js,/\["proposal",pt\?"Sugerir prato"/);
 assert.match(js,/node\("button","chef-menu-mode-choice"/);
 assert.match(js,/node\("div","chef-menu-dish-results"\)/);
 assert.match(js,/button\.onclick=\(\)=>\{\s*selectedDish=\{id:dish\.id,name:dish\.name_pt\}/);
 assert.match(js,/results\.hidden=true/);
 assert.match(js,/node\("button","chef-menu-category-trigger"\)/);
 assert.match(js,/categoryOptions\.hidden=true/);
 assert.match(js,/request\("\/api\/v2\/chef\/menu-proposals","POST"/);
 assert.match(js,/request\("\/api\/v2\/chef\/menus","PUT"/);
 assert.match(js,/menu_date:date,meal,kind:mode/);
 assert.match(js,/dish_id:mode==="dish"\?selectedDish\.id:null/);
 assert.match(js,/if\(previewReadOnly\|\|date<dateKey\(new Date\(\)\)\)return/);
 assert.match(css,/\.chef-menu-editor\{[^}]*border-radius:17px/s);
 assert.match(css,/\.chef-menu-mode-choice\[aria-pressed="true"\]/);
 assert.match(css,/\.chef-menu-editor \.chef-edit-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(guide,/Não adicionar campos, payloads, migrações/);
});
