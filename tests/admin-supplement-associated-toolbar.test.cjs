"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const microCss=fs.readFileSync("static/admin-microcycles.css","utf8");
const start=html.indexOf('<section class="calendar-panel" id="supplements-panel"');
const end=html.indexOf('<section class="calendar-panel" id="peri-panel"',start);
const panel=html.slice(start,end);

test("Suplementos associados has a standalone add button and a hidden bottom save",()=>{
 assert.ok(start>=0 && end>start);
 const card=panel.slice(panel.indexOf('<div class="supp-associated-card">'),panel.indexOf('<details class="supp-workflow supp-exceptions-card">'));
 assert.match(card, /<h3>Suplementos associados<\/h3>/);
 assert.match(card, /id="supp-add-toggle"[^>]*>\+ Adicionar suplemento<\/button>/);
 assert.match(card, /id="supp-save-footer"[^>]*hidden>/);
 assert.match(card, /id="supp-save"[^>]*hidden>Guardar<\/button>/);
 assert.ok(card.indexOf('id="supp-save"')>card.indexOf('id="supp-base-list"'));
 assert.match(card, /id="supp-assign-inline"[^>]*hidden>/);
 assert.match(card, /id="supp-assign-search"/);
 assert.match(card, /id="supp-search-dropdown"/);
 assert.doesNotMatch(card, /id="supp-lib-assign"|id="supp-assign-cancel"|Associar ao jogador/);
 for(const id of ["supp-add-toggle","supp-save-footer","supp-save","supp-assign-inline","supp-assign-search","supp-base-list","supp-feedback"]){
  assert.equal((card.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(panel, /<summary>Exceções por jogo<\/summary>/);
 assert.match(panel, /<summary>Prescrição personalizada<\/summary>/);
 assert.match(panel, /<summary>Biblioteca de suplementos<\/summary>/);
});

test("selected library suggestion adds directly to the draft, never auto-publishes",()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 const start=js.indexOf("function addSupplementFromLibrary(item){");
 const end=js.indexOf('\n\n$("supp-transfer-import").onclick=',start);
 assert.ok(start>=0&&end>start);
 const handler=js.slice(start,end);
 assert.doesNotMatch(handler, /request\(|method:"PUT"/);
 assert.match(js, /button\.onclick=\(\)=>addSupplementFromLibrary\(item\)/);
 assert.doesNotMatch(js, /\$\("supp-lib-assign"\)\.onclick/);
 const notifications=[];
 const nodes={"supp-feedback":{textContent:""},"supp-add-toggle":{focus:()=>notifications.push("focus")}};
 const env={supplementEditorReady:true,supplementDraft:{plan:[]},$:(id)=>nodes[id],renderSupplementEditor:()=>notifications.push("render"),setSupplementAssignmentOpen:(open)=>notifications.push("open:"+open)};
 const context=vm.createContext(env);
 vm.runInContext(handler,context);
 vm.runInContext('addSupplementFromLibrary({id:"lib-1",name:"Magnésio",dose:"1 comprimido",moment:"breakfast",rule:"daily",note:"",timing_text:""});',context);
 assert.equal(env.supplementDraft.plan.length,1);
 assert.equal(env.supplementDraft.plan[0].library_id,"lib-1");
 assert.deepEqual(notifications,["render","open:false","focus"]);
 assert.equal(nodes["supp-feedback"].textContent,"");
});

test("Guardar is displayed only for pending changes, including edits and removals",()=>{
 const start=js.indexOf("function supplementPublishedKey()");
 const end=js.indexOf("async function loadSupplementEditor()",start);
 assert.ok(start>=0&&end>start);
 const snapshot=js.slice(start,end);
 const nodes={"supp-save":{hidden:false},"supp-save-footer":{hidden:false}};
 const env={supplementDraft:{plan:[{name:"A"}],match_exclusions:{}},publishedSupplementSnapshot:JSON.stringify([{name:"A"}]),publishedSupplementExclusionsSnapshot:"{}",supplementEditorReady:true,$:(id)=>nodes[id]};
 const context=vm.createContext(env);
 vm.runInContext(snapshot,context);
 const sync=()=>vm.runInContext("syncSupplementSaveVisibility()",context);
 sync();
 assert.equal(nodes["supp-save"].hidden,true);
 assert.equal(nodes["supp-save-footer"].hidden,true);
 env.supplementDraft.plan.push({name:"B"});
 sync();
 assert.equal(nodes["supp-save"].hidden,false);
 env.supplementDraft.plan.pop();
 sync();
 assert.equal(nodes["supp-save"].hidden,true);
 env.supplementDraft.plan[0].name="Editado";
 sync();
 assert.equal(nodes["supp-save"].hidden,false);
 env.supplementDraft.plan[0].name="A";
 env.supplementDraft.match_exclusions={game:["A"]};
 sync();
 assert.equal(nodes["supp-save"].hidden,false);
 env.supplementDraft.match_exclusions={};
 sync();
 assert.equal(nodes["supp-save"].hidden,true);
 assert.match(js,/method:"PUT",body:JSON\.stringify\(supplementDraft\)/);
 assert.match(js,/publishedSupplementExclusionsSnapshot=supplementExclusionsKey\(\)/);
});

test("supplement editing uses exact official Hugeicons PencilEdit01Icon and TrashIcon paths",()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 const match=js.match(/const supplementPlanActionIcons=(\{[^\n]+\});/);
 assert.ok(match,"Official icons constant missing");
 const icons=JSON.parse(match[1]);
 assert.match(icons.edit,/data-hugeicons="PencilEdit01Icon"/);
 assert.match(icons.remove,/data-hugeicons="TrashIcon"/);
 assert.doesNotMatch(icons.remove,/tm-plan-trash-icon/);
 const editD=[
   "M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 5.41226 15.7842 5.05637 16.4211C4.70047 17.058 4.3424 18.5619 4 20C5.43809 19.6576 6.94199 19.2995 7.57889 18.9436C8.21579 18.5877 8.73844 18.0651 9.78375 17.0198L18.0176 8.78591",
   "M11 20H17"
 ];
 const trashD=[
   "M18.8516 16.3743L19.5 6H4.5L5.14839 16.3743C5.315 19.0401 5.39831 20.373 6.26426 21.1865C7.13021 22 8.46571 22 11.1367 22H12.8633C15.5343 22 16.8698 22 17.7357 21.1865C18.6017 20.373 18.685 19.0401 18.8516 16.3743Z",
   "M15.5 6H21M15.5 6L15.3721 4.97683C15.1595 3.2762 13.7139 2 12 2C10.2861 2 8.84047 3.2762 8.6279 4.97683L8.5 6M15.5 6H8.5M3 6H8.5",
   "M9.5 11V17M14.5 11V17"
 ];
 function extractD(svg){
  return [...svg.matchAll(/<path [^>]*d="([^"]+)"/g)].map(x=>x[1]);
 }
 assert.deepEqual(extractD(icons.edit),editD);
 assert.deepEqual(extractD(icons.remove),trashD);
 assert.equal((icons.edit.match(/stroke-width="1\.5"/g)||[]).length,2);
 assert.equal((icons.remove.match(/stroke-width="1\.5"/g)||[]).length,3);
 assert.match(js,/supp-item-edit/);
 assert.match(js,/supp-item-remove/);
 assert.match(js,/aria-label","Editar suplemento /);
 assert.match(js,/aria-label","Remover suplemento /);
});

test("names and protocols are separate DOM lines, not concatenated with a dot",()=>{
 assert.match(js,/name\.className="supp-associated-name";name\.textContent=item\.name;/);
 assert.match(js,/protocol\.className="supp-associated-protocol"/);
 assert.match(js,/label\.append\(headline,protocol\)/);
 assert.doesNotMatch(js,/label\.textContent=item\.name\+" · "/);
 assert.match(css,/supp-associated-row>\.supp-associated-label/);
 assert.match(css,/flex-direction:column!important/);
 assert.match(css,/supp-associated-protocol/);
 assert.match(css,/color:var\(--tm-ui-muted\)!important/);
});

test("header insets align with card text and add button stays white/black by theme",()=>{
 assert.match(css,/\.supp-associated-card>\.supp-associated-header\{\s*box-sizing:border-box!important;\s*padding:17px 20px 5px!important/);
 assert.match(css,/\.supp-associated-row\{\s*padding-left:20px!important;padding-right:20px!important/);
 assert.match(css,/#f6f7f8!important;color:#161719!important/);
 assert.match(css,/admin-theme="light"\] #supplements-panel \.supp-associated-card #supp-add-toggle/);
 assert.match(css,/background:#1b1d23!important;color:#fff!important/);
 assert.match(css,/supp-item-action:hover:not\(:disabled\)\{\s*background:transparent!important/);
 assert.match(css,/supp-item-edit:hover:not\(:disabled\)\{\s*color:#f5f6f8!important/);
 assert.match(css,/supp-item-remove:hover:not\(:disabled\)\{\s*color:#e17c89!important/);
 assert.match(css,/admin-theme="light"\] #supplements-panel #supp-base-list \.supp-associated-actions \.supp-item-edit/);
 assert.match(css,/admin-theme="light"\] #supplements-panel #supp-base-list \.supp-associated-actions \.supp-item-remove/);
});

test("button colors, hidden states and cached assets work in dark and light themes",()=>{
 assert.match(css,/#supplements-panel \.supp-associated-card \.supp-associated-footer\[hidden\]\{display:none!important\}/);
 assert.match(css,/#supplements-panel \.supp-associated-card>\.supp-assignment-inline\[hidden\]\{display:none!important\}/);
 assert.match(css,/#f6f7f8!important;color:#161719!important/);
 assert.match(css,/admin-theme="light"\] #supplements-panel \.supp-associated-card #supp-save/);
 assert.match(css,/background:#1b1d23!important;color:#fff!important/);
 assert.match(css,/supp-item-action svg/);
 assert.match(html,/admin-microcycles\.js\?v=18296/);
 for(const page of ["admin-microcycles","create-plan","food-library","admin-appointments"]){
  const p=fs.readFileSync("static/"+page+".html","utf8");
  assert.match(p,/admin-surface-palette\.css\?v=70/);
 }
});


test("Guardado/Pendente labels are inline beside the name and use the official palette",()=>{
 assert.match(js,/statusChip\.className="supp-status-chip "\+\(saved\?"supp-status-saved":"supp-status-pending"\)/);
 assert.match(js,/statusChip\.textContent=saved\?"Guardado":"Pendente"/);
 assert.match(js,/headline\.append\(name,statusChip\)/);
 assert.match(js,/label\.append\(headline,protocol\)/);
 assert.match(css,/supp-associated-headline\{/);
 assert.match(css,/supp-status-chip\{/);
 assert.match(css,/border-radius:999px!important/);
 for(const token of [
  "#183428!important;color:#8ED0AB!important",
  "#3B2D16!important;color:#E2C17E!important",
  "#DDEFE4!important;color:#317154!important",
  "#F5E8C9!important;color:#8A6327!important",
 ]) assert.ok(css.includes(token),"Missing official status palette "+token);
});

test("rows are transparent and separated by lines, without publication card fills",()=>{
 assert.match(css,/\/\* Suplementação: simple list rows/);
 assert.match(css,/\.supp-associated-row\.supp-published,/);
 assert.match(css,/\.supp-associated-row\.supp-pending\{/);
 assert.match(css,/border-bottom:1px solid var\(--tm-ui-divider\)!important/);
 assert.match(css,/border-radius:0!important;background:transparent!important/);
 assert.match(css,/\.supp-associated-row:last-child\{\s*border-bottom:0!important/);
});

test("saved-state matching handles deletions, editing, reordering and duplicates",()=>{
 const from=js.indexOf("function supplementSavedStatuses(plan,publishedSnapshot){");
 const to=js.indexOf("function renderSupplementEditor(){",from);
 assert.ok(from>=0&&to>from);
 const source=js.slice(from,to);
 const check=(current,published)=>{
  const code=source+"\nJSON.stringify(supplementSavedStatuses("+JSON.stringify(current)+","+JSON.stringify(JSON.stringify(published))+"));";
  return JSON.parse(vm.runInNewContext(code));
 };
 assert.deepEqual(check([{a:1},{b:2}],[{a:1},{b:2}]),[true,true]);
 assert.deepEqual(check([{b:2}],[{a:1},{b:2}]),[true]);
 assert.deepEqual(check([{b:2},{a:1}],[{a:1},{b:2}]),[true,true]);
 assert.deepEqual(check([{a:9},{b:2}],[{a:1},{b:2}]),[false,true]);
 assert.deepEqual(check([{a:1},{a:1}],[{a:1}]),[true,false]);
});

test("both add actions are contrast-colored full pills; event toggle remains the original control",()=>{
 const eventControl=html.match(/<button type="button" id="calendar-mobile-event-toggle"[^>]+><span class="calendar-mobile-event-plus"[^>]*>\+<\/span><span>Adicionar evento<\/span><\/button>/);
 assert.ok(eventControl);
 assert.match(css,/\.supp-associated-card #supp-add-toggle/);
 assert.match(css,/border:0!important;border-radius:999px!important;\s*background:#f6f7f8!important;color:#161719!important/);
 assert.match(css,/admin-theme="light"\] #supplements-panel \.supp-associated-card #supp-add-toggle/);
 assert.match(css,/\.tm-calendar-event-subcard>#calendar-mobile-event-toggle\{\s*border:0!important;border-radius:999px!important/);
 assert.match(css,/admin-theme="light"\] #admin-workspace #calendar-section #calendar-month-card \.tm-calendar-event-subcard>#calendar-mobile-event-toggle/);
});


test("Microciclos month title is in the same row as previous Hoje next buttons",()=>{
 const cardStart=html.indexOf('<div id="calendar-month-card"');
 const calendarEnd=html.indexOf('<div id="calendar-day-card"',cardStart);
 assert.ok(cardStart>=0 && calendarEnd>cardStart);
 const card=html.slice(cardStart,calendarEnd);
 const headerStart=card.indexOf('<div class="tm-calendar-month-heading">');
 const navigationStart=card.indexOf('<div class="calendar-navigation tm-calendar-month-navigation">');
 const headerEnd=card.indexOf('</div>',navigationStart)+6;
 assert.ok(headerStart>=0 && navigationStart>headerStart && headerEnd>navigationStart);
 const header=card.slice(headerStart,headerEnd);
 assert.match(header,/<strong id="calendar-title"><\/strong>/);
 for(const id of ["calendar-prev","calendar-go-today","calendar-next"])
  assert.match(header,new RegExp('id="'+id+'"'));
 assert.equal((card.match(/id="calendar-title"/g)||[]).length,1);
 assert.match(css,/\.tm-calendar-month-heading>#calendar-title/);
 assert.match(css,/\.tm-calendar-month-heading>\.tm-calendar-month-navigation/);
});

test("Adicionar evento moved below calendar days, still opens its adjacent form",()=>{
 const cardStart=html.indexOf('<div id="calendar-month-card"');
 const calendarEnd=html.indexOf('<div id="calendar-day-card"',cardStart);
 const card=html.slice(cardStart,calendarEnd);
 const dayIndex=card.indexOf('id="calendar-days"');
 const buttonIndex=card.indexOf('id="calendar-mobile-event-toggle"');
 const formIndex=card.indexOf('id="calendar-event-form"');
 assert.ok(dayIndex>=0 && dayIndex<buttonIndex && buttonIndex<formIndex);
 assert.match(card,/<\/button>\s*<form id="calendar-event-form" class="calendar-event-form">/);
 assert.match(css,/\.tm-calendar-event-subcard>#calendar-mobile-event-toggle/);
 assert.match(css,/grid-column:2!important;grid-row:1!important;justify-self:end!important/);
 assert.match(css,/\.tm-calendar-event-subcard>#calendar-event-form/);
 assert.match(js,/setMobileCalendarEventFormOpen\(open\)/);
 assert.match(js,/\$\("calendar-mobile-event-toggle"\)\.addEventListener\("click"/);
});

test("pending-save explanation is removed but error and success feedback remain",()=>{
 assert.doesNotMatch(js,/supp-feedback"\)\.textContent="Alterações por guardar/);
 assert.doesNotMatch(js,/supp-feedback"\)\.textContent="Exceções por guardar/);
 assert.match(js,/supp-feedback"\)\.textContent="Não foi possível guardar: "/);
 assert.match(js,/Suplementação guardada e publicada para o jogador/);
 assert.match(css,/\.supp-associated-card>\.supp-associated-footer\{\s*margin:0!important;padding:0 20px 6px!important/);
});


test("Month day numbers align top right without moving classification and meal colors",()=>{
 assert.match(css,/calendar-days \.calendar-day>strong\{\s*align-self:flex-end!important;text-align:right!important/);
 const numberCreation=js.indexOf('const date=document.createElement("strong");date.textContent=Number(day.date.slice(-2));el.appendChild(date);');
 assert.ok(numberCreation>=0,"Day number still generated in its own strong element");
 assert.match(js,/const type=document\.createElement\("span"\);type\.textContent=/);
 assert.match(js,/const strip=document\.createElement\("div"\);strip\.className="day-color-strip"/);
});

test("Supplements associated is a standalone main card separated from workflow subcards",()=>{
 assert.match(html, /<section class="calendar-panel" id="supplements-panel" hidden>\s*<div class="supp-associated-card">/);
 assert.match(css, /#tm-admin-legacy \.calendar-panel:not\(#menus-panel\):not\(#supplements-panel\)/);
 assert.match(css, /#supplements-panel \.supp-associated-card\{\s*display:flex!important;flex-direction:column!important;gap:14px!important;min-width:0!important;\s*margin:0!important;padding:0 0 16px!important;background:var\(--tm-ui-card\)!important;\s*border:0!important;border-radius:20px!important;box-shadow:none!important;/);
 assert.match(microCss, /#supplements-panel\{border:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;display:flex;flex-direction:column;gap:14px\}/);
 assert.match(microCss, /#supplements-panel\[hidden\]\{display:none!important\}/);
 assert.match(microCss, /#supplements-panel>details\.supp-workflow/);
});

test("Supplement library search left edge follows 20px/16px associated-row text insets",()=>{
 assert.match(css, /#supplements-panel \.supp-associated-card>\.supp-assignment-inline\{\s*display:flex!important;align-items:center!important;flex-wrap:wrap!important;\s*box-sizing:border-box!important;width:100%!important;\s*margin:0!important;padding:0 20px!important/);
 assert.match(css, /#supplements-panel \.supp-associated-card>\.supp-assignment-inline\{\s*padding:0 16px!important/);
 assert.match(css, /#supplements-panel #supp-base-list \.supp-associated-row\{\s*padding-left:20px!important;padding-right:20px!important/);
 assert.match(css, /#supplements-panel #supp-base-list \.supp-associated-row\{\s*padding-left:16px!important;padding-right:16px!important/);
 assert.match(html, /id="supp-assign-inline" class="supp-assignment-inline" hidden/);
 assert.match(html, /id="supp-assign-search" type="search"/);
 assert.match(css, /#supplements-panel \.supp-associated-card>\.supp-assignment-inline\[hidden\]\{display:none!important\}/);
});
