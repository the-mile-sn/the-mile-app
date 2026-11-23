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
