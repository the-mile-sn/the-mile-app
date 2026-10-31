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
