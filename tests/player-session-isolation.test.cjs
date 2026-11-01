const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('static/jogador-v2.js','utf8');
test('logout and account switch invalidate in-memory weekly caches and views',()=>{
 const start=source.indexOf('function revokePlayerView(){');
 const end=source.indexOf('async function api(',start);
 const body=source.slice(start,end);
 assert.match(body,/\+\+playerSessionEpoch/);
 assert.match(body,/\+\+overviewRequestId/);
 assert.match(body,/overviewReadCache\.clear\(\)/);
 assert.match(body,/plans=\{\}/);
 assert.match(body,/dayColorOverrides=\{\}/);
 assert.match(body,/replaceChildren\(\)/);
});
test('responses from prior session never reach current UI',()=>{
 assert.match(source,/const epoch=playerSessionEpoch;\s*const r=await fetch\(/);
 assert.match(source,/if\(epoch!==playerSessionEpoch\)\{const err=new Error\("stale_session"\)/);
 assert.match(source,/requestId!==overviewRequestId\|\|epoch!==playerSessionEpoch/);
});
test('login preserves input credentials across cache reset',()=>{
 assert.match(source,/const identifier=\$\("username"\)\.value\.trim\(\)\.toLowerCase\(\),password=\$\("password"\)\.value;revokePlayerView\(\);\$\("status"\)\.textContent="";await api\("\/api\/login"/);
});
test('stale rejected cached promises cannot evict new account reads',()=>{
 assert.match(source,/if\(overviewReadCache\.get\(path\)\?\.promise===promise\)overviewReadCache\.delete\(path\)/);
});

test('an anonymous /api/me response is a normal signed-out state, without an expiration banner',()=>{
 const start=source.indexOf('async function session(){');
 const end=source.indexOf('async function show(',start);
 const body=source.slice(start,end);
 assert.match(body,/if\(!sessionData\.user\)\{/);
 assert.match(body,/\$\("status"\)\.textContent="";\s*\$\("login-panel"\)\.hidden=false/);
 assert.match(body,/if\(epoch!==playerSessionEpoch\)return/);
 assert.match(body,/\$\("login-panel"\)\.hidden=true;\s*\$\("player-panel"\)\.hidden=false;\s*\$\("logout"\)\.hidden=false;\s*\$\("status"\)\.textContent=""/);
});
test('only unauthorized responses revoke the player view, not forbidden actions',()=>{
 const start=source.indexOf('async function api(');
 const end=source.indexOf('function fmt(',start);
 const body=source.slice(start,end);
 assert.match(body,/if\(r\.status===401&&path!=="\/api\/login"&&path!=="\/api\/logout"\)revokePlayerView\(\)/);
 assert.doesNotMatch(body,/r\.status===403.*revokePlayerView/);
 assert.match(source,/function revokePlayerView\(\)/);
});
test('optional startup weight read no longer competes with identity and calendar initialization',()=>{
 const start=source.indexOf('async function session(){');
 const end=source.indexOf('async function show(',start);
 const body=source.slice(start,end);
 assert.match(body,/const profilePromise=api\("\/api\/v2\/player\/me"\)/);
 assert.match(body,/const plansPromise=api\("\/api\/v2\/player\/plans"\)/);
 assert.match(body,/const \[r,p\]=await Promise\.all\(\[profilePromise,plansPromise\]\)/);
 assert.doesNotMatch(body,/\/api\/v2\/player\/weight\?date/);
});
