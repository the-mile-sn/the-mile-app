const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const area=html.slice(html.indexOf('class="tm-players-panel tm-players-list-surface"'),html.indexOf('id="tm-players-archived-panel"'));
const areaStyle=css.slice(css.lastIndexOf("/* =============================================================\n   Dashboard + Jogadores / app-style directory"));
test("Players: filters are a separate section and entries are actual cards, not table rows",()=>{
 assert.match(area,/id="tm-players-filter-panel"/);
 assert.match(area,/id="tm-players-filter"/);
 assert.match(area,/id="tm-players-access"/);
 assert.match(area,/id="tm-players-body" class="tm-players-card-list"/);
 assert.doesNotMatch(area,/<table\b|<thead\b|<tbody\b|<tr\b|<td\b/);
 assert.match(js,/el\("article","tm-player-card"\)/);
 assert.match(js,/el\("div","tm-player-card-renewal"\)/);
 assert.match(js,/el\("div","tm-player-card-status"\)/);
});
test("Player list keeps handlers, access filters and search suggestions",()=>{
 assert.match(js,/enterPlayerApp\(p\.user_id,app/);
 assert.match(js,/openPlayerProfile\(p\.id\)/);
 assert.match(js,/selectedPlayerId!==null\?p\.id===selectedPlayerId:matchesPlayerSearch\(p,term\)/);
 assert.match(js,/filter==="all"\|\|p\.access_status===filter/);
 assert.match(js,/function renderPlayerSuggestions\(/);
 assert.match(js,/const playersSearchCell=\$\("tm-players-filter-panel"\)/);
 assert.doesNotMatch(js,/access\.value="all";/);
 assert.match(area,/Estado/);
});
test("mobile cards preserve separate app action and expose status filter",()=>{
 assert.match(areaStyle,/@media\(max-width:830px\)/);
 assert.match(areaStyle,/\.tm-players-filter-panel #tm-players-new/);
 assert.match(areaStyle,/\.tm-players-filter-panel \.tm-players-header-select/);
 assert.match(areaStyle,/\.tm-player-card-actions \.tm-p-icon-action:not\(\.tm-p-app-action\)/);
 assert.match(areaStyle,/\.tm-player-card-actions \.tm-p-app-action/);
 assert.match(areaStyle,/font-size:16px!important/);
 assert.match(areaStyle,/max-width:360px/);
});
test("Weekly dashboard expands vertically with only necessary horizontal scroll",()=>{
 assert.match(areaStyle,/#tm-dashboard \.tm-db-grid-scroll/);
 assert.match(areaStyle,/max-height:none!important/);
 assert.match(areaStyle,/overflow:visible!important/);
 assert.match(areaStyle,/overflow-x:auto!important/);
 assert.match(areaStyle,/overflow-y:visible!important/);
});
test("Light/dark card hierarchy and focus preserved; no decorative border/shadow",()=>{
 assert.match(areaStyle,/background:var\(--tm-ui-subcard\)!important/);
 assert.match(areaStyle,/background:var\(--tm-ui-field-on-subcard\)!important/);
 assert.match(areaStyle,/background:var\(--tm-ui-card\)!important/);
 assert.match(areaStyle,/border:0!important/);
 assert.match(areaStyle,/box-shadow:none!important/);
 assert.match(areaStyle,/:focus-visible/);
 assert.match(html,/admin-dashboard\.js\?v=70/);
 assert.match(html,/admin-surface-palette\.css\?v=6/);
});
