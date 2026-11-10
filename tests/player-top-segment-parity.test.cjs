"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const css=fs.readFileSync("static/jogador-v2.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const recipeCss=fs.readFileSync("static/player-recipes.css","utf8");
const title="/* Unify the top segmented controls with the approved Início";
const i=css.lastIndexOf(title);
assert.ok(i>0,"Unified selector rules must exist");
const patch=css.slice(i);
function rule(selector){
 const anchor=selector+"{";
 const p=patch.lastIndexOf(anchor);
 assert.ok(p>=0,"Missing selector "+selector);
 const end=patch.indexOf("}",p+anchor.length);
 return patch.slice(p+anchor.length,end);
}
function hasAll(s,terms){for(const t of terms)assert.ok(s.includes(t),"Missing: "+t);}

test("The approved home control remains unchanged and defines the common geometry",()=>{
 assert.ok(css.includes("#overview #overview-mode{\n min-height:38px!important;\n height:38px!important;"));
 assert.ok(css.includes("min-height:32px!important;\n height:32px!important;"));
 assert.ok(css.includes("#player-panel:has(#overview:not([hidden])){margin-top:-9px!important}"));
 assert.ok(!patch.includes("#overview #overview-mode"));
});
test("Menus and Avaliações both use exact home exterior height, padding and top coordinate",()=>{
 const outer=rule("#player-panel #menus #menus-recipe-switch,\n#player-panel #plans #plans-assessments .assessment-tabs");
 hasAll(outer,[
  "height:38px!important","min-height:38px!important","max-height:38px!important",
  "padding:3px!important","gap:3px!important","border-radius:999px!important",
  "background:#202024!important"
 ]);
 const menu=rule("#player-panel #menus #menus-recipe-switch");
 const assessments=rule("#player-panel #plans #plans-assessments .assessment-tabs");
 assert.ok(menu.includes("repeat(2,minmax(0,1fr))"));
 assert.ok(assessments.includes("repeat(3,minmax(0,1fr))"));
 // Home offsets its panel -9px, while Menus already offsets its page -12px.
 assert.ok(css.includes("#player-panel:has(#overview:not([hidden])){margin-top:-9px!important}"));
 assert.ok(css.includes("top:-12px!important;"));
 assert.ok(menu.includes("margin-top:3px!important"));
 assert.ok(assessments.includes("margin-top:-9px!important"));
});
test("Both controls have 32px equal buttons, home typography, no legacy thick padding",()=>{
 const buttons=rule("#player-panel #menus #menus-recipe-switch button,\n#player-panel #plans #plans-assessments .assessment-tabs button");
 hasAll(buttons,[
  "height:32px!important","min-height:32px!important","max-height:32px!important",
  "padding:4px 8px!important","font-size:13px!important",
  "font-weight:500!important","line-height:1.1!important",
  "margin:0!important","border-radius:999px!important"
 ]);
 assert.ok(!buttons.includes("padding:11px 4px"));
 const selected=rule('#player-panel #menus #menus-recipe-switch button[aria-pressed="true"],\n#player-panel #plans #plans-assessments .assessment-tabs button[aria-pressed="true"]');
 hasAll(selected,["background:#55555b!important","color:#fff!important"]);
});
test("Navigation and recipe subpage top inset remain intact",()=>{
 assert.ok(html.includes('id="overview-mode"'));
 assert.ok(html.includes('class="assessment-tabs"'));
 assert.ok(html.includes('id="menus-recipe-switch"'));
 assert.ok(html.includes("jogador-v2.css?v=199"));
 assert.ok(html.includes("player-recipes.css?v=18"));
 assert.ok(recipeCss.includes("#menus #menus-recipe-switch[hidden] ~ #player-recipes-area{\n padding-top:26px;"));
 assert.ok(rule("#player-panel #menus #menus-recipe-switch[hidden]").includes("display:none!important"));
 assert.ok(!patch.includes("#tabs"));
});
