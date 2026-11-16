"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const marker="/* MENUS mobile — history as readable day cards, week swipe snapping (16 Nov 2026).";
const mobile=css.slice(css.indexOf(marker));

test("mobile history presents one readable card per date with lunch and dinner",()=>{
 assert.ok(css.includes(marker),"mobile refinements must be present");
 assert.match(mobile,/@media \(max-width:830px\)\{/);
 assert.match(mobile,/grid-template-areas:"date microcycle" "lunch lunch" "dinner dinner"!important/);
 assert.match(mobile,/\.tm-menu-history-scroll tbody>tr\{/);
 assert.match(mobile,/td:nth-child\(3\)::before\{\s*content:"Almoço"/);
 assert.match(mobile,/td:nth-child\(4\)::before\{\s*content:"Jantar"/);
 assert.match(mobile,/overflow-wrap:anywhere!important/);
 assert.match(mobile,/\.tm-menu-history-scroll thead\{[\s\S]*?clip-path:inset\(50%\)!important/);
});

test("mobile history preserves server-side dish search and cursor pagination",()=>{
 assert.match(html,/id="menu-history-search"/);
 assert.match(html,/id="menu-history-prev"/);
 assert.match(html,/id="menu-history-next"/);
 assert.match(js,/const menuHistoryPageSize=12/);
 assert.match(js,/params\.set\("q",search\)/);
 assert.match(js,/menuHistoryPages\[currentPage\+1\]=data\.days\.at\(-1\)\.date/);
 assert.match(js,/\$\("menu-history-search"\)\.addEventListener\("input"/);
 assert.match(js,/\$\("menu-history-prev"\)\.addEventListener\("click"/);
 assert.match(js,/\$\("menu-history-next"\)\.addEventListener\("click"/);
});

test("week horizontal swipe snaps by weekday and leaves the next day visible",()=>{
 assert.match(mobile,/scroll-snap-type:x mandatory!important/);
 assert.match(mobile,/\.tm-menu-week-table thead th\{\s*scroll-snap-align:start!important/);
 assert.match(mobile,/-webkit-overflow-scrolling:touch/);
 assert.match(css,/min-width:1530px!important/);
 assert.match(js,/for\(let i=0;i<7;i\+\+\)/);
});

test("desktop history table and editing remain intact",()=>{
 assert.match(html,/<table><thead><tr><th scope="col">Data<\/th><th scope="col">Microciclo<\/th><th scope="col">Almoço<\/th><th scope="col">Jantar<\/th><\/tr><\/thead>/);
 assert.match(css,/\.tm-menu-history-scroll>table\{\s*width:100%!important;min-width:720px!important/);
 assert.match(html,/admin-surface-palette\.css\?v=99/);
 assert.doesNotThrow(()=>new Function(js));
});
