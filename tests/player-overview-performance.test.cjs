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
 assert.match(js,/if\(groupPeriTiming\)appendGroupedPeriItems\(details,o\.items,o\.timing_groups\)/);
 assert.match(js,/optionEl\(option,index,false,true\)/);
 assert.match(js,/function appendGroupedPeriItems\(host,items,order=\[\]\)/);
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/\.match-intra-card \.peri-timing-lines/);
});


test("approved expanded nutrition typography uses one rule for each role",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 const guide=fs.readFileSync("docs/GUIA_VISUAL_APP_JOGADORES.md","utf8");
 assert.match(css,/#overview #day-details \.nutrition-weekly-charts:not\(\[hidden\]\) > \.nutrition-chart-section>strong,\s*#overview #day-details \.nutrition-weekly-charts:not\(\[hidden\]\) \.macro-chart-heading\{\s*font-size:16px!important;\s*font-weight:var\(--mile-type-semibold,600\)!important;/);
 assert.match(css,/#overview #day-details \.nutrition-weekly-charts:not\(\[hidden\]\) \.macro-chart-header\+div>\.nutrition-chart-section>strong\{\s*font-size:12px!important;\s*font-weight:var\(--mile-type-regular,400\)!important;/);
 assert.equal((css.match(/#overview #day-details \.nutrition-weekly-charts:not\(\[hidden\]\) \.macro-chart-header\+div>\.nutrition-chart-section>strong\{/g)||[]).length,1);
 assert.match(guide,/Painel nutricional aberto — títulos semanais/);
 assert.match(guide,/Painel nutricional aberto — etiquetas de macros/);
 assert.match(js,/weeklyCharts\.append\(buildBars\(playerText\("Calorias da semana","Weekly calories"\)/);
 assert.match(js,/macroTitle\.textContent="Macros da semana"/);
 assert.doesNotMatch(js,/n\.style\.color=color;n\.style\.color=color/);
 assert.doesNotMatch(js,/footer\.append\(footerLabel,footerActions\);footer\.addEventListener/);
});
