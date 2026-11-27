const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const source=fs.readFileSync("static/jogador-v2.js","utf8");
test("header and profile share one private fetched photo object URL",()=>{
 const start=source.indexOf("function paintPlayerPhoto("),end=source.indexOf("function displayPlayerRenewal(",start);
 const body=source.slice(start,end);
 assert.equal((body.match(/fetch\("\/api\/v2\/player\/profile-photo"/g)||[]).length,1);
 assert.match(body,/URL\.createObjectURL\(blob\)/);
 assert.match(body,/for\(const \[imageId,fallbackId\] of pairs\)/);
 assert.match(body,/image\.src=url/);
 assert.match(body,/controller\.signal\.aborted/);
 assert.match(body,/epoch!==playerSessionEpoch/);
 assert.doesNotMatch(body,/session="\+epoch/);
});
test("account switch aborts and revokes private object URLs and dish photos",()=>{
 const start=source.indexOf("function revokePlayerView("),end=source.indexOf("async function api(",start);
 const body=source.slice(start,end);
 assert.match(body,/profilePhotoController\.abort\(\)/);
 assert.match(body,/URL\.revokeObjectURL\(profilePhotoObjectUrl\)/);
 assert.match(body,/dishPhotoObserver\.disconnect\(\)/);
 assert.match(body,/dishPhotoCache\.clear\(\)/);
 assert.match(body,/overviewReadCache\.clear\(\)/);
});
test("dish photos are deferred until within observer root margin",()=>{
 assert.match(source,/typeof IntersectionObserver==="function"/);
 assert.match(source,/rootMargin:"180px 0px"/);
 assert.match(source,/if\(!entry\.isIntersecting\)continue/);
 assert.match(source,/dishPhotoObserver\.unobserve\(entry\.target\)/);
 assert.match(source,/photo\.dataset\.playerEpoch=String\(epoch\)/);
 assert.match(source,/photosToObserve\.push\(photo\)/);
 assert.match(source,/dishPhotoObserver\.observe\(photo\)/);
 const body=source.slice(source.indexOf("async function menusView("),source.indexOf("function error(",source.indexOf("async function menusView(")));
 assert.doesNotMatch(body,/cachedDishPhoto\(dishId\)/);
});
test("assessment and post-match reads deduplicate; submitting post-match invalidates",()=>{
 assert.match(source,/cachedOverviewRead\("\/api\/v2\/player\/assessments"\)/);
 assert.match(source,/cachedOverviewRead\("\/api\/v2\/player\/post-match\?local_date="\+encodeURIComponent\(iso\(new Date\(\)\)\)\)/);
 assert.match(source,/overviewReadCache\.delete\("\/api\/v2\/player\/post-match\?local_date="\+encodeURIComponent\(iso\(new Date\(\)\)\)\)/);
 assert.match(source,/if\(!assessmentRecords\.length\)/);
 assert.match(source,/POST_MATCH_DISPLAY_ENABLED=false/);
});
