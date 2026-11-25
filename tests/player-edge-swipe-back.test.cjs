// Swipe back (25/11): every page with a ‹ button also goes back with a swipe from the left edge.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('static/jogador-v2.js','utf8');
test('the swipe reuses the visible back button of each page',()=>{
 for(const sel of ['#progress-page:not([hidden]) .progress-back','#weight-detail:not([hidden]) .weight-detail-back','.plan-page-head .plan-page-back','#overview-back:not([hidden])','#recipe-header-back:not([hidden])','.profile-page-back'])
  assert.ok(js.includes(JSON.stringify(sel)),sel);
 assert.match(js,/settle\(innerWidth,\(\)=>\{target\.click\(\);\}\)/);
});
test('only from the left edge, rightwards, past a distance or with speed; vertical scroll stays native',()=>{
 assert.match(js,/const PLAYER_EDGE_BACK_ZONE=28;/);
 assert.match(js,/if\(t\.clientX>PLAYER_EDGE_BACK_ZONE\)return;/);
 assert.match(js,/if\(Math\.abs\(dy\)>14&&Math\.abs\(dy\)>Math\.abs\(dx\)\)\{reset\(\);return;\}/);
 assert.match(js,/if\(dx>innerWidth\*\.28\|\|\(dx>40&&speed>\.45\)\)/);
});
test('the day swipe on Início leaves the left edge to the back swipe',()=>{
 assert.match(js,/if\(t\.clientX<PLAYER_EDGE_BACK_ZONE\|\|t\.clientX>innerWidth-22\)return;/);
});
