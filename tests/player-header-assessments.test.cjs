const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
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
 assert.match(js,/cachedOverviewRead\("\/api\/v2\/player\/assessments"\)/);
 assert.match(js,/renderPlayerAssessments\(\)/);
});
test('header uses official Backoffice wordmark and right-side private avatar',()=>{
 assert.match(html,/viewBox="0 0 1605 244"/);
 assert.match(html,/class="player-header-wordmark"/);
 assert.match(css,/#tabs button\[data-tab="profile"\] \.profile-tab-avatar\{/);
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

test('Planos navigation opens prescriptions directly without a redundant page heading',()=>{
 assert.match(html,/data-tab="plans"[^>]*>.*<span>Planos<\/span>/);
 assert.match(html,/id="plans-prescriptions"/);
 assert.doesNotMatch(html,/<h1>Planos<\/h1>/);
 assert.doesNotMatch(html,/<h2 class="assessments-page-heading">Avaliações<\/h2>/);
 assert.doesNotMatch(html,/id="plans-back-prescriptions"/);
 assert.doesNotMatch(js,/plans-back-prescriptions/);
 assert.match(js,/if\(t==="plans"\)openPlansSection\("prescriptions"\)/);
 assert.match(js,/\$\("plans-landing"\)\.hidden=true/);
});
test('assessment notes preserve the timestamp below metrics and the formula inside body fat details',()=>{
 assert.match(html,/id="assessment-measurements"><\/div><div class="assessment-most-recent" id="assessment-most-recent"/);
 assert.match(js,/stamp\.textContent="Última avaliação/);
 assert.match(js,/key==="body_fat"&&recent\.formula_note/);
 assert.match(js,/details\.append\(note\)/);
 assert.doesNotMatch(js,/note\.textContent="Gordura corporal: "\+recent\.formula_note;target\.append\(note\)/);
});

test("profile tab shows the existing private photo and header has only the brand",()=>{
 assert.match(html,/<button data-tab="profile"[^>]*><span class="profile-tab-avatar"/);
 assert.match(html,/id="header-player-photo"/);
 assert.match(html,/id="avatar-initials"/);
 assert.doesNotMatch(html,/id="player-avatar"/);
 assert.match(css,/#tabs button\[data-tab="profile"\] \.profile-tab-avatar img\{/);
});

test('8-skinfold graph colours reflect sex and goalkeeper cutoffs',()=>{
 const start=js.indexOf('function playerSkinfoldCategory(');
 const end=js.indexOf('\n}',start);
 assert.ok(start>=0&&end>start);
 const fn=vm.runInNewContext(js.slice(start,end+2)+';playerSkinfoldCategory');
 for(const [sex,pos,limits] of [['M','',[45,55,60]],['M','GR',[50,60,65]],['F','',[65,70,80]],['F','GR',[70,75,85]]]){
  const [dark,yellow,red]=limits;
  for(const [value,expected] of [[dark,'dark-green'],[dark+.1,'light-green'],[yellow-.1,'light-green'],[yellow,'yellow'],[red-.1,'yellow'],[red,'red'],[red+5,'red']]){
   assert.equal(fn(value,pos,sex).code,expected,sex+' '+pos+' '+value);
  }
 }
 assert.equal(fn(62.5,'','M').code,'red');
 assert.equal(fn(62.5,'GR','M').code,'yellow');
 assert.equal(fn(80,'','F').color,'#E17878');
 assert.equal(fn(85,'GR','F').color,'#E17878');
 assert.equal(fn(null,'','F'),null);
 assert.equal(fn(60,'',null).code,'red');
 assert.match(js,/buildAssessmentTrend\(readings,unit,[^\n]*key==="sum_8"\)/);
 assert.match(js,/dot\.style\.stroke=category\.color/);
 assert.match(js,/label\.style\.fill=category\.color/);
});

test("Assessments, Menus, Profile and bottom navigation share approved typography tokens",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#plans #plans-assessments \.assessment-metric-name/);
 assert.match(css,/#menus \.day-menu \.menu-entry-heading strong/);
 assert.match(css,/#profile \.profile-action,#profile \.profile-password-save/);
 assert.match(css,/#tabs button,#tabs button>span:not\(\.profile-tab-avatar\)/);
 assert.match(css,/font-weight:var\(--mile-type-medium\)!important/);
 assert.match(css,/font-weight:var\(--mile-type-semibold\)!important/);
 assert.match(css,/font-weight:var\(--mile-type-regular\)!important/);
});
