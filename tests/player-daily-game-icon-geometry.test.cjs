"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");

test("Form, match and daily meal icons use the approved common 37px geometry",()=>{
 assert.match(css,/#overview #day-details\{[^}]*--day-icon-box:37px;--day-icon-glyph:24px;--day-icon-radius:11px/s);
 assert.match(css,/#overview #day-details \.tm-day-icon\{[^}]*width:var\(--day-icon-box\)!important;[^}]*height:var\(--day-icon-box\)!important/s);
 assert.match(css,/#overview #day-details \.tm-day-icon\{[^}]*border-radius:var\(--day-icon-radius\)!important/s);
 assert.match(js,/matchIconBox\.className="meal-leading-icon tm-day-icon"/);
 assert.match(js,/icon\.className="post-match-inline-icon tm-day-icon"/);
});
test("Match and post-match headers share the approved 17px left inset",()=>{
 assert.match(css,/#overview #day-details\{[^}]*--day-header-inset:17px/s);
 assert.match(css,/#overview #day-details \.tm-day-header\{[^}]*padding-left:var\(--day-header-inset\)!important/s);
 assert.match(js,/head\.className="daily-meal-head tm-day-header"/);
 assert.match(js,/button\.className="post-match-inline-trigger tm-day-header"/);
});
test("Approved match and post-match icons remain available with versioned assets",()=>{
 assert.match(js,/matchIconBox\.append\(mealIcon\("football"\)\)/);
 assert.match(js,/icon\.append\(mealIcon\("football-pitch"\)\)/);
 assert.match(html,/jogador-v2\.css\?v=[^"\s]+/);
 assert.match(html,/jogador-v2\.js\?v=[^"\s]+/);
});
