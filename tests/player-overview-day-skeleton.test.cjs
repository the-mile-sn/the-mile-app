"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const guide=fs.readFileSync("docs/GUIA_VISUAL_APP_JOGADORES.md","utf8");

test("Day skeleton reflects the current nutritional strip, not legacy large blocks",()=>{
 assert.match(html,/<div class="overview-day-skeleton-nutrition">/);
 assert.match(html,/<div class="overview-day-skeleton-energy">/);
 assert.match(html,/<div class="overview-day-skeleton-macros">/);
 assert.equal((html.match(/class="overview-day-skeleton-metric"/g)||[]).length,3);
 assert.match(html,/id="overview-day-skeleton-cards"/);
 assert.doesNotMatch(html,/overview-skeleton-macros|overview-skeleton-weight|overview-skeleton-meal/);
 assert.match(css,/#overview \.overview-day-skeleton-nutrition\{[^}]*grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,2\.95fr\)/s);
 assert.match(css,/#overview \.overview-day-skeleton-card\{[^}]*height:61px;[^}]*border-radius:13px/s);
 assert.match(css,/#overview \.overview-day-skeleton-icon\{[^}]*width:37px;height:37px;border-radius:11px/s);
 assert.match(html,/jogador-v2\.css\?v=274-home-widgets/);
 assert.match(html,/day-skeleton-v1/);
});

test("Day and Week skeletons share one subtle animated shape and reduced-motion rule",()=>{
 assert.match(css,/#overview \.overview-skeleton-shape\{[^}]*background:#29292e/s);
 assert.match(css,/animation:overview-skeleton-shimmer 1\.5s ease-in-out infinite/);
 assert.equal((css.match(/@keyframes overview-skeleton-shimmer/g)||[]).length,1);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\s*#overview \.overview-skeleton-shape::after\{animation:none\}/);
 assert.match(js,/node\.className="overview-skeleton-shape overview-week-skeleton-shape "\+name/);
 assert.match(js,/node\.className="overview-skeleton-shape "\+name/);
 assert.match(css,/#overview \.overview-loading\.week-pending \.overview-skeleton-day\{display:none\}/);
 assert.match(css,/#overview \.overview-loading\.week-pending \.overview-skeleton-week\{display:block/);
});

test("fast same-week navigation avoids forced skeleton while keeping session guards",()=>{
 assert.match(js,/function renderPendingDaySkeleton\(\)/);
 assert.match(js,/if\(overviewMode==="week"\)renderPendingWeeklySkeleton\(\);\s*else renderPendingDaySkeleton\(\)/);
 assert.match(js,/const count=1\+Math\.min\(7,Math\.max\(3,mealCount\)\)/);
 const snapshotStart=js.indexOf(" if(snapshot){",js.indexOf("async function overview(){"));
 const snapshotBranch=js.slice(snapshotStart,js.indexOf(" }else{",snapshotStart));
 assert.match(snapshotBranch,/setOverviewLoading\(false\)/);
 assert.doesNotMatch(snapshotBranch,/setOverviewLoading\(true/);
 assert.doesNotMatch(snapshotBranch,/scheduleOverviewDaySkeleton/);
 assert.match(js,/const OVERVIEW_DAY_SKELETON_DELAY_MS=240/);
 assert.match(js,/if\(overviewMode==="day"\)scheduleOverviewDaySkeleton\(requestId,epoch,mon,d\)/);
 assert.match(js,/if\(requestId!==overviewRequestId\|\|epoch!==playerSessionEpoch\|\|[\s\S]*tab!=="overview"/);
 assert.match(js,/cancelOverviewDaySkeletonTimer\(\);\s*overviewSnapshot=\{weekKey,time:Date\.now\(\),r,weekMenus,weekWeights\}/);
 const overview=js.slice(js.indexOf("async function overview(){"),js.indexOf("\nfunction openPlansSection(",js.indexOf("async function overview(){")));
 assert.ok(overview.includes("api('/api/v2/player/consumption-records?start='+d+'&end='+d)"));
 assert.match(overview,/\$\("day-details"\)\.hidden=isWeek\|\|!\$\("overview-loading"\)\.hidden/);
 const clear=overview.indexOf('root.hidden=false;setOverviewLoading(false);');
 const consumed=overview.indexOf('const consumption=await api(');
 assert.ok(clear>consumed,"Day is not revealed before the consumption request");
 assert.match(overview,/root\.hidden=false;setOverviewLoading\(false\);animateDailySwipeEntry\(\);return;/);
 assert.match(overview,/if\(requestId!==overviewRequestId\|\|epoch!==playerSessionEpoch\)return;/);
 assert.match(js,/\$\("overview"\)\.toggleAttribute\("aria-busy",loading\)/);
 assert.match(guide,/Carregamento na transição de dias/);
});

test("the real Day calendar is a single, stable element before the loading skeleton",()=>{
 const overview=html.slice(html.indexOf('<section id="overview">'),html.indexOf('<section id="plans" hidden>'));
 const positions=[
  overview.indexOf('id="overview-mode"'),
  overview.indexOf('id="week-strip"'),
  overview.indexOf('id="date-title"'),
  overview.indexOf('id="overview-loading"'),
  overview.indexOf('id="day-details"')
 ];
 assert.ok(positions.every(n=>n>=0),"all Day layout landmarks must exist");
 assert.ok(positions.every((n,i)=>i===0||positions[i-1]<n),"calendar must precede skeleton and content");
 assert.equal((overview.match(/id="week-strip"/g)||[]).length,1);
 assert.equal((overview.match(/id="overview-loading"/g)||[]).length,1);
 assert.match(js,/if\(overviewMode==="day"&&mon\)\{[\s\S]*renderPendingCalendar\(mon,dateKey\)/);
 assert.match(js,/\$\("week-strip"\)\.hidden=true;\$\("date-title"\)\.hidden=true/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(guide,/Ordem obrigatória de composição/);
});
