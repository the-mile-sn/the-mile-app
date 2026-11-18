"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const clients=fs.readFileSync("static/admin-clients.js","utf8");
const chefs=fs.readFileSync("static/admin-chefs.js","utf8");
const nav=fs.readFileSync("static/admin-nav-shell.js","utf8");
const dashboard=fs.readFileSync("static/admin-dashboard.js","utf8");
const adminApp=fs.readFileSync("app.py","utf8");

test("Clientes replaces the old Jugadores nav label without changing the route",()=>{
  assert.match(nav, /<span>Clientes<\/span>/);
  assert.match(nav,/id=\\\"tm-admin-nav-players\\\"/);
  assert.match(html,/aria-label="Gestão de clientes"/);
  assert.match(html,/id="tm-players-new"[^>]*>\+ Novo cliente<\/button>/);
  assert.match(html,/id="tm-clients-create-choice"/);
});

test("account chooser offers all three types and keeps real athlete creation unchanged",()=>{
  for(const type of ["acompanhamento","consulta","chef"]){
    assert.match(html,new RegExp('data-new-client-type="'+type+'"'));
    assert.match(clients,new RegExp('type==="'+type+'"'));
  }
  assert.match(html,/id="tm-player-create-fields"/);
  assert.match(clients,/window\.tmOpenPlayerCreate\(\)/);
  assert.match(dashboard,/window\.tmOpenPlayerCreate\(\)/);
  assert.match(clients,/stopImmediatePropagation\(\)/);
});

test("Chefs creation sits only in Clientes; Planning retains only history",()=>{
  assert.match(html,/id="tm-clients-chefs-panel"/);
  assert.match(chefs,/clientsPanel\.append\(section\)/);
  assert.match(chefs,/history\.insertAdjacentElement\("afterend",review\)/);
  assert.match(chefs,/review\.id="tm-chef-menu-review"/);
  assert.match(chefs,/section\.addEventListener\("toggle"/);
  assert.match(chefs,/review\.addEventListener\("toggle"/);
  assert.doesNotMatch(chefs,/history\.insertAdjacentElement\("afterend",section\)/);
});

test("Consultations do not masquerade as an active authentication flow",()=>{
  assert.match(html,/id="tm-clients-consultations-panel"/);
  assert.match(html,/em preparação/);
  assert.match(html,/href="\/appointments"/);
  assert.doesNotMatch(clients,/\/api\/v2\/admin\/consultations/);
});

test("new assets remain admin-only and preserve underlying player route",()=>{
  assert.match(adminApp,/\/admin-clients\.js/);
  assert.match(adminApp,/\/admin-clients\.css/);
  assert.match(html,/\/admin-clients\.js\?v=6/);
  assert.match(html,/\/admin-clients\.css\?v=7/);
  assert.match(adminApp,/if SITE_ROLE == 'player'/);
});

test("account types appear as a shared filter and a labelled card category",()=>{
  assert.doesNotMatch(html,/id="tm-clients-types"/);
  assert.match(html,/id="tm-clients-type-filter"/);
  assert.match(html,/id="tm-clients-type-value"/);
  assert.match(html,/id="tm-clients-account-list"/);
  assert.match(html,/id="tm-chef-accounts"/);
  assert.match(clients,/window\.tmClientsCurrentType/);
  assert.match(clients,/window\.tmRefreshChefAccounts/);
  assert.match(chefs,/window\.tmFilterChefAccounts/);
  assert.match(chefs,/tm-client-type-chef/);
  assert.match(dashboard,/tm-client-type-pill-mobile/);
  assert.match(html,/option value="consulta">Consultas<\/option>/);
});

test("desktop client type precedes identity, nav asset cache is refreshed",()=>{
 const css=fs.readFileSync("static/admin-clients.css","utf8");
 assert.match(css,/\.tm-player-card \.tm-client-type-cell\{order:-1/);
 assert.match(css,/#tm-chef-accounts \.tm-client-type-cell\{order:-1/);
 assert.match(css,/grid-template-columns:minmax\(160px,220px\)/);
 assert.match(html,/admin-nav-shell\.js\?v=13/);
});


test("client and Chef cards remain separated, with Guide Visual hover on real controls",()=>{
  const css=fs.readFileSync("static/admin-clients.css","utf8");
  assert.match(css,/#tm-players-body:not\(\[hidden\]\):not\(:empty\) \+ #tm-chef-accounts:not\(\[hidden\]\)/);
  assert.match(css,/\.tm-player-card:hover:not\(:has\(\.tm-player-card-actions:hover\)\)/);
  assert.match(css,/\.tm-chef-account-actions button:hover/);
});

test("Chef creation always uses a native modal on desktop and mobile, never an inline page",()=>{
  const css=fs.readFileSync("static/admin-clients.css","utf8");
  assert.match(html,/<dialog id="tm-clients-chef-create-dialog"/);
  assert.match(html,/id="tm-clients-chef-modal-slot"/);
  assert.match(html,/<dialog id="tm-players-create-form"/);
  assert.match(clients,/chefSlot\.appendChild\(details\)/);
  assert.match(clients,/chefModal\.showModal\(\)/);
  assert.match(clients,/chefModal\?\.addEventListener\("close"/);
  assert.match(clients,/function openChefDialog\(details\)/);
  assert.match(clients,/if\(details\)openChefDialog\(details\)/);
  assert.doesNotMatch(clients,/mobileCreate|matchMedia\("\(max-width: 830px\)"\)/);
  assert.doesNotMatch(clients,/details\.scrollIntoView/);
  assert.match(css,/#tm-players-page #tm-clients-chefs-panel\{display:none!important\}/);
  assert.doesNotMatch(css,/@media\(max-width:830px\)\{\s*#tm-players-page #tm-clients-chefs-panel/);
  assert.match(css,/#tm-clients-chef-create-dialog #tm-chef-create/);
  assert.match(html,/admin-clients\.js\?v=6/);
  assert.match(html,/admin-clients\.css\?v=7/);
});


test("Chef card opens a profile and reserves the phone for read-only app preview",()=>{
  const css=fs.readFileSync("static/admin-clients.css","utf8");
  assert.match(html,/id="tm-clients-chef-profile"[^>]*hidden/);
  assert.match(html,/id="tm-players-profile-back"/);
  assert.match(html,/id="tm-chef-profile-password-form"/);
  assert.match(chefs,/open\.addEventListener\("click",\(\)=>openChefProfile\(item\)\)/);
  assert.match(chefs,/className|tm-chef-card-open/);
  assert.match(chefs,/tm-p-icon-action tm-p-app-action/);
  assert.match(chefs,/api\("\/api\/admin\/chef-preview"/);
  assert.doesNotMatch(chefs,/controls\.append\(button\("Alterar passe"/);
  assert.match(css,/\.tm-chef-account:hover:not\(:has\(\.tm-chef-app-actions:hover\)\)/);
  assert.match(css,/\.tm-chef-account\.is-pressing/);
  assert.match(clients,/!profile\.hidden\|\|!chefProfile\.hidden/);
});

test("Chef account access stays in profile; server tickets are admin-only and scoped",()=>{
  assert.match(html,/<summary>Arquivados<\/summary>/);
  assert.match(html,/aria-label="Gestão de clientes arquivados"/);
  assert.match(chefs,/tm-chef-profile-toggle/);
  assert.match(chefs,/tm-chef-profile-password-open/);
  assert.match(chefs,/\/password-reset/);
  assert.match(adminApp,/if path == '\/api\/admin\/chef-preview' and method == 'POST'/);
  assert.match(adminApp,/admin\(user\)/);
  assert.match(adminApp,/role='chef' AND active=1/);
  assert.match(adminApp,/chef_accounts_v2\.assigned_athlete\(c,requested\)/);
  assert.match(adminApp,/v2_admin_preview_tickets\(token,admin_id,player_id,expires\)/);
  assert.match(html,/admin-chefs\.js\?v=5/);
  assert.match(html,/admin-clients\.js\?v=6/);
  assert.match(html,/admin-clients\.css\?v=7/);
});


test("Chef detail reuses the single Player profile back control and hides account filters",()=>{
 const css=fs.readFileSync("static/admin-clients.css","utf8");
 assert.match(html,/id="tm-players-profile-nav"/);
 assert.match(html,/id="tm-players-profile-back"/);
 assert.doesNotMatch(html,/id="tm-clients-chef-profile-back"/);
 assert.match(clients,/const sharedProfileNav=document.getElementById\("tm-players-profile-nav"\)/);
 assert.match(clients,/const dashboardReturn=document.getElementById\("tm-dashboard-return"\)/);
 assert.match(clients,/dashboardReturn\.hidden=true;\s*sharedProfileNav\.hidden=false/);
 assert.match(clients,/sharedProfileNav\.hidden=true;\s*dashboardReturn\.hidden=false/);
 assert.match(clients,/sharedBackButton\.addEventListener\("click",event=>/);
 assert.match(clients,/event\.stopImmediatePropagation\(\)/);
 assert.match(css,/#tm-players-filter-panel\[hidden\]\{\s*display:none!important/);
 assert.match(html,/admin-clients\.js\?v=6/);
 assert.match(html,/admin-chefs\.js\?v=5/);
 assert.match(html,/admin-clients\.css\?v=7/);
});
