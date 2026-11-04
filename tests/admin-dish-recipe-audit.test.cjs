"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const app=fs.readFileSync("app.py","utf8");
const library=fs.readFileSync("recipe_library_v2.py","utf8");
test("dish recipe coverage audit is admin-only and GET-only",()=>{
 assert.match(app,/path == '\/api\/v2\/dishes\/recipe-association-audit' and method == 'GET'/);
 assert.match(app,/admin\(user\)[\s\S]{0,100}audit_dish_recipe_associations\(c\)/);
});
test("dish recipe audit reports missing and multiple associations without mutations",()=>{
 const start=library.indexOf("def audit_dish_recipe_associations(c):");
 assert.ok(start>=0);
 const body=library.slice(start);
 for(const key of ["unlinked_dishes","unlinked_recipes","multiple_recipe_dishes","invalid_associations","associations_total","read_only"]){
  assert.ok(body.includes('"'+key+'"'),key);
 }
 assert.doesNotMatch(body,/\b(INSERT|UPDATE|DELETE|commit\()\b/);
});
