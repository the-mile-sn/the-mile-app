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
  assert.equal(vm.runInContext('playerMacroLabel("protein_g")',ctx),"Protein");
  assert.equal(vm.runInContext('playerMacroLabel("carbs_g")',ctx),"Carbohydrates");
  assert.equal(vm.runInContext('playerMacroLabel("fat_g")',ctx),"Fat");
  assert.equal(vm.runInContext('playerMacroAbbreviation("carbs_g")',ctx),"C");
  assert.equal(vm.runInContext('playerMacroAbbreviation("fat_g")',ctx),"F");
  assert.equal(vm.runInContext('playerClassification("Geral")',ctx),"General");
  assert.equal(vm.runInContext('playerEventTitle({kind:"match",title:"Jogo"})',ctx),"Match");
  assert.equal(vm.runInContext('playerEventTitle({kind:"training",title:"Treino"})',ctx),"Training");
  assert.equal(vm.runInContext('playerEventTitle({kind:"training",title:"Sessão personalizada"})',ctx),"Sessão personalizada");
  assert.equal(vm.runInContext('playerEventTitle({kind:"match",title:"Custom final"})',ctx),"Custom final");
  assert.equal(vm.runInContext('playerClassification("Jogo personalizado")',ctx),"Jogo personalizado");
  assert.equal(vm.runInContext('playerSupplementMomentLabel("Almoço")',ctx),"Lunch");
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
  assert.equal(vm.runInContext('playerMacroLabel("carbs_g")',ctx),"Hidratos");
  assert.equal(vm.runInContext('playerMacroAbbreviation("carbs_g")',ctx),"HC");
  assert.equal(vm.runInContext('playerClassification("Geral")',ctx),"Geral");
  assert.equal(vm.runInContext('playerEventTitle({kind:"match",title:"Jogo"})',ctx),"Jogo");
  assert.equal(vm.runInContext('playerEventTitle({kind:"training",title:"Treino"})',ctx),"Treino");
  assert.equal(vm.runInContext('playerSupplementMomentLabel("Almoço")',ctx),"Almoço");
  assert.equal(vm.runInContext("colorNames.blue",ctx),"Azul");
  assert.equal(element.className,"mile-approved");
  assert.deepEqual(element.style,{});
});

test("Plans All list renders translated categories in both languages without timing context",()=>{
  const source=fs.readFileSync("static/jogador-v2.js","utf8");
  const start=source.indexOf("function renderPlans(){");
  const end=source.indexOf("\nconst dishPhotoCache=",start);
  assert.ok(start>=0&&end>start,"Plans renderer boundaries");
  const renderer=source.slice(start,end);
  for(const [locale,expected] of [
    ["pt",["Verde","Suplementação"]],
    ["en",["Green","Supplements"]]
  ]){
    const createNode=()=>({
      textContent:"",className:"",children:[],attributes:{},
      replaceChildren(...children){this.children=children;},
      append(...children){this.children.push(...children);},
      setAttribute(key,value){this.attributes[key]=value;},
      addEventListener(){}
    });
    const targets={
      "plan-colors":createNode(),
      "plan-subfilters":createNode(),
      "plan-detail":createNode()
    };
    const context={
      $:id=>targets[id],
      document:{createElement:()=>createNode()},
      plans:{green:{breakfast:[{items:[]}]}},
      periPlans:{training:{options:{}},match:{options:{}}},
      plansCategory:"todos",
      selectedColor:null,
      planPhase:null,
      colorNames:{green:locale==="en"?"Green":"Verde"},
      playerText:(pt,en)=>locale==="en"?en:pt
    };
    assert.doesNotThrow(()=>vm.runInNewContext(renderer+"\nrenderPlans();",context),
      "Plans All must render without any peri-match timing variable: "+locale);
    assert.deepEqual(
      targets["plan-detail"].children.map(group=>group.children[0].textContent),
      expected,"Visible plan categories must be localised: "+locale);
    assert.equal(targets["plan-colors"].children.length,5,
      "Existing Plans navigation is preserved");
  }
});

