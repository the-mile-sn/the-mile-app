"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const python=fs.readFileSync("app.py","utf8");
const defaults=fs.readFileSync("player_language_defaults_v2.py","utf8");

test("Initial language is inside Clients > player Profile, not a separate page",()=>{
 assert.match(js,/settingsSlot\.querySelector\("\.tm-player-language-default"\)\?\.remove\(\)/);
 assert.match(js,/const languageSection=el\("section","tm-player-language-default"\)/);
 assert.match(js,/permissions\.after\(languageSection\)/);
 assert.match(js,/Idioma inicial da app/);
 assert.match(js,/Português/);
 assert.match(js,/English/);
 assert.match(js,/role","group"/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/if\(!accountId\)/);
 assert.match(js,/accountId\)/);
 assert.match(js,/playerProfileEditing/);
});

test("Only independent admin language endpoint is used and no clinical profile PUT is reused",()=>{
 assert.match(js,/\/initial-language/);
 assert.match(js,/method:"PUT",body:JSON\.stringify\(\{language\}\)/);
 assert.match(js,/token!==profileLoadToken\|\|playerProfile\?\.id!==athleteId/);
 assert.match(js,/A escolha do jogador mantém prioridade/);
 assert.match(python,/path\.endswith\('\/initial-language'\)/);
 assert.match(python,/admin\(user\)/);
 assert.match(python,/player_language_defaults_v2\.set_initial\(c,link\['id'\],body\['language'\]\)/);
 assert.doesNotMatch(defaults,/UPDATE\s+v2_player_language_preferences|INSERT\s+INTO\s+v2_player_language_preferences/i);
});

test("Profile language control retains approved depth, keyboard focus and mobile layout",()=>{
 assert.match(css,/\.tm-player-language-default-body\{/);
 assert.match(css,/background:var\(--tm-ui-subcard\)/);
 assert.match(css,/\.tm-player-language-default-choice\[aria-pressed="true"\]/);
 assert.match(css,/\.tm-player-language-default-choice:focus-visible/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(html,/admin-dashboard\.js\?v=105/);
 assert.match(html,/admin-surface-palette\.css\?v=206/);
});
