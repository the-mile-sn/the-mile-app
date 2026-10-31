const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const dashboard=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
test("assessment page orders dashboard then registry then import",()=>{
 const a=html.indexOf('id="tm-assessment-dashboard"'),b=html.indexOf('id="tm-assessment-registry"'),c=html.indexOf('class="tm-assessment-import-section"');
 assert.ok(a>=0&&a<b&&b<c);assert.equal(html.split('id="assessment-excel"').length-1,1);assert.equal(html.split('id="assessment-review-form"').length-1,1);
});
test("metric priority, one chart with selectable complete assessments and no thresholds",()=>{
 assert.match(js,/const assessmentMetrics=ASSESSMENT_GROUPS\[1\]\[2\]/);
 assert.match(js,/for\(const \[key,label,unit\] of assessmentMetrics\)/);
 assert.match(js,/card\.style\.backgroundColor=category\.color/);
 assert.match(js,/const published=records\.filter\(r=>r\.status==="published"\)/);
 assert.match(js,/\[\.\.\.assessmentMetrics,\.\.\.ASSESSMENT_GROUPS\[2\]\[2\],\.\.\.ASSESSMENT_GROUPS\[3\]\[2\]\]/);
 assert.match(js,/className="tm-assessment-hover"/);
 assert.doesNotMatch(js,/const SKINFOLD_CUTOFFS/);
});
test("registry is global and filterable without duplicating assessments",()=>{
 assert.match(js,/Promise\.allSettled\(athletes\.map\(a=>request\("\/api\/v2\/athletes\/"/);
 for(const key of ["tm-assessment-filter-text","tm-assessment-filter-player","tm-assessment-filter-status","tm-assessment-filter-date"])assert.match(html,new RegExp('id="'+key+'"'));
 assert.match(js,/window\.tmRefreshAssessmentRegistry=refreshAssessmentRegistry/);
 assert.match(dashboard,/window\.tmRefreshAssessmentRegistry/);
});
test("post match matrix preserves unanswered values and existing record operations",()=>{
 assert.match(js,/tm-postmatch-matrix/);
 assert.match(js,/Não preenchido/);
 assert.match(js,/deleteMonitoringGame\(record\.match_id,record\.match_date\)/);
 assert.match(js,/deleteMonitoringWeight\(record\.weigh_date\)/);
 assert.match(js,/monitoring-game-cancel/);
});
test("legacy editor and clinical account endpoints stay intact",()=>{
 for(const key of ["assessment-publish","assessment-draft","assessment-excel-fill-preview","admin-account-panel","profile-monitoring","monitoring-game-form","monitoring-weight-form"])assert.equal(html.split('id="'+key+'"').length-1,1);
 assert.match(css,/tm-assessment-details/);
});
