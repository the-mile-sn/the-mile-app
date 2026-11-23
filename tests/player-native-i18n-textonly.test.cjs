"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

test("Player native locale changes approved text only, preserving DOM and style",()=>{
  const source=fs.readFileSync("static/jogador-v2.js","utf8");
  const start=source.indexOf('const $=id=>');
  const end=source.indexOf('let playerSessionEpoch=0;',start);
  assert.ok(start>0&&end>start);
  const prelude=source.slice(start,end);
  const nodes=new Map();
  const element={
    lang:"pt-PT",style:{},className:"mile-approved",children:[]
  };
  const document={
    documentElement:element,
    querySelector(selector){
      if(!nodes.has(selector)){
        nodes.set(selector,{
          textContent:"",className:"approved-layout",children:[],
          style:{},title:"",attrs:{},
          setAttribute(key,value){this.attrs[key]=value;}
        });
      }
      return nodes.get(selector);
    }
  };
  const ctx=vm.createContext({document});
  vm.runInContext(prelude,ctx);
  assert.equal(nodes.size,0,"Initialising locale must not change the DOM");
  vm.runInContext('applyPlayerNativeLanguage("en")',ctx);
  assert.equal(document.documentElement.lang,"en-GB");
  assert.equal(nodes.get("#tabs [data-tab='overview'] > span:last-child")
                   .textContent,"Home");
  assert.equal(nodes.get("#overview-mode [data-view='week']").textContent,"Week");
  assert.equal(nodes.get("#profile-password-open > span:nth-child(2)")
                   .textContent,"Change password");
  assert.equal(vm.runInContext("names.breakfast",ctx),"Breakfast");
  assert.equal(vm.runInContext("colorNames.blue",ctx),"Blue");
  const count=nodes.size;
  for(const node of nodes.values()){
    assert.equal(node.className,"approved-layout");
    assert.equal(node.children.length,0);
    assert.deepEqual(node.style,{});
    assert.ok(Object.keys(node.attrs).every(key=>key==="aria-label"));
  }
  vm.runInContext('applyPlayerNativeLanguage("pt")',ctx);
  assert.equal(document.documentElement.lang,"pt-PT");
  assert.equal(nodes.size,count,"Reversing locale must not add controls");
  assert.equal(nodes.get("#tabs [data-tab='overview'] > span:last-child")
                   .textContent,"Início");
  assert.equal(vm.runInContext("names.breakfast",ctx),"Pequeno-almoço");
  assert.equal(vm.runInContext("colorNames.blue",ctx),"Azul");
  assert.equal(element.className,"mile-approved");
  assert.deepEqual(element.style,{});
});

test("Remaining Player and Chef UI labels use the selected language without visual changes",()=>{
  const player=fs.readFileSync("static/jogador-v2.js","utf8");
  const chef=fs.readFileSync("static/chef.js","utf8");
  const portions=fs.readFileSync("static/player-visual-portions.js","utf8");
  for(const phrase of [
    'playerText("Ver receitas","View recipes")',
    'playerText("Ver receita","View recipe")',
    'playerText("As novas palavras-passe não coincidem.","The new passwords do not match.")',
    "playerText('Refeição registada','Meal recorded')",
    'playerText("Fechar fotografia","Close photo")',
    'playerText("Média semanal: ","Weekly average: ")',
    "playerText('Momentos de consumo disponíveis','Available consumption times')",
    'periTimingEnglish[timing]'
  ])assert.ok(player.includes(phrase),phrase);
  assert.ok(chef.includes('lang==="pt"?"Fechar fotografia":"Close photo"'));
  assert.ok(chef.includes('lang==="pt"?"abrir detalhes":"open details"'));
  assert.ok(portions.includes('tr("Reduzir painel","Collapse panel")'));
  assert.ok(portions.includes('tr("Expandir painel","Expand panel")'));
  // Text-only changes: no CSS, HTML or new visual control is required.
});

test("Recipe and visual-portion labels follow language without changing markup",()=>{
  function textOnlyHelpers(path,start,end,language,expression){
    const source=fs.readFileSync(path,"utf8");
    const begin=source.indexOf(start),finish=source.indexOf(end,begin);
    assert.ok(begin>=0&&finish>begin,path+" helper markers");
    const document={documentElement:{lang:language}};
    return vm.runInNewContext(
      source.slice(begin,finish)+"\n"+expression,{document});
  }
  assert.equal(textOnlyHelpers("static/player-recipes.js",
    " const tr=(pt,en)=>"," const area=", "pt-PT",
    'tr("Preparação","Method")'),"Preparação");
  assert.equal(textOnlyHelpers("static/player-recipes.js",
    " const tr=(pt,en)=>"," const area=", "en-GB",
    'tr("Preparação","Method")'),"Method");
  assert.equal(textOnlyHelpers("static/player-visual-portions.js",
    " const tr=(pt,en)=>"," let layer=null;", "pt-PT",
    'categoryText("Arroz + Batata")'),"Arroz + Batata");
  assert.equal(textOnlyHelpers("static/player-visual-portions.js",
    " const tr=(pt,en)=>"," let layer=null;", "en-GB",
    'categoryText("Arroz + Batata")'),"Rice + potato");
  assert.equal(textOnlyHelpers("static/player-visual-portions.js",
    " const tr=(pt,en)=>"," let layer=null;", "en-GB",
    'tr("Ver porções","View portions")'),"View portions");
});
