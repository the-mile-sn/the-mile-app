"use strict";
// Regression guard: mobile/desktop menu planning and the admin preview share one
// calendar-effective color resolver. No browser or production athlete data required.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"..","static","admin-microcycles.js"),"utf8");
const start=source.indexOf("function effectiveMenuMealColor(");
const end=source.indexOf("\nasync function loadMenus()",start);
assert.ok(start>=0&&end>start,"Shared menu color resolver exists");

const model={
 classifications:[
  {name:"Geral",meals:{lunch:"blue",dinner:"green"}},
  {name:"MD",meals:{lunch:"orange",dinner:"yellow"}}
 ]
};
const resolve=vm.runInNewContext(source.slice(start,end)+"\neffectiveMenuMealColor;",{model});
const date="2026-11-09";

test("No-match days inherit Geral without explicit classification",()=>{
 assert.equal(resolve(date,null,"lunch",{}),"blue");
 assert.equal(resolve(date,"","dinner",{}),"green");
});
test("Specific MD classification has its own colors",()=>{
 assert.equal(resolve(date,"MD","lunch",{}),"orange");
});
test("Manual calendar exception wins over Geral",()=>{
 const calendar={meal_color_overrides:[{meal_date:date,meal:"lunch",color:"yellow"}]};
 assert.equal(resolve(date,null,"lunch",calendar),"yellow");
});
test("Explicit none means no menu color",()=>{
 const calendar={meal_color_overrides:[{meal_date:date,meal:"lunch",color:"none"}]};
 assert.equal(resolve(date,null,"lunch",calendar),null);
});
test("Effective calendar color is authoritative for both views",()=>{
 const calendar={effective_colors:{[date]:{lunch:{color:"vp"}}},meal_color_overrides:[{meal_date:date,meal:"lunch",color:"orange"}]};
 assert.equal(resolve(date,null,"lunch",calendar),"vp");
});
test("Preview and planning both call the same resolver",()=>{
 assert.equal((source.match(/effectiveMenuMealColor\(/g)||[]).length,3);
});
