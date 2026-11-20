const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const css=fs.readFileSync("static/admin-work.css","utf8");
const layout=fs.readFileSync("static/admin-microcycles.css","utf8");

const dashboard=html.slice(html.indexOf('<section id="tm-dashboard"'),html.indexOf('<section class="tm-db-panel"><div class="tm-db-heading tm-db-week-heading"'));
const side=dashboard.slice(dashboard.indexOf('<div class="tm-db-today-side">'));
test("real DOM and tab order is Hoje, Tarefas, Formulários, Chat on desktop and mobile",()=>{
 const sections=["tm-db-today-main","tm-db-today-tasks","tm-db-today-recent","tm-db-today-chat"];
 const positions=sections.map(name=>dashboard.indexOf('class="'+name+'"'));
 assert.ok(positions.every(n=>n>=0), "All sections must exist");
 assert.ok(positions.every((n,i)=>i===0||n>positions[i-1]),"Sections follow approved reading order");
 const sidePositions=sections.slice(1).map(name=>side.indexOf('class="'+name+'"'));
 assert.ok(sidePositions.every((n,i)=>i===0||n>sidePositions[i-1]));
 assert.match(layout,/#tm-dashboard \.tm-db-today-side\{\s*display:flex;flex-direction:column/);
 assert.match(layout,/@media\(max-width:1120px\)\{\s*#tm-dashboard \.tm-db-today-columns\{grid-template-columns:minmax\(0,1fr\)\}/);
});
test("Tasks + in header and Ver todas in bottom-right footer",()=>{
 const tasks=side.slice(side.indexOf('<section class="tm-db-today-tasks"'),side.indexOf('<section class="tm-db-today-recent"'));
 const header=tasks.slice(tasks.indexOf('class="tm-db-tasks-header"'),tasks.indexOf('id="tm-db-tasks-list"'));
 const footer=tasks.slice(tasks.indexOf('id="tm-db-tasks-list"'));
 assert.match(header,/id="tm-db-tasks-add"/);
 assert.doesNotMatch(header,/id="tm-db-tasks-open"/);
 assert.match(footer,/class="tm-db-tasks-footer"/);
 assert.match(footer,/id="tm-db-tasks-open"[^>]*>Ver todas<\/button>/);
 assert.ok(tasks.indexOf('id="tm-db-tasks-add"')<tasks.indexOf('id="tm-db-tasks-list"'));
 assert.ok(tasks.indexOf('id="tm-db-tasks-open"')>tasks.indexOf('id="tm-db-tasks-list"'));
 assert.match(css,/#tm-dashboard \.tm-db-tasks-footer\{[\s\S]*?justify-content:flex-end/);
 assert.match(css,/#tm-dashboard \.tm-db-tasks-footer\{[\s\S]*?margin-top:10px/);
 assert.doesNotMatch(css,/\.tm-db-tasks-actions/);
});
test("no duplicate IDs, no altered functionality, no forced card height",()=>{
 for(const id of ["tm-db-tasks-add","tm-db-tasks-open","tm-db-tasks-list","tm-db-recent","tm-db-miniagenda"]){
  const matches=[...html.matchAll(new RegExp('id="'+id+'"','g'))];
  assert.equal(matches.length,1,id+" must appear once");
 }
 assert.match(html,/admin-work\.css\?v=6/);
 assert.match(html,/admin-work\.js\?v=6/);
 assert.doesNotMatch(css,/#tm-dashboard \.tm-db-today-tasks\{[^}]*min-height/);
});
