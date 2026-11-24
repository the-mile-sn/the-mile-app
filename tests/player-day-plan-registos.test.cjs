// Início (24/11): «Plano do dia» with the day's record count, «Registos» for the last 7 days,
// and the registered marker reduced to the check icon.
const test=require("node:test");const assert=require("node:assert/strict");const fs=require("fs");
const source=fs.readFileSync("static/jogador-v2.js","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
function extract(name){const start=source.indexOf("function "+name+"(");assert.ok(start>=0,name);let depth=0,i=source.indexOf("{",start);for(;i<source.length;i++){if(source[i]==="{")depth++;else if(source[i]==="}"&&--depth===0)break;}return source.slice(start,i+1);}
const plannedMealsForDay=new Function(extract("plannedMealsForDay")+";return plannedMealsForDay;")();
const dayRecordProgress=new Function(extract("dayRecordProgress")+";return dayRecordProgress;")();
const calendar={
 meals:["breakfast","lunch","snack","dinner","supper"],
 days:[{date:"2026-11-23",classification:"MD+1"},{date:"2026-11-24",classification:null}],
 classifications:[{name:"MD+1",meals:{breakfast:"blue",lunch:"green",snack:"blue",dinner:"green"}},{name:"Geral",meals:{breakfast:"blue",lunch:"blue"}}],
 effective_colors:{"2026-11-23":{dinner:{color:null}}},
 meal_color_overrides:[{meal_date:"2026-11-23",meal:"supper",color:"yellow"},{meal_date:"2026-11-24",meal:"lunch",color:"none"}]
};
test("planned meals follow the day view precedence: effective colour, own change, classification",()=>{
 assert.deepEqual(plannedMealsForDay(calendar,"2026-11-23"),["breakfast","lunch","snack","supper"]);
 assert.deepEqual(plannedMealsForDay(calendar,"2026-11-24"),["breakfast"]);
 assert.deepEqual(plannedMealsForDay(calendar,"2026-11-30"),[]);
});
test("a complete day needs every planned meal registered plus the fasting weight; peri-event records do not count",()=>{
 const records=[{meal_key:"breakfast",meal_date:"2026-11-23",event_id:""},{meal_key:"lunch",meal_date:"2026-11-23",event_id:"match-1"},{meal_key:"snack",meal_date:"2026-11-22",event_id:""}];
 assert.deepEqual(dayRecordProgress(["breakfast","lunch"],records,"2026-11-23",false),{done:1,total:3});
 assert.deepEqual(dayRecordProgress(["breakfast"],records,"2026-11-23",true),{done:2,total:2});
});
test("Plano do dia heading, Registos card and icon-only registered marker are wired",()=>{
 assert.match(source,/planTitle\.textContent=playerText\("Plano do dia","Day plan"\)/);
 assert.match(source,/if\(consumptionEnabled\)renderRegistosCard\(root,d,/);
 assert.match(source,/api\("\/api\/v2\/player\/weight-history\?end="\+endKey\+"&days=7/);
 assert.match(source,/function registeredMark\(el,label\)\{el\.replaceChildren\(consumptionActionIcon\('CheckmarkCircle02Icon'\)\)/);
 assert.doesNotMatch(source,/meal-registered-badge[^;]*;consumptionActionLabel\([a-zA-Z]+,'CheckmarkCircle02Icon',playerText\(' Registado'/);
 assert.match(css,/#overview #day-details \.daily-meal:not\(\[open\]\)>\.daily-meal-head>\.meal-registered-meal-badge\{/);
 assert.match(css,/#overview #day-details \.registos-card\{/);
});
