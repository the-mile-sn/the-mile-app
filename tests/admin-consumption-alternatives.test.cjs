"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Execute the comparison functions from the actual production browser bundle.
const source = fs.readFileSync(path.join(__dirname, "../static/admin-consumption.js"), "utf8");
const start = source.indexOf(" function foodName(f)");
const end = source.indexOf(" function metric(k,n)", start);
assert.ok(start !== -1 && end > start, "Consumption comparison functions are present");
const context = vm.createContext({libraryNames: null});
vm.runInContext(source.slice(start, end), context);
const changes = record => Array.from(context.changes(record) || []);
const status = (record, diff) => context.displayStatus(record, diff);

const option = {
 foods: [
  {id:"bread",display_name:"Pão",grams:100},
  {id:"honey",display_name:"Mel",grams:35},
  {id:"cheese-a",display_name:"Queijo cottage",grams:120},
  {id:"cheese-b",display_name:"Queijo alternativo",grams:120,alternative_to:2}
 ]
};
function record(entries) {
 return {
  status:"partial",
  prescription:{option},
  consumed_foods:entries.map(([index,grams])=>({id:option.foods[index].id,grams,option_index:index,additional:false}))
 };
}
test("alternative selected and honey increased -> consumed with alterations",()=>{
 const r=record([[0,100],[1,78],[3,120]]);
 const d=changes(r);
 assert.equal(status(r,d),"all");
 assert.equal(d.filter(x=>x.type==="removed").length,0);
 assert.ok(d.some(x=>x.type==="edited"&&x.name==="Mel"&&x.before===35&&x.after===78));
 assert.ok(d.some(x=>x.type==="substituted"&&x.index===3));
});
test("alternative selected and honey reduced -> partial",()=>{
 const r=record([[0,100],[1,20],[3,120]]);
 const d=changes(r);
 assert.equal(status(r,d),"partial");
 assert.ok(d.some(x=>x.type==="edited"&&x.before===35&&x.after===20));
});
test("selected alternative does not count as a missing prescribed food",()=>{
 const r=record([[0,100],[1,35],[3,120]]);
 const d=changes(r);
 assert.equal(status(r,d),"all");
 assert.deepEqual(d.map(x=>x.type),["substituted"]);
});
test("genuinely omitted food -> partial",()=>{
 const r=record([[0,100],[3,120]]);
 const d=changes(r);
 assert.equal(status(r,d),"partial");
 assert.ok(d.some(x=>x.type==="removed"&&x.name==="Mel"));
});
test("same foods, exact quantities -> consumed",()=>{
 const r=record([[0,100],[1,35],[2,120]]);
 const d=changes(r);
 assert.equal(status(r,d),"all");
 assert.equal(d.length,0);
});
