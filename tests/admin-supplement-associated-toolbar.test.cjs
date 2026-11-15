"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const script=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");

const start=html.indexOf('<section class="calendar-panel" id="supplements-panel"');
const end=html.indexOf('<section class="calendar-panel" id="peri-panel"',start);
const panel=html.slice(start,end);

test("supplementation has one associated-section toolbar and no separate assignment card",()=>{
 assert.ok(start>=0 && end>start);
 assert.match(panel, /class="supp-associated-header"/);
 assert.match(panel, /<h3>Suplementos associados<\/h3>/);
 assert.match(panel, /id="supp-add-toggle"[^>]*aria-expanded="false"[^>]*>Adicionar novo<\/button>/);
 assert.match(panel, /id="supp-save"[^>]*>Guardar<\/button>/);
 assert.equal((panel.match(/id="supp-save"/g)||[]).length,1);
 assert.ok(panel.indexOf('id="supp-save"')<panel.indexOf('id="supp-base-list"'));
 assert.doesNotMatch(panel, /<h3>Associar suplemento ao jogador<\/h3>/);
 assert.match(panel, /id="supp-assign-inline"[^>]*hidden>/);
 assert.match(panel, /id="supp-assign-search"/);
 assert.match(panel, /id="supp-search-dropdown"/);
 assert.match(panel, /id="supp-lib-select"/);
 assert.match(panel, /id="supp-lib-assign"/);
 assert.match(panel, /id="supp-assign-cancel"/);
 assert.match(panel, /<summary>Exceções por jogo<\/summary>/);
 assert.match(panel, /<summary>Prescrição personalizada<\/summary>/);
 assert.match(panel, /<summary>Biblioteca de suplementos<\/summary>/);
 for(const id of ["supp-add-toggle","supp-save","supp-assign-inline","supp-assign-search","supp-search-dropdown","supp-lib-assign","supp-lib-select","supp-assign-cancel","supp-base-list"]){
  assert.equal((panel.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
});

test("inline addition can open, cancel and reset safely without changing publication API",()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(script, /function setSupplementAssignmentOpen\(open,focusSearch=false\)/);
 assert.match(script, /panel\.hidden=!open/);
 assert.match(script, /toggle\.setAttribute\("aria-expanded",String\(open\)\)/);
 assert.match(script, /\$\("supp-add-toggle"\)\.onclick=/);
 assert.match(script, /\$\("supp-assign-cancel"\)\.onclick=/);
 assert.match(script, /setSupplementAssignmentOpen\(false\)/);
 assert.match(script, /\$\("supp-lib-assign"\)\.onclick=/);
 assert.match(script, /method:"PUT",body:JSON\.stringify\(supplementDraft\)/);
 assert.match(script, /Suplementação guardada e publicada para o jogador\./);
 assert.doesNotMatch(script, /Revê e clica em Publicar suplementação do jogador/);
});

test("new input stays hidden until activated and retains mobile focus/accessible dimensions",()=>{
 assert.match(css, /#supplements-panel>\.supp-assignment-inline\[hidden\]\{display:none!important\}/);
 assert.match(css, /#supplements-panel \.supp-associated-toolbar/);
 assert.match(css, /#supplements-panel \.supp-assignment-inline \.supp-assignment-actions/);
 assert.match(css, /font-size:16px!important/);
 for(const page of ["admin-microcycles","create-plan","food-library","admin-appointments"]){
  const document=fs.readFileSync("static/"+page+".html","utf8");
  assert.match(document, /admin-surface-palette\.css\?v=65/);
 }
 assert.match(html, /admin-microcycles\.js\?v=18292/);
});
