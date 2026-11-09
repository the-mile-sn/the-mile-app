"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const file=fs.readFileSync(path.join("static","admin-microcycles.js"),"utf8");
const start=file.indexOf("function publishedNutritionOption(");
const end=file.indexOf("function renderLiveMealOptions(",start);
assert.ok(start>0&&end>start,"Expected canonical Planeamento nutrition functions");
const functions=file.slice(start,end);
const choice=(date,meal,index,ref,color,source="draft-1",event="")=>({
 meal_date:date,meal_key:meal,event_id:event,option_index:index,
 option_ref:ref,source_draft_id:source,source_color:color
});
const nutrients=(kcal,protein_g,carbs_g,fat_g)=>({kcal,protein_g,carbs_g,fat_g});
const breakfast={
 status:"ok",color:"yellow",draft_id:"draft-1",
 nutrition:nutrients(400,30,50,10),
 options:[{option_ref:"breakfast-1",nutrition:nutrients(320,25,40,8)},
          {option_ref:"breakfast-2",nutrition:nutrients(480,35,60,12)}]
};
const lunch={
 status:"ok",color:"orange",draft_id:"draft-1",
 nutrition:nutrients(600,40,80,12),
 options:[{option_ref:"lunch-1",nutrition:nutrients(500,35,60,10)},
          {option_ref:"lunch-2",nutrition:nutrients(700,45,100,14)}]
};
const peri={
 status:"ok",draft_id:"draft-1",phase:"pre_training",event_id:"event-1",
 nutrition:nutrients(200,12,30,4),
 options:[{option_ref:"peri-1",nutrition:nutrients(150,9,25,3)},
          {option_ref:"peri-2",nutrition:nutrients(250,15,35,5)}]
};
const baseline=nutrients(1200,82,160,26);
const baseDay={nutrition:baseline,meals:{breakfast,lunch},peri_events:[peri]};
const day="2026-11-12";
function calculator(assignments){
 return new Function("mealChoiceAssignments",functions+
   "return {effectiveLiveDayNutrition,publishedNutritionOption,previewNutritionOption};")(assignments);
}
function approx(actual,expected){
 for(const nutrient of Object.keys(expected)){
  assert.ok(Math.abs(actual[nutrient]-expected[nutrient])<1e-7,
   nutrient+" expected "+expected[nutrient]+", got "+actual[nutrient]);
 }
}
test("Without opt-in, daily nutrition remains the average of all Planos alternatives",()=>{
 const record=calculator({enabled:false,drafts:[],published:[
  choice(day,"breakfast",2,"breakfast-2","yellow")
 ]});
 approx(record.effectiveLiveDayNutrition(day,baseDay),baseline);
});
test("Published options replace their meal averages in full daily totals",()=>{
 const assignments={enabled:true,drafts:[],published:[
  choice(day,"breakfast",2,"breakfast-2","yellow"),
  choice(day,"lunch",1,"lunch-1","orange"),
  choice(day,"pre_training",2,"peri-2",null,"draft-1","event-1")
 ]};
 const record=calculator(assignments);
 // 400->480; 600->500; 200->250, across all four nutrients
 approx(record.effectiveLiveDayNutrition(day,baseDay),nutrients(1230,85,155,27));
});
test("A saved choice immediately changes the backoffice preview, but not published state",()=>{
 const assignments={enabled:true,published:[
  choice(day,"breakfast",2,"breakfast-2","yellow")
 ],drafts:[
  {...choice(day,"breakfast",1,"breakfast-1","yellow"),action:"select"}
 ]};
 const record=calculator(assignments);
 assert.equal(record.publishedNutritionOption(day,"breakfast",breakfast).option_ref,"breakfast-2");
 assert.equal(record.previewNutritionOption(day,"breakfast",breakfast).option_ref,"breakfast-1");
 approx(record.effectiveLiveDayNutrition(day,baseDay),nutrients(1120,77,150,24));
});
test("A saved removal previews the original average until the removal is published",()=>{
 const assignments={enabled:true,published:[
  choice(day,"breakfast",2,"breakfast-2","yellow")
 ],drafts:[{...choice(day,"breakfast",null,null,"yellow"),action:"clear"}]};
 const record=calculator(assignments);
 assert.equal(record.previewNutritionOption(day,"breakfast",breakfast),null);
 assert.equal(record.publishedNutritionOption(day,"breakfast",breakfast).option_ref,"breakfast-2");
 approx(record.effectiveLiveDayNutrition(day,baseDay),baseline);
});
test("A stale color or option reference does not change day nutrition",()=>{
 for(const bad of [
  choice(day,"breakfast",2,"breakfast-2","green"),
  choice(day,"breakfast",2,"different","yellow"),
  choice(day,"breakfast",1,"breakfast-2","yellow"),
  choice(day,"breakfast",2,"breakfast-2","yellow","previous-publication")
 ]){
  const calc=calculator({enabled:true,drafts:[],published:[bad]});
  approx(calc.effectiveLiveDayNutrition(day,baseDay),baseline);
 }
});
test("Seven-day average uses each selected daily total, not the mean of unselected options",()=>{
 const assignments={enabled:true,drafts:[],published:[
  choice(day,"breakfast",2,"breakfast-2","yellow"),
  choice(day,"lunch",1,"lunch-1","orange"),
  choice(day,"pre_training",2,"peri-2",null,"draft-1","event-1")
 ]};
 const calculate=calculator(assignments);
 const days=Array.from({length:7},(_,index)=>
  calculate.effectiveLiveDayNutrition(index===0?day:"2026-11-"+String(13+index-1).padStart(2,"0"),baseDay));
 const averages=Object.fromEntries(Object.keys(baseline).map(k=>[k,
  days.reduce((sum,row)=>sum+row[k],0)/7]));
 approx(averages,nutrients(
  (1230+1200*6)/7,(85+82*6)/7,(155+160*6)/7,(27+26*6)/7));
});
