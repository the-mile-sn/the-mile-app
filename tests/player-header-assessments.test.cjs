const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('static/jogador-v2.html','utf8');
const js=fs.readFileSync('static/jogador-v2.js','utf8');
const css=fs.readFileSync('static/jogador-v2.css','utf8');
test('bottom middle button uses the existing assessment chart icon',()=>{
 assert.match(html,/data-tab="assessments"[^>]*>.*icon-chart-03.*<span>Avaliações<\/span>/);
 assert.doesNotMatch(html,/data-tab="new"/);
 assert.doesNotMatch(html,/id="plans-open-assessments"/);
});
test('assessments are a standalone view connected to the original published data',()=>{
 assert.match(html,/<section id="assessments"/);
 assert.match(html,/<div id="plans-assessments">/);
 assert.match(html,/id="assessment-measurements"/);
 assert.match(js,/if\(t==="assessments"\)openPlansSection\("assessments"\)/);
 assert.match(js,/api\("\/api\/v2\/player\/assessments"\)/);
 assert.match(js,/renderPlayerAssessments\(\)/);
});
test('header uses official Backoffice wordmark and right-side private avatar',()=>{
 assert.match(html,/viewBox="0 0 1605 244"/);
 assert.match(html,/class="player-header-wordmark"/);
 assert.match(css,/\.player-top #player-avatar\{margin-left:auto!important/);
 assert.match(html,/id="header-player-photo"/);
});
test('profile notifications are a noninteractive placeholder without network calls',()=>{
 assert.match(html,/class="profile-notifications-card"/);
 assert.match(html,/id="profile-notifications-open"/);
 assert.match(html,/id="profile-notifications-page"/);
 assert.match(html,/>Notificações<\/span>/);
 assert.match(html,/class="profile-notification-indicator" hidden/);
 assert.doesNotMatch(html,/id="profile-notifications-toggle"/);
});

test('Original assessment CSS and module are preserved, no duplicated partial rules',()=>{
 assert.match(css,/#plans #plans-assessments details\.assessment-measure-card > summary/);
 assert.equal(css.split("{").length,css.split("}").length);
 assert.match(html,/<div id="plans-assessments">/);
 assert.ok(js.includes('$("plans-assessments").hidden=section!=="assessments"'));
});
