"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const planJs=fs.readFileSync("static/create-plan.js","utf8");
const start=html.indexOf('<section class="calendar-panel" id="supplements-panel"');
const end=html.indexOf('<section class="calendar-panel" id="peri-panel"',start);
const panel=html.slice(start,end);

test("Suplementos associados has a standalone add button and a hidden bottom save",()=>{
 assert.ok(start>=0 && end>start);
 const card=panel.slice(panel.indexOf('<div class="supp-associated-card">'),panel.indexOf('<details class="supp-workflow supp-exceptions-card">'));
 assert.match(card, /<h3>Suplementos associados<\/h3>/);
 assert.match(card, /id="supp-add-toggle"[^>]*>Adicionar novo<\/button>/);
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

test("supplement edit and delete icons exactly match the Planos editor SVGs",()=>{
 const planEdit=planJs.indexOf('<button class="edit-row" data-edit-food=');
 const planTrash=planJs.indexOf('<button class="remove-row tm-plan-delete-action" data-remove=',planEdit);
 assert.ok(planEdit>0 && planTrash>0);
 const iconAt=(at)=>planJs.slice(planJs.indexOf("<svg ",at),planJs.indexOf("</svg>",at)+6);
 const edit=iconAt(planEdit),trash=iconAt(planTrash);
 assert.match(edit,/PencilEdit01Icon/);
 assert.match(trash,/tm-plan-trash-icon/);
 assert.ok(js.includes(JSON.stringify(edit)));
 assert.ok(js.includes(JSON.stringify(trash)));
 assert.match(js,/supp-item-edit/);
 assert.match(js,/supp-item-remove/);
 assert.match(js,/aria-label","Editar suplemento /);
 assert.match(js,/aria-label","Remover suplemento /);
 assert.match(css,/#supplements-panel #supp-base-list \.supp-item-remove/);
 assert.match(css,/--tm-action-danger-bg/);
});

test("button colors, hidden states and cached assets work in dark and light themes",()=>{
 assert.match(css,/#supplements-panel \.supp-associated-card \.supp-associated-footer\[hidden\]\{display:none!important\}/);
 assert.match(css,/#supplements-panel \.supp-associated-card>\.supp-assignment-inline\[hidden\]\{display:none!important\}/);
 assert.match(css,/#f6f7f8!important;color:#161719!important/);
 assert.match(css,/admin-theme="light"\] #supplements-panel \.supp-associated-card #supp-save/);
 assert.match(css,/background:#1b1d23!important;color:#fff!important/);
 assert.match(css,/supp-item-action svg/);
 assert.match(html,/admin-microcycles\.js\?v=18293/);
 for(const page of ["admin-microcycles","create-plan","food-library","admin-appointments"]){
  const p=fs.readFileSync("static/"+page+".html","utf8");
  assert.match(p,/admin-surface-palette\.css\?v=66/);
 }
});
