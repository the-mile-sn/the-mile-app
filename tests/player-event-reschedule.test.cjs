const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("static/jogador-v2.js","utf8");

test("rescheduling invalidates only stale player calendar and peri-preview data",()=>{
 const first=js.indexOf("function invalidatePlayerEventCalendarCache(){");
 const last=js.indexOf("function cachedOverviewRead(path){",first);
 assert.ok(first>0&&last>first);
 const invalidate=js.slice(first,last);
 const result=vm.runInNewContext(`
  let overviewSnapshot={weekKey:"2026-11-16",r:{events:[{session:"afternoon"}]}};
  const overviewReadCache=new Map([
   ["/api/v2/player/calendar?start=2026-11-16&end=2026-11-22",{time:1}],
   ["/api/v2/player/effective-nutrition-preview?start=2026-11-16&end=2026-11-22",{time:1}],
   ["/api/v2/player/menus?start=2026-11-16&end=2026-11-22",{time:1}],
   ["/api/v2/player/reference-weights?start=2026-11-16&end=2026-11-22",{time:1}]
  ]);
  ${invalidate}
  invalidatePlayerEventCalendarCache();
  ({snapshot:overviewSnapshot,keys:Array.from(overviewReadCache.keys())});
 `);
 assert.equal(result.snapshot,null);
 assert.deepEqual(Array.from(result.keys),[
  "/api/v2/player/menus?start=2026-11-16&end=2026-11-22",
  "/api/v2/player/reference-weights?start=2026-11-16&end=2026-11-22"
 ]);
});
test("the actual event editor saves a morning/afternoon change before refreshing",async()=>{
 const first=js.indexOf("function eventCard(event,compact=false){");
 const last=js.indexOf("function matchWithIntraCard(",first);
 assert.ok(first>0&&last>first);
 const snippet=js.slice(first,last);
 const element=tag=>({
  tagName:tag.toUpperCase(),children:[],attributes:{},hidden:false,
  append(...children){this.children.push(...children);},
  setAttribute(key,value){this.attributes[key]=value}
 });
 const requests=[],refreshes=[],invalidations=[];
 const api=async(path,options)=>{
  requests.push({path,options,payload:options.body?JSON.parse(options.body):null});
  return {event:{id:"training-1",event_date:"2026-11-23",session:"morning"}};
 };
 const make=vm.runInNewContext(snippet+";eventCard",{
  document:{createElement:element},decorateLabel(){},iso(){return "2026-11-19";},
  playerCsrf:"test",api,overview:async()=>{refreshes.push("overview");},
  invalidatePlayerEventCalendarCache(){invalidations.push("cache");},
  error(){},confirm(){return true}
 });
 const card=make({id:"training-1",title:"Treino",kind:"training",event_date:"2026-11-23",session:"afternoon"});
 const editor=card.children.find(c=>c.className==="daily-event-editor");
 assert.ok(editor);
 const fields=editor.children.find(c=>c.className==="daily-event-fields");
 const session=fields.children.find(c=>c.className.includes("daily-event-period")).children[0];
 session.value="morning";
 const save=editor.children.find(c=>c.className==="daily-event-actions").children[0];
 await save.onclick();
 assert.equal(requests[0].path,"/api/v2/player/events/training-1");
 assert.equal(requests[0].options.method,"PUT");
 assert.equal(requests[0].payload.session,"morning");
 assert.equal(requests[0].payload.event_date,"2026-11-23");
 assert.deepEqual(invalidations,["cache"]);
 assert.deepEqual(refreshes,["overview"]);
});
test("training and its peri-meals move between the morning and afternoon slots",()=>{
 const first=js.indexOf("function appendDailyEvents(");
 const last=js.indexOf("function appendWeeklyEvents(",first);
 assert.ok(first>0&&last>first);
 const training={id:"training-1",title:"Treino",event_date:"2026-11-23",kind:"training",session:"afternoon"};
 const calendarEvents=[training],periMeals=[
  {event_id:training.id,event_date:training.event_date,phase:"pre",selection_phase:"pre_training"},
  {event_id:training.id,event_date:training.event_date,phase:"post",selection_phase:"post_training"}
 ];
 const render=vm.runInNewContext(js.slice(first,last)+";appendDailyEvents",{
  calendarEvents,periMeals,supplementsByDay:{},
  eventCard:e=>({tagName:"DIV",label:e.title}),
  makePeriCard:p=>({label:p.phase}),
  matchWithIntraCard(){throw new Error("a training is not a match");},
  attachSupplements(){}
 });
 const slot=session=>{
  const target={items:[],append(item){this.items.push(item.label);}};
  render(target,"2026-11-23",session);
  return target.items;
 };
 assert.deepEqual(slot("morning"),[]);
 assert.deepEqual(slot("afternoon"),["pre","Treino","post"]);
 training.session="morning";
 assert.deepEqual(slot("morning"),["pre","Treino","post"]);
 assert.deepEqual(slot("afternoon"),[]);
});
