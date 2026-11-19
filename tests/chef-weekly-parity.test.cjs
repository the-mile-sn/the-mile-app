"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const chef=fs.readFileSync("static/chef.js","utf8");
const css=fs.readFileSync("static/chef.css","utf8");
const html=fs.readFileSync("static/chef.html","utf8");

test("weekly meals show approved icons without PA/AL/JA/CE abbreviations",()=>{
 assert.match(chef,/cell\.append\(iconForMeal\(meal\)\)/);
 assert.doesNotMatch(chef,/mealAbbrev/);
 assert.match(chef,/cell\.setAttribute\("aria-label",mealNames\[lang\]\[meal\]/);
});
test("selected date uses one visual full-height lane without changing the meal tones",()=>{
 assert.match(chef,/chef-week-selected-column/);
 assert.match(chef,/highlight\.setAttribute\("aria-hidden","true"\)/);
 assert.match(css,/\.chef-week-selected-column\{/);
 assert.match(css,/top:0;bottom:0;left:calc\(var\(--chef-week-left\) - 2px\)/);
 assert.match(css,/\.chef-week-day\.selected\{background:transparent\}/);
 assert.match(css,/background:rgba\(245,245,247,\.065\)/);
 assert.match(css,/\.chef-week-cell\.selected\{[\s\S]*?background:color-mix\(in srgb,var\(--chef-tone\) 84%,white 16%\)/);
 assert.doesNotMatch(css,/\.chef-week-cell\.selected\{outline:/);
 assert.doesNotMatch(css,/border:1\.5px solid #f5f5f7;border-radius:15px/);
 assert.match(css,/left:calc\(var\(--chef-week-left-small\) - 2px\)/);
 assert.match(chef,/selectedDay=new Date\(key\+"T12:00:00"\)/);
 assert.match(chef,/const color=mealTone\(key,meal\)/);
});
test("weekly detail uses a single meal header and shared meal content",()=>{
 assert.match(chef,/function chefWeekDetailLabel\(date\)/);
 assert.match(chef,/microcycle\?" · "\+microcycle/);
 assert.match(chef,/chef-week-detail-identity/);
 assert.match(chef,/chef-week-detail-date/);
 assert.match(chef,/chef-week-detail-meal/);
 assert.doesNotMatch(chef,/panel\.append\(renderChefMeal\(date,meal,true\)\)/);
 assert.match(chef,/appendChefMenuDish\(menu,plannedMenu\(date,meal\),txt\(\)\.pending\)/);
 assert.match(chef,/const body=node\("div","chef-meal-body chef-week-meal-body"\)/);
 assert.match(chef,/appendChefMealContents\(body,date,meal\)/);
 assert.match(chef,/appendChefMealContents\(body,date,meal,onlyPrescription\)/);
 assert.match(css,/#screen\.chef-screen-home \.chef-week-detail>\.chef-week-menu-highlight\{/);
 assert.match(css,/#screen\.chef-screen-home \.chef-week-detail\{/);
 assert.doesNotMatch(css,/\.chef-week-detail\{padding:13px;background:#19191e/);
 assert.match(chef,/body\.append\(chefOptionCards\(date,meal\)\)/);
 assert.match(chef,/executionForm\(date,meal,body\)/);
});
test("weekly compact date uses localized weekday and MD classification",()=>{
 const from=chef.indexOf("function chefWeekDetailLabel(date){");
 const to=chef.indexOf("function renderChefWeekly(root){",from);
 assert.ok(from!==-1&&to>from);
 const f=new Function("format","locale","lang","classificationFor","dateKey",
   chef.slice(from,to)+"return chefWeekDetailLabel");
 const format=(date,options)=>new Intl.DateTimeFormat("pt-PT",options).format(date);
 const label=f(format,()=> "pt-PT","pt",()=>"MD-2",()=> "2026-11-19");
 assert.equal(label(new Date("2026-11-19T12:00:00")),"Qui, 19/11 · MD-2");
});
test("assets are cache-busted for the Chef view only",()=>{
 assert.match(html,/\/chef\.css\?v=12/);
 assert.match(html,/\/chef\.js\?v=16/);
});

test("weekly breakfast shows no duplicate card or heading",()=>{
 const from=chef.indexOf("function chefWeekDetailLabel(date){");
 const to=chef.indexOf("function sectionTitle(title,extra){",from);
 const source=chef.slice(from,to);
 assert.match(source,/title\.append\(node\("h2","chef-week-detail-meal",mealNames\[lang\]\[meal\]\)\)/);
 assert.doesNotMatch(source,/node\("summary","chef-meal-head"\)/);
 assert.match(source,/if\(meal==="lunch"\|\|meal==="dinner"\)\{/);
 assert.match(source,/panel\.append\(body\)/);
 assert.match(css,/#screen \.chef-week-detail \.chef-option-card\{/);
});
test("existing daily Chef card, image and actions remain in place",()=>{
 assert.match(chef,/function renderChefMeal\(date,meal,expanded=false,onlyPrescription=false\)/);
 assert.match(chef,/card\.append\(head\)/);
 assert.match(chef,/card\.append\(body\)/);
 assert.match(chef,/appendChefMealContents\(body,date,meal,onlyPrescription\)/);
 assert.match(chef,/executionForm\(date,meal,body\)/);
 assert.match(chef,/function chefMenuPhoto\(item\)/);
});
