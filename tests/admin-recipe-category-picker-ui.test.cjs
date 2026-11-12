const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("static/admin-microcycles.html", "utf8");
const js = fs.readFileSync("static/admin-microcycles.js", "utf8");
const css = fs.readFileSync("static/admin-microcycles.css", "utf8");

test("planning recipe panel keeps existing access API, search and save", () => {
  assert.match(html, /id="profile-recipe-access"/);
  assert.match(html, /id="profile-recipe-category-search"[^>]*role="combobox"/);
  assert.match(html, /id="profile-recipe-category-results"[^>]*role="listbox"/);
  assert.match(js, /\/recipe-categories/);
  assert.match(js, /method:"PUT"/);
  assert.match(js, /setAttribute\("aria-expanded"/);
});
test("selected categories use committed visibility and staged removal", () => {
  assert.match(js, /savedRecipeCategories=new Set\(result\.category_ids\)/);
  assert.match(js, /badge\.textContent=saved\?"Visível":"Por guardar"/);
  assert.match(js, /remove\.textContent="Eliminar"/);
  assert.match(js, /selectedRecipeCategories\.delete\(category\.id\)/);
  assert.match(js, /recipeCategoryAccessChanged\(\)/);
  assert.match(js, /savedRecipeCategories=new Set\(response\.category_ids\|\|category_ids\)/);
});
test("two-line dropdown remains below search and panel is borderless", () => {
  assert.match(js, /tm-recipe-option-title/);
  assert.match(js, /tm-recipe-option-subtitle/);
  assert.match(css, /#menus-panel #profile-recipe-access\{/);
  assert.match(css, /border:0!important;box-shadow:none!important/);
  assert.match(css, /tm-recipe-search-results\{position:relative!important/);
  assert.match(css, /tm-recipe-category-remove/);
  assert.match(css, /html\[data-admin-theme="light"\] #menus-panel #profile-recipe-access/);
});