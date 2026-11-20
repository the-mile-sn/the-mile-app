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

test('password cards have visible floating labels without internal dividers or extra instructions',()=>{
 assert.doesNotMatch(html,/profile-password-intro/);
 assert.doesNotMatch(html,/Introduz a palavra-passe atual/);
 for(const label of ['Palavra-passe atual','Nova palavra-passe','Confirmar nova palavra-passe']){
  assert.ok(html.includes('<span class="profile-password-floating-label">'+label+'</span>'),label);
 }
 assert.equal((html.match(/placeholder=" "/g)||[]).length,3);
 assert.equal((html.match(/class="profile-password-field"/g)||[]).length,3);
 assert.match(css,/label\.profile-password-field:focus-within \.profile-password-floating-label/);
 assert.match(css,/input:not\(:placeholder-shown\)\+\.profile-password-floating-label/);
 assert.match(css,/top:12px;transform:translateY\(0\);font-size:12px/);
 assert.match(css,/top:50%;max-width:calc\(100% - 36px\)/);
 assert.match(css,/transform:translateY\(-50%\);pointer-events:none/);
 assert.match(css,/transition:top 180ms ease,transform 180ms ease,font-size 180ms ease/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/#profile \.profile-password-intro\{/);
 assert.doesNotMatch(css,/profile-password-visually-hidden/);
 assert.doesNotMatch(css,/#profile \.profile-password-page-form label\.profile-password-field input:focus::placeholder/);
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


test('profile root uses the approved universal type and original read-only plan layout',()=>{
 assert.match(css,/#player-panel #profile\{padding:19px 0 100px!important;margin:0!important\}/);
 assert.match(css,/#profile \.profile-plan-card\{[^}]*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[^}]*border-radius:13px/s);
 assert.match(css,/#profile \.profile-plan-detail>span\{[^}]*font-size:12px;[^}]*font-weight:var\(--mile-type-regular,400\)/s);
 assert.match(css,/#profile \.profile-plan-detail>strong\{[^}]*font-size:15px;font-weight:var\(--mile-type-semibold,600\)/s);
 assert.match(css,/#profile button\.profile-notifications-card\{[^}]*min-height:61px!important;[^}]*border-radius:13px!important;[^}]*font-size:16px!important;font-weight:var\(--mile-type-card-title,400\)!important/s);
 assert.match(css,/#profile \.profile-action\{[^}]*min-height:61px!important;[^}]*font-size:16px!important;font-weight:var\(--mile-type-card-title,400\)!important/s);
 assert.match(css,/#profile \.profile-actions-card\{[^}]*border-radius:17px/s);
 assert.match(html,/jogador-v2\.css\?v=268/);
});

test('profile subpages share the recipe back button geometry and page title hierarchy',()=>{
 const recipeCss=fs.readFileSync('static/player-recipes.css','utf8');
 assert.match(recipeCss,/\.player-top > #recipe-header-back\{[^}]*width:40px;[^}]*height:40px;[^}]*border:0;[^}]*background:rgba\(255,255,255,\.06\)/s);
 assert.match(css,/#profile button\.profile-page-back\{[^}]*width:40px!important;height:40px!important;[^}]*border:0!important;[^}]*background:rgba\(255,255,255,\.06\)!important/s);
 assert.match(css,/#profile \.profile-subpage-header h2\{[^}]*font-size:clamp\(21px,5\.3vw,23px\);[^}]*font-weight:var\(--mile-type-semibold,600\)/s);
 assert.match(css,/#profile button\.profile-page-back:focus-visible\{outline:2px solid currentColor;outline-offset:3px\}/);
 assert.match(js,/\$\("profile-notifications-back"\)\.onclick=resetProfileSubpage/);
 assert.match(js,/\$\("profile-password-back"\)\.onclick=resetProfileSubpage/);
});

test('profile password form keeps accessible semantics and cleans conflicting styles',()=>{
 assert.doesNotMatch(css,/#profile \.profile-password-intro\{/);
 assert.match(css,/#profile \.profile-password-page-form\{\s*background:transparent!important;/);
 assert.match(css,/#profile \.profile-password-page-form label\.profile-password-field input\{[^}]*height:76px!important;min-height:76px!important;border:0!important;[^}]*border-radius:13px!important;[^}]*font-size:16px!important;[^}]*font-weight:var\(--mile-type-regular,400\)!important/s);
 assert.match(css,/#profile \.profile-password-page-form button\.profile-password-save\{[^}]*font-size:14px!important;[^}]*font-weight:var\(--mile-type-medium,500\)!important/s);
 assert.match(html,/autocomplete="current-password"/);
 assert.match(html,/autocomplete="new-password"/);
 assert.match(js,/if\(next!==confirm\)/);
 assert.match(js,/if\(next.length<8\)/);
 assert.match(js,/await api\("\/api\/change-password"/);
});

test('each Profile component has one effective source rule, without later overrides',()=>{
 for(const selector of [
  '#player-panel #profile',
  '#profile .profile-subpage-header h2',
  '#profile button.profile-page-back',
  '#profile .profile-password-page-form',
  '#profile .profile-password-page-form label.profile-password-field input'
 ]){
  const count=css.split(selector+'{').length-1;
  assert.equal(count,1,selector);
 }
 // The one additional rule for this card is an intentional narrow-screen exception.
 assert.equal(css.split('#profile .profile-plan-card{').length-1,2);
 assert.match(css,/@media\(max-width:360px\)\{\s*#profile \.profile-plan-card\{gap:8px;padding:16px 15px\}/);
 assert.doesNotMatch(css,/#profile>h2/);
 assert.doesNotMatch(css,/#profile \.profile-plan-card>span/);
 assert.doesNotMatch(css,/#profile \.profile-password-form input/);
 assert.doesNotMatch(css,/#profile-logout\{border-radius:999px/);
 assert.match(css,/@media\(max-width:360px\)\{\s*#profile \.profile-plan-card\{/);
});
