const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const dashboard=fs.readFileSync("static/admin-dashboard.js","utf8");
const admin=fs.readFileSync("static/admin-microcycles.js","utf8");
test("main navigation has real clinical pages",()=>{
 for(const key of ["assessments","forms"]){assert.match(html,new RegExp('id="tm-admin-nav-'+key+'"'));assert.match(html,new RegExp('id="tm-'+key+'-page"'));assert.match(html,new RegExp('id="tm-'+key+'-player"'));}
});
test("shared editors stay singular, not duplicated",()=>{
 for(const id of ["assessments-admin-panel","profile-monitoring","assessment-review-form","monitoring-weight-form","monitoring-game-form"])assert.equal(html.split('id="'+id+'"').length-1,1,id);
 assert.match(dashboard,/\$\("tm-assessments-slot"\)\.append\(assessmentPanel\)/);
 assert.match(dashboard,/\$\("tm-forms-slot"\)\.append\(monitoringPanel\)/);
 assert.doesNotMatch(dashboard,/assessmentHome|monitoringHome/);
 assert.match(dashboard,/tm-assessments-slot/);
 assert.match(dashboard,/tm-forms-slot/);
});
test("player identity remains tied to existing model selection",()=>{
 assert.match(dashboard,/original\.value=selected\.value/);
 assert.match(dashboard,/if\(!selected\.value\)\{/);
 assert.match(dashboard,/if\(aid\)\{openClinical\(kind,aid\);\}/);
 assert.match(dashboard,/if\(typeof loadModel==="function"\)await loadModel\(\)/);
 assert.match(dashboard,/if\(token!==clinicalToken\)return/);
});
test("legacy clinical and account functions remain available",()=>{
 for(const name of ['admin-account-panel','athlete-weight-panel','backoffice-nav','admin-access-panel'])assert.match(html,new RegExp('id="'+name+'"'));
 assert.match(admin,/function showBackofficeView\(view\)/);
 assert.match(admin,/async function openMonitoring\(kind\)/);
 assert.match(admin,/async function loadAssessmentsAdmin\(\)/);
});

test("dashboard shortcuts target clinical main pages, not legacy planning",()=>{
 assert.match(dashboard,/target==="assessments"\?openClinical\("assessments",item\.athlete_id\)/);
 assert.match(dashboard,/openClinical\("forms",item\.athlete_id,kind==="pitch"\?"game":"weight"/);
 assert.match(dashboard,/row\.dataset\.monitoringDate===recordDate/);
 assert.doesNotMatch(html,/Os formulários ainda não estão ativos/);
});


test("Planeamento has only planning tabs; migrated controls remain single and usable elsewhere",()=>{
 const match=html.match(/<nav class="calendar-panel" id="backoffice-nav"[^>]*>([\s\S]*?)<\/nav>/);
 assert.ok(match,"Planning navigation is present");
 const tabs=[...match[1].matchAll(/data-view="([^"]+)"/g)].map(v=>v[1]);
 assert.deepEqual(tabs,["calendar","plans","supplements","matrix","menus","player-preview"]);
 for(const id of ["athlete-weight-panel","profile-monitoring","assessments-admin-panel","admin-account-toggle","admin-access-panel"]){
  assert.equal(html.split('id="'+id+'"').length-1,1,id+" must remain mounted once");
 }
 assert.match(dashboard,/function ensurePlanningOnlyView\(\)/);
 assert.equal(dashboard.split("ensurePlanningOnlyView();").length-1,2,"both entry points should normalize the Planning view");
 assert.match(dashboard,/if\(monitoringKind\)return openClinical\("forms",aid,monitoringKind,day\)/);
 assert.doesNotMatch(admin,/button\.dataset\.view==="assessments"/);
 assert.doesNotMatch(admin,/admin-access-panel"\)\.hidden=view!==/);
 assert.match(dashboard,/activationPanel\.hidden=false/);
 assert.match(html,/admin-microcycles\.css\?v=111/);
});

test("Clinical editors remain in their definitive homes without reparenting or account fetches",()=>{
 assert.equal(dashboard.split('$("tm-assessments-slot").append(assessmentPanel)').length-1,1);
 assert.equal(dashboard.split('$("tm-forms-slot").append(monitoringPanel)').length-1,1);
 assert.doesNotMatch(dashboard,/showBackofficeView\("profile"\)/);
 assert.doesNotMatch(admin,/assessments:\["assessments-admin-panel"\]/);
 assert.doesNotMatch(admin,/if\(view==="assessments"&&model\)loadAssessmentsAdmin/);
 assert.match(dashboard,/if\(typeof showBackofficeView==="function"\)showBackofficeView\("assessments"\)/);
 assert.match(dashboard,/monitoringPanel.hidden=false/);
});


test("Avaliações restores its cards and chart dashboard when opened from the dedicated area",()=>{
 // PR #40 moved the editor permanently but accidentally removed the data load.
 // The dashboard must load before the global registry refresh, for every athlete selection.
 assert.match(dashboard,/if\(kind==="assessments"\)\{[\s\S]*?assessmentPanel\.hidden=false;\s*[\s\S]*?await loadAssessmentsAdmin\(\);\s*if\(token!==clinicalToken\)return;\s*if\(typeof window\.tmRefreshAssessmentRegistry/);
 assert.match(admin,/async function loadAssessmentsAdmin\(\)\{[\s\S]*?renderAssessmentDashboard\(result\.assessments\);/);
 assert.match(admin,/function renderAssessmentDashboard\(records\)\{/);
 assert.match(admin,/host\.append\(metricGrid\)/);
 assert.match(admin,/host\.append\(detailGrid\)/);
 assert.match(admin,/host\.append\(visual\)/);
 assert.match(dashboard,/monitoringPanel\.hidden=false/); // Formulários unchanged.
 assert.match(html,/admin-dashboard\.js\?v=33/); // Force browsers to load the fix.
});

test("Modelo legend and matrix stay scoped to their Planning tab, including athlete refresh",()=>{
 const vm=require("node:vm");
 const legend=null;
 assert.equal(legend,null);
 assert.doesNotMatch(html,/id="model-legend"/);
 assert.equal(html.split('id="model-legend"').length-1,0);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
 const elements={};
 for(const id of ["athlete-weight-panel","calendar-section","plan-import-panel","peri-panel","supplements-panel","matrix","scenario-editor","menus-panel","player-preview-panel"]){
  elements[id]={hidden:true};
 }
 const tabs=["calendar","plans","supplements","matrix","menus","player-preview"].map(view=>({dataset:{view},setAttribute(k,v){this[k]=v;}}));
 const ctx={
  $:id=>elements[id],
  document:{querySelectorAll:()=>tabs},
  model:{athlete:{id:"test"},classifications:[],meals:[],colors:[]},
  backofficeView:"calendar",
  loadCalendar:async()=>{},loadV2Access:async()=>{},loadSupplementEditor:async()=>{},
  loadPeriImports:async()=>{},loadMenus:async()=>{},loadScenarioEditor:()=>{},
  showPlayerView:async()=>{},playerView:"overview",status:()=>{}
 };
 const start=admin.indexOf("function showBackofficeView(view){");
 const end=admin.indexOf('\n}\nfor(const button of document.querySelectorAll("#backoffice-nav [data-view]"))',start);
 assert.ok(start>=0&&end>start,"View controller found");
 const show=vm.runInNewContext(admin.slice(start,end+2)+"\nshowBackofficeView",ctx);
 show("plans");
 assert.equal(elements["plan-import-panel"].hidden,false);
 assert.equal(elements.matrix.hidden,true);
 assert.equal(elements.matrix.hidden,true);
 show("matrix");
 assert.equal(elements.matrix.hidden,false);
 assert.equal(elements.matrix.hidden,false);
 assert.equal(elements["scenario-editor"].hidden,false);
 show("menus");
 assert.equal(elements.matrix.hidden,true);
 assert.equal(elements.matrix.hidden,true);
 assert.equal(elements["menus-panel"].hidden,false);
 const renderAt=admin.indexOf("function render(){"),renderEnd=admin.indexOf("\n",renderAt);
 assert.ok(renderAt>=0&&renderEnd>renderAt);
 const renderSource=admin.slice(renderAt,renderEnd);
 const node=()=>({children:[],appendChild(child){this.children.push(child);}});
 elements.matrix={...node(),hidden:true,replaceChildren(){this.children=[];}};
 ctx.document.createElement=()=>node();
 const render=vm.runInNewContext(renderSource+"\nrender",ctx);
 ctx.backofficeView="plans";
 render();
 assert.equal(elements.matrix.hidden,true,"model refresh must not flash matrix inside Planos");
 ctx.backofficeView="matrix";
 render();
 assert.equal(elements.matrix.hidden,false,"model refresh remains visible in Modelo");
});


test("Microciclos loads the calendar once per athlete refresh and never exposes it in other tabs",async()=>{
 const vm=require("node:vm");
 const start=admin.indexOf("async function loadModel(){"),end=admin.indexOf("\nasync function runScenarioPreview()",start);
 assert.ok(start>=0&&end>start,"loadModel must exist");
 const source=admin.slice(start,end);
 assert.match(admin,/\$\("calendar-section"\)\.hidden=backofficeView!=="calendar";/);
 assert.doesNotMatch(admin,/\$\("calendar-section"\)\.hidden=false;\s*\n}/);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
 for(const view of ["calendar","plans","supplements","matrix","menus","player-preview","assessments"]){
  const calls=[];
  const ctx={
   backofficeView:view,selectedCalendarDay:"previous",selectedNutritionWeek:"previous",
   model:null,profileEditing:true,
   $:id=>id==="athlete"?{value:"athlete-1"}:null,
   resetPlanReviewForAthlete:aid=>calls.push("reset:"+aid),
   resetMenusForAthlete:aid=>calls.push("reset-menus:"+aid),
   resetSupplementForAthlete:aid=>calls.push("reset-supplements:"+aid),
   resetPlayerPreviewForAthlete:aid=>calls.push("reset-preview:"+aid),
   resetPeriForAthlete:aid=>calls.push("reset-peri:"+aid),
   updatePlanningPlayerControls:()=>calls.push("picker"),
   request:async path=>{calls.push("model");assert.match(path,/\/api\/v2\/athletes\/athlete-1\/microcycles/);return {athlete:{id:"athlete-1"},classifications:[],meals:[],colors:[]};},
   render:()=>calls.push("matrix"),
   renderProfileSummary:()=>calls.push("profile"),
   loadPlanDrafts:async()=>calls.push("plans"),
   loadCalendar:async()=>calls.push("calendar"),
   showBackofficeView:chosen=>{calls.push("show:"+chosen);if(chosen==="calendar")return ctx.loadCalendar();return null;}
  };
  const fn=vm.runInNewContext(source+"\nloadModel",ctx);
  await fn();
  assert.equal(calls.filter(x=>x==="calendar").length,1,view+" should load calendar exactly once");
  assert.equal(calls.filter(x=>x==="show:"+view).length,1,view+" should restore selected area");
  assert.equal(ctx.selectedCalendarDay,null);
  assert.equal(ctx.selectedNutritionWeek,null);
  assert.equal(ctx.model.athlete.id,"athlete-1");
  assert.ok(calls.indexOf("plans")<calls.indexOf("calendar"),view+" plans must initialize before calendar");
 }
});


test("Planos clears stale player reviews and ignores late replies from another athlete",()=>{
 assert.match(admin,/function resetPlanReviewForAthlete\(athleteId\)/);
 assert.match(admin,/selectedPlanId=null;selectedPlanMode="consult";[\s\S]*?\$\("import-review"\)\.replaceChildren\(\)/);
 assert.match(admin,/resetPlanReviewForAthlete\(athleteId\);[\s\S]*?const nextModel=await request/);
 assert.match(admin,/if\(\$\("athlete"\)\.value!==athleteId\)return;/);
 assert.match(admin,/const stillCurrent=\(\)=>revision===planDraftReadRevision&&stillOnAthlete\(\)/);
 assert.match(admin,/const data=await request\(path\+"\/plan-imports"\);\s*if\(!stillCurrent\(\)\)return/);
 assert.match(admin,/const historyData=await request\(path\+"\/plan-imports\/publication-history"\);\s*if\(!stillCurrent\(\)\)return/);
 assert.match(admin,/const result=await request\(path\+"\/plan-imports\/"\+encodeURIComponent\(latest.id\)\);\s*if\(!stillOnAthlete\(\)\)return/);
});


test("Menus loads and saves only for its selected athlete and current week",()=>{
 assert.match(admin,/function resetMenusForAthlete\(athleteId\)/);
 assert.match(admin,/resetMenusForAthlete\(athleteId\);[\s\S]*?const nextModel=await request/);
 assert.match(admin,/const athleteId=model\.athlete\.id;\s*resetMenusForAthlete\(athleteId\)/);
 assert.match(admin,/const stillCurrent=\(\)=>menusLoadRevision===revision&&menusAthleteId===athleteId/);
 assert.match(admin,/const data=await request\(base\+"\/menus\?start="\+begin\+"&end="\+end\);\s*if\(!stillCurrent\(\)\)return/);
 assert.match(admin,/const calendarData=await request\(base\+"\/calendar\?start="\+begin\+"&end="\+end\);\s*if\(!stillCurrent\(\)\)return/);
 assert.match(admin,/saveWeek\.onclick=async\(\)=>\{\s*if\(!stillCurrent\(\)\|\|!pending\.size\)return/);
 assert.match(admin,/await request\(base\+"\/menus\/batch"/);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
});


test("Suplementação invalidates old-player reads and binds publication to the selected player",()=>{
 assert.match(admin,/function resetSupplementForAthlete\(athleteId\)/);
 assert.match(admin,/resetSupplementForAthlete\(athleteId\);[\s\S]*?const nextModel=await request/);
 assert.match(admin,/const revision=\+\+supplementLoadRevision/);
 assert.match(admin,/const stillCurrent=\(\)=>supplementLoadRevision===revision&&supplementAthleteId===athleteId/);
 assert.match(admin,/const draft=await request\(base\+"\/supplements"\);\s*if\(!stillCurrent\(\)\)return/);
 assert.match(admin,/const calendar=await request\(base\+"\/calendar\?start="/);
 assert.match(admin,/if\(!stillCurrent\(\)\)return;\s*supplementDraft=draft/);
 assert.match(admin,/if\(!supplementEditorReady\|\|!athleteId\|\|!stillCurrent\(\)\)return/);
 assert.match(admin,/await request\("\/api\/v2\/athletes\/"\+encodeURIComponent\(athleteId\)\+"\/supplements",\{method:"PUT"/);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
});


test("Vista jogador ignores delayed reads after changing athlete, day, week or tab",()=>{
 assert.match(admin,/function resetPlayerPreviewForAthlete\(athleteId\)/);
 assert.match(admin,/resetPlayerPreviewForAthlete\(athleteId\);[\s\S]*?const nextModel=await request/);
 assert.match(admin,/playerSelectedPlan=null;publishedSimulation=\{\}/);
 for(const fn of ["playerShowPlans","playerShowMenus","loadPlayerSimulation"]){
  assert.match(admin,new RegExp("async function "+fn+"\\(\\)\\{[\\s\\S]*?const athleteId=model\\.athlete\\.id,revision=\\+\\+playerPreviewRevision"));
 }
 assert.match(admin,/if\(!current\(\)\)return;\s*publishedSimulation=plans\.options_by_color/);
 assert.match(admin,/async function showPlayerView\(view\)\{\s*playerView=view;\+\+playerPreviewRevision/);
 assert.match(admin,/isoDay\(weekStart\(playerMenuWeek\)\)===begin/);
 assert.match(admin,/isoDay\(simulationDay\)===d/);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
});

test("Peri-treino and Peri-jogo remain scoped to the selected player",()=>{
 assert.match(admin,/function resetPeriForAthlete\(athleteId\)/);
 assert.match(admin,/resetPeriForAthlete\(athleteId\);[\s\S]*?const nextModel=await request/);
 assert.match(admin,/const result=await request\(periEndpoint\(athleteId\)\);\s*if\(revision!==periLoadRevision\|\|!periIsCurrent\(athleteId\)\)return/);
 assert.match(admin,/function renderPeriDraft\(draft,editing=false,athleteId=periAthleteId\)/);
 assert.match(admin,/if\(!periIsCurrent\(athleteId\)\)return;\s*const root=\$\("peri-review"\)/);
 assert.match(admin,/confirmation:"PUBLICAR",athlete_id:athleteId/);
 assert.match(admin,/await request\(periEndpoint\(athleteId\)\+"\/"\+encodeURIComponent\(draft.id\)\+"\/option"/);
 assert.match(admin,/if\(!periIsCurrent\(athleteId\)\)return;\s*const result=await request\(periEndpoint\(athleteId\),\{method:"POST"/);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
});


test("Appearance is in Definições, uses locally persisted two-state control, and preserves dark CSS",()=>{
 const css=require("node:fs").readFileSync("static/admin-microcycles.css","utf8");
 const light=require("node:fs").readFileSync("static/admin-light-theme.css","utf8");
 assert.match(html,/id="tm-settings-appearance"/);
 assert.match(html,/data-admin-theme-choice="dark" aria-pressed="true"/);
 assert.match(html,/data-admin-theme-choice="light" aria-pressed="false"/);
 assert.match(html,/\/admin-light-theme\.css\?v=11/);
 assert.match(html,/\/admin-dashboard\.js\?v=33/);
 assert.match(dashboard,/tm-admin-theme/);
 assert.match(dashboard,/window\.localStorage\.getItem\(key\)/);
 assert.match(dashboard,/window\.localStorage\.setItem\(key,theme\)/);
 assert.match(dashboard,/document\.documentElement\.dataset\.adminTheme=theme/);
 assert.match(dashboard,/button\.setAttribute\("aria-pressed"/);
 assert.match(css,/:root\{color-scheme:dark/);
 assert.match(light,/html\[data-admin-theme="light"\]/);
 assert.doesNotMatch(light,/:root\s*\{/);
 assert.match(light,/\.tm-dashboard/);
 assert.match(light,/\.tm-clinical-metric/);
 assert.match(light,/#tm-admin-legacy/);
});


test("The Backoffice serves its opt-in light stylesheet from the exact HTML URL",()=>{
 const backend=require("node:fs").readFileSync("app.py","utf8");
 assert.match(html,/href="\/admin-light-theme\.css\?v=11"/);
 assert.match(backend,/['"]\/admin-light-theme\.css['"]:\s*['"]admin-light-theme\.css['"]/);
 assert.match(backend,/path in \([\s\S]*?['"]\/admin-light-theme\.css['"]/);
});


test("Player profile uses a top-left back arrow outside the detail card",()=>{
 assert.match(html,/id="tm-players-profile-nav" class="tm-subpage-nav" hidden/);
 assert.ok(html.indexOf('id="tm-players-profile-back"')<html.indexOf('id="tm-players-profile"'));
 assert.match(html,/id="tm-players-profile-back" class="tm-subpage-back" aria-label="Voltar à lista de jogadores"/);
 assert.match(dashboard,/profileNav\.hidden=true;playersHeader\.hidden=false;/);
 assert.match(dashboard,/playersHeader\.hidden=true;profileNav\.hidden=false;/);
 assert.match(dashboard,/\$\("tm-players-profile-back"\)\.addEventListener\("click",closePlayerProfile\)/);
 const css=require("node:fs").readFileSync("static/admin-microcycles.css","utf8");
 assert.match(css,/\.tm-subpage-nav\[hidden\]/);
});
test("Light Formulários panel and chart point centers have dedicated contrast styles",()=>{
 const css=require("node:fs").readFileSync("static/admin-light-theme.css","utf8");
 assert.match(css,/html\[data-admin-theme="light"\] #tm-forms-page #profile-monitoring\{/);
 assert.match(css,/#tm-forms-page #profile-monitoring \.monitoring-weight-chart/);
 assert.match(css,/#tm-assessments-page \.tm-assessment-trend-svg circle\[role="button"\]/);
 assert.match(html,/admin-light-theme\.css\?v=11/);
});

test("Brand wordmark preserves original aspect ratio and provides navigation home",()=>{
 assert.match(html,/viewBox="0 0 1605 244" role="img" aria-label="The Mile"/);
 assert.doesNotMatch(html,/class="tm-admin-brand-mark"/);
 assert.match(html,/id="tm-admin-brand-home"/);
 assert.match(html,/id="tm-dashboard-return" class="tm-subpage-nav tm-dashboard-return"[^>]*hidden/);
 assert.match(html,/id="tm-dashboard-return-button"/);
 assert.match(dashboard,/\$\("tm-dashboard-return-button"\)\.addEventListener\("click",openDashboard\)/);
 assert.match(dashboard,/\$\("tm-admin-brand-home"\)\.addEventListener\("click",openDashboard\)/);
 assert.match(dashboard,/dashboardReturn\.hidden=target===dash/);
 assert.match(dashboard,/dashboardReturn\.hidden=true/);
 assert.match(html,/admin-dashboard\.js\?v=33/);
});

test("The Mile wordmark aligns optically with navigation icon artwork",()=>{
 const css=require("node:fs").readFileSync("static/admin-microcycles.css","utf8");
 assert.match(css,/#admin-workspace \.tm-admin-brand\{padding:12px 15px 30px\}/);
 assert.match(css,/@media\(max-width:830px\)\{#admin-workspace \.tm-admin-brand\{padding:6px 11px 10px\}\}/);
 assert.match(html,/admin-microcycles\.css\?v=111/);
});

test("Jogadores profile has birth date, follow-up plan, renewal and private photo editing",()=>{
 assert.match(html,/id="tm-players-profile-photo-upload"/);
 assert.match(html,/accept="image\/jpeg,image\/png,image\/webp"/);
 assert.match(dashboard,/\["Data de nascimento","birth_date","date"\]/);
 assert.match(dashboard,/\["Plano de acompanhamento","followup_plan","followup"\]/);
 assert.match(dashboard,/\["Data de renovação do acompanhamento","followup_renewal_date","date"\]/);
 assert.match(dashboard,/const \[data,additional\]=await Promise\.all\(/);
 assert.match(dashboard,/playerPhotoData=value/);
 assert.match(dashboard,/followup_renewal_date:get\("followup_renewal_date"\)/);
 assert.match(dashboard,/selectedToken!==profileLoadToken/);
 assert.match(html,/admin-dashboard\.js\?v=33/);
});

test("Jogadores follow-up is a select with Pro and Elite only",()=>{
 assert.match(dashboard,/type==="sex"\|\|type==="position"\|\|type==="followup"\?el\("select"\):el\("input"\)/);
 assert.match(dashboard,/type==="followup"\)\{for\(const v of \["","Pro","Elite"\]\)/);
 assert.match(dashboard,/followup_plan:get\("followup_plan"\)/);
});

test("Plan option lines support insertion and reorder with durable payload order",()=>{
 assert.match(admin,/function movePlanEditorLine\(edits,edit,direction\)/);
 assert.match(admin,/function insertPlanEditorLine\(edits,afterEdit,edit\)/);
 assert.match(admin,/const up=tool\("↑","meal-line-move"/);
 assert.match(admin,/const down=tool\("↓","meal-line-move"/);
 assert.match(admin,/const insert=tool\("\+ Inserir abaixo","meal-line-insert"/);
 assert.match(admin,/if\(addLine\)form\.insertBefore\(box,addLine\)/);
 assert.match(admin,/const entries=edits\.map\(edit=>\{/);
 assert.match(admin,/edit\.legend\.textContent="Linha "\+\(index\+1\)/);
 assert.match(admin,/const pending=saveChain;planPendingSaves\.push\(pending\)/);
});

test("opening imported option editor does not reference obsolete index parameter",()=>{
 const start=admin.indexOf("const addPlanLine=(item,afterEdit=null)=>{");
 const end=admin.indexOf("  (option.items||[]).filter(item=>item.kind!==\"title\").forEach",start);
 assert.ok(start>=0&&end>start);
 const block=admin.slice(start,end);
 assert.doesNotMatch(block,/\bindex\+1\b/);
 assert.match(block,/remove\.setAttribute\("aria-label","Remover linha"\)/);
 assert.match(admin,/edit\.legend\.textContent="Linha "\+\(index\+1\)/);
});

test("Menus includes CT and Estágio in selector and API allowlist",()=>{
 const app=require("node:fs").readFileSync("app.py","utf8");
 assert.match(admin,/const categoryNames=\[[^\]]*"CT","Estágio"\]/);
 assert.match(app,/if kind==\x27category\x27 and value(?:\.strip\(\))? not in \([^\)]*\x27CT\x27,\x27Estágio\x27\)/);
});

test("Modelo places effective colors before grouped post-match scenarios and hides diagnostic UI",()=>{
 const first=html.indexOf('id="matrix"'),second=html.indexOf('id="scenario-editor"');
 assert.ok(first>=0&&second>first);
 assert.match(html,/class="scenario-diagnostics" hidden/);
 assert.match(admin,/className="scenario-day-group"/);
 assert.match(admin,/className="scenario-matrix scenario-day-matrix"/);
 assert.match(admin,/select\.dataset\.color=savedColor\|\|base\|\|"none"/);
 assert.doesNotMatch(admin,/heading\.textContent="Modelo efetivo"/);
 const css=fs.readFileSync("static/admin-microcycles.css","utf8");
 assert.match(css,/#matrix \.model-effective-matrix tr:nth-child\(even\) td/);
 assert.match(css,/#scenario-editor \.microcycle-color-select\[data-color=green\]/);
});

test("Model uses actual minute ranges and has no redundant guidance",()=>{
 assert.match(admin,/\["very_low","0 min · Não jogou"\]/);
 assert.match(admin,/\["low","1–29 min"\]/);
 assert.match(admin,/\["medium","30–59 min"\]/);
 assert.doesNotMatch(html,/High utiliza o modelo atual/);
 assert.doesNotMatch(html,/id="model-legend"/);
 assert.doesNotMatch(html,/class="scenario-cells gridbox"/);
});

test("meal selectors fill both effective and post-match matrix cells",()=>{
 const css=fs.readFileSync("static/admin-microcycles.css","utf8");
 assert.match(css,/#matrix \.model-effective-matrix td:not\(:first-child\)/);
 assert.match(css,/#scenario-editor \.scenario-day-matrix tbody td/);
 assert.match(css,/#matrix \.model-effective-matrix td \.microcycle-color-select,/);
 assert.match(css,/#scenario-editor \.scenario-day-matrix tbody td \.microcycle-color-select/);
 assert.match(css,/width:100%!important;/);
 assert.match(css,/min-height:40px!important;/);
});

test("Bottle-green VP and compact high-visibility meal controls apply to both matrices",()=>{
 const css=fs.readFileSync("static/admin-microcycles.css","utf8");
 assert.match(css,/#matrix \.microcycle-color-select\[data-color="vp"\],/);
 assert.match(css,/#scenario-editor \.microcycle-color-select\[data-color="vp"\]/);
 assert.match(css,/background:#28543e!important/);
 assert.match(css,/#matrix \.model-effective-matrix,\s*#scenario-editor \.scenario-day-matrix/);
 assert.match(css,/max-width:1380px!important/);
 assert.match(css,/min-height:46px!important/);
});

test("Calendar day editing keeps the color endpoint and nutrition without option browser",()=>{
 const start=admin.indexOf("function renderDayPreview(day,host){");
 const end=admin.indexOf("let dayWeightReferences={};",start);
 assert.ok(start>=0&&end>start);
 const section=admin.slice(start,end);
 assert.match(section,/calendar\/meal-color/);
 assert.match(section,/averageMealNutrition\(mealOptionsByColor/);
 assert.match(section,/renderNutritionTotals\(host,"Resumo nutricional do dia",plannedDayTotals\(day\)/);
 assert.doesNotMatch(section,/Ver opções/);
 assert.doesNotMatch(section,/opções disponíveis/);
 assert.doesNotMatch(section,/Pré-visualização administrativa/);
 assert.match(section,/className="day-meal-nutrients"/);
});
test("Calendar month events remain editable under a collapsed summary",()=>{
 assert.match(html,/<details class="calendar-event-list" id="calendar-month-events">/);
 assert.match(html,/id="calendar-matches"/);
 assert.match(admin,/list\.append\(renderUnifiedEvent\(ev\)\)/);
 assert.match(admin,/\$\("calendar-month-count"\)\.textContent=monthEventCount/);
 assert.match(html,/id="calendar-peri-flags"/);
 assert.doesNotMatch(html,/<h2>Calendário<\/h2>/);
});

test("Weekly average is outside month-event accordion and meal controls stay editable",()=>{
 assert.match(admin,/\$\("calendar-month-events"\)\.insertAdjacentElement\("afterend",weekly\)/);
 assert.match(admin,/colorBar\.append\(choose\)/);
 assert.match(admin,/className="day-meal-nutrients"/);
 assert.match(admin,/\]\.join\(" · "\)/);
 assert.match(admin,/className="calendar-week-coverage"/);
 assert.match(admin,/renderNutritionTotals\(host,"Resumo nutricional do dia",plannedDayTotals\(day\)/);
 assert.match(admin,/nutritionCards\(weekly,average,null,relativeMeans\)/);
 assert.match(admin,/calendar\/meal-color/);
});

test("Light mode assessment editing and Planning picker keep readable surfaces",()=>{
 const light=fs.readFileSync("static/admin-light-theme.css","utf8");
 const start=light.indexOf("/* Light theme: assessment editor surfaces and Planning's searchable player list.");
 assert.ok(start>=0,"Scoped light theme fixes are present");
 const rules=light.slice(start);
 for(const selector of [
  '#assessments-admin-panel .assessment-review-group',
  '#assessments-admin-panel .assessment-review-grid label',
  '#assessments-admin-panel .assessment-review-grid .tm-assessment-prior-value',
  '#assessments-admin-panel .assessment-review-grid input[readonly]',
  '#tm-admin-legacy .tm-planning-results',
  '#tm-admin-legacy .tm-planning-result[aria-selected="true"]',
  '#tm-admin-legacy .tm-planning-result-empty'
 ])assert.ok(rules.includes(selector),selector);
 assert.match(rules,/html\[data-admin-theme="light"\]/);
 assert.match(rules,/background:var\(--tm-light-surface\)/);
 assert.match(rules,/background:#e9eef5/);
 assert.match(html,/admin-light-theme\.css\?v=11/);
 assert.match(html,/id="assessment-review-form"/);
 assert.match(html,/id="tm-planning-results"/);
});

test("archived players have their own collapsible card below the active list",()=>{
 const list=html.indexOf('id="tm-players-body"');
 const end=html.indexOf('id="tm-players-error"');
 const archive=html.indexOf('id="tm-players-archived-panel"');
 assert.ok(list>=0&&end>list&&archive>end,"archive card follows the player table");
 assert.equal(html.split('id="tm-players-archived-box"').length-1,1);
 assert.match(html,/id="tm-players-archived-panel" class="tm-players-panel tm-players-archived-panel"/);
 assert.match(dashboard,/async function loadArchivedPlayers\(\)/);
 assert.match(dashboard,/tm-players-archived-box/);
 const dark=fs.readFileSync("static/admin-microcycles.css","utf8");
 const light=fs.readFileSync("static/admin-light-theme.css","utf8");
 assert.match(dark,/\.tm-players-archived-panel\{margin-top:18px/);
 assert.match(dark,/\.tm-archived-row\{/);
 assert.match(dark,/#tm-players-page:has\(#tm-players-profile:not\(\[hidden\]\)\)/);
 assert.match(light,/tm-players-archived-box\[open\]/);
});

test("Player Gerir acesso uses approved hierarchy and preserves secure actions",()=>{
 const profile=html.slice(html.indexOf('id="tm-players-profile"'),html.indexOf('id="tm-players-profile"')+6500);
 assert.match(profile,/Gerir acesso/);
 assert.doesNotMatch(profile,/Dados do jogador · geridos em Jogadores|Oculta o jogador das listas|Utilizador: @|Acesso à App do Jogador/);
 for(const id of ["tm-players-archive","tm-players-access-toggle","tm-players-password-toggle","tm-players-password-new","tm-players-password-confirm","tm-players-password-save","tm-players-password-cancel"])
   assert.equal(profile.split('id="'+id+'"').length-1,1,id);
 assert.ok(profile.indexOf('id="tm-players-archive"')>profile.indexOf('id="tm-players-access-management"'));
 assert.equal((profile.match(/class="tm-access-visibility-toggle"/g)||[]).length,2);
 assert.match(dashboard,/resetPasswordForm\(\)/);
 assert.match(dashboard,/dataset\.passwordTarget/);
 assert.match(dashboard,/accessToggle\.classList\.toggle\("is-unblocking"/);
 assert.match(dashboard,/confirmation:"ARQUIVAR"/);
 assert.match(dashboard,/password-reset/);
 const css=fs.readFileSync("static/admin-microcycles.css","utf8");
 const light=fs.readFileSync("static/admin-light-theme.css","utf8");
 for(const selector of [".tm-access-archive",".tm-access-block",".tm-access-password-form",".tm-access-password-actions"])assert.ok(css.includes(selector));
 assert.match(light,/\.tm-access-archive/);
 assert.match(light,/\.tm-access-password-form/);
});

test("Player access loader never uses removed identity element",()=>{
 assert.doesNotMatch(dashboard,/accessIdentity|tm-players-access-identity/);
 assert.match(dashboard,/playerAccess=data\.access;paintPlayerAccess\(\)/);
 assert.match(dashboard,/accessToggle\.hidden=!playerAccess/);
 assert.match(dashboard,/\$\("tm-players-password-toggle"\)\.hidden=!playerAccess/);
 assert.match(dashboard,/if\(playerAccess\)\{accessToggle\.querySelector/);
 assert.match(dashboard,/accessFeedback\.textContent="Não foi possível consultar o acesso:/);
});

test("Dashboard uses photo metadata, with initials fallback, and MD-green game events",()=>{
 const py=fs.readFileSync("dashboard_v2.py","utf8");
 const dark=fs.readFileSync("static/admin-microcycles.css","utf8");
 const lightCss=fs.readFileSync("static/admin-light-theme.css","utf8");
 assert.match(py,/u\.photo IS NOT NULL/);
 assert.match(py,/week_rows\.append\(\{"id": aid,[\s\S]*?"has_photo": False/);
 assert.match(dashboard,/if\(player\.has_photo&&player\.user_id\)/);
 assert.ok(dashboard.includes('img.src="/api/players/"+encodeURIComponent(player.user_id)+"/photo"'));
 assert.match(dashboard,/img\.addEventListener\("error",\(\)=>img\.remove\(\)\)/);
 assert.match(dashboard,/item\.match_id\?" tm-db-game":""/);
 assert.match(dark,/\.tm-db-event\.tm-db-game\{background:#193126!important/);
 assert.match(lightCss,/\.tm-db-event\.tm-db-game\{background:#e5f3e9!important/);
 assert.match(html,/admin-dashboard\.js\?v=33/);
});

test("Player picker photos share linked account metadata while retaining initials fallback",()=>{
 const app=fs.readFileSync("app.py","utf8");
 const css=fs.readFileSync("static/admin-microcycles.css","utf8");
 assert.match(app,/athlete\['has_photo'\] = bool\(linked and linked\['has_photo'\]\)/);
 assert.match(admin,/o\.dataset\.userId=a\.user_id\|\|""/);
 assert.match(admin,/chosen\?\.dataset\.hasPhoto==="true"/);
 assert.match(dashboard,/o\.dataset\.userId=option\.dataset\.userId\|\|""/);
 assert.match(dashboard,/option\?\.dataset\.hasPhoto==="true"/);
 assert.match(dashboard,/avatar\.textContent=name\.trim\(\)/);
 assert.match(css,/\.tm-picker-photo\{/);
 assert.match(css,/#tm-dashboard \.tm-db-avatar\{width:38px/);
 assert.match(css,/#tm-players-page \.tm-p-avatar\{width:46px/);
 assert.match(html,/admin-microcycles\.js\?v=18243/);
});
