"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const css=fs.readFileSync("static/jogador-v2.css","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");
test("Only the post-match scale track and labels use neutral grays",()=>{
 assert.match(css,/\.post-match-scale input\{width:100%;accent-color:#cecece\}/);
 assert.match(css,/\.post-match-scale-ends\{display:flex;justify-content:space-between;font-size:12px;color:#b8b8b8\}/);
 assert.doesNotMatch(css,/\.post-match-scale-ends\{[^}]*color:#aeb7b1/);
 for(const hex of ["#cecece","#b8b8b8"]){
  const r=hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  assert.ok(r);
  assert.equal(r[1],r[2]);
  assert.equal(r[2],r[3]);
 }
});
test("Game questionnaire scales keep original prompts, endpoints and numeric values",()=>{
 assert.match(js,/scale\("feeling","2\. Como te sentiste no jogo\?","Horrível","Muito bem"\)/);
 assert.match(js,/scale\("effort","3\. Perceção do esforço","Muito leve","Esforço máximo"\)/);
 assert.match(js,/input\.type="range";input\.min=1;input\.max=10;input\.step=1/);
 assert.match(js,/line\.className="post-match-scale"/);
 assert.match(js,/ends\.className="post-match-scale-ends"/);
});
test("Player reloads the new stylesheet without touching JavaScript version",()=>{
 assert.match(html,/jogador-v2\.css\?v=193/);
 assert.match(html,/jogador-v2\.js\?v=160/);
});
