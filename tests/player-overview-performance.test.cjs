const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("static/jogador-v2.js","utf8"),html=fs.readFileSync("static/jogador-v2.html","utf8");
test("initial independent profile and plan reads run together",()=>{
 assert.match(js,/const profilePromise=api\("\/api\/v2\/player\/me"\)/);
 assert.match(js,/const plansPromise=api\("\/api\/v2\/player\/plans"\)/);
 assert.match(js,/const \[r,p\]=await Promise\.all\(\[profilePromise,plansPromise\]\)/);
});
test("same-week navigation uses short-lived session-local snapshot",()=>{
 assert.match(js,/const OVERVIEW_CACHE_MS=60000/);
 assert.match(js,/reusableOverviewSnapshot\(weekKey\)/);
 assert.match(js,/overviewSnapshot=\{weekKey,time:Date\.now\(\),r,weekMenus,weekWeights\}/);
 assert.match(js,/overviewReadCache\.clear\(\);overviewSnapshot=null/);
 assert.match(html,/id="overview-loading"/);
 assert.match(js,/requestId!==overviewRequestId\|\|epoch!==playerSessionEpoch/);
});
test("weight request starts early, familiar icon is visible and action is guarded until data arrives",()=>{
 assert.match(js,/cachedOverviewRead\("\/api\/v2\/player\/weight\?date="\+d\)/);
 assert.match(js,/data=await cachedOverviewRead\("\/api\/v2\/player\/weight\?date="\+date\)/);
 assert.match(js,/action\.disabled=true/);
 assert.match(js,/action\.disabled=false/);
 assert.match(js,/overviewSnapshot=null;\s*await overview\(\)/);
});
test("nutrition parity preview remains read-only and not activated",()=>{
 assert.match(js,/POST_MATCH_DISPLAY_ENABLED=false/);
 assert.match(js,/scenario_automation_enabled!==false/);
 assert.match(js,/preview_only/);
});

test("intra-match groups all products by first-seen ingestion timing without losing items",()=>{
 const start=js.indexOf("function groupPeriItemsByTiming("),end=js.indexOf("\n}",start);
 assert.ok(start>=0&&end>start);
 const group=vm.runInNewContext(js.slice(start,end+2)+";groupPeriItemsByTiming");
 const items=[
  {timing:"pre_warmup",name:"SIS Sports Drink",quantity:"1/3",kind:"food"},
  {timing:"half_time",name:"Carb Shot",kind:"food"},
  {timing:"pre_warmup",name:"Maurten",quantity:"1/2",kind:"food"},
  {timing:"post_warmup",name:"SIS Sports Drink",quantity:"1/3",kind:"food"},
  {timing:"pre_warmup",name:"Kick-Start gum",quantity:"2 un",kind:"food"},
  {timing:"half_time",name:"SIS Sports Drink",quantity:"1/3",kind:"food"},
  {kind:"text",text:"Sem horário"},
 ];
 const result=group(items);
 assert.deepEqual(Array.from(result,x=>x.timing),["pre_warmup","half_time","post_warmup",""]);
 assert.deepEqual(Array.from(result[0].foods,x=>x.name),["SIS Sports Drink","Maurten","Kick-Start gum"]);
 assert.deepEqual(Array.from(result[1].foods,x=>x.name),["Carb Shot","SIS Sports Drink"]);
 assert.equal(result.reduce((n,x)=>n+x.foods.length,0),items.length);
 assert.equal(group([]).length,0);
 assert.match(js,/if\(opts\.length===1\)appendGroupedPeriItems\(section,opts\[0\]\.items\)/);
 assert.match(js,/optionEl\(option,index,false,true\)/);
 assert.match(js,/if\(groupPeriTiming\)appendGroupedPeriItems\(details,o\.items\)/);
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/\.match-intra-card \.peri-timing-lines/);
});
