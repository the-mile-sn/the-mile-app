"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const guide=fs.readFileSync("docs/GUIA_VISUAL_APP_JOGADORES.md","utf8");

test("overview has separate day and week skeleton hosts",()=>{
 assert.match(html,/<div class="overview-skeleton-day">/);
 assert.match(html,/<div id="overview-week-skeleton" class="overview-skeleton-week"><\/div>/);
 assert.match(html,/id="overview-loading"[^>]*role="status"[^>]*aria-live="polite"/);
 assert.doesNotMatch(html,/overview-skeleton-week-label/);
 assert.match(html,/jogador-v2\.css\?v=285-progresso-spacing/);
 assert.match(html,/week-skeleton-v1/);
});

test("loading logic respects view, request epochs and cache",()=>{
 assert.match(js,/function renderPendingWeeklySkeleton\(\)/);
 assert.match(js,/node\.className="overview-skeleton-shape overview-week-skeleton-shape "\+name/);
 assert.match(js,/for\(let i=0;i<7;i\+\+\)/);
 assert.match(js,/const mealRows=Array\.isArray\(meals\)&&meals\.length\?meals\.length:5/);
 assert.match(js,/if\(overviewMode==="week"\)renderPendingWeeklySkeleton\(\)/);
 assert.match(js,/indicator\.classList\.toggle\("week-pending",overviewMode==="week"\)/);
 assert.match(js,/if\(loading&&!sameView\)/);
 assert.match(js,/if\(requestId!==overviewRequestId\|\|epoch!==playerSessionEpoch\)return/);
 assert.match(js,/const weekKey=iso\(mon\),snapshot=reusableOverviewSnapshot\(weekKey\)/);
 assert.match(js,/setOverviewLoading\(false\)/);
 assert.match(js,/indicator\.hidden=true/);
});

test("weekly placeholders match seven-day layout and recipe shimmer",()=>{
 assert.match(css,/#overview \.overview-loading\.week-pending \.overview-skeleton-day\{display:none\}/);
 assert.match(css,/#overview \.overview-loading\.week-pending \.overview-skeleton-week\{display:block/);
 assert.match(css,/#overview \.overview-week-skeleton-grid\{[^}]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/s);
 assert.match(css,/#overview \.overview-week-skeleton-summary\{[^}]*grid-template-columns:1\.45fr repeat\(3,minmax\(0,1fr\)\)/s);
 assert.match(css,/#overview \.overview-skeleton-shape\{[^}]*background:#29292e/s);
 assert.match(css,/animation:overview-skeleton-shimmer 1\.5s ease-in-out infinite/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\s*#overview \.overview-skeleton-shape::after\{animation:none\}/);
 assert.doesNotMatch(css,/overview-skeleton-macros::after/);
 assert.match(guide,/Carregamento na transição de semanas/);
});
