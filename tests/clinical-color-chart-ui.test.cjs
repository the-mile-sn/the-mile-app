const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("static/admin-microcycles.js","utf8"),style=fs.readFileSync("static/admin-microcycles.css","utf8");
function extract(name,after){const at=source.indexOf(after);assert.ok(at>=0);const end=source.indexOf("\n}",at);assert.ok(end>at);return source.slice(at,end+2);}
test("skin fold cutoff boundaries are unambiguous",()=>{
 const fn=extract("tmSkinfoldCategory",'function tmSkinfoldCategory(value, fieldPosition=""){');
 const f=vm.runInNewContext("const clinicalNumber=v=>Number(v);"+fn+";tmSkinfoldCategory");
 assert.equal(f(44.9).code,"dark-green");assert.equal(f(45).code,"dark-green");
 assert.equal(f(45.01).code,"light-green");assert.equal(f(54.99).code,"light-green");
 assert.equal(f(55).code,"yellow");assert.equal(f(64.99).code,"yellow");assert.equal(f(65).code,"red");assert.equal(f(72).code,"red");
 assert.equal(f(50,"GR").code,"dark-green");assert.equal(f(50.01,"GR").code,"light-green");
 assert.equal(f(60,"GR").code,"yellow");assert.equal(f(69.99,"GR").code,"yellow");assert.equal(f(70,"GR").code,"red");
});
test("clinical directions preserve contextual indicators and three-muscle perimeter total",()=>{
 const at=source.indexOf("const tmClinicalDirections="),end=source.indexOf("\n",at);
 const dirs=vm.runInNewContext(source.slice(at,end).replace("const tmClinicalDirections=","(").replace(/;$/,")"));
 assert.equal(dirs.sum_8,-1);assert.equal(dirs.body_fat,-1);assert.equal(dirs.sum_perimeters,1);
 assert.equal(dirs.weight,undefined);assert.equal(dirs.bmi,undefined);
 assert.match(source,/\["sum_perimeters",\["arm_muscle","thigh_muscle","calf_muscle"\]\]/);
});
test("interactive chart has broad pointer targeting and historical mean",()=>{
 for(const name of ["pointermove","pointerleave","tm-assessment-hover","tmAssessmentSvg(\"line\"",'"Média "+clinicalFormat(avg)',"tabindex:\"0\"","tmSkinfoldCategory(points[i].value,model?.athlete?.field_position)"]) assert.ok(source.includes(name),name);
});
test("dated measurement bars preserve all published values",()=>{
 for(const name of ["tm-assessment-history-bar-row","assessmentPtDate(point.date)","drawBars","tm-assessment-history-bars"])assert.ok(source.includes(name),name);
});
test("game form uses semantic badges and keeps unanswered states",()=>{
 for(const name of ["tm-answer-badge","tm-answer-missing","tm-answer-positive","tm-answer-negative","Não preenchido","visualValue(key,answers[key]"])assert.ok(source.includes(name)||style.includes(name),name);
 assert.match(source,/deleteMonitoringGame\(record\.match_id,record\.match_date\)/);
});
