const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const dashboard=fs.readFileSync("static/admin-dashboard.js","utf8");
const admin=fs.readFileSync("static/admin-microcycles.js","utf8");
test("main navigation has real clinical pages",()=>{
 for(const key of ["assessments","forms"]){assert.match(html,new RegExp('id="tm-admin-nav-'+key+'"'));assert.match(html,new RegExp('id="tm-'+key+'-page"'));assert.match(html,new RegExp('id="tm-'+key+'-player"'));}
});
test("shared editors stay singular, not duplicated",()=>{
 for(const id of ["assessments-admin-panel","profile-monitoring","assessment-review-form","monitoring-weight-form","monitoring-game-form"])assert.equal(html.split('id="'+id+'"').length-1,1,id);
 assert.match(dashboard,/assessmentHome\.after\(assessmentPanel\)/);
 assert.match(dashboard,/monitoringHome\.after\(monitoringPanel\)/);
 assert.match(dashboard,/tm-assessments-slot/);
 assert.match(dashboard,/tm-forms-slot/);
});
test("player identity remains tied to existing model selection",()=>{
 assert.match(dashboard,/\$\("athlete"\)\.value=aid/);
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
