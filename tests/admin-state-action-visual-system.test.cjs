const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const guide=fs.readFileSync("docs/GUIA_VISUAL_BACKOFFICE.md","utf8");
const htmls=["admin-microcycles.html","create-plan.html","food-library.html"].map(x=>fs.readFileSync("static/"+x,"utf8"));
test("all Backoffice entrypoints load the versioned shared V1 stylesheet",()=>{
 for(const s of htmls)assert.match(s,/admin-surface-palette\.css\?v=6/);
 assert.match(css,/THE MILE \| ESTADOS E ACOES V1/);
 assert.match(guide,/The Mile — Guia Visual do Backoffice/);
});
test("light and dark state tokens and action colors match the approved reference",()=>{
 for(const color of [
 "#ddefe4","#317154","#183428","#8ed0ab",
 "#f5e8c9","#8a6327","#3b2d16","#e2c17e",
 "#e7ecf2","#607082","#2a3038","#aab4c2",
 "#f8e3d8","#af6544","#42261e","#e2a188",
 "#f5dce0","#a65362","#3d2128","#e5a0ac",
 "#dce5ef","#2e4157","#2d3440","#f2f3f5",
 "#e8edf3","#425468","#23272f","#d6dce5",
 "#f4e0e3","#b15665","#3a2128","#f0a3af"
 ])assert.ok(css.includes(color),"Missing token "+color);
});
test("state pills and action buttons have distinct geometries",()=>{
 assert.match(css,/--tm-action-radius:12px/);
 assert.match(css,/--tm-action-compact-radius:10px/);
 assert.match(css,/--tm-action-status-radius:999px/);
 assert.match(css,/\.tm-ui-state\[data-state="published"\]/);
 assert.match(css,/\.tm-action-new/);
 assert.match(css,/\.tm-action-danger/);
 assert.match(css,/\.recipe-status-published/);
 assert.match(css,/\.plan-state-label/);
 assert.match(css,/\.tm-p-status\.tm-p-active/);
 assert.match(css,/\.tm-consumption-status/);
});
test("interactive portion toggle, keyboard focus and semantic exceptions survive",()=>{
 assert.match(css,/\.tm-portion-toggle\[aria-pressed="false"\]/);
 assert.match(css,/\.tm-portion-toggle:focus-visible/);
 assert.match(css,/\.plan-library-legacy-draft/);
 assert.match(css,/\.tm-p-app-action:not\(:disabled\)/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/box-shadow:\s*0\s+\d/);
});
test("guide defines responsive rules, icons, official meanings and exceptions",()=>{
 for(const term of ["Mobile","Safari","Lucide","Eliminar","Remover","Desativar","Publicado","Rascunho","Por guardar","Por publicar","#28543E","44 × 44 px","outline"]){
  assert.ok(guide.includes(term),"Missing guide topic "+term);
 }
 assert.ok((guide.match(/^## /gm)||[]).length>=8);
});
