"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
function lastRule(selector){
 const anchor=selector+"{";
 const index=css.lastIndexOf(anchor);
 assert.ok(index>=0,"Expected style rule: "+selector);
 return css.slice(index+anchor.length,css.indexOf("}",index));
}
test("Form icon surround matches the existing daily meal icon geometry",()=>{
 const rule=lastRule("#overview #day-details .post-match-inline-icon");
 for(const d of ["width:37px!important","height:37px!important","flex:0 0 37px!important","border-radius:11px!important"]){
  assert.ok(rule.includes(d),"Missing "+d);
 }
 const mealAnchor=".meal-leading-icon{width:37px;height:37px;";
 assert.ok(css.includes(mealAnchor));
 const meal=css.slice(css.indexOf(mealAnchor),css.indexOf("}",css.indexOf(mealAnchor)));
 assert.ok(meal.includes("border-radius:11px"));
});
test("Match and post-match icons use 17px meal grid inset",()=>{
 for(const sel of [
  "#overview #day-details .daily-event-card.match-intra-card > summary.daily-meal-head",
  "#overview #day-details .post-match-inline-trigger"
 ]){
  assert.ok(lastRule(sel).includes("padding-left:17px!important"),sel);
 }
 assert.ok(lastRule("#overview #day-details .daily-event-card").includes("padding-left:17px!important"));
});
test("Only player CSS is cache-busted, with original SVGs still present",()=>{
 assert.ok(js.includes('matchIconBox.className="meal-leading-icon"'));
 assert.ok(js.includes('icon.className="post-match-inline-icon"'));
 assert.ok(html.includes("jogador-v2.css?v=194"));
 assert.ok(html.includes("jogador-v2.js?v=160"));
});
