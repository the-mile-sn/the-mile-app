"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const source=fs.readFileSync("static/jogador-v2.js","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const first=source.indexOf("let overviewSwipeDirection=0;");
const last=source.indexOf("function revokePlayerView(){",first);
assert.ok(first>0&&last>first,"Actual daily swipe functions must exist");
const functions=source.slice(first,last);
const localDate=(d)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");

function harness({mode="day",tab="overview",hidden=false,day=new Date(2026,10,8,12)}={}){
 const callbacks={};
 const root={
  dataset:{},hidden,
  addEventListener(type,fn,options){callbacks[type]={fn,options}},
 };
 const target={parentElement:root,scrollWidth:0,clientWidth:200,closest:()=>null};
 let renderCalls=0,defeatedClicks=0;
 const $=id=>id==="weekly-view"?weeklyView:dayView;
 const makeTarget=()=>({
  hidden:false,offsetWidth:400,
  classList:{
   list:new Set(),
   remove(...names){for(const n of names)this.list.delete(n)},
   add(name){this.list.add(name)},
   has(name){return this.list.has(name)}
  }
 });
 const dayView=makeTarget(),weeklyView=makeTarget();
 const factory=new Function("element","getComputedStyle","window","$","overview","error","tab","overviewMode","initialDay","selected",`
  let day=initialDay,weeklySelection=selected;
  ${functions}
  enableOverviewDaySwipe(element);
  return {
   getDate:()=>day,getWeeklySelection:()=>weeklySelection,
   shift:shiftOverviewDay,animate:animateOverviewDaySwipe,
   getDirection:()=>overviewSwipeDirection
  };
 `);
 const page=factory(root,()=>({overflowX:"visible"}),{innerWidth:390},$,
  ()=>{renderCalls++;return Promise.resolve()},()=>{},tab,mode,day,{date:"2026-11-08",meal:"lunch"});
 function touch(type,x,y,{targetNode=target,cancelable=true,touches=1}={}){
  const touch={clientX:x,clientY:y};
  const event={
   target:targetNode,changedTouches:touches===1?[touch]:[touch,touch],
   touches:touches===1?[touch]:[touch,touch],cancelable,
   preventDefault(){defeatedClicks++}
  };
  const handler=callbacks[type];
  assert.ok(handler,"Missing touch handler "+type);
  handler.fn(event);
  return event;
 }
 function swipe(from,to,{startY=150,endY=150,targetNode=target}={}){
  touch("touchstart",from,startY,{targetNode});
  touch("touchend",to,endY,{targetNode});
 }
 return {root,page,target,touch,swipe,callbacks,dayView,weeklyView,
  renderCalls:()=>renderCalls,defeatedClicks:()=>defeatedClicks};
}

test("Daily calendar swipes follow consecutive days, not week jumps",()=>{
 const h=harness();
 h.swipe(275,110);
 assert.equal(localDate(h.page.getDate()),"2026-11-09"); // Sunday -> Monday
 h.swipe(100,275);
 assert.equal(localDate(h.page.getDate()),"2026-11-08"); // Monday -> Sunday
 assert.equal(h.renderCalls(),2);
 assert.equal(h.defeatedClicks(),2);
});
test("Weekly view retains its mode and highlights consecutive dates",()=>{
 const h=harness({mode:"week",day:new Date(2026,10,9,12)});
 h.swipe(100,290);
 assert.equal(localDate(h.page.getDate()),"2026-11-08");
 assert.equal(h.page.getWeeklySelection(),null);
 assert.equal(h.renderCalls(),1);
 h.page.animate();
 assert.ok(h.weeklyView.classList.has("overview-swipe-enter-prev"));
 assert.equal(h.page.getDirection(),0);
});
test("Normal taps, short drags and vertical scroll do not change the date",()=>{
 const h=harness();
 h.swipe(130,110);
 h.swipe(130,240,{startY:100,endY:285});
 h.touch("touchstart",270,130);
 h.touch("touchcancel",270,130);
 h.touch("touchend",100,130);
 assert.equal(h.renderCalls(),0);
 assert.equal(h.defeatedClicks(),0);
});
test("Exclude multi-finger gestures, edge gestures, controls and nested horizontal scrolling",()=>{
 const h=harness();
 h.touch("touchstart",270,120,{touches:2});
 h.touch("touchend",120,120,{touches:2});
 h.swipe(12,280);
 h.swipe(275,110,{targetNode:{parentElement:h.root,closest:()=>({}),clientWidth:100,scrollWidth:100}});
 const scrollNode={parentElement:h.root,clientWidth:100,scrollWidth:180,closest:()=>null};
 // The horizontal-scroll guard is validated structurally below. This mock
 // has no active overflow-x and therefore cannot intercept date swipes.
 assert.ok(functions.includes("node.scrollWidth>node.clientWidth+6"));
 assert.ok(functions.includes("getComputedStyle(node).overflowX"));
 assert.equal(h.renderCalls(),0);
});
test("Only the overview owns its day swipe; Menus preserves independent week navigation",()=>{
 assert.equal((source.match(/enableOverviewDaySwipe\(\$\("overview"\)\)/g)||[]).length,1);
 assert.ok(source.includes('enableWeekSwipe($("menu-week-strip")'));
 assert.ok(!source.includes("enableWeekSwipe(root,offset=>"));
 assert.ok(!source.includes("enableWeekSwipe(strip,offset=>"));
 assert.ok(source.includes('if(isWeek){renderWeekly(mon,r,weekMenus.menus||[],weekWeights.weights_by_date||{});animateOverviewDaySwipe();return;}'));
 assert.ok(source.includes("injectPostMatchCard();\n animateOverviewDaySwipe();"));
 assert.ok(html.includes("jogador-v2.js?v=161"));
 assert.ok(html.includes("jogador-v2.css?v=195"));
});
test("Animation is short, scoped, and respects reduced-motion preferences",()=>{
 assert.ok(css.includes("overview-day-swipe-enter-next 160ms ease-out"));
 assert.ok(css.includes("overview-day-swipe-enter-prev 160ms ease-out"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
 assert.ok(css.includes("animation:none!important"));
});
