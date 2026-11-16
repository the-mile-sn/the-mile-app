"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-surface-palette.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");

test("history input has no duplicated caption but retains accessible name",()=>{
 assert.doesNotMatch(html,/>Pesquisar prato\s*\n\s*<span class="tm-menu-history-search-field"/);
 assert.match(html,/id="menu-history-search" aria-label="Pesquisar prato no histórico"/);
 assert.match(html,/placeholder="Pesquisar almoço ou jantar…"/);
});

test("only relevant meal is shown on mobile; desktop keeps stable table columns",()=>{
 assert.match(js,/td\.className="is-filtered-out"/);
 assert.match(js,/if\(entry\.lunch&&!entry\.dinner\)tr\.classList\.add\("tm-menu-history-only-lunch"\)/);
 assert.match(js,/if\(entry\.dinner&&!entry\.lunch\)tr\.classList\.add\("tm-menu-history-only-dinner"\)/);
 assert.match(css,/\.tm-menu-history-only-lunch\{\s*grid-template-areas:"date microcycle" "lunch lunch"!important/);
 assert.match(css,/\.tm-menu-history-only-dinner\{\s*grid-template-areas:"date microcycle" "dinner dinner"!important/);
 assert.match(css,/tbody>tr>td\.is-filtered-out\{\s*display:none!important/);
 assert.match(html,/<th scope="col">Data<\/th><th scope="col">Microciclo<\/th><th scope="col">Almoço<\/th><th scope="col">Jantar<\/th>/);
});

test("highlight uses safe text nodes, matches ignoring case and retains names",()=>{
 const start=js.indexOf("function appendMenuHistoryHighlightedText(cell,value,search){");
 const end=js.indexOf("// A fresh query is executed by the server for each page;",start);
 assert.ok(start>=0&&end>start);
 const document={
  createTextNode(text){return {type:"text",textContent:text}},
  createElement(tag){return {type:tag,className:"",textContent:""}}
 };
 const sandbox={document};
 vm.runInNewContext(js.slice(start,end),sandbox);
 const cell={children:[],append(node){this.children.push(node)},set textContent(t){this.children=[{type:"text",textContent:t}]}};
 sandbox.appendMenuHistoryHighlightedText(cell,"Frango com frango e legumes","FRANGO");
 assert.deepEqual(Array.from(cell.children,x=>x.type),["mark","text","mark","text"]);
 assert.equal(cell.children.filter(x=>x.type==="mark").length,2);
 assert.equal(cell.children.map(x=>x.textContent).join(""),"Frango com frango e legumes");
 const unsafe={children:[],append(node){this.children.push(node)},set textContent(t){this.children=[{type:"text",textContent:t}]}};
 sandbox.appendMenuHistoryHighlightedText(unsafe,'Frango <img src="x">',"frango");
 assert.equal(unsafe.children[0].type,"mark");
 assert.equal(unsafe.children.map(x=>x.textContent).join(""),'Frango <img src="x">');
 assert.doesNotMatch(js,/td\.innerHTML=entry\[field\]/);
 assert.match(css,/mark\.tm-menu-history-hit\{[\s\S]*?color:inherit!important/);
});

test("filter is still paginated, and clearing search restores the full history",()=>{
 assert.match(js,/const menuHistoryPageSize=12/);
 assert.match(js,/if\(search\)params\.set\("q",search\)/);
 assert.match(js,/\$\("menu-history-search"\)\.addEventListener\("input"/);
 assert.match(js,/menuHistoryPages=\[null\];menuHistoryPage=0/);
 assert.match(js,/\$\("menu-history-next"\)\.addEventListener\("click"/);
 assert.match(html,/admin-surface-palette\.css\?v=100/);
 assert.match(html,/admin-microcycles\.js\?v=18321/);
 assert.doesNotThrow(()=>new Function(js));
});
