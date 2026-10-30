// Run with: node --test tests/nutrition-parity.test.cjs
// Uses functions extracted from the actual player and Backoffice JavaScript files.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const player=fs.readFileSync("static/jogador-v2.js","utf8");
const admin=fs.readFileSync(process.env.THE_MILE_ADMIN_JS||"admin-branch/static/admin-microcycles.js","utf8");
function extract(source,name){
 const start=source.indexOf("function "+name+"(");
 assert.notEqual(start,-1,"missing function "+name);
 const open=source.indexOf("{",start);
 let depth=0,inString=null,escaped=false;
 for(let i=open;i<source.length;i++){
  const c=source[i];
  if(inString){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}if(c===inString)inString=null;continue;}
  if(c==='"'||c==="'"||c==="`"){inString=c;continue;}
  if(c==="{")depth++;
  if(c==="}"&&--depth===0)return source.slice(start,i+1);
 }
 throw Error("unclosed function "+name);
}
const opts=(kcal,p=0,carbs=0,fat=0)=>[{totals:{kcal,protein_g:p,carbs_g:carbs,fat_g:fat}}];
function contexts(){
 const meals=["breakfast","lunch","snack","dinner","supper"];
 const modelRows=[{name:"Geral",meals:{breakfast:"yellow",lunch:"blue",snack:null,dinner:"yellow",supper:null}},{name:"MD-1",meals:{breakfast:"green",lunch:"blue",snack:null,dinner:"green",supper:null}}];
 const plans={yellow:{breakfast:opts(500,25,60,12),dinner:opts(700,35,90,18)},blue:{lunch:opts(800,40,100,20)},green:{breakfast:opts(650,33,75,15),dinner:opts(900,45,110,25)}};
 const base={meals,model:modelRows,plans,periMeals:[],dayColorOverrides:{},effectiveScenarioColorsByDay:{},POST_MATCH_DISPLAY_ENABLED:false};
 const p=vm.createContext({...base});
 vm.runInContext(["average","assignedColor","dayNutritionTotal","weeklyDayTotal"].map(n=>extract(player,n)).join("\n"),p);
 const a=vm.createContext({model:{meals,classifications:modelRows},mealOptionsByColor:plans,periByDay:{},dayColorOverrides:{},effectiveAdminColorsByDay:{},names:{breakfast:"Breakfast",lunch:"Lunch",snack:"Snack",dinner:"Dinner",supper:"Supper"},colors:{yellow:"Yellow",blue:"Blue",green:"Green"}});
 vm.runInContext(["colorForDay","mealColorsForDay","averageMealNutrition","plannedDayTotals"].map(n=>extract(admin,n)).join("\n"),a);
 return {p,a};
}
function comparable(r){return JSON.parse(JSON.stringify(r));}
test("Geral fallback yields identical absolute daily totals in player and admin",()=>{
 const {p,a}=contexts(),day={date:"2026-10-30",classification:null};
 const playerTotal=vm.runInContext("dayNutritionTotal("+JSON.stringify(day)+")",p);
 const adminResult=vm.runInContext("plannedDayTotals("+JSON.stringify(day)+")",a);
 assert.deepEqual(comparable(playerTotal),comparable(adminResult.total));
 assert.equal(playerTotal.kcal,2000);
 assert.equal(adminResult.state,"complete");
});
test("explicit microcycle prescription supersedes Geral",()=>{
 const {p,a}=contexts(),day={date:"2026-10-30",classification:"MD-1"};
 assert.deepEqual(comparable(vm.runInContext("dayNutritionTotal("+JSON.stringify(day)+")",p)),comparable(vm.runInContext("plannedDayTotals("+JSON.stringify(day)+").total",a)));
});
test("individual none override removes a Geral meal in both views",()=>{
 const {p,a}=contexts(),day={date:"2026-10-30",classification:null};
 p.dayColorOverrides[day.date+"|dinner"]="none";
 a.dayColorOverrides[day.date+"|dinner"]="none";
 const expected=1300;
 assert.equal(vm.runInContext("dayNutritionTotal("+JSON.stringify(day)+").kcal",p),expected);
 assert.equal(vm.runInContext("plannedDayTotals("+JSON.stringify(day)+").total.kcal",a),expected);
});
test("peri supplements are added once in both views",()=>{
 const {p,a}=contexts(),day={date:"2026-10-30",classification:null};
 const peri={event_date:day.date,options:opts(200,10,25,6)};
 p.periMeals=[peri];a.periByDay[day.date]=[peri];
 assert.equal(vm.runInContext("dayNutritionTotal("+JSON.stringify(day)+").kcal",p),2200);
 assert.equal(vm.runInContext("plannedDayTotals("+JSON.stringify(day)+").total.kcal",a),2200);
});
test("weekly per-day function matches daily for Geral",()=>{
 const {p}=contexts(),day={date:"2026-10-30",classification:null};
 const literal=JSON.stringify(day);
 assert.deepEqual(comparable(vm.runInContext("dayNutritionTotal("+literal+")",p)),comparable(vm.runInContext("weeklyDayTotal("+literal+")",p)));
});

test("Backoffice distinguishes automatic Geral from explicit prescription",()=>{
 assert.match(admin,/Geral · por definir/);
 assert.match(admin,/calendar-general-fallback/);
 assert.match(admin,/day\.classification\?"":" calendar-general-fallback"/);
});
test("explicit Geral classification is not marked undefined",()=>{
 const {p,a}=contexts(),day={date:"2026-10-30",classification:"Geral"};
 const pResult=vm.runInContext("dayNutritionTotal("+JSON.stringify(day)+")",p);
 const aResult=vm.runInContext("plannedDayTotals("+JSON.stringify(day)+").total",a);
 assert.deepEqual(comparable(pResult),comparable(aResult));
});
