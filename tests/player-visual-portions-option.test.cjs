"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const source=fs.readFileSync("static/player-visual-portions.js","utf8");
const appSource=fs.readFileSync("static/jogador-v2.js","utf8");

function node(tagName){
 const self={
  tagName:String(tagName).toUpperCase(),
  children:[],attributes:{},listeners:{},isConnected:true,
  _classes:new Set(),textContent:"",disabled:false,
  classList:{
   add(...names){for(const name of names)self._classes.add(name);},
   remove(...names){for(const name of names)self._classes.delete(name);},
   contains(name){return self._classes.has(name);}
  },
  append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=children;},
  addEventListener(type,cb){this.listeners[type]=cb;},
  setAttribute(key,value){this.attributes[key]=String(value);},
  remove(){this.isConnected=false;},
  focus(){},
  querySelectorAll(){return [];}
 };
 return self;
}
function flatten(root){
 return [root,...root.children.flatMap(flatten)];
}
function createApp(){
 const body=node("body");
 const document={
  body,activeElement:node("button"),
  createElement:node,
  addEventListener(){},removeEventListener(){},
  getElementById(){return node("div");}
 };
 const window={};
 vm.runInNewContext(source,{window,document,console,Date,Number,Math}, {filename:"player-visual-portions.js"});
 return {body,document,api:window.tmVisualPortions};
}
function option(ref,photoId,food="Arroz"){
 return {
  number:ref==="a"?1:2,title:ref==="a"?"Sopa + Prato + Fruta":"Sopa + Prato c/leguminosas + Fruta",
  option_ref:ref,source_draft_id:"published-1",
  groups:[{visual_examples:true,alternatives:[{
   photo_id:photoId,category:food,prescribed_g:220,reference_g:220,
   match:"exact",generic_visual:true,photo_subject:food
  }]}]
 };
}
function event(){
 const ev={prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
 return ev;
}
test("per-option actions appear inside each option summary, not meal card",()=>{
 assert.match(appSource,/addOptionPortions\(card\.querySelector\(":scope > summary"\),o\)/);
 assert.match(appSource,/addOptionPortions\(body,single\)/);
 assert.doesNotMatch(appSource,/card:section,date:d,mealTitle:names\[meal\]/);
 const {api}=createApp();
 const card=node("summary");
 api.appendAction({card,date:"2026-11-11",mealTitle:"Almoço",color:"yellow",meal:"lunch",
  option:option("a","aaaaaaaaaaaaaaaaaaaaaaaa"),index:{yellow:{lunch:[option("a","aaaaaaaaaaaaaaaaaaaaaaaa")]}},
  refresh:async()=>({options_by_color:{yellow:{lunch:[]}}})});
 assert.equal(card.children.length,1);
 assert.equal(card.children[0].textContent,"Ver porções");
 assert.ok(card.classList.contains("tm-portion-summary-with-action"));
});
test("one option button opens only that exact photo and no second option selector",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa","Arroz");
 const second=option("b","bbbbbbbbbbbbbbbbbbbbbbbb","Batata");
 const index={yellow:{lunch:[first,second]}};
 const card=node("summary");
 api.appendAction({card,date:"2026-11-11",mealTitle:"Almoço",color:"yellow",meal:"lunch",option:first,
  index,refresh:async()=>({options_by_color:index})});
 const click=event();
 await card.children[0].listeners.click(click);
 assert.equal(click.prevented,true);
 assert.equal(click.stopped,true);
 const content=flatten(body);
 const photos=content.filter(x=>x.tagName==="IMG");
 assert.equal(photos.length,1);
 assert.match(photos[0].src,/aaaaaaaaaaaaaaaaaaaaaaaa$/);
 assert.equal(content.some(x=>x.src?.includes("bbbbbbbbbbbbbbbbbbbbbbbb")),false);
 assert.equal(content.some(x=>x._classes?.has("tm-portion-sheet-tabs")),false);
 assert.equal(content.some(x=>x.textContent==="Fotografia: 220 g"),false);
 assert.equal(content.some(x=>x.textContent==="Exemplo com carne branca"),false);
 assert.equal(content.some(x=>x.textContent==="Arroz"),true);
});
test("stale option ref cannot reuse photos",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 const card=node("summary");
 const index={yellow:{lunch:[first]}};
 api.appendAction({card,date:"2026-11-11",mealTitle:"Almoço",color:"yellow",meal:"lunch",option:first,
  index,refresh:async()=>({options_by_color:{yellow:{lunch:[option("b","bbbbbbbbbbbbbbbbbbbbbbbb")]}}})});
 await card.children[0].listeners.click(event());
 assert.equal(card.children[0].isConnected,false);
 assert.equal(flatten(body).filter(x=>x.tagName==="IMG").length,0);
});
test("near photos disclose the photographed grams but exact photos do not",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 first.groups[0].alternatives[0].reference_g=200;
 first.groups[0].alternatives[0].match="near";
 const card=node("div");const index={yellow:{lunch:[first]}};
 api.appendAction({card,date:"2026-11-11",mealTitle:"Jantar",color:"yellow",meal:"lunch",option:first,
  index,refresh:async()=>({options_by_color:index})});
 await card.children[0].listeners.click(event());
 assert.ok(flatten(body).some(x=>x.textContent==="Foto de 200 g"));
});
