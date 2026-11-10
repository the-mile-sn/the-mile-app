"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const css=fs.readFileSync("static/player-recipes.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const js=fs.readFileSync("static/player-recipes.js","utf8");

test("Only recipe subpages get 26px spacing below the shared header",()=>{
 const selector="#menus #menus-recipe-switch[hidden] ~ #player-recipes-area";
 const i=css.lastIndexOf(selector+"{");
 assert.ok(i>=0,"Missing scoped recipe-subpage spacing");
 const rule=css.slice(i,css.indexOf("}",i));
 assert.match(rule,/padding-top:26px;/);
 assert.ok(html.includes('<nav id="menus-recipe-switch"'));
 assert.ok(html.includes('<div id="player-recipes-area" hidden></div>'));
 assert.match(js,/switcher\.hidden=secondary/);
 assert.match(js,/const secondary=\["list","detail","dish","dish-detail"\]\.includes\(screen\.kind\)/);
});
test("Main Menus / Receitas selector remains visually unchanged",()=>{
 assert.match(css,/#menus #menus-recipe-switch\{[\s\S]*?margin:14px 0 18px;/);
 assert.ok(!css.includes("#menus #player-recipes-area{padding-top:26px;}"));
 assert.match(html,/player-recipes\.css\?v=18/);
});
test("All recipe navigation and header behavior stay intact without a spacer row",()=>{
 assert.match(js,/function renderList\(\)/);
 assert.match(js,/function renderDetail\(\)/);
 assert.match(js,/function renderDishList\(entries\)/);
 assert.match(js,/function renderDishDetail\(\)/);
 assert.match(js,/return document\.createDocumentFragment\(\)/);
 assert.doesNotMatch(js,/node\("div","recipe-topline"\)/);
 assert.match(js,/headerBack\.hidden=!\(subpage/);
 assert.match(html,/id="recipe-header-back"/);
});
