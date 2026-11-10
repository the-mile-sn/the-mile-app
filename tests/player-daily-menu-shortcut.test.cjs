"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const start=js.indexOf("async function openDailyMealInMenus(");
const end=js.indexOf("async function overview(){",start);
assert.ok(start>0&&end>start,"Daily-to-Menus navigation helper must exist");

function setup({initialTab="overview",reducedMotion=false,mealPresent=true}={}){
 const stats={selections:0,shown:[],selectors:[],focused:null,scroll:null,frame:null};
 const fragment=js.slice(start,end);
 const factory=new Function("stats","initialTab","reducedMotion","mealPresent",`
  let tab=initialTab,menuWeek=null,menuSelectedDate=null;
  const document={querySelector(selector){
   stats.selectors.push(selector);
   if(selector.startsWith("#menus-recipe-switch"))return {click(){stats.selections++;}};
   if(selector.startsWith("#menu-days .day-menu"))return {
    scrollIntoView(opts){stats.scroll={kind:"day",opts};},
    querySelector(mealSelector){
     stats.focused=mealSelector;
     return mealPresent?{scrollIntoView(opts){stats.scroll={kind:"meal",opts};}}:null;
    }
   };
   return null;
  }};
  const window={requestAnimationFrame(fn){stats.frame=fn;},matchMedia(){return {matches:reducedMotion}}};
  async function show(t){stats.shown.push(t);tab=t;}
  ${fragment}
  return {openDailyMealInMenus,context:()=>({tab,menuWeek,menuSelectedDate})};
 `);
 const app=factory(stats,initialTab,reducedMotion,mealPresent);
 return {stats,...app};
}
test("only assigned lunch/dinner dish subcards become interactive",()=>{
 const daily=js.slice(js.indexOf("for(const meal of meals){",js.indexOf("async function overview(){")),js.indexOf("injectPostMatchCard();",js.indexOf("async function overview(){")));
 assert.match(daily,/if\(\(meal==="lunch"\|\|meal==="dinner"\)\&\&menu\.kind==="dish"\)\{/);
 assert.match(daily,/p\.classList\.add\("meal-menu-link"\)/);
 assert.match(daily,/p\.setAttribute\("role","button"\);p\.tabIndex=0/);
 assert.match(daily,/p\.addEventListener\("click"/);
 assert.match(daily,/if\(event\.key==="Enter"\|\|event\.key===" "\)/);
 assert.match(daily,/attachDailyDishPhoto\(section,p,menu,epoch,requestId\)/);
 assert.doesNotMatch(daily,/head\.addEventListener\("click"/);
});
test("direct jump selects the right week, day and exact lunch or dinner",async()=>{
 for(const [date,meal] of [["2026-11-10","lunch"],["2026-11-15","dinner"],["2026-12-01","dinner"]]){
  const app=setup();
  await app.openDailyMealInMenus(date,meal);
  assert.equal(app.stats.selections,1,"Menus mode switch is activated, including from old recipes");
  assert.deepEqual(app.stats.shown,["menus"]);
  assert.equal(app.context().menuSelectedDate,date);
  assert.equal(app.context().menuWeek.getFullYear(),Number(date.slice(0,4)));
  assert.equal(app.context().menuWeek.getDate(),Number(date.slice(-2)));
  assert.equal(typeof app.stats.frame,"function");
  app.stats.frame();
  assert.equal(app.stats.focused,'.menu-entry[data-meal="'+meal+'"]');
  assert.equal(app.stats.scroll.kind,"meal");
  assert.equal(app.stats.scroll.opts.block,"center");
  assert.equal(app.stats.scroll.opts.behavior,"smooth");
  assert.ok(app.stats.selectors.some(s=>s.includes('.day-menu[data-date="'+date+'"]')));
 }
});
test("reduced motion and fallback when a meal card is absent",async()=>{
 const app=setup({reducedMotion:true,mealPresent:false});
 await app.openDailyMealInMenus("2026-11-10","lunch");
 app.stats.frame();
 assert.equal(app.stats.scroll.kind,"day");
 assert.equal(app.stats.scroll.opts.behavior,"auto");
});
test("a shortcut cannot fire outside daily overview or on unassigned meals",async()=>{
 for(const [initialTab,meal] of [["menus","lunch"],["overview","breakfast"]]){
  const app=setup({initialTab});
  await app.openDailyMealInMenus("2026-11-10",meal);
  assert.deepEqual(app.stats.shown,[]);
  assert.equal(app.stats.selections,0);
  assert.equal(app.stats.frame,null);
 }
});
test("existing card design, photos and other view asset versions stay isolated",()=>{
 assert.match(css,/#overview #day-details \.daily-meal \.meal-menu-card\.meal-menu-link/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/:active/);
 assert.match(css,/\.meal-menu-card\.has-dish-photo/);
 assert.match(js,/div\.dataset\.meal=meal/);
 assert.match(html,/jogador-v2\.js\?v=168/);
 assert.match(html,/jogador-v2\.css\?v=199/);
 assert.match(html,/player-recipes\.js\?v=11/);
 assert.match(html,/player-recipes\.css\?v=18/);
});
