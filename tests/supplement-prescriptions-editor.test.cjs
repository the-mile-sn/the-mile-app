"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const admin=fs.readFileSync("static/admin-microcycles.js","utf8");
const player=fs.readFileSync("static/jogador-v2.js","utf8");
const palette=fs.readFileSync("static/admin-surface-palette.css","utf8");
const playerCss=fs.readFileSync("static/jogador-v2.css","utf8");
const adminHtml=fs.readFileSync("static/admin-microcycles.html","utf8");
const playerHtml=fs.readFileSync("static/jogador-v2.html","utf8");

test("Backoffice and player JavaScript remain syntactically valid",()=>{
 assert.doesNotThrow(()=>new vm.Script(admin));
 assert.doesNotThrow(()=>new vm.Script(player));
});

test("Editing opens a native modal with the supplement name as title, no editable name input",()=>{
 assert.match(admin,/function openSupplementPrescriptionDialog\(item\)\{/);
 assert.match(admin,/const dialog=document\.createElement\("dialog"\)/);
 assert.match(admin,/title\.textContent=item\.name/);
 assert.match(admin,/dialog\.showModal\(\)/);
 assert.match(admin,/edit\.onclick=\(\)=>openSupplementPrescriptionDialog\(item\)/);
 assert.doesNotMatch(admin,/const fields=\[\["name","Suplemento"\]/);
 assert.match(admin,/close\.onclick=\(\)=>dialog\.close\(\)/);
 assert.match(admin,/cancel\.onclick=\(\)=>dialog\.close\(\)/);
 assert.match(admin,/dialog\.addEventListener\("close",\(\)=>dialog\.remove\(\)/);
});

test("Prescription 1 is the base, extra prescriptions have explicit same-day collision choices",()=>{
 assert.match(admin,/entries\.forEach\(appendRule\)/);
 assert.match(admin,/const entries=item\.prescriptions\?\.length\?item\.prescriptions:\[\{rule:item\.rule,dose:item\.dose/);
 assert.match(admin,/r\.heading\.textContent="Prescrição "\+\(i\+1\)/);
 assert.match(admin,/r\.choice\.field\.hidden=i===0/);
 assert.match(admin,/Se coincidir com outra prescrição no mesmo dia/);
 assert.match(admin,/Mostrar ambas as prescrições/);
 assert.match(admin,/Mostrar apenas esta prescrição/);
 assert.match(admin,/i>0&&!r\.choice\.input\.value/);
 assert.match(admin,/item\.prescriptions=entries/);
 assert.match(admin,/item\.rule=entries\[0\]\.rule;item\.dose=entries\[0\]\.dose/);
 assert.match(admin,/item\.moment=entries\[0\]\.moment;item\.timing_text=entries\[0\]\.timing_text/);
 assert.match(admin,/item\.note=generalNote/);
 assert.match(admin,/renderSupplementEditor\(\);\$\("supp-feedback"\)\.textContent="";/);
});

test("Only modified legacy or new multi-prescription supplements require collision confirmation",()=>{
 const a=admin.indexOf("function supplementSavedStatuses(plan,publishedSnapshot){");
 const b=admin.indexOf("function openSupplementPrescriptionDialog(item){",a);
 const c=admin.indexOf("function supplementNeedingOverlapConfirmation(){",b);
 const d=admin.indexOf('\n$("supp-save").onclick=',c);
 assert.ok(a>=0&&b>a&&c>b&&d>c);
 const code=admin.slice(a,b)+admin.slice(c,d);
 const before={name:"Creatina",prescriptions:[{rule:"daily"},{rule:"match"}]};
 const check=(plan,published)=>vm.runInNewContext(
  code+"\nsupplementNeedingOverlapConfirmation()||null",
  {supplementDraft:{plan},publishedSupplementSnapshot:JSON.stringify(published)}
 );
 assert.equal(check([before],[before]),null,"untouched legacy already-published data");
 assert.equal(check([before],[]).name,"Creatina","new overlapping rule needs confirmation");
 const confirmed={name:"Creatina",prescriptions:[{rule:"daily"},{rule:"match",overlap_mode:"replace"}]};
 assert.equal(check([confirmed],[]),null);
 const additive={name:"Creatina",prescriptions:[{rule:"daily"},{rule:"match",overlap_mode:"add"}]};
 assert.equal(check([additive],[]),null);
 assert.match(admin,/const unconfirmed=supplementNeedingOverlapConfirmation\(\)/);
 assert.match(admin,/openSupplementPrescriptionDialog\(unconfirmed\)/);
 assert.match(admin,/method:"PUT",body:JSON\.stringify\(supplementDraft\)/);
});

test("Existing library supplement is edited instead of creating a duplicate plan entry",()=>{
 assert.match(admin,/const existing=supplementDraft\.plan\.find\(x=>item\.id&&x\.library_id===item\.id\)/);
 assert.match(admin,/if\(existing\)\{\s*setSupplementAssignmentOpen\(false\)/);
 assert.match(admin,/openSupplementPrescriptionDialog\(existing\)/);
 assert.match(admin,/supplementDraft\.plan\.push\(associated\)/);
 assert.match(admin,/associated\.prescriptions\?\.length>1/);
});

test("Player plan shows every prescription; daily and meal views retain resolved doses",()=>{
 assert.match(player,/const rules=item\.prescriptions\?\.length\?item\.prescriptions:\[item\]/);
 assert.match(player,/for\(const \[index,p\] of rules\.entries\(\)/);
 assert.match(player,/Prescrição "\+\(index\+1\)/);
 assert.match(player,/supplement-plan-prescription/);
 assert.match(player,/function supplementsCard\(items\)/);
 assert.match(player,/function attachSupplements\(card,items\)/);
 assert.match(player,/x\.prescription_total>1/);
 assert.match(player,/api\("\/api\/v2\/player\/calendar\?start="/);
});

test("Weekly aggregation does not merge distinct prescriptions with the same dose",()=>{
 assert.match(player,/item\.supplement_index\?\?/);
 assert.match(player,/item\.prescription_index\?\?"legacy"/);
 assert.match(player,/item\.prescription_total\?\?1/);
 assert.match(player,/Prescrição "\+\(item\.prescriptionIndex\+1\)/);
 assert.match(player,/weekly-supplement-entry/);
 assert.match(player,/supplementsByDay\[date\]/);
});

test("Popup is accessible and responsive with light/dark contrast buttons",()=>{
 assert.match(palette,/dialog\.tm-supp-prescription-dialog\{/);
 assert.match(palette,/dialog\.tm-supp-prescription-dialog::backdrop/);
 assert.match(palette,/\.tm-supp-modal-grid\{/);
 assert.match(palette,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(palette,/@media\(max-width:620px\)/);
 assert.match(palette,/grid-template-columns:1fr!important/);
 assert.match(palette,/html\[data-admin-theme="light"\] \.tm-supp-modal-apply/);
 assert.match(palette,/\.tm-supp-modal-overlap-warning/);
 assert.match(admin,/feedback\.setAttribute\("role","alert"\)/);
 assert.match(admin,/close\.setAttribute\("aria-label","Fechar edição"\)/);
 assert.match(playerCss,/supplement-plan-prescription/);
 assert.match(adminHtml,/admin-microcycles\.js\?v=18299/);
 assert.match(adminHtml,/admin-surface-palette\.css\?v=73/);
 assert.match(playerHtml,/jogador-v2\.js\?v=42/);
 assert.match(playerHtml,/jogador-v2\.css\?v=56/);
});