test("Daily and weekly cards translate only standard match and training titles in EN",()=>{
  const source=fs.readFileSync("static/jogador-v2.js","utf8");
  assert.ok(source.includes('label.textContent=playerEventTitle(event);section.append(label);if(!compact)decorateLabel(section,event.title||event.kind);'));
  assert.ok(source.includes('label.textContent=playerEventTitle(event);head.append(label);'));
  assert.ok(source.includes('title:"Jogo"'),"Calendar data remains canonical in PT");
  assert.ok(source.includes('event?.kind==="match"'),"Match kind remains unchanged for existing behaviour");
  assert.ok(source.includes('event?.kind==="training"'),"Training kind remains unchanged for existing behaviour");
});

test("Energy values render as ungrouped kcal in both locales, without changing nutrient formatting",()=>{
  const player=fs.readFileSync("static/jogador-v2.js","utf8");
  const helper=player.split("\n").find(line=>line.startsWith("function fmtKcal(v){"));
  assert.ok(helper,"kcal-specific formatter exists");
  for(const locale of ["pt-PT","en-GB"]){
    const displayed=vm.runInNewContext(
      'function playerDateLocale(){return '+JSON.stringify(locale)+';};'+helper+';fmtKcal(1244.2)');
    assert.equal(displayed,"1244",locale);
    const rounded=vm.runInNewContext(
      'function playerDateLocale(){return '+JSON.stringify(locale)+';};'+helper+';fmtKcal(999.6)');
    assert.equal(rounded,"1000",locale);
  }
  assert.ok(player.includes('value.textContent=(key==="kcal"?fmtKcal(data[key]):fmt(data[key],0))'));
  assert.ok(player.includes('current.textContent=fmtKcal(actual.kcal/divisor)'));
  assert.ok(player.includes('planned.textContent=" / "+fmtKcal(total.kcal/divisor)'));
  assert.ok(player.includes('n.textContent=item.found?(key==="kcal"?fmtKcal(item.total[key]/scale)'));
  assert.ok(player.includes('span.append(document.createTextNode((Number.isFinite(n)?(key==="kcal"?fmtKcal(n):fmt(n,d))'));
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
  assert.ok(chef.includes('function chefClassificationLabel(value){return lang==="en"&&value==="Geral"?"General":value;}'));
  assert.ok(player.includes('playerSupplementMomentLabel(x.display_moment||x.timing_text||'));
  assert.ok(portions.includes('tr("Reduzir painel","Collapse panel")'));
  assert.ok(portions.includes('tr("Expandir painel","Expand panel")'));
  // Text-only changes: no CSS, HTML or new visual control is required.
});

test("Chef dish category search renders English without changing canonical categories",()=>{
  const source=fs.readFileSync("static/chef.js","utf8");
  const start=source.indexOf("const chefDishCategoryEnglish=");
  const method=source.indexOf("function chefDishCategoryLabel(value){",start);
  const end=source.indexOf("\n}",method)+2;
  assert.ok(start>0&&method>start&&end>method);
  const helper=source.slice(start,end);
  const evaluate=(locale,value)=>vm.runInNewContext(
    'const lang='+JSON.stringify(locale)+';'+helper+';chefDishCategoryLabel('+JSON.stringify(value)+')');
  assert.equal(evaluate("en","Peixe"),"Fish");
  assert.equal(evaluate("en","Peixe gordo"),"Oily fish");
  assert.equal(evaluate("pt","Peixe"),"Peixe");
  assert.equal(evaluate("en","Categoria personalizada"),"Categoria personalizada");
  assert.ok(source.includes('node("small","",chefDishCategoryLabel(dish.category))'));
});

test("Remaining consumption and nutrition labels use selected locale",()=>{
  const source=fs.readFileSync("static/jogador-v2.js","utf8");
  assert.ok(source.includes("playerText('Editar consumo','Edit consumption')"));
  assert.ok(source.includes("playerText('⊕ Adicionar alimento','⊕ Add food')"));
  assert.ok(source.includes('playerText("Peq Alm.","Breakfast")'));
  assert.ok(source.includes('playerText("ontem","yesterday")'));
  assert.ok(source.includes('playerText("média","average")'));
  assert.ok(source.includes('playerText("Ver valores semanais e detalhes","View weekly values and details")'));
  assert.ok(source.includes('playerMacroAbbreviation(\'carbs_g\')'));
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
