const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
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
