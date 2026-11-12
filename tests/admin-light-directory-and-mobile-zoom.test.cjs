const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const block=css.slice(css.lastIndexOf("/* Refinamento Dashboard/Jogadores 12-11-2026"));
test("iPhone Dashboard input is at least 16px to prevent focus zoom",()=>{
 assert.match(block,/@media\(max-width:830px\)/);
 assert.match(block,/#tm-dashboard \.tm-db-table \.tm-db-search\{/);
 assert.match(block,/font-size:16px!important/);
});
test("light desktop directory has distinct borderless grey filters without mobile change",()=>{
 assert.match(block,/@media\(min-width:831px\)/);
 assert.match(block,/html\[data-admin-theme="light"\] #tm-players-page/);
 assert.match(block,/background:#e0e7ef!important/);
 assert.match(block,/border:0!important/);
 assert.match(block,/border-radius:14px!important/);
});
test("phone action is unframed and retains keyboard focus",()=>{
 assert.match(block,/#tm-players-page \.tm-p-app-action/);
 assert.match(block,/\.tm-p-app-action:focus-visible/);
 assert.match(html,/admin-microcycles\.css\?v=195/);
});