const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const html=fs.readFileSync('static/jogador-v2.html','utf8'), js=fs.readFileSync('static/jogador-v2.js','utf8'), css=fs.readFileSync('static/jogador-v2.css','utf8');
test('notifications and password navigate to separate profile pages with back actions',()=>{
 for(const id of ['profile-main','profile-notifications-page','profile-password-page','profile-notifications-open','profile-password-open','profile-notifications-back','profile-password-back'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(html,/<details class="profile-notifications-card">/);
 assert.match(html,/id="profile-notifications-open"[^>]*type="button"|id="profile-notifications-open"/);
 assert.match(html,/profile-action-chevron" aria-hidden="true">›/);
 assert.match(js,/\$\("profile-notifications-open"\)\.onclick=\(\)=>openProfileSubpage\("notifications"\)/);
 assert.match(js,/\$\("profile-password-open"\)\.onclick=\(\)=>openProfileSubpage\("password"\)/);
 assert.match(js,/\$\("profile-notifications-back"\)\.onclick=resetProfileSubpage/);
 assert.match(js,/\$\("profile-password-back"\)\.onclick=resetProfileSubpage/);
});
test('no notification delivery or backend integration introduced',()=>{
 assert.match(html,/profile-notifications-empty/);
 assert.match(html,/Ainda não existem notificações/);
 assert.match(html,/class="profile-notification-indicator" hidden/);
 assert.doesNotMatch(js,/\/api\/v2\/player\/notifications/);
});
test('password form retains real backend validation and clears secrets on navigation',()=>{
 assert.equal((html.match(/id="profile-password-form"/g)||[]).length,1);
 for(const id of ['profile-current-password','profile-new-password','profile-confirm-password','profile-password-feedback'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/await api\("\/api\/change-password"/);
 assert.match(js,/if\(next!==confirm\)/);
 assert.match(js,/if\(next.length<8\)/);
 assert.match(js,/revokePlayerView\(\);\$\("status"\)\.textContent="Palavra-passe alterada/);
 assert.match(js,/function resetProfilePassword\(\)/);
 assert.match(js,/\$\("profile-password-form"\)\.reset\(\)/);
 assert.match(js,/if\(t!=="profile"\)resetProfileSubpage\(\)/);
});
test('original assessment navigation and CSS continue unchanged',()=>{
 assert.match(html,/id="assessment-measurements"/);
 assert.match(js,/openPlansSection\("assessments"\)/);
 assert.match(css,/#plans #plans-assessments details\.assessment-measure-card > summary/);
 assert.equal(css.split('{').length,css.split('}').length);
});

test('password inputs have accessible inline placeholders and hide hints on focus',()=>{
 for(const label of ['Palavra-passe atual','Nova palavra-passe','Confirmar nova palavra-passe']){
  assert.ok(html.includes('placeholder="'+label+'"'));
  assert.ok(html.includes('<span class="profile-password-visually-hidden">'+label+'</span>'));
 }
 assert.match(css,/label\.profile-password-field input:focus::placeholder/);
 assert.match(css,/color:transparent!important/);
 assert.match(html,/autocomplete="current-password"/);
 assert.match(html,/autocomplete="new-password"/);
});



test('only selected assessment mode renders and password page has no outer grey card',()=>{
 assert.doesNotMatch(js,/svg\.hidden=all;fullScroll\.hidden=!all/);
 assert.match(css,/\.assessment-trend-horizontal-scroll\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/#profile \.profile-password-page-form\{\s*background:transparent!important;/);
 assert.match(css,/border-radius:0!important;\s*padding:0!important/);
});

test('assessments use one scrollable horizontal chart for all historical points',()=>{
 assert.match(js,/const visible=points,values=visible\.map/);
 assert.match(js,/const width=344\+Math\.max\(0,visible\.length-10\)/);
 assert.match(js,/className="assessment-trend-horizontal-scroll"/);
 assert.match(js,/scroll\.scrollLeft=scroll\.scrollWidth-scroll\.clientWidth/);
 assert.doesNotMatch(js,/recentButton\.textContent|allButton\.textContent/);
 assert.doesNotMatch(js,/assessment-trend-vertical-scroll/);
 assert.match(css,/\.assessment-trend-horizontal-scroll\{[\s\S]*?overflow-x:auto/);
});

test('scrolling assessment plots omit vertical axis labels without losing grid and mean',()=>{
 const code=js.slice(js.indexOf('function buildAssessmentTrend('),js.indexOf('function renderPlayerAssessments()'));
 assert.doesNotMatch(code,/assessment-chart-tick/);
 assert.match(code,/assessment-chart-grid/);
 assert.match(code,/assessment-chart-mean/);
});

test('assessment last value label stays within the horizontal chart bounds',()=>{
 const chart=js.slice(js.indexOf('function buildAssessmentTrend('),js.indexOf('function renderPlayerAssessments()'));
 assert.match(chart,/const left=27,right=width-40,top=22,bottom=148/);
 assert.match(chart,/x=i=>left\+\(right-left\)\*i/);
});

test('login uses the approved minimal brand layout without changing credentials or authentication wiring',()=>{
 assert.doesNotMatch(html,/class="login-tagline">Start now\. Get consistent\./);
 assert.match(html,/id="username" autocomplete="username"/);
 assert.match(html,/id="password" type="password" autocomplete="current-password"/);
 assert.match(html,/id="login-form"/);
 assert.match(html,/id="login-error" class="error" role="alert"/);
 assert.match(css,/#login-panel\{background:transparent!important;border:0!important/);
 assert.match(css,/#login-form \.login-input input\{/);
});

test('login group is vertically centred without affecting authenticated player pages',()=>{
 assert.match(css,/body:has\(#login-panel:not\(\[hidden\]\)\) \.shell\{/);
 assert.match(css,/min-height:100vh;min-height:100dvh/);
 assert.match(css,/display:flex;flex-direction:column;justify-content:center/);
 assert.match(css,/safe-area-inset-bottom/);
});

test('login logo is larger and the former tagline is removed',()=>{
 assert.doesNotMatch(html,/Start now\. Get consistent\./);
 assert.match(css,/player-header-brand\{width:174px!important/);
});
test('tab switching slides content in navigation direction and respects reduced motion',()=>{
 assert.match(js,/const tabOrder=\["overview","plans","assessments","menus","profile"\]/);
 assert.match(js,/direction=oldIndex<newIndex\?1:-1/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/destination\.animate\(\[/);
 assert.match(js,/duration:500/);
});

test('floating navigation has frosted glass styling with a clear selected state',()=>{
 assert.match(css,/backdrop-filter:blur\(22px\) saturate\(145%\)/);
 assert.match(css,/#player-panel #tabs button\[aria-pressed="true"\]/);
 assert.match(js,/duration:500/);
});

test('adaptive bottom navigation responds to scroll and resets on tab change',()=>{
 assert.match(js,/window\.addEventListener\("scroll"/);
 assert.match(js,/mileScrollAccum>=28/);
 assert.match(js,/y<32/);
 assert.match(js,/nav\.classList\.toggle\("tabs-compact",direction>0\)/);
 assert.match(js,/\$\("tabs"\)\.classList\.remove\("tabs-compact"\)/);
 assert.match(css,/#player-panel #tabs\.tabs-compact\{/);
 assert.match(css,/min-height:44px!important/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
