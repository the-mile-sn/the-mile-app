"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const navigation = fs.readFileSync("static/admin-nav-shell.js", "utf8").replace(/\\"/g, '"');
const stylesheet = fs.readFileSync("static/admin-surface-palette.css", "utf8");

test("all 11 sidebar destinations use requested official Hugeicons identifiers", () => {
  const icons = [
    ["id=\"tm-admin-nav-dashboard\"", "Home09Icon"],
    ["id=\"tm-admin-nav-players\"", "UsersRoundIcon"],
    ["id=\"tm-admin-nav-food-library\"", "LibraryBigIcon"],
    ["id=\"tm-admin-nav-create-plan\"", "Files01Icon"],
    ["id=\"tm-admin-nav-planning\"", "StrategyIcon"],
    ["id=\"tm-admin-nav-menus-recipes\"", "MenuRestaurantIcon"],
    ["id=\"tm-admin-nav-assessments\"", "Chart03Icon"],
    ["id=\"tm-admin-nav-forms\"", "Link05Icon"],
    ["id=\"tm-admin-nav-appointments\"", "CalendarDaysIcon"],
    ["href=\"/?nav=settings\"", "Settings02Icon"],
    ["href=\"/?nav=account\"", "User03Icon"],
  ];
  for (const [locator, icon] of icons) {
    const start = navigation.indexOf(locator);
    assert.ok(start >= 0, "Missing destination " + locator);
    const end = navigation.indexOf("</a>", start);
    assert.ok(end > start, "Missing closing navigation anchor for " + locator);
    const link = navigation.slice(start, end);
    assert.ok(link.includes('data-hugeicons="' + icon + '"'), "Incorrect icon for " + locator);
    assert.ok(link.includes('<svg class="tm-admin-side-icon"'), "Missing SVG style for " + locator);
  }
});

test("Início label and authentic wordmark monogram replace the generated letter", () => {
  assert.match(navigation, /<span>Início<\/span>/);
  assert.doesNotMatch(navigation, /<span>Dashboard<\/span>/);
  assert.match(navigation, /class="tm-admin-brand-monogram"[^>]+viewBox="840 0 330 244"/);
  assert.match(stylesheet, /\.tm-admin-brand-monogram\{/);
  assert.match(stylesheet, /width:min\(147px,100%\)/);
  assert.match(stylesheet, /padding:0 0 0 14px!important/);
  assert.doesNotMatch(stylesheet, /font:600 20px\/1 "Inter Tight"/);
});

test("all pages using the shared sidebar refresh cached assets", () => {
  for (const page of ["admin-microcycles", "create-plan", "food-library", "admin-appointments"]) {
    const html = fs.readFileSync("static/" + page + ".html", "utf8");
    assert.ok(html.includes("/admin-nav-shell.js?v=9"), page + " nav cache version");
    assert.ok(html.includes("/admin-surface-palette.css?v=68"), page + " style cache version");
  }
});

// Regression guard: malformed HTML quote escaping made the login screen blank.
test("sidebar JavaScript parses correctly", () => {
  const js = fs.readFileSync("static/admin-nav-shell.js", "utf8");
  assert.doesNotThrow(() => new vm.Script(js));
});
