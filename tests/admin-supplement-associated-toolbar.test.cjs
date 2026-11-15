"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const start=html.indexOf('<section class="calendar-panel" id="supplements-panel"');
const end=html.indexOf('<section class="calendar-panel" id="peri-panel"',start);
const panel=html.slice(start,end);

test("Suplementos associados has a standalone add button and a hidden bottom save",()=>{
 assert.ok(start>=0 && end>start);
 const card=panel.slice(panel.indexOf('<div class="supp-associated-card">'),panel.indexOf('<details class="supp-workflow supp-exceptions-card">'));
 assert.match(card, /<h3>Suplementos associados<\/h3>/);
 assert.match(card, /id="supp-add-toggle"[^>]*>\+ Adicionar novo<\/button>/);
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
 assert.match(nodes["supp-feedback"].textContent,/Alterações por guardar/);
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
 assert.match(js,/label\.append\(name,protocol\)/);
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
 assert.match(html,/admin-microcycles\.js\?v=18294/);
 for(const page of ["admin-microcycles","create-plan","food-library","admin-appointments"]){
  const p=fs.readFileSync("static/"+page+".html","utf8");
  assert.match(p,/admin-surface-palette\.css\?v=67/);
 }
});
