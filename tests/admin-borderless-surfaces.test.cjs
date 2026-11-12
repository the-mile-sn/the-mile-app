const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = path => fs.readFileSync("static/" + path, "utf8");

test("Backoffice primary surfaces are borderless without elevation", () => {
 const s = css("admin-microcycles.css");
 const phase = s.slice(s.lastIndexOf("/* The Mile · Borderless surfaces"));
 assert.match(phase, /#admin-workspace \.tm-db-panel/);
 assert.match(phase, /#tm-players-page \.tm-players-list-surface/);
 assert.match(phase, /#tm-assessments-page \.tm-assessment-visual/);
 assert.match(phase, /#tm-food-library-page \.food-catalog-panel/);
 assert.match(phase, /border:0!important;box-shadow:none!important/);
 assert.doesNotMatch(phase, /background\s*:/);
});

test("Menus VP colour and meaningful state highlights remain", () => {
 const s = css("admin-microcycles.css");
 assert.match(s, /#menus-panel \.menu-color-label\.meal-vp\{background:#28543e!important/);
 assert.match(s, /tm-db-general-pending/);
 assert.match(s, /1\.5px dashed/);
});

test("Plan and recipe panels are borderless but warning rows retain framing", () => {
 for(const [p, marker] of [["admin-plans-native.css","/* Borderless primary"],["create-plan.css","/* Standalone Planos"]]) {
  const s = css(p);
  const phase = s.slice(s.lastIndexOf(marker));
  assert.match(phase, /not\(\.plan-library-legacy-draft\)/);
  assert.match(phase, /box-shadow:none!important/);
 }
 const recipes = css("admin-recipes.css");
 assert.match(recipes, /#tm-recipe-library-page :is\(\.recipe-table-scroll/);
 assert.match(css("admin-consumption.css"), /#consumption-panel \.tm-consumption-card\{border:0!important/);
});
