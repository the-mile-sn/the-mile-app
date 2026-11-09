"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const source=fs.readFileSync("static/jogador-v2.js","utf8");
function block(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>0&&b>a,"Cannot extract production source: "+start);
 return source.slice(a,b);
}
const logic=block("function average(options)","const periTimingLabels=")+
            block("function datedPlanOptions(","// Read-only nutritional parity check")+
            block("function dayNutritionTotal(","function weeklySummary(");
const num=(kcal,protein_g,carbs_g,fat_g)=>({kcal,protein_g,carbs_g,fat_g});
const food=(number,ref,nutrients)=>({
 number,option_ref:ref,source_draft_id:"plan-id",totals:nutrients,items:[]
});
const breakfast=[
 food(1,"br-1",num(320,25,40,8)),food(2,"br-2",num(480,35,60,12))
];
const lunch=[
 food(1,"lu-1",num(500,35,60,10)),food(2,"lu-2",num(700,45,100,14))
];
const peri=[food(1,"peri-1",num(150,9,25,3)),food(2,"peri-2",num(250,15,35,5))];
const plans={yellow:{breakfast},orange:{lunch}};
const dates=Array.from({length:7},(_,i)=>"2026-11-"+String(12+i).padStart(2,"0"));
const meals=["breakfast","lunch"];
const assignedColor=(date,meal)=>meal==="breakfast"?"yellow":"orange";
const events=dates.map(date=>({
 event_date:date,options:date===dates[0]?[peri[1]]:peri
}));
const selected={
 [dates[0]+"|breakfast"]:{
  option_index:2,option_ref:"br-2",source_draft_id:"plan-id",source_color:"yellow"
 },
 [dates[0]+"|lunch"]:{
  option_index:1,option_ref:"lu-1",source_draft_id:"plan-id",source_color:"orange"
 }
};
function app(assignments,periMeals=events){
 return new Function("plans","publishedMealChoices","assignedColor","periMeals","meals",
   logic+"return {datedPlanOptions,dayNutritionTotal,weeklyDayTotal,summarizeWeekNutrition};")(
     plans,assignments,assignedColor,periMeals,meals);
}
function matches(actual,expected){
 for(const key of Object.keys(expected))
  assert.ok(Math.abs(actual[key]-expected[key])<1e-7,
            key+" expected "+expected[key]+", got "+actual[key]);
}
test("Unassigned player uses the existing mean-of-options day nutrition",()=>{
 const player=app({},dates.map(date=>({event_date:date,options:peri})));
 matches(player.dayNutritionTotal({date:dates[0],classification:"Geral"}),
         num(1200,82,160,26));
});
test("Published choice contributes its own totals to player daily nutrition",()=>{
 const player=app(selected);
 matches(player.dayNutritionTotal({date:dates[0],classification:"Geral"}),
         num(1230,85,155,27));
});
test("The 7-day average is derived from individually selected day totals",()=>{
 const player=app(selected);
 const daily=dates.map(date=>player.weeklyDayTotal({date,classification:"Geral"}));
 const out=player.summarizeWeekNutrition(dates,daily);
 assert.equal(out.complete,true);
 matches(out.means,num((1230+1200*6)/7,(85+82*6)/7,
                       (155+160*6)/7,(27+26*6)/7));
});
test("A stale selection cannot change daily or weekly nutritional values",()=>{
 const player=app({
  [dates[0]+"|breakfast"]:{
   option_index:2,option_ref:"br-old",source_draft_id:"plan-id",source_color:"yellow"
  }
 },dates.map(date=>({event_date:date,options:peri})));
 const totals=player.dayNutritionTotal({date:dates[0],classification:"Geral"});
 matches(totals,num(1200,82,160,26));
});
