"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {execFileSync}=require("node:child_process");

const html=fs.readFileSync("static/jogador-v2.html","utf8");
const css=fs.readFileSync("static/jogador-v2.css","utf8");
const chef=fs.readFileSync("static/chef.css","utf8");
const js=fs.readFileSync("static/jogador-v2.js","utf8");

const inserted='<section id="profile-language-card" class="profile-language-card" aria-label="Idioma" hidden><span id="profile-language-label" class="profile-language-label">Idioma</span><div id="profile-language-selector" class="profile-language-selector" role="group" aria-label="Idioma"><button type="button" data-language="pt" class="active" aria-pressed="true">PT</button><button type="button" data-language="en" aria-pressed="false">EN</button></div><p id="profile-language-feedback" class="profile-language-feedback" role="status" aria-live="polite"></p></section>';

test("exactly one approved Chef-pattern language card follows Notifications",()=>{
  assert.equal(html.split(inserted).length-1,1);
  assert.match(html,/id="profile-notifications-open"[\s\S]*?id="profile-language-card"[\s\S]*?id="profile-password-open"/);
  assert.match(html,/id="profile-language-card"[^>]*hidden/);
  assert.match(html,/id="profile-language-selector"[^>]*role="group"/);
  assert.equal((html.match(/data-language="pt"/g)||[]).length,1);
  assert.equal((html.match(/data-language="en"/g)||[]).length,1);
  assert.match(html,/id="profile-language-feedback"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(chef,/\.chef-profile \.chef-language-selector\{/);
  assert.match(chef,/\.chef-profile \.profile-language-card\{/);
  assert.match(css,/#profile \.profile-language-card\{[^}]*min-height:61px;[^}]*border-radius:13px;background:#242429/s);
  assert.match(css,/#profile \.profile-language-selector button\.active\{background:#55555b\}/);
  for(const part of [
    ".profile-language-card",".profile-language-label",
    ".profile-language-selector",".profile-language-selector button",
    ".profile-language-selector button.active",".profile-language-feedback"
  ])assert.equal(css.split("#profile "+part+"{").length-1,1,part);
});

test("profile selector changes only the authenticated preference and refreshes existing data",()=>{
  assert.match(js,/function syncPlayerLanguageSelector\(preferences\)/);
  assert.match(js,/const ready=preferences\?\.enabled===true/);
  assert.match(js,/card\.hidden=!ready/);
  assert.match(js,/aria-pressed/);
  assert.match(js,/async function updatePlayerLanguageChoice\(code\)/);
  assert.match(js,/await api\("\/api\/v2\/player\/preferences",\{/);
  assert.match(js,/"X-CSRF-Token":playerCsrf/);
  assert.match(js,/body:JSON\.stringify\(\{language:code\}\)/);
  assert.match(js,/await session\(\)/);
  assert.match(js,/overviewReadCache\.clear\(\)/);
  assert.match(js,/for\(const button of document\.querySelectorAll\("#profile-language-selector button\[data-language\]"\)\)/);
  assert.doesNotMatch(js,/updatePlayerLanguageChoice\([\s\S]{0,650}(?:localStorage|sessionStorage)/);
  assert.match(js,/syncPlayerLanguageSelector\(\{enabled:false\}\)/);
});

test("existing Player HTML and CSS are byte-identical except for the authorised card",()=>{
  const upstream=process.env.BASE_SHA;
  if(!upstream)return;
  const ancestor=execFileSync("git",["merge-base","HEAD",upstream],{encoding:"utf8"}).trim();
  const priorCss=execFileSync("git",["show",ancestor+":static/jogador-v2.css"],{encoding:"utf8"});
  const priorHtml=execFileSync("git",["show",ancestor+":static/jogador-v2.html"],{encoding:"utf8"});
  assert.ok(css.startsWith(priorCss),
    "Existing Player CSS must not be changed or rearranged; only append the new card");
  assert.doesNotMatch(css.slice(priorCss.length),/#overview|#menus|#plans|#tabs|#login/);
  const anchor='<span class="profile-action-chevron" aria-hidden="true">›</span></button><div class="profile-actions-card">';
  let expected=priorHtml.replace(anchor,
    '<span class="profile-action-chevron" aria-hidden="true">›</span></button>'+inserted+'<div class="profile-actions-card">');
  assert.notEqual(expected,priorHtml,"Baseline must contain the original Profile action card");
  expected=expected.replace("/jogador-v2.css?v=272","/jogador-v2.css?v=273");
  expected=expected.replace("-week-skeleton-v1-day-skeleton-v1\"","-week-skeleton-v1-day-skeleton-v1-locale-profile-v1\"");
  assert.equal(html,expected,
    "No existing Player HTML element may be modified or moved");
});
