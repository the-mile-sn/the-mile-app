const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const player=fs.readFileSync('static/jogador-v2.js','utf8');
const html=fs.readFileSync('static/jogador-v2.html','utf8');
test('V2 profile reads linked follow-up metadata rather than old users plan and renewal',()=>{
 assert.match(player,/me=r\.player/);
 assert.match(player,/me\.followup_plan/);
 assert.match(player,/me\.followup_renewal_date/);
 assert.doesNotMatch(player,/sessionData\.user\?\.plan_name/);
 assert.match(html,/id="profile-plan-value"/);
 assert.match(html,/id="profile-renewal-date"/);
});
test('header avatar and profile photo are self-only and reset after account switch',()=>{
 assert.match(html,/id="header-player-photo"/);
 assert.match(html,/id="profile-photo"/);
 assert.match(player,/\/api\/v2\/player\/profile-photo/);
 assert.match(player,/const epoch=playerSessionEpoch/);
 assert.match(player,/for\(const id of \["profile-photo","header-player-photo"\]\)/);
});
test('App navigation is deliberately unchanged until a separately validated UI PR',()=>{
 assert.match(html,/data-tab="new"/);
 assert.match(html,/data-tab="plans"/);
 assert.match(html,/id="plans-open-assessments"/);
});
