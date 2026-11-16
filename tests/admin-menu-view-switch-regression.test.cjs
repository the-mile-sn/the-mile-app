"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("static/admin-microcycles.js","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");

function menuHelpers(){
 const start=source.indexOf("function setMenuDisplayMode(mode){");
 const end=source.indexOf('$("menu-view-day").addEventListener(',start);
 assert.ok(start>=0&&end>start,"menu view helpers must precede listeners");
 return source.slice(start,end);
}

test("Menus day/week helpers remain declared and callable",()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 const elems=Object.fromEntries(["menu-grid","menu-weekly","menu-view-day","menu-view-week"].map(id=>[
   id,{hidden:false,attrs:{},setAttribute(name,value){this.attrs[name]=value;}}
 ]));
 const context={$:id=>elems[id],menuDisplayMode:"day"};
 vm.runInNewContext(menuHelpers(),context);
 assert.equal(typeof context.formatMenuWeek,"function");
 assert.equal(typeof context.setMenuDisplayMode,"function");

 context.setMenuDisplayMode("week");
 assert.equal(context.menuDisplayMode,"week");
 assert.equal(elems["menu-grid"].hidden,true);
 assert.equal(elems["menu-weekly"].hidden,false);
 assert.equal(elems["menu-view-day"].attrs["aria-pressed"],"false");
 assert.equal(elems["menu-view-week"].attrs["aria-pressed"],"true");

 context.setMenuDisplayMode("day");
 assert.equal(context.menuDisplayMode,"day");
 assert.equal(elems["menu-grid"].hidden,false);
 assert.equal(elems["menu-weekly"].hidden,true);
 assert.equal(elems["menu-view-day"].attrs["aria-pressed"],"true");
 assert.equal(elems["menu-view-week"].attrs["aria-pressed"],"false");
});

test("Menu week date label formats same-month and cross-month ranges",()=>{
 const context={$:()=>{},menuDisplayMode:"day"};
 vm.runInNewContext(menuHelpers(),context);
 assert.equal(context.formatMenuWeek(new Date(2026,10,16),new Date(2026,10,22)),"16–22 novembro 2026");
 assert.equal(context.formatMenuWeek(new Date(2026,10,30),new Date(2026,11,6)),"30 novembro – 6 dezembro 2026");
});

test("Menus JS asset version changes when restoring missing helpers",()=>{
 assert.match(html,/admin-microcycles\.js\?v=18318/);
 assert.match(source,/\$\("menu-week"\)\.textContent=formatMenuWeek\(start,finish\)/);
 assert.match(source,/setMenuDisplayMode\(menuDisplayMode\)/);
});
