"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const source=fs.readFileSync("static/jogador-v2.js","utf8");
const from=source.indexOf("function datedPlanOptions(");
const until=source.indexOf("// Read-only nutritional parity check",from);
assert.ok(from>0&&until>from,"datedPlanOptions must exist in production player JavaScript");
const functionSource=source.slice(from,until);
const first={number:1,option_ref:"ref-a",source_draft_id:"plan-a",totals:{kcal:400}};
const second={number:2,option_ref:"ref-b",source_draft_id:"plan-a",totals:{kcal:250}};
const plans={yellow:{breakfast:[first,second]}};
const choice={meal_date:"2026-11-12",meal_key:"breakfast",option_index:2,
              option_ref:"ref-b",source_draft_id:"plan-a",source_color:"yellow"};
function resolve(selections){
 return new Function("plans","publishedMealChoices",functionSource+"return datedPlanOptions;")(
  plans,selections);
}
test("No published assignment preserves all options",()=>{
 assert.deepEqual(resolve({})("2026-11-12","breakfast","yellow"),[first,second]);
});
test("Dated published selection only filters its exact meal on the exact day",()=>{
 const fn=resolve({"2026-11-12|breakfast":choice});
 assert.deepEqual(fn("2026-11-12","breakfast","yellow"),[second]);
 assert.deepEqual(fn("2026-11-13","breakfast","yellow"),[first,second]);
 assert.deepEqual(fn("2026-11-12","snack","yellow"),[]);
});
test("Changes to Planos invalidate a stale selection safely",()=>{
 const fn=resolve({"2026-11-12|breakfast":choice});
 assert.deepEqual(fn("2026-11-12","breakfast","blue"),[]);
 for(const invalid of [{...choice,option_ref:"changed"},{...choice,source_draft_id:"different"},
                       {...choice,source_color:"green"},{...choice,option_index:1}]){
  const current=resolve({"2026-11-12|breakfast":invalid});
  assert.deepEqual(current("2026-11-12","breakfast","yellow"),[first,second]);
 }
});
