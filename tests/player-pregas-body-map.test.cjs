// Pregas (26/11, canvas aprovado): neutral body map + table; the skinfold page has a mini body and ‹ previous · next ›.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('static/jogador-v2.js','utf8');
const css=fs.readFileSync('static/jogador-v2.css','utf8');
const block=(a,b)=>js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));
test('male and female figures each place the 8 skinfolds; the figure follows the player sex',()=>{
 const figures=block('const PROGRESS_BODY_FIGURES={','const PROGRESS_SKINFOLD_SITES=');
 for(const key of ['back','triceps','biceps','suprailiac','supraspinal','abdominal_skin','thigh_skin','calf_skin'])
  assert.equal((figures.match(new RegExp('[{,]'+key+':\\[[\\d.]+,[\\d.]+\\]','g'))||[]).length,2,key);
 assert.match(js,/function progressBodyFigure\(\)\{return PROGRESS_BODY_FIGURES\[String\(me\?\.sex\|\|""\)\.trim\(\)\.toUpperCase\(\)==="F"\?"F":"M"\];\}/);
});
test('Pregas shows the body map and a table instead of the square widgets; Perímetros keeps the widgets',()=>{
 const render=block('function renderPlayerAssessments(){','// Metric page:');
 assert.match(render,/else if\(assessmentGroup==="pregas"\)\{\n  if\(progressSkinfoldScreen\(target\)\)return;/);
 assert.match(render,/for\(const \[key,label,unit\] of fields\)grid\.append\(progressMetricTile\(key,label,unit,false\)\)/);
 const screen=block('function progressSkinfoldScreen(target){','// Skinfold page extras');
 assert.match(screen,/progressBodyMap\(\{onPick:open\}\)/);
 assert.match(screen,/row\.append\(name,diff,value,progressChevron\(\)\);row\.onclick=\(\)=>open\(entry\)/);
 assert.doesNotMatch(screen,/progressSpark/);
});
test('the body has no colours: flat silhouette in underwear, faint details and white dots sized by mm',()=>{
 assert.match(css,/#plans \.progress-body-fill\{fill:#2e2f35;stroke:#2e2f35;stroke-width:\.6\}/);
 assert.match(css,/#plans \.progress-body-wear\{fill:#3e3f46;stroke:none\}/);
 assert.match(css,/#plans \.progress-body-detail\{fill:none;stroke:#4a4b52;/);
 assert.match(css,/#plans \.progress-body-dot\{fill:#f1f1f4;fill-opacity:\.85\}/);
 const map=block('function progressBodyMap(','function progressSkinfoldScreen(');
 assert.match(map,/Math\.max\(3\.5,Math\.min\(9,2\.5\+values\[values\.length-1\]\*0\.45\)\)/);
 assert.doesNotMatch(map,/playerSkinfoldCategory|#1D9E75|#D85A30/i);
});
test('the skinfold page keeps the unchanged chart and adds a mini body and the pager',()=>{
 const page=block('function openProgressPage(page){','function closeProgressPage(');
 assert.match(page,/progressBodyMap\(\{selected:key,mini:true\}\)/);
 assert.match(page,/progressChartCard\(key,unit,progressPage\.group\)/);
 assert.match(page,/if\(progressPage\.group==="pregas"\)progressSkinfoldPager\(view,key\)/);
 assert.match(page,/view\.ontouchstart=view\.ontouchend=null;/);
 const pager=block('function progressSkinfoldPager(','function renderPlayerAssessments(){');
 assert.match(pager,/t\.clientX<=PLAYER_EDGE_BACK_ZONE\|\|event\.target\?\.closest\?\.\("\.assessment-trend-horizontal-scroll,button"\)/);
 assert.match(pager,/go\(dx<0\?1:-1\)/);
});
