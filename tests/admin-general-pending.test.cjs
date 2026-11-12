"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("static/admin-dashboard.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const light=fs.readFileSync("static/admin-light-theme.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("only provisional Geral gets dashed border and review label",()=>{
 assert.ok(js.includes('const pendingGeneral=Boolean(item.needs_confirmation)&&item.classification==="Geral"'));
 assert.ok(js.includes('tm-db-general-pending'));
 assert.ok(js.includes('"por definir"'));
 assert.ok(js.includes('const value=item.colors?.[meal]'));
 assert.ok(css.includes('border:1.5px dashed #9a865e!important'));
 assert.ok(light.includes('border:1.5px dashed #b49b66!important'));
});
test("changed assets have fresh version numbers",()=>{
 for(const name of ["admin-dashboard.js?v=68","admin-microcycles.css?v=189","admin-light-theme.css?v=31"])assert.ok(html.includes(name));
});