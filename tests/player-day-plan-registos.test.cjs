// Início (24/11): «Plano do dia» with the day's record count, «Registos» for the last 7 days,
// and the registered marker reduced to the check icon.
const test=require("node:test");const assert=require("node:assert/strict");const fs=require("fs");
const source=fs.readFileSync("static/jogador-v2.js","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
function extract(name){const start=source.indexOf("function "+name+"(");assert.ok(start>=0,name);let depth=0,i=source.indexOf("{",start);for(;i<source.length;i++){if(source[i]==="{")depth++;else if(source[i]==="}"&&--depth===0)break;}return source.slice(start,i+1);}
const plannedRecordItemsForDay=new Function(extract("plannedRecordItemsForDay")+";return plannedRecordItemsForDay;")();
const dayRecordProgress=new Function(extract("dayRecordProgress")+";return dayRecordProgress;")();
const calendar={
 meals:["breakfast","lunch","snack","dinner","supper"],
 days:[{date:"2026-11-23",classification:"MD+1"},{date:"2026-11-24",classification:null}],
 classifications:[{name:"MD+1",meals:{breakfast:"blue",lunch:"green",snack:"blue",dinner:"green"}},{name:"Geral",meals:{breakfast:"blue",lunch:"blue"}}],
 effective_colors:{"2026-11-23":{dinner:{color:null}}},
 meal_color_overrides:[{meal_date:"2026-11-23",meal:"supper",color:"yellow"},{meal_date:"2026-11-24",meal:"lunch",color:"none"}],
 events:[{id:"t1",kind:"training",event_date:"2026-11-23",session:"morning"},{id:"off1",kind:"off",event_date:"2026-11-23",session:"morning"}],
 matches:[{id:"m1",match_date:"2026-11-23",match_time:"20:00"}],
 peri_meals:[{event_id:"t1",event_date:"2026-11-23",phase:"pre",selection_phase:"pre_training",options:[{}]},{event_id:"t1",event_date:"2026-11-23",phase:"post",selection_phase:"post_training",options:[{}]},
  {event_id:"m1",event_date:"2026-11-23",phase:"pre",selection_phase:"intra_match",options:[{}]},{event_id:"m1",event_date:"2026-11-23",phase:"post",selection_phase:"post_match",options:[{}]},
  {event_id:"m1",event_date:"2026-11-23",phase:"pre",selection_phase:"pre_match",options:[]},{event_id:"off1",event_date:"2026-11-23",phase:"post",selection_phase:"post_training",options:[{}]}]
};
test("planned items: main meals by colour precedence, plus peri-event meals of trainings and matches shown that day",()=>{
 const main=x=>({meal:x,event_id:""});
 assert.deepEqual(plannedRecordItemsForDay(calendar,"2026-11-23"),[main("breakfast"),main("lunch"),main("snack"),main("supper"),{meal:"pre_training",event_id:"t1"},{meal:"post_training",event_id:"t1"},{meal:"intra_match",event_id:"m1"},{meal:"post_match",event_id:"m1"}]);
 assert.deepEqual(plannedRecordItemsForDay(calendar,"2026-11-24"),[main("breakfast")]);
 assert.deepEqual(plannedRecordItemsForDay(calendar,"2026-11-30"),[]);
});
test("a complete day needs every planned item registered (peri meals by event) plus the fasting weight",()=>{
 const records=[{meal_key:"breakfast",meal_date:"2026-11-23",event_id:""},{meal_key:"post_training",meal_date:"2026-11-23",event_id:"t1"},{meal_key:"post_training",meal_date:"2026-11-23",event_id:"other"},{meal_key:"snack",meal_date:"2026-11-22",event_id:""}];
 assert.deepEqual(dayRecordProgress([{meal:"breakfast",event_id:""},{meal:"post_training",event_id:"t1"},{meal:"pre_training",event_id:"t1"}],records,"2026-11-23",false),{done:2,total:4});
 assert.deepEqual(dayRecordProgress([{meal:"breakfast",event_id:""}],records,"2026-11-23",true),{done:2,total:2});
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
test("Semana opens from the widget and always shows a back button to that day",()=>{
 assert.match(source,/open\.onclick=\(\)=>\{weekReturnDay=date;overviewMode="week";/);
 assert.match(source,/const back=\$\("overview-back"\);back\.hidden=!isWeek;/);
 assert.doesNotMatch(source,/overview-mode/);
 assert.match(fs.readFileSync("static/jogador-v2.html","utf8"),/<button type="button" id="overview-back" class="overview-back" hidden aria-label="Voltar ao dia">/);
});
