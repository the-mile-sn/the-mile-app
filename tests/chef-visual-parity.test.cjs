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
 assert.match(html,/chef\.css\?v=23/);
 assert.match(html,/chef\.js\?v=30/);
});

test("Chef chat demo stays accessible, ephemeral and disconnected from production",()=>{
 const demoJs=fs.readFileSync("static/chef-chat-demo.js","utf8");
 const demoCss=fs.readFileSync("static/chef-chat-demo.css","utf8");
 assert.match(html,/chef-chat-demo\.css\?v=1/);
 assert.match(html,/chef-chat-demo\.js\?v=1/);
 assert.match(html,/id="chef-chat-trigger"[^>]*hidden/);
 assert.match(html,/class="mile-icon icon-message-01"/);
 assert.match(html,/<dialog id="chef-chat-dialog"/);
 assert.match(html,/aria-labelledby="chef-chat-title"/);
 assert.match(html,/id="chef-chat-thread"[^>]*role="log"/);
 assert.match(html,/id="chef-chat-input"[^>]*maxlength="600"/);
 assert.match(js,/el\("chef-chat-trigger"\)\.hidden=view!=="chef"/);
 assert.match(js,/window\.themileChefChatDemo\?\.setLanguage\(lang\)/);
 assert.match(js,/chefOfficialIconData\["Message01Icon"\]=\[/);
 assert.match(js,/"message-01":"Message01Icon"/);
 assert.match(demoJs,/dialog\.showModal\(\)/);
 assert.match(demoJs,/dialog\.addEventListener\("close"/);
 assert.match(demoJs,/thread\.replaceChildren\(\)/);
 assert.match(demoJs,/event\.preventDefault\(\)/);
 assert.match(demoJs,/form\.addEventListener\("submit"/);
 assert.match(demoJs,/window\.themileChefChatDemo=Object\.freeze/);
 for(const forbidden of [/fetch\s*\(/,/\blocalStorage\b/,/\bsessionStorage\b/,/\bindexedDB\b/,/\bWebSocket\s*\(/,/\bnavigator\.sendBeacon\s*\(/])
  assert.doesNotMatch(demoJs,forbidden);
 assert.match(demoCss,/\.chef-chat-trigger\{[\s\S]*?top:calc\(env\(safe-area-inset-top,0px\) \+ 7px\)/);
 assert.match(demoCss,/\.chef-chat-dialog::backdrop/);
 assert.match(demoCss,/@media\(max-width:640px\)/);
 assert.match(guide,/protótipo reside isolado/);
});
test("Chef Menus displays a full month week range and only weekday names",()=>{
 const vm=require("node:vm");
 const r=js.match(/function chefMenuWeekRange\(start,end\)\{[\s\S]*?\n\}/)?.[0];
 const d=js.match(/function chefMenuWeekday\(date\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(r&&d);
 const lang="pt",format=(date,options)=>new Intl.DateTimeFormat("pt-PT",options).format(date);
 const range=vm.runInNewContext(r+";chefMenuWeekRange",{format});
 const weekday=vm.runInNewContext(d+";chefMenuWeekday",{format,lang,locale:code=>code==="en"?"en-GB":"pt-PT"});
 assert.equal(range(new Date(2026,10,16),new Date(2026,10,22)),"16–22 novembro 2026");
 assert.equal(range(new Date(2026,10,30),new Date(2026,11,6)),"30 novembro–6 dezembro 2026");
 assert.equal(range(new Date(2026,11,28),new Date(2027,0,3)),"28 dezembro 2026–3 janeiro 2027");
 assert.equal(weekday(new Date(2026,10,16)),"Segunda");
 assert.equal(weekday(new Date(2026,10,17)),"Terça");
 assert.equal(weekday(new Date(2026,10,21)),"Sábado");
 assert.match(js,/const period=node\("strong","chef-menu-week-range",chefMenuWeekRange\(start,end\)\)/);
 assert.match(js,/const weekday=node\("strong","",chefMenuWeekday\(date\)\)/);
 assert.match(js,/weekday\.title=dateDescription\(date\)/);
 assert.match(guide,/16–22 novembro 2026/);
});
test("Chef Profile copies Player identity, account actions and password workflow without legacy logout",()=>{
 const playerCss=fs.readFileSync("static/jogador-v2.css","utf8");
 const playerJs=fs.readFileSync("static/jogador-v2.js","utf8");
 for(const token of ["width:90px;height:90px","background:#414148","font-size:21px","border-radius:13px;background:#242429","min-height:61px","border-radius:17px","min-height:64px"]){
  assert.ok(css.includes(token),"Chef style: "+token);
 }
 assert.match(playerCss,/#profile \.profile-identity/);
 assert.match(playerCss,/#profile \.profile-actions-card/);
 assert.match(js,/function chefProfileInitials\(name\)/);
 assert.match(js,/node\("div","profile-photo-circle",chefProfileInitials\(chef\?\.name\)\)/);
 assert.match(js,/chef\?\.username\?"@"\+chef\.username:""/);
 assert.doesNotMatch(js,/node\("section","profile-plan-card"\)|const assigned=node/);
 assert.doesNotMatch(css,/\.chef-profile \.profile-plan-card|\.chef-profile \.profile-plan-detail/);
 assert.match(js,/const languageCard=node\("section","profile-language-card"\)/);
 assert.match(js,/languageCard\.append\(node\("span","profile-language-label",txt\(\)\.language\),segment,languageFeedback\)/);
 assert.match(js,/page\.append\(notifications\);[\s\S]*?page\.append\(languageCard\);[\s\S]*?page\.append\(actions\)/);
 assert.match(css,/\.chef-profile \.profile-language-card\{[\s\S]*?min-height:61px;[\s\S]*?border-radius:13px;background:#242429/);
 assert.match(js,/request\("\/api\/v2\/chef\/preferences","PUT",\{language:code\}\)/);
 assert.match(guide,/Mensagens Chef ↔ Backoffice — simulação visual autorizada/);
 assert.match(guide,/não executa chamadas de rede/);
 assert.match(js,/const actions=node\("div","profile-actions-card"\)/);
 assert.match(js,/chefProfileAction\(txt\(\)\.logout,"door-01",chefLogout\)/);
 assert.match(js,/chefProfileAction\(txt\(\)\.changePassword,"key-01"/);
 assert.match(js,/request\("\/api\/change-password","POST"/);
 assert.match(playerJs,/\/api\/change-password/);
 assert.match(js,/form\.reset\(\)/);
 assert.match(js,/if\(next!==confirm\)/);
 assert.match(js,/save\.disabled=previewReadOnly/);
 assert.match(js,/button\.disabled=previewReadOnly/);
 assert.match(html,/id="chef-profile-tab-initials"/);
 assert.match(js,/button\.querySelector\(":scope > span:last-child"\)\.textContent=caption/);
 assert.doesNotMatch(html,/id="top-logout"|id="top-name"/);
 assert.doesNotMatch(js,/el\("top-logout"\)|el\("top-name"\)/);
 assert.doesNotMatch(css,/\.profile-row\{|\.top-details\{|\.quiet-button\{/);
 assert.match(guide,/Perfil — paridade com Jogadores, revisão aprovada/);
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
 assert.match(js,/chefOptionCards\(date,meal,colorOverride,onlyPrescription\)/);
});

test("image skeleton is conditional and does not change Chef photo zoom/error policy",()=>{
 assert.match(js,/photo\.addEventListener\("load",\(\)=>frame\.classList\.remove\("chef-photo-pending"\)/);
 assert.match(js,/if\(photo\.complete&&photo\.naturalWidth>0\)frame\.classList\.remove/);
 assert.match(js,/photo\.onerror=\(\)=>frame\.remove\(\)/);
 assert.match(js,/frame\.onclick=event=>/);
 assert.match(css,/\.chef-dish-photo-frame\.chef-photo-pending::before/);
 assert.match(css,/\.chef-dish-photo-frame\.chef-photo-pending::after\{[^}]*animation:chef-photo-pulse 1\.6s ease-in-out infinite/);
 assert.match(css,/@keyframes chef-photo-pulse\{0%,100%\{opacity:\.12\}50%\{opacity:\.38\}\}/);
 assert.doesNotMatch(css,/\.chef-dish-photo-frame\.chef-photo-pending::after\{[^}]*transform:/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.chef-dish-photo-frame\.chef-photo-pending::after\{animation:none;opacity:\.18\}\}/);
});

test("visual changes keep role-scoped Chef endpoints, four tabs and edit rules intact",()=>{
 for(const fragment of ["/api/v2/chef/me","/api/v2/chef/plans","/api/v2/chef/calendar","/api/v2/chef/menus","/api/v2/chef/menu-executions","/api/v2/chef/preferences"]){
  assert.ok(js.includes(fragment),fragment);
 }
 assert.match(js,/previewReadOnly&&method!=="GET"/);
 assert.match(js,/if\(!previewReadOnly&&key>=dateKey\(new Date\(\)\)\)/);
 assert.match(js,/if\(chefViewMode==="week"\)\{renderChefWeekly\(root\);return;\}/);
 assert.match(js,/renderChefDaily\(dayContent\)/);
 for(const tab of ["home","plans","menus","profile"])assert.match(html,new RegExp('data-tab="'+tab+'"'));
 assert.match(js,/el\("chef-nav"\)\.querySelectorAll\("\[data-tab\]"\)/);
 assert.match(guide,/validação visual em iPhone e desktop \*\*pendente\*\*/);
});

test("Chef Planos reuses the Player Todos/Cores category family, without calendar",()=>{
 assert.match(js,/function publishedChefColors\(\)/);
 assert.match(js,/validColors\.filter\(color=>mealOrder\.some/);
 assert.match(js,/prescriptions\[color\]\?\.\[meal\]/);
 assert.match(js,/chefPlanCategory="todos"/);
 assert.match(js,/node\("nav","plans-filters"\)/);
 assert.match(js,/\["todos",lang==="pt"\?"Todos":"All"\]/);
 assert.match(js,/\["cores",lang==="pt"\?"Cores":"Colours"\]/);
 assert.match(js,/node\("nav","plans-subfilters"\)/);
 assert.match(js,/node\("details","plans-all-group"\)/);
 assert.match(js,/node\("div","plans-all-body"\)/);
 assert.match(js,/renderChefMeal\(dateKey\(selectedDay\),meal,false,true,color\)/);
 assert.match(css,/\.plans-all-group>summary\{[^}]*min-height:86px/);
 assert.match(css,/\.plans-all-group\{[^}]*border-radius:18px/);
 assert.match(css,/\.plans-filter\{[^}]*min-height:42px/);
 assert.match(css,/\.plans-subfilter\{[^}]*min-height:35px/);
 assert.doesNotMatch(html,/id="day-controls"|id="day-picker"|id="prev-week"|id="next-week"/);
 assert.doesNotMatch(js,/el\("day-picker"\)|el\("day-controls"\)|el\("week-range"\)/);
 assert.doesNotMatch(css,/\.day-picker\{|\.day-controls\{/);
 assert.doesNotMatch(css,/\.chef-plan-category\{|\.chef-plan-category-mark\{/);
 assert.match(js,/const avg=key=>Math\.round\(/);
 assert.match(js,/chef-plan-header-macros/);
 assert.match(guide,/Planos — paridade com Jogadores/);
});

test("Menus has only the week navigation; Recipes tab/list are disabled in Chef frontend",()=>{
 assert.match(css,/\.chef-view-mode\{[^}]*height:38px;min-height:38px/);
 assert.match(css,/\.chef-view-mode button\{[^}]*height:32px;min-height:32px/);
 assert.match(js,/function renderChefMenuWeekNavigation\(root\)/);
 assert.match(js,/renderChefMenuWeekNavigation\(root\)/);
 assert.match(js,/function renderMenus\(root\)\{\s*renderChefMenuWeekNavigation\(root\)/);
 assert.match(js,/selectedDay=shift\(selectedDay,delta\*7\)/);
 assert.match(js,/if\(activeTab==="menus"&&!target\.closest\?\.\("\.chef-menu-week-navigation"\)\)return/);
 assert.doesNotMatch(js,/chefMenuMode|renderChefRecipes|chef-menu-switch|chef-recipes-list/);
 assert.doesNotMatch(css,/\.chef-menu-switch|\.chef-recipes-caption|\.chef-recipes-search|\.chef-recipe-row/);
 assert.match(js,/request\("\/api\/v2\/chef\/dishes\?q="\+encodeURIComponent\(search\.value\.trim\(\)\)\)/);
 assert.match(guide,/Receitas — desativada na App de Chefs/);
 assert.match(guide,/possível ferramenta futura de equivalências/);
});
test("Chef option palette and inner spacing match current Player Planos and Dia",()=>{
 const player=fs.readFileSync("static/jogador-v2.css","utf8");
 for(const token of ["#623324","#57451E","#284D6C","#24543E","#1B392A"])
   assert.ok(css.includes(token),token+" inner surface is required");
 assert.match(css,/\.chef-option-card\{[^}]*border-radius:13px;background:var\(--chef-inner\)/);
 assert.match(css,/\.chef-option-card\{[^}]*margin:9px 0;padding:12px 14px/);
 assert.match(css,/\.chef-option-head\{[^}]*min-height:0/);
 assert.match(css,/\.chef-option-list\{display:flow-root\}/);
 assert.match(css,/\.chef-option-label strong\{[^}]*font-size:15px;font-weight:500/);
 assert.match(css,/\.chef-option-label small\{[^}]*font-size:12px;font-weight:400/);
 assert.match(css,/\.chef-option-food\{[^}]*font-size:14px;font-weight:400;color:var\(--chef-option-body\)/);
 assert.match(css,/--chef-option-label:color-mix\(in srgb,var\(--chef-tone-ink\) 75%,white\)/);
 assert.match(css,/--chef-option-body:color-mix\(in srgb,var\(--chef-tone-ink\) 58%,white\)/);
 assert.match(css,/\.tone-vp\{--chef-option-label:color-mix\(in srgb,var\(--chef-tone-ink\) 68%,white\)/);
 assert.match(css,/#screen\.chef-screen-plans \.chef-option-card\{margin:9px 12px\}/);
 assert.match(css,/#screen\.chef-screen-plans \.chef-option-list>\.chef-single-option\{padding:9px 16px 12px\}/);
 assert.match(player,/\.tone-orange\{--meal-ink:var\(--meal-orange-text\);--meal-inner:#623324\}/);
 assert.match(player,/--option-label:color-mix\(in srgb,var\(--meal-ink\) 75%,white\)/);
 assert.match(player,/--option-body:color-mix\(in srgb,var\(--meal-ink\) 58%,white\)/);
 assert.doesNotMatch(css,/color-mix\(in srgb,var\(--chef-tone\) 82%,white 18%\)/);
 assert.match(guide,/nunca a antiga mistura/);
});
test("published Chef and Player universal card rhythm is the same in open/closed states",()=>{
 const player=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/--mile-radius-card:13px;--mile-radius-open:18px;--mile-card-header:61px;--mile-card-icon:37px/);
 assert.match(css,/\.chef-meal-card\{margin:10px 0;[^}]*border-radius:var\(--mile-radius-card\)/);
 assert.match(css,/\.chef-meal-card\[open\]>.chef-meal-head\{min-height:55px;padding-bottom:3px\}/);
 assert.match(css,/\.chef-meal-body\{padding:0 12px 13px\}/);
 assert.match(css,/\.chef-meal-heading\{[^}]*flex-wrap:nowrap/);
 assert.match(css,/\.chef-option-list\{display:flow-root\}/);
 assert.match(css,/\.chef-option-card\{[^}]*margin:9px 0;padding:12px 14px/);
 assert.match(css,/\.chef-meal-metrics\{[^}]*align-items:flex-end/);
 assert.match(css,/\.chef-plan-header-kcal\{font-size:11px;font-weight:500/);
 assert.match(css,/\.chef-plan-header-macros\{display:none;[^}]*font-size:10px/);
 assert.match(css,/\.chef-meal-card\[open\] \.chef-plan-header-macros\{display:flex\}/);
 assert.match(js,/const metrics=node\("span","chef-meal-metrics"\)/);
 assert.match(js,/heading\.append\(metrics\)/);
 assert.doesNotMatch(js,/head\.append\(macros\)/);
 assert.match(js,/head\.append\(heading\);\n \/\/ A Chef must see the planned dish/);
 assert.match(player,/#plans #plan-detail \.plan-overview-meal>\.daily-meal-head \.meal-average-inline/);
 assert.match(guide,/margens colapsadas num contentor `display:flow-root`/);
});
test("Menus dish body text is white with all other menu colours left untouched",()=>{
 assert.match(css,/\.chef-menu-entry \.chef-dish-name\{font-size:14px;font-weight:400;line-height:1\.4;color:#fff\}/);
 assert.match(css,/\.chef-menu-meal-label\{font-size:16px;font-weight:400;margin-bottom:4px\}/);
 assert.match(css,/\.chef-menu-entry\{background:var\(--chef-tone\);border-radius:13px;padding:13px 12px;color:var\(--chef-tone-ink\);margin:10px 0\}/);
 assert.match(guide,/nome\/descrição do prato a branco/);
});

test("Menus offers Approved dish / Suggestion but preserves historical category data",()=>{
 assert.match(js,/item\?"Alterar prato":"Definir prato"/);
 assert.match(js,/\["dish",pt\?"Prato aprovado"/);
 assert.match(js,/\["proposal",pt\?"Sugerir prato"/);
 assert.doesNotMatch(js,/\["category",pt\?"Categoria"/);
 assert.doesNotMatch(js,/const categoryArea=node/);
 assert.match(js,/node\("button","chef-menu-mode-choice"/);
 assert.match(js,/node\("div","chef-menu-dish-results"\)/);
 assert.match(js,/button\.onclick=\(\)=>\{\s*selectedDish=\{id:dish\.id,name:dish\.name_pt\}/);
 assert.match(js,/request\("\/api\/v2\/chef\/menu-proposals","POST"/);
 assert.match(js,/request\("\/api\/v2\/chef\/menus","PUT"/);
 assert.match(js,/menu_date:date,meal,kind:"dish"/);
 assert.match(js,/dish_id:selectedDish\.id/);
 assert.match(js,/if\(previewReadOnly\|\|date<dateKey\(new Date\(\)\)\)return/);
 assert.match(js,/pending:"Menu por atribuir"/);
 assert.match(js,/item\?"tone-"\+color:"tone-neutral chef-menu-unassigned"/);
 assert.match(css,/\.chef-menu-entry\.chef-menu-unassigned\{background:#303135;color:#f2f2f4\}/);
 assert.match(css,/\.chef-menu-mode-choices\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/\.chef-menu-category-trigger\{|\.chef-menu-category-options\{/);
 assert.match(css,/\.chef-menu-editor\{[^}]*border-radius:17px/s);
 assert.match(css,/\.chef-menu-editor \.chef-edit-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(guide,/registos históricos de categoria continuam válidos/);
});


test("Chef photos already have the approved image-only 1.5s skeleton and release it after load/error",()=>{
 assert.match(js,/const frame=node\("span","chef-dish-photo-frame chef-photo-pending"\)/);
 assert.match(js,/photo\.addEventListener\("load",\(\)=>frame\.classList\.remove\("chef-photo-pending"\)/);
 assert.match(js,/photo\.onerror=\(\)=>frame\.remove\(\)/);
 assert.match(css,/\.chef-dish-photo-frame\.chef-photo-pending::before/);
 assert.match(css,/\.chef-photo-pending \.chef-dish-photo/);
 assert.match(css,/@keyframes chef-photo-pulse/);
 assert.match(css,/\.chef-dish-photo-frame\.chef-photo-pending::after\{[^}]*animation:chef-photo-pulse/);
 assert.doesNotMatch(css,/\.chef-dish-photo-frame\.chef-photo-pending::after\{[^}]*translateX/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test("Chef initial home skeleton matches the real Dia/Semana geometry and never blocks fast loads",()=>{
 assert.match(js,/function renderChefHomeSkeleton\(\)/);
 assert.match(js,/function chefSkeletonShape\(extra=""\)/);
 assert.match(js,/node\("div","chef-skeleton-summary"\)/);
 assert.match(js,/node\("div","chef-skeleton-week-grid"\)/);
 assert.match(js,/node\("div","chef-skeleton-meal"\)/);
 assert.match(js,/const id=\+\+chefWeekRequestId/);
 assert.match(js,/chefSkeletonTimer=setTimeout\(\(\)=>\{/);
 assert.match(js,/renderChefHomeSkeleton\(\);\s*\},240\)/);
 assert.match(js,/if\(id!==chefWeekRequestId\|\|dateKey\(monday\(selectedDay\)\)!==weekKey\)return/);
 assert.match(js,/clearChefSkeleton\(\);\s*render\(\)/);
 assert.match(js,/clearTimeout\(chefSkeletonTimer\)/);
 assert.match(js,/root\.setAttribute\("aria-busy","true"\)/);
 assert.match(css,/\.chef-skeleton-meal\{[^}]*min-height:61px/);
 assert.match(css,/\.chef-skeleton-week-grid\{[^}]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/\.chef-skeleton-week-cell\{height:76px;border-radius:10px\}/);
 assert.match(css,/background:#29292e/);
 assert.match(css,/animation:chef-photo-shimmer 1\.5s ease-in-out infinite/);
 assert.match(css,/#screen\.chef-screen-loading \.chef-skeleton-shape::after\{animation:none\}/);
 assert.match(guide,/apenas \*\*após 240 ms\*\*/);
 assert.doesNotMatch(js,/await new Promise\(resolve=>setTimeout\(resolve,240\)\)/);
});
test("Chef follows Player tab animation and adaptive floating bar, without inventing tab-swipe",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/duration:500,easing:"cubic-bezier\(0\.2,0\.7,0\.2,1\)"/);
 assert.match(js,/const chefTabOrder=\["home","plans","menus","profile"\]/);
 assert.match(js,/function changeChefTab\(next\)/);
 assert.match(js,/duration:500,easing:"cubic-bezier\(0\.2,0\.7,0\.2,1\)"/);
 assert.match(js,/\{transform:"translateX\("\+\(direction\*24\)\+"px\)",opacity:\.55\}/);
 assert.match(js,/function updateChefAdaptiveNav\(\)/);
 assert.match(js,/if\(y<32\)/);
 assert.match(js,/if\(chefScrollAccum>=28\)/);
 assert.match(js,/if\(nav\.classList\.contains\("chef-nav-compact"\)!==compact\)\{/);
 assert.match(js,/if\(chefScrollFrame\)\{window\.cancelAnimationFrame\(chefScrollFrame\);chefScrollFrame=0;\}/);
 assert.match(css,/#chef-nav\.bottom-nav\{[\s\S]*?position:fixed!important;z-index:30!important;/);
 assert.match(css,/#chef-nav\.bottom-nav\{[\s\S]*?transform:translate3d\(0,0,0\)/);
 assert.doesNotMatch(css,/\.bottom-nav\{position:fixed/);
 assert.match(guide,/Correção da barra inferior em Menus/);
 assert.match(css,/#chef-nav\.bottom-nav\.chef-nav-compact\{[^}]*left:24px!important;right:24px!important;padding:3px!important/);
 assert.match(css,/#chef-nav\.bottom-nav\.chef-nav-compact>button\{[^}]*height:44px!important/);
 assert.match(css,/\.chef-nav-compact \.mile-icon\{transform:scale\(\.87\)\}/);
 assert.match(css,/\.chef-nav-compact>button>span:last-child\{font-size:8px!important\}/);
 assert.match(guide,/não transformar o toque em swipe horizontal entre separadores/);
});
test("Chef swipe covers empty daily viewport but animates only its content",()=>{
 assert.match(css,/body\{[^}]*display:flex;flex-direction:column\}/);
 assert.match(css,/\.page\{[^}]*flex:1;display:flex;flex-direction:column\}/);
 assert.match(css,/#chef-view\{display:flex;flex:1;flex-direction:column\}/);
 assert.match(css,/#screen\{flex:1\}/);
 assert.match(css,/\.chef-day-content\{display:flow-root;width:100%\}/);
 assert.match(js,/const dayContent=node\("div","chef-day-content"\)/);
 assert.match(js,/root\.append\(dayContent\)/);
 assert.match(js,/renderChefDaily\(dayContent\)/);
 assert.match(css,/#screen\.chef-screen-home>\.chef-day-content>\.chef-daily-summary/);
 assert.match(css,/#screen\.chef-screen-home>\.chef-day-content>\.chef-meal-card/);
 assert.match(js,/const chefSwipeArea=el\("screen"\)/);
 assert.match(js,/const content=homeDay\?chefSwipeArea\.querySelector\(":scope > \.chef-day-content"\):null/);
 assert.match(js,/chefTouchContent=content/);
 assert.match(js,/const content=el\("screen"\)\.querySelector\(":scope > \.chef-day-content"\)/);
 assert.match(js,/chefSwipeEntryAnimation=content\.animate\(/);
 assert.doesNotMatch(js,/chefSwipeEntryAnimation=screen\.animate\(/);
 assert.match(guide,/espaço entre o último card e a barra inferior/);
 assert.match(guide,/confirmação visual em iPhone ainda pendente/);
});
test("Chef swipe reuses Player's 210/320ms directional gestures, native scroll and reduced-motion guard",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/duration:320,easing:"cubic-bezier\(0\.2,0\.7,0\.2,1\)"/);
 assert.match(js,/function finishChefGesture\(dx,done\)/);
 assert.match(js,/transform 210ms cubic-bezier\(\.2,\.8,\.2,1\)/);
 assert.match(js,/duration:320,easing:"cubic-bezier\(0\.2,0\.7,0\.2,1\)"/);
 assert.match(js,/const minSwipe=isDay\?\(forwardDay\?30:35\):55/);
 assert.match(js,/distance>width\*\.38/);
 assert.match(js,/speed>\.55/);
 assert.match(js,/if\(t\.clientX<22\|\|t\.clientX>innerWidth-\(homeDay\?8:22\)\)return/);
 assert.match(js,/if\(vertical>18&&vertical>horizontal\*1\.35\)return "vertical"/);
 assert.match(js,/chefViewMode==="week"&&!target\.closest\?\.\("\.chef-week-grid"\)/);
 assert.match(js,/activeTab==="menus"&&!target\.closest\?\.\("\.chef-menu-week-navigation"\)/);
 assert.match(js,/requestAnimationFrame\(updateChefAdaptiveNav\)/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(guide,/A mudança de dia dentro da semana já carregada é imediata/);
});

test("Chef weekly adjacent-day selection shares Player 460ms moving-circle animation",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 assert.match(player,/\{duration:460,easing:'cubic-bezier\(\.25,\.75,\.3,1\)'\}/);
 assert.match(js,/function selectChefWeekDay\(date,selection=null\)/);
 assert.match(js,/dayHead\.onclick=\(\)=>selectChefWeekDay\(date\)/);
 assert.match(js,/selectChefWeekDay\(new Date\(key\+"T12:00:00"\),active\?null:\{date:key,meal\}\)/);
 assert.match(js,/Math\.abs\(offset-previousOffset\)>1/);
 assert.match(js,/\{duration:460,easing:"cubic-bezier\(\.25,\.75,\.3,1\)"\}/);
 assert.match(css,/\.chef-week-moving-circle\{[^}]*border-radius:50%;background:#f3f3f5/);
 assert.match(css,/\.chef-week-day\.selected strong\.chef-week-circle-arriving\{[^}]*background:transparent/);
 assert.match(guide,/círculo móvel do calendário dos Jogadores/);
});

test("Chef recognises diagonal horizontal gestures without stealing genuine vertical scroll",()=>{
 const vm=require("node:vm");
 const source=js.match(/function chefSwipeIntent\(dx,dy\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(source,"single source of gesture direction thresholds");
 const intent=vm.runInNewContext(source+";chefSwipeIntent");
 for(const [dx,dy] of [[48,40],[40,45],[-40,-45],[12,15],[35,38]]){
  assert.equal(intent(dx,dy),"horizontal","diagonal should lock lateral: "+dx+","+dy);
 }
 for(const [dx,dy] of [[0,25],[5,38],[14,23],[-6,-39]]){
  assert.equal(intent(dx,dy),"vertical","mostly vertical should scroll: "+dx+","+dy);
 }
 assert.equal(intent(4,7),"pending","tiny movement must not steal scroll");
 assert.match(js,/const intent=chefSwipeIntent\(dx,dy\)/);
 assert.match(js,/if\(intent==="vertical"\)\{clearChefGesture\(\);return;\}/);
 assert.match(js,/if\(intent!=="horizontal"\)return/);
 assert.match(js,/if\(event\.cancelable\)event\.preventDefault\(\)/);
 assert.doesNotMatch(js,/chefSwipeIntent\(dx,dy\)!=="horizontal"/);
 assert.match(js,/if\(distance<minSwipe\)return false/);
 assert.doesNotMatch(js,/Math\.abs\(dx\)<Math\.abs\(dy\)\*1\.4/);
 assert.match(js,/target\.closest\?\.\("input,textarea,select/);
 assert.match(js,/if\(t\.clientX<22\|\|t\.clientX>innerWidth-\(homeDay\?8:22\)\)return/);
 assert.match(guide,/Swipe lateral e scroll vertical — ajuste direcional/);
});

test("leftward and rightward swipes map to next/previous day without shared-angle assumptions",()=>{
 const vm=require("node:vm");
 const helper=js.match(/function chefSwipeIntent\(dx,dy\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(helper,"gesture intent helper exists");
 const intent=vm.runInNewContext(helper+";chefSwipeIntent");
 for(const [dx,dy] of [[-90,35],[-50,-25],[-40,35],[90,35],[50,-25],[40,35]])
  assert.equal(intent(dx,dy),"horizontal","both lateral directions: "+dx+","+dy);
 const direction=dx=>dx<0?1:-1;
 assert.equal(direction(-90),1,"swipe left must advance one day");
 assert.equal(direction(90),-1,"swipe right must return one day");
 assert.match(js,/const direction=dx<0\?1:-1/);
 assert.match(js,/const navigate=\(\)=>\{if\(commit\)chefShiftDay\(direction,step\);\}/);
 assert.match(js,/const homeDay=activeTab==="home"&&chefViewMode==="day"/);
 assert.match(js,/if\(!homeDay&&target\.closest\?\.\("\.chef-dish-photo-frame"\)\)return/);
 assert.match(js,/if\(t\.clientX<22\|\|t\.clientX>innerWidth-\(homeDay\?8:22\)\)return/);
 assert.match(css,/#screen\.chef-screen-home,[\s\S]*?touch-action:pan-y pinch-zoom/);
 assert.doesNotMatch(js,/Math\.abs\(dx\)<Math\.abs\(dy\)\*1\.4/);
 assert.doesNotMatch(js,/chefSwipeIntent\(dx,dy\)!=="horizontal"/);
});

test("forward-only diagonal tolerance is earlier, reverse remains strict, pure vertical stays native",()=>{
 const vm=require("node:vm");
 const extract=name=>{
  const re=new RegExp("function "+name+"\\([^)]*\\)\\{[\\s\\S]*?\\n\\}");
  const source=js.match(re)?.[0];
  assert.ok(source,name+" is available as a pure helper");
  return vm.runInNewContext(source+";"+name);
 };
 const intent=extract("chefSwipeIntent");
 // Same moderate diagonal: forward takes lateral precedence, reverse uses
 // the original vertical classifier because reverse already felt correct.
 assert.equal(intent(-16,22),"horizontal");
 assert.equal(intent(16,22),"vertical");
 assert.equal(intent(-9,12),"horizontal");
 assert.equal(intent(9,12),"pending","reverse keeps its existing activation angle");
 for(const [dx,dy] of [[-3,40],[3,40],[-12,30],[12,30],[0,45]])
  assert.equal(intent(dx,dy),"vertical","vertical pan "+dx+","+dy);
 assert.equal(intent(-4,6),"pending","tiny diagonal is not captured");
 assert.equal(intent(4,6),"pending","tiny reverse is not captured");
 // Compare acceptance using exactly the function that touchend calls.
 const commit=extract("chefSwipeShouldCommit");
 assert.equal(commit(-120,450,360,true),true,"forward 30% threshold");
 assert.equal(commit(120,450,360,true),false,"reverse retains 38% threshold");
 assert.equal(commit(-70,140,360,true),true,"forward slightly slower flick");
 assert.equal(commit(70,140,360,true),false,"reverse still uses 0.55px/ms");
 assert.equal(commit(160,500,360,true),true,"reverse long swipe still works");
 assert.equal(commit(-10,50,360,true),false,"short movement never flips day");
 assert.equal(commit(-54,100,360,false),false,"week navigation keeps 55px minimum");
 assert.equal(commit(-55,100,360,false),true,"week navigation keeps working");
 assert.equal(commit(55,100,360,false),true,"week reverse unaffected");
 assert.match(js,/if\(event\.cancelable\)event\.preventDefault\(\)/);
 assert.match(js,/const commit=chefSwipeShouldCommit\(/);
 assert.doesNotMatch(js,/chefSwipeIntent\(dx,dy\)!=="horizontal"/);
 assert.match(guide,/retrocesso para o dia anterior.*mantém a deteção aprovada/);
 assert.match(guide,/avançar ao dia seguinte/);
});
