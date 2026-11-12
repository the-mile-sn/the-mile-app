"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const micro=fs.readFileSync("static/admin-microcycles.js","utf8");
const dash=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const light=fs.readFileSync("static/admin-light-theme.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("Microcycle picker opens anchored listbox below control",()=>{
 for(const s of ['trigger.setAttribute("role","combobox")','menu.setAttribute("role","listbox")','option.setAttribute("role","option")','document.removeEventListener("pointerdown",outside,true)','menu.hidden=false;trigger.setAttribute("aria-expanded","true")'])assert.ok(micro.includes(s));
 assert.ok(micro.includes('"/calendar/day-classification"'));
 assert.ok(css.includes("top:calc(100% + 8px)"));
 assert.ok(css.includes(".calendar-day-classification-list[hidden]"));
});
test("Peri is a meal tile when closed, expands within row when open",()=>{
 for(const s of ['grid.append(details)','calendar-peri-tile-title','calendar-peri-tile-action','renderLiveMealOptions(day,peri.phase,peri)'])assert.ok(micro.includes(s));
 assert.ok(css.includes("grid-column:1/-1;padding:13px!important"));
 assert.ok(css.includes("min-height:142px"));
 assert.ok(css.includes('html[data-admin-theme="light"] #calendar-section .day-preview .day-meals>details'));
});
test("Dashboard signals off variants and general, preserving five meal indicators",()=>{
 assert.ok(dash.includes('const isOff=Boolean(item.is_off)'));
 assert.ok(dash.includes('["Off","Off (+1)","Off (+2)"]'));
 assert.ok(dash.includes("tm-db-general"));
 assert.ok(dash.includes("tm-db-off"));
 assert.ok(dash.includes("const value=item.colors?.[meal]"));
 assert.ok(css.includes("button.tm-db-cell.tm-db-off"));
 assert.ok(light.includes("button.tm-db-cell.tm-db-off"));
 for(const v of ["admin-microcycles.js?v=18276","admin-dashboard.js?v=68","admin-microcycles.css?v=189","admin-light-theme.css?v=31"])assert.ok(html.includes(v));
});