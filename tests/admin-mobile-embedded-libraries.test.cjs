"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const admin=fs.readFileSync("static/admin-microcycles.css","utf8");
const plans=fs.readFileSync("static/admin-plans-native.css","utf8");
const html=fs.readFileSync("static/admin-microcycles.html","utf8");
const foodsJS=fs.readFileSync("static/food-library.js","utf8");
const plansJS=fs.readFileSync("static/create-plan.js","utf8");
test("embedded food library mobile layout retains search and every nutrient/action column",()=>{
 assert.ok(html.includes('id="tm-food-library-page"'));
 assert.ok(html.includes('id="category"'));
 assert.ok(html.includes('id="search"'));
 assert.match(admin, /Integrated Biblioteca Alimentar: phone-sized cards/);
 assert.match(admin, /#tm-food-library-page \.food-catalog-table tbody tr td\.food-name/);
 for(const i of [4,5,6,7])assert.ok(admin.includes('td:nth-child('+i+')::before'));
 assert.match(admin, /#tm-food-library-page \.food-catalog-table tbody tr td\.food-edit-cell/);
 assert.ok(foodsJS.includes('data-edit='));
 assert.ok(foodsJS.includes('data-delete='));
});
test("embedded plans mobile layout does not alter plan actions, state or filters",()=>{
 assert.ok(html.includes('id="tm-plan-page"'));
 assert.match(plans, /Integrated Planos: readable phone-sized list cards/);
 assert.match(plans, /#tm-plan-page #plan-entry \.plan-library-table tbody tr/);
 assert.match(plans, /\.plan-library-table tbody tr > td\[colspan\]/);
 assert.match(plans, /\.plan-library-row-actions button/);
 for(const token of ['data-view-id','data-edit-id','data-delete-legacy-id','plan-type-tag','plan-state-label','library-player-filter','library-type-filter'])assert.ok(plansJS.includes(token));
});
test("new responsive styles are served by cache-busted integrated Backoffice",()=>{
 assert.ok(html.includes("admin-microcycles.css?v=188"));
 assert.ok(html.includes("admin-plans-native.css?v=7"));
 assert.ok(admin.includes("@media(max-width:700px)"));
 assert.ok(plans.includes("@media(max-width:700px)"));
});
