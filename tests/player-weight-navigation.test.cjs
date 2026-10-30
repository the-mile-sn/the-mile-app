const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync("static/jogador-v2.js","utf8");
test("future dates avoid rejected weight fetch and retain a disabled card",()=>{
 assert.match(source,/if\(date>iso\(new Date\(\)\)\)\{/);
 assert.match(source,/Disponível no próprio dia/);
 assert.match(source,/action\.disabled=true/);
 assert.ok(source.indexOf("if(date>iso(new Date()))") < source.indexOf('api("/api/v2/player/weight?date="+date)'));
});
test("weight request cannot block meal rendering",()=>{
 assert.match(source,/renderWeightCard\(root,d\)\.catch\(\(\)=>\{\}\);/);
 assert.doesNotMatch(source,/await renderWeightCard\(root,d\)/);
});
test("weekly reference weights and menu data are shared across daily and weekly views",()=>{
 assert.match(source,/const \[r,weekMenus,weekWeights\]=await Promise\.all/);
 assert.match(source,/weekWeights\.weights_by_date\?\.\[d\]/);
 assert.match(source,/x\.menu_date===d&&x\.meal===meal/);
});
test("saving weight invalidates cached relative nutrition references",()=>{
 assert.match(source,/overviewReadCache\.clear\(\); \/\/ The reference-weight values can change after saving/);
});
test("days with no published meals still render weight card",()=>{
 assert.match(source,/renderWeightCard\(root,d\)\.catch\(\(\)=>\{\}\);\s*const note=document\.createElement\("p"\)/);
});
