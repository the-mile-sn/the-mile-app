"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("static/admin-microcycles.js","utf8");
const css=fs.readFileSync("static/admin-microcycles.css","utf8");
const portions=fs.readFileSync("static/visual-portions.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
test("date header and manual classification with reset",()=>{
 assert.match(js,/formatCalendarPreviewDate\(day\.date\)/);
 assert.match(js,/return weekdays\[weekday\]\+", "\+day\+" "\+months/);
 assert.match(js,/calendar-day-classification-trigger/);
 assert.match(js,/const choices=\[\{classification:null,label:"Automático/);
 assert.match(js,/body:JSON\.stringify\(\{date:day\.date,classification\}\)/);
 assert.match(js,/calendar\/day-classification/);
 assert.match(css,/\.calendar-day-preview-heading/);
});
test("peri event options keep content while using neutral accordion",()=>{
 assert.match(js,/renderLiveMealOptions\(day,peri\.phase,peri\)/);
 assert.match(css,/Peri phases use the same neutral card language/);
 assert.match(css,/details\.calendar-day-peri\.calendar-live-peri>summary/);
 assert.match(css,/html\[data-admin-theme="light"\] #calendar-section \.day-preview details\.calendar-day-peri/);
});
test("food filter focus outlines only full card",()=>{
 assert.match(css,/\.tm-food-filter-field:has\(select\)::after/);
 assert.match(css,/\.tm-food-filter-field :is\(input,select\):is\(:focus,:focus-visible\)/);
 assert.match(portions, /\.tm-portion-filters>label:has\(select\)::after/);
 assert.match(portions, /\.tm-portion-filters>label :is\(input,select\):is\(:focus,:focus-visible\)/);
 for(const v of ["admin-microcycles.js?v=18276","admin-microcycles.css?v=189","visual-portions.css?v=7"])assert.ok(html.includes(v));
});
