const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const css=fs.readFileSync("static/admin-work.css","utf8");
const js=fs.readFileSync("static/admin-work.js","utf8");
const dashboard=fs.readFileSync("static/admin-microcycles.html","utf8");
const appointments=fs.readFileSync("static/admin-appointments.html","utf8");
test("work modals use two-line subcard fields and approved tokens",()=>{
 assert.match(css,/\.tm-work-field\{[\s\S]*?min-height:76px/);
 assert.match(css,/\.tm-work-field\{[\s\S]*?background:var\(--tm-ui-subcard\)/);
 assert.match(css,/dialog\.tm-work-dialog \.tm-work-field > :is\(input,select,textarea\)\{[\s\S]*?background:transparent!important/);
 assert.match(css,/\.tm-work-field:focus-within\{outline:2px/);
 assert.match(css,/button\.tm-work-save\{[\s\S]*?background:var\(--tm-action-main-bg\)!important/);
 assert.match(css,/button\.tm-work-cancel\{[\s\S]*?background:var\(--tm-action-secondary-bg\)!important/);
 assert.match(css,/button\.tm-work-delete\{[\s\S]*?background:var\(--tm-action-danger-bg\)!important/);
 assert.match(css,/font-size:16px/);
});
test("closing and error handling match modal standard",()=>{
 assert.match(js,/error==null\|\|error===""\)\?""/);
 assert.match(css,/\.tm-work-error:empty\{display:none\}/);
 assert.match(css,/\.tm-work-dialog\{[\s\S]*?box-shadow:none/);
 assert.doesNotMatch(dashboard,/data-tm-work-close aria-label="Fechar">×/);
 assert.match(dashboard,/aria-label="Fechar"><svg/);
 assert.match(appointments,/aria-label="Fechar"><svg/);
 assert.match(dashboard,/admin-work\.css\?v=7/);
 assert.match(appointments,/admin-work\.js\?v=6/);
});
