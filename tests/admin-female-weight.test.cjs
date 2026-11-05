"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const py=fs.readFileSync("app.py","utf8");

test("menstruation input is isolated to female weight monitoring",()=>{
 assert.match(js,/const monitoringFemale=\(\)=>String\(model\?\.athlete\?\.sex/);
 assert.match(js,/monitoring-weight-menstruation-field"\)\.hidden=!monitoringFemale/);
 assert.match(html,/id="monitoring-weight-menstruation-field" hidden/);
 assert.match(js,/monitoringFemale\(\)\?\[\["menstruating","Menstruação"\]\]:\[\]/);
});
test("tri-state menstrual response remains distinct",()=>{
 assert.match(js,/value===1\|\|value===true\?"Sim":value===0\|\|value===false\?"Não":"—"/);
 assert.match(html,/<option value="">Não respondeu<\/option>/);
 assert.match(js,/key==="menstruating"\?monitoringMenstruationLabel/);
});
test("admin correction uses linked user sex and preserves audit",()=>{
 assert.match(py,/SELECT u\.sex FROM users u JOIN v2_player_links/);
 assert.match(py,/stored_response=None if response is None else int\(response\)/);
 assert.match(py,/UPDATE v2_daily_weighins SET weight_kg=\?,menstruating=\?,updated_at=\?/);
 assert.match(py,/'menstruating':stored_response/);
 assert.match(js,/monitoring-weight-menstruation"\)\.value=monitoringMenstruationValue\(record\.menstruating\)/);
});
test("chart indicators are limited to explicit yes",()=>{
 assert.match(js,/female&&monitoringMenstruationLabel\(points\[i\]\.menstruating\)==="Sim"/);
 assert.match(js,/Menstruação":""/);
});