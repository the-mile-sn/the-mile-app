const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('static/jogador-v2.js','utf8'),html=fs.readFileSync('static/jogador-v2.html','utf8');
test('initial session prefetches independent week data',()=>{
 assert.match(js,/if\(sessionData\.user\?\.role==="player"\)/);
 assert.match(js,/cachedOverviewRead\(path\)\.catch\(\(\)=>\{\}\)/);
 assert.match(js,/const \[r,p\]=await Promise\.all/);
});
test('calendar stays navigable when fetching an uncached week',()=>{
 assert.match(js,/function renderPendingCalendar\(mon,dateKey\)/);
 assert.match(js,/renderPendingCalendar\(mon,dateKey\)/);
 assert.match(js,/requestId!==overviewRequestId\|\|epoch!==playerSessionEpoch/);
 assert.match(html,/id="overview-loading"/);
 assert.match(html,/overview-skeleton-macros/);
 assert.doesNotMatch(html,/A carregar planeamento…/);
});
test('menu reuses week data and prevents stale responses',()=>{
 assert.match(js,/cachedOverviewRead\("\/api\/v2\/player\/menus\?start="\+startKey/);
 assert.match(js,/cachedOverviewRead\("\/api\/v2\/player\/calendar\?start="\+startKey/);
 assert.match(js,/renderToken!==menuRenderToken\|\|tab!=="menus"/);
 assert.match(html,/id="menu-loading"/);
});
test('navigation invalidates previous in-flight rendering, not prescriptions',()=>{
 assert.match(js,/if\(t!=="overview"\)\{\+\+overviewRequestId;setOverviewLoading\(false\);\}/);
 assert.match(js,/if\(t!=="menus"\)\{\+\+menuRenderToken;\$\("menu-loading"\)\.hidden=true;\}/);
 assert.match(js,/overviewReadCache\.clear\(\);overviewSnapshot=null/);
 assert.match(js,/POST_MATCH_DISPLAY_ENABLED=false/);
});
