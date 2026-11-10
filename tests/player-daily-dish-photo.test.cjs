"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
const backend=fs.readFileSync("app.py","utf8");
test("daily thumbnails only for assigned lunch/dinner dishes",()=>{
 assert.match(js,/if\(\(meal==="lunch"\|\|meal==="dinner"\)\&\&menu\.kind==="dish"\)/);
 assert.match(js,/attachDailyDishPhoto\(section,p,menu,epoch,requestId\)/);
 assert.match(js,/menu\.value;\s*p\.append\(name\)/);
 assert.match(js,/photo\.className="daily-meal-dish-photo"/);
});
test("reuses authorised photo endpoint and avoids guessing legacy dish names",()=>{
 const body=js.slice(js.indexOf("function attachDailyDishPhoto("),js.indexOf("let lastMenuPresentationWeek=null;",js.indexOf("function attachDailyDishPhoto(")));
 assert.match(body,/menu\.dish_id/);
 assert.match(body,/cachedOverviewRead\("\/api\/v2\/player\/dishes"\)/);
 assert.match(body,/matches\.length===1/);
 assert.match(body,/cachedDishPhoto\(dishId,true\)/);
 assert.match(body,/Promise\.resolve\(\)\.then\(load\)/);
 assert.doesNotMatch(body,/if\(started\|\|!section\.open\)return/);
 assert.match(body,/epoch!==playerSessionEpoch/);
 assert.match(body,/requestId!==overviewRequestId/);
 assert.match(body,/photo\.onload=/);
});
test("no image or failed image leaves original card unchanged",()=>{
 const body=js.slice(js.indexOf("function attachDailyDishPhoto("),js.indexOf("let lastMenuPresentationWeek=null;",js.indexOf("function attachDailyDishPhoto(")));
 assert.match(body,/if\(!dishId/);
 assert.match(body,/if\(!src/);
 assert.match(body,/card\.classList\.add\("has-dish-photo"\)/);
 assert.match(body,/card\.append\(photo\)/);
 assert.match(css,/#overview #day-details \.daily-meal \.meal-menu-card\.has-dish-photo/);
 assert.match(css,/border-radius:50%/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.doesNotMatch(body,/openDishPhoto\(/);
});
test("JS/CSS cache changed but recipe assets remain intact",()=>{
 assert.match(html,/jogador-v2\.js\?v=167/);
 assert.match(html,/jogador-v2\.css\?v=198/);
 assert.match(html,/player-recipes\.js\?v=11/);
 assert.match(html,/player-recipes\.css\?v=18/);
});

test("photos are prepared before opening, sharing a separate compact cache",()=>{
 assert.match(js,/key=\(thumbnail\?"daily:":"full:"\)\+dishId/);
 assert.match(js,/thumbnail\?"\?size=thumbnail":"\?v=2"/);
 assert.match(js,/const src=await cachedDishPhoto\(dishId,true\)/);
 const daily=js.slice(js.indexOf("function attachDailyDishPhoto("),js.indexOf("let lastMenuPresentationWeek=null;",js.indexOf("function attachDailyDishPhoto(")));
 assert.doesNotMatch(daily,/section\.addEventListener\("toggle"/);
 assert.match(daily,/Promise\.resolve\(\)\.then\(load\)/);
});

test("server delivers a small authenticated thumbnail without modifying Menus' full photo",()=>{
 assert.match(backend,/def player_daily_dish_thumbnail\(image_bytes\)/);
 assert.match(backend,/photo\.thumbnail\(\(176, 176\), Image\.Resampling\.LANCZOS\)/);
 assert.match(backend,/@lru_cache\(maxsize=64\)/);
 assert.match(backend,/get\('size',\[''\]\)\[0\] == 'thumbnail'/);
 assert.match(backend,/player_daily_dish_thumbnail\(image_data\) if thumbnail else player_menu_photo\(image_data\)/);
 assert.match(backend,/dish_assigned_to_athlete\(c,link\['athlete_id'\],identifier\)/);
});
