const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("static/admin-microcycles.js","utf8"),style=fs.readFileSync("static/admin-microcycles.css","utf8");
function extract(name,after){const at=source.indexOf(after);assert.ok(at>=0);const end=source.indexOf("\n}",at);assert.ok(end>at);return source.slice(at,end+2);}
test("skin fold cutoff boundaries are unambiguous for both sexes and goalkeepers",()=>{
 const fn=extract("tmSkinfoldCategory",'function tmSkinfoldCategory(value, fieldPosition="", sex="M"){');
 const f=vm.runInNewContext("const clinicalNumber=v=>v==null||v===''?null:Number(String(v).replace(',', '.'));"+fn+";tmSkinfoldCategory");
 for(const [sex,position,cutoffs] of [["M","",[45,55,60]],["M","GR",[50,60,65]],["F","",[65,70,80]],["F","GR",[70,75,85]]]){
  const [dark,yellow,red]=cutoffs;
  assert.equal(f(dark,position,sex).code,"dark-green",sex+" "+position+" dark boundary");
  assert.equal(f(dark+0.01,position,sex).code,"light-green",sex+" "+position+" green starts");
  assert.equal(f(yellow-0.01,position,sex).code,"light-green",sex+" "+position+" green ends");
  assert.equal(f(yellow,position,sex).code,"yellow",sex+" "+position+" yellow starts");
  assert.equal(f(red-0.01,position,sex).code,"yellow",sex+" "+position+" yellow ends");
  assert.equal(f(red,position,sex).code,"red",sex+" "+position+" red starts");
  assert.equal(f(red+10,position,sex).code,"red",sex+" "+position+" red continues");
 }
 assert.equal(f(60).code,"red","legacy calls preserve masculine defaults");
 assert.equal(f(60,"GR").code,"yellow","legacy goalkeeper offset");
 assert.equal(f(80,"",null).code,"red","undefined profile sex uses legacy classification");
 assert.equal(f(null,"","F"),null);
 assert.equal(f("","GR","F"),null);
});
test("clinical directions preserve contextual indicators and three-muscle perimeter total",()=>{
 const at=source.indexOf("const tmClinicalDirections="),end=source.indexOf("\n",at);
 const dirs=vm.runInNewContext(source.slice(at,end).replace("const tmClinicalDirections=","(").replace(/;$/,")"));
 assert.equal(dirs.sum_8,-1);assert.equal(dirs.body_fat,-1);assert.equal(dirs.sum_perimeters,1);
 assert.equal(dirs.weight,undefined);assert.equal(dirs.bmi,undefined);
 assert.match(source,/\["sum_perimeters",\["arm_muscle","thigh_muscle","calf_muscle"\]\]/);
});
test("interactive chart has broad pointer targeting and historical mean",()=>{
 for(const name of ["pointermove","pointerleave","tm-assessment-hover","tmAssessmentSvg(\"line\"",'"Média "+clinicalFormat(avg)',"tabindex:\"0\"","tmSkinfoldCategory(points[i].value,model?.athlete?.field_position,model?.athlete?.sex)"]) assert.ok(source.includes(name),name);
});
test("dated measurement bars preserve all published values",()=>{
 for(const name of ["tm-assessment-history-bar-row","assessmentPtDate(point.date)","drawBars","tm-assessment-history-bars"])assert.ok(source.includes(name),name);
});
test("game form uses semantic badges and keeps unanswered states",()=>{
 for(const name of ["tm-answer-badge","tm-answer-missing","tm-answer-positive","tm-answer-negative","Não preenchido","visualValue(key,answers[key]"])assert.ok(source.includes(name)||style.includes(name),name);
 assert.match(source,/deleteMonitoringGame\(record\.match_id,record\.match_date\)/);
});
