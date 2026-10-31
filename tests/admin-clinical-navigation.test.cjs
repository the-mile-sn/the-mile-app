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
 assert.match(html,/admin-microcycles\.css\?v=88/);
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
 assert.match(html,/admin-dashboard\.js\?v=21/); // Force browsers to load the fix.
});

test("Modelo legend and matrix stay scoped to their Planning tab, including athlete refresh",()=>{
 const vm=require("node:vm");
 const legend=html.match(/<p\b[^>]*\bid="model-legend"[^>]*>/);
 assert.ok(legend,"Modelo legend must have its own ID");
 assert.match(legend[0],/\bhidden\b/,"Modelo legend starts hidden");
 assert.equal(html.split('id="model-legend"').length-1,1);
 assert.match(html,/admin-microcycles\.js\?v=18217/);
 const elements={};
 for(const id of ["athlete-weight-panel","calendar-section","plan-import-panel","peri-panel","supplements-panel","matrix","scenario-editor","model-legend","menus-panel","player-preview-panel"]){
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
 assert.equal(elements["model-legend"].hidden,true);
 assert.equal(elements.matrix.hidden,true);
 show("matrix");
 assert.equal(elements["model-legend"].hidden,false);
 assert.equal(elements.matrix.hidden,false);
 assert.equal(elements["scenario-editor"].hidden,false);
 show("menus");
 assert.equal(elements["model-legend"].hidden,true);
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
 const source=admin.split("\n").find(line=>line.startsWith("async function loadModel(){"));
 assert.ok(source,"loadModel must exist");
 assert.match(admin,/\$\("calendar-section"\)\.hidden=backofficeView!=="calendar";/);
 assert.doesNotMatch(admin,/\$\("calendar-section"\)\.hidden=false;\s*\n}/);
 assert.match(html,/admin-microcycles\.js\?v=18217/);
 for(const view of ["calendar","plans","supplements","matrix","menus","player-preview","assessments"]){
  const calls=[];
  const ctx={
   backofficeView:view,selectedCalendarDay:"previous",selectedNutritionWeek:"previous",
   model:null,profileEditing:true,
   $:id=>id==="athlete"?{value:"athlete-1"}:null,
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
