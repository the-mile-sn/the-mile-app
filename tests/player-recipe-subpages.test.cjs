"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/player-recipes.js","utf8");
const css=fs.readFileSync("static/player-recipes.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");

test("segment is reserved for the main Menus and Recipes views",()=>{
 assert.match(js,/const secondary=screen\.kind==="list"\|\|screen\.kind==="detail"\|\|screen\.kind==="dish"/);
 assert.match(js,/switcher\.hidden=secondary/);
 assert.match(js,/screen=\{kind:"categories"\};renderCategories/);
});

test("subpages use only back navigation, without duplicate titles or recipe count",()=>{
 assert.match(js,/function goBack\(callback\)/);
 assert.doesNotMatch(js,/goBack\(group\.name/);
 assert.doesNotMatch(js,/goBack\("Receita"/);
 assert.doesNotMatch(js,/goBack\(dishName/);
 assert.match(js,/root\.append\(goBack\(/);
 assert.match(js,/root\.append\(node\("h2","",recipe\.name/);
});

test("recipe body retains ingredient values, portions and plain numbered steps",()=>{
 assert.match(js,/\[entry\.quantity,entry\.unit\]\.filter\(Boolean\)\.join\(" "\)/);
 assert.match(js,/recipe\.servings/);
 assert.match(js,/recipe-step-number/);
 assert.match(css,/#menus \.recipe-detail \.recipe-hero\{/);
 assert.match(css,/height:clamp\(185px,54vw,235px\)/);
});

test("back swipe is edge-only and does not capture ordinary vertical scrolling",()=>{
 assert.match(js,/p\.clientX<=38/);
 assert.match(js,/p\.clientX-start\.x<90/);
 assert.match(js,/Math\.abs\(p\.clientY-start\.y\)>65/);
 assert.match(js,/restoreScroll\(listScroll\)/);
 assert.match(js,/restoreScroll\(categoryScroll\)/);
 assert.match(js,/restoreScroll\(returnScroll\)/);
});

test("bottom navigation remains in original layout",()=>{
 assert.match(html,/<nav id="tabs"/);
 assert.match(html,/<button data-tab="menus"/);
 assert.match(html,/<div id="player-recipes-area" hidden><\/div>/);
 assert.doesNotMatch(css,/#tabs\s*\{/);
});
