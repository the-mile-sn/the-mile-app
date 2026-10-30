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
 assert.match(source,/const identifier=\$\("username"\)\.value\.trim\(\)\.toLowerCase\(\),password=\$\("password"\)\.value;revokePlayerView\(\);await api\("\/api\/login"/);
});
test('stale rejected cached promises cannot evict new account reads',()=>{
 assert.match(source,/if\(overviewReadCache\.get\(path\)\?\.promise===promise\)overviewReadCache\.delete\(path\)/);
});
