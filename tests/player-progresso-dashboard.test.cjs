// Progresso (25/11): square widgets, each metric on its own page; charts unchanged; Peso em jejum replaces assessment weight.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('static/jogador-v2.html','utf8');
const js=fs.readFileSync('static/jogador-v2.js','utf8');
const css=fs.readFileSync('static/jogador-v2.css','utf8');
const block=(a,b)=>js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));
test('Progresso has a heading, the segmented control and a metric page container',()=>{
 assert.match(html,/<div id="plans-assessments"><header class="progress-heading">/);
 assert.match(html,/<div id="assessment-measurements"><\/div><section id="progress-page" class="progress-page" hidden><\/section>/);
 assert.match(css,/body\.progress-active:has\(#player-panel:not\(\[hidden\]\)\) \.player-top\{display:none!important\}/);
});
test('Resumo: Soma de 8 pregas wide, Peso em jejum instead of assessment weight, muscles in one wide widget, no report averages',()=>{
 const render=block('function renderPlayerAssessments(){','// Metric page:');
 assert.match(render,/if\(key==="weight"\)\{grid\.append\(progressFastingTile\(\)\)/);
 assert.match(render,/progressMetricTile\(key,label,unit,key==="sum_8"\)/);
 assert.match(render,/PROGRESS_MUSCLE_KEYS\.includes\(key\)\)continue/);
 assert.match(render,/progressMuscleTile\(muscles\)/);
 assert.doesNotMatch(render,/Médias do relatório|assessmentAverages/);
 assert.match(js,/const PROGRESS_MUSCLE_KEYS=\["muscle_index","arm_muscle","thigh_muscle","calf_muscle"\]/);
});
test('Peso em jejum widget reads the daily history and opens the existing screen inside Progresso',()=>{
 const tile=block('function progressFastingTile(){','function progressMuscleTile(');
 assert.match(tile,/api\("\/api\/v2\/player\/weight-history\?end="\+today\+"&days=7&local_date="\+today\)/);
 assert.match(tile,/openWeightDetail\(today,null,\$\("plans-assessments"\)\)/);
});
test('Peso em jejum returns to where it was opened: Progresso or Início',()=>{
 assert.match(js,/async function openWeightDetail\(date,editToday,host=\$\("overview"\)\)/);
 assert.match(js,/back\.textContent=fromProgress\?playerText\("Progresso","Progress"\):playerText\("Início","Home"\)/);
 assert.match(js,/if\(editToday\)edit\.onclick=.*else edit\.hidden=true;/);
 assert.match(css,/#plans #plans-assessments\.weight-detail-open > :not\(#weight-detail\)\{display:none!important\}/);
 assert.match(css,/:is\(#overview,#plans-assessments\) \.weight-detail-bar\{/);
});
test('each metric page uses the unchanged chart, the report average and the list of assessments; ‹ restores the scroll',()=>{
 const page=block('function openProgressPage(page){','function closeProgressPage(');
 assert.match(js,/card\.append\(buildAssessmentTrend\(progressReadings\(key\),unit,progressAxisStep\(group,unit\),key==="sum_8"\)\)/);
 assert.match(js,/const PROGRESS_REPORT_AVERAGE=\{sum_8:"avg_skinfolds",weight:"avg_weight",body_fat:"avg_body_fat"\}/);
 assert.match(page,/playerText\("Média do relatório","Report average"\)/);
 assert.match(page,/playerText\("Avaliações","Assessments"\)/);
 assert.match(page,/back\.onclick=closeProgressPage/);
 assert.match(js,/if\(restore\)\{const y=progressReturnY;requestAnimationFrame\(\(\)=>window\.scrollTo\(\{top:y\}\)\);\}/);
 assert.match(js,/closeProgressPage\(false\);if\(weightDetailOpen\)closeWeightDetail\(\);/);
});
test('widget trend lines are neutral (cut-point colours stay in the chart)',()=>{
 assert.match(css,/#plans \.progress-spark-line\{fill:none;stroke:#f1f1f4;stroke-opacity:\.5/);
 assert.match(css,/#plans \.progress-tile\{[^}]*background:rgba\(255,255,255,\.045\)/s);
});
