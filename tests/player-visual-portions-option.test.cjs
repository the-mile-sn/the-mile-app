"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const source=fs.readFileSync("static/player-visual-portions.js","utf8");
const appSource=fs.readFileSync("static/jogador-v2.js","utf8");
const css=fs.readFileSync("static/player-visual-portions.css","utf8");

function node(tagName){
 const self={
  tagName:String(tagName).toUpperCase(),
  children:[],attributes:{},listeners:{},isConnected:true,
  _classes:new Set(),textContent:"",disabled:false,style:{height:""},
  getBoundingClientRect(){return {height:Number.parseInt(this.style.height)||500};},
  classList:{
   add(...names){for(const name of names)self._classes.add(name);},
   remove(...names){for(const name of names)self._classes.delete(name);},
   toggle(name,enabled){
    const flag=enabled===undefined?!self._classes.has(name):enabled;
    if(flag)self._classes.add(name);else self._classes.delete(name);
    return flag;
   },
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
 Object.defineProperty(self,"className",{
  get(){return [...self._classes].join(" ");},
  set(value){self._classes=new Set(String(value).split(/\s+/).filter(Boolean));}
 });
 return self;
}
function flatten(root){
 return [root,...root.children.flatMap(flatten)];
}
function createApp(){
 const body=node("body");
 const document={
  body,documentElement:{clientHeight:800},activeElement:node("button"),
  createElement:node,createElementNS(_ns,tag){return node(tag);},
  addEventListener(){},removeEventListener(){},
  getElementById(){return node("div");}
 };
 const window={innerHeight:800};
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
 return {prevented:false,stopped:false,
  preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
}
function mountOption(api,chosen,index,refresh){
 const card=node("details"),summary=node("summary"),foods=node("div"),notes=node("div");
 card.append(summary,foods,notes);
 api.appendAction({card,date:"2026-11-11",mealTitle:"Almoço",color:"yellow",meal:"lunch",
  option:chosen,index,refresh:refresh||(async()=>({options_by_color:index}))});
 return {card,summary,foods,notes,button:card.children[3]};
}
test("Ver porções is appended after foods and notes in each expandable option",()=>{
 assert.match(appSource,/addOptionPortions\(card,o\)/);
 assert.match(appSource,/addOptionPortions\(body,single\)/);
 assert.doesNotMatch(appSource,/addOptionPortions\(card\.querySelector/);
 assert.doesNotMatch(appSource,/card:section,date:d,mealTitle:names\[meal\]/);
 const {api}=createApp(),first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 const {card,summary,notes,button}=mountOption(api,first,{yellow:{lunch:[first]}});
 assert.equal(card.children.length,4);
 assert.equal(card.children[0],summary);
 assert.equal(card.children[2],notes);
 assert.equal(button.children.find(x=>x.tagName==="SPAN")?.textContent,"Ver porções");
 assert.equal(button.children.filter(x=>x.tagName==="SVG").length,2);
 assert.ok(button.children[0]._classes.has("tm-portion-action-icon"));
 assert.match(css,/color:var\(--meal-ink,/);
 assert.match(css,/border:1px solid var\(--meal-ink,/);
 assert.doesNotMatch(css,/color:var\(--option-base,/);
 assert.ok(button._classes.has("tm-daily-portions-action"));
 assert.match(css,/details\.player-meal-option-subcard:not\(\[open\]\) > \.tm-daily-portions-action/);
 assert.match(css,/width:max-content!important/);
});
test("one option opens its own published photos, without another option selector",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa","Arroz");
 const second=option("b","bbbbbbbbbbbbbbbbbbbbbbbb","Batata");
 const index={yellow:{lunch:[first,second]}};
 const {button}=mountOption(api,first,index);
 const click=event();
 await button.listeners.click(click);
 assert.equal(click.prevented,true);
 assert.equal(click.stopped,true);
 const content=flatten(body),photos=content.filter(x=>x.tagName==="IMG");
 assert.equal(photos.length,1);
 assert.match(photos[0].src,/aaaaaaaaaaaaaaaaaaaaaaaa$/);
 assert.equal(content.some(x=>x.src?.includes("bbbbbbbbbbbbbbbbbbbbbbbb")),false);
 assert.equal(content.some(x=>x._classes?.has("tm-portion-sheet-tabs")),false);
 assert.equal(content.some(x=>x._classes?.has("tm-portion-photo-grid")),true);
 assert.equal(content.some(x=>x.textContent==="Fotografia: 220 g"),false);
 assert.equal(content.some(x=>x.textContent==="Exemplo com carne branca"),false);
 assert.equal(content.some(x=>x.textContent==="Arroz"),true);
});
test("an obsolete option ref cannot reuse photos from another publication",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 const {button}=mountOption(api,first,{yellow:{lunch:[first]}},
  async()=>({options_by_color:{yellow:{lunch:[option("b","bbbbbbbbbbbbbbbbbbbbbbbb")]}}}));
 await button.listeners.click(event());
 assert.equal(button.isConnected,false);
 assert.equal(flatten(body).filter(x=>x.tagName==="IMG").length,0);
});
test("only approximate photographs receive a short weight clarification",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 first.groups[0].alternatives[0].reference_g=200;
 first.groups[0].alternatives[0].match="near";
 const {button}=mountOption(api,first,{yellow:{lunch:[first]}});
 await button.listeners.click(event());
 assert.ok(flatten(body).some(x=>x.textContent==="Foto de 200 g"));
});
test("Carne/Peixe and side photos use the same square two-column grid",async()=>{
 const {api,body}=createApp();
 const first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 first.groups=[
  {alternatives:[{photo_id:"aaaaaaaaaaaaaaaaaaaaaaaa",category:"Carne / Peixe",
    prescribed_g:110,reference_g:110,photo_subject:"Carne branca",match:"exact"}]},
  {visual_examples:true,alternatives:[
   {photo_id:"bbbbbbbbbbbbbbbbbbbbbbbb",category:"Arroz",prescribed_g:220,reference_g:220},
   {photo_id:"cccccccccccccccccccccccc",category:"Batata",prescribed_g:220,reference_g:220},
   {photo_id:"dddddddddddddddddddddddd",category:"Massa",prescribed_g:220,reference_g:220}
  ]}
 ];
 const {button}=mountOption(api,first,{yellow:{lunch:[first]}});
 await button.listeners.click(event());
 const grids=flatten(body).filter(x=>x._classes?.has("tm-portion-photo-grid"));
 assert.equal(grids.length,2);
 assert.equal(grids[0].children.length,1);
 assert.equal(grids[1].children.length,3);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/aspect-ratio:1\/1/);
 assert.doesNotMatch(css,/scroll-snap-type:x mandatory/);
});
test("sheet grip expands, reduces and can be dragged while content still scrolls",async()=>{
 const {api,body}=createApp(),first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 const {button}=mountOption(api,first,{yellow:{lunch:[first]}});
 await button.listeners.click(event());
 const content=flatten(body);
 const handle=content.find(x=>x._classes?.has("tm-portion-sheet-drag-handle"));
 const sheet=content.find(x=>x._classes?.has("tm-portion-sheet"));
 assert.ok(handle);assert.ok(sheet);
 assert.equal(handle.attributes["aria-expanded"],"false");
 handle.listeners.click();
 assert.equal(handle.attributes["aria-expanded"],"true");
 assert.ok(sheet._classes.has("is-expanded"));
 handle.listeners.click();
 assert.equal(handle.attributes["aria-expanded"],"false");
 const ev={currentTarget:handle,target:handle,button:0,clientY:500,pointerId:1};
 handle.listeners.pointerdown(ev);
 handle.listeners.pointermove({...ev,clientY:400,preventDefault(){}});
 assert.ok(sheet._classes.has("is-dragging"));
 assert.match(sheet.style.height,/px$/);
 handle.listeners.pointerup({...ev,clientY:400});
 assert.ok(sheet._classes.has("is-expanded"));
 assert.match(css,/\.tm-portion-sheet\.is-expanded\{height:94dvh\}/);
 assert.match(css,/overflow-y:auto;overflow-x:hidden/);
 const close=content.find(x=>x._classes?.has("tm-portion-sheet-close"));
 assert.ok(close);
 assert.equal(close.children.length,1);
 assert.equal(close.children[0].tagName,"SVG");
 assert.equal(close.children[0].children.length,2);
 assert.ok(close.children[0]._classes.has("tm-portion-close-icon"));
 assert.doesNotMatch(css,/\.tm-portion-sheet-close::before/);
 assert.match(css,/\.tm-portion-sheet-close \.tm-portion-close-icon/);
});


test("dragging downward on the sheet header or grip dismisses the modal",async()=>{
 const {api,body}=createApp(),first=option("a","aaaaaaaaaaaaaaaaaaaaaaaa");
 const {button}=mountOption(api,first,{yellow:{lunch:[first]}});
 await button.listeners.click(event());
 const all=flatten(body);
 const grip=all.find(x=>x._classes?.has("tm-portion-sheet-drag-handle"));
 const header=all.find(x=>x._classes?.has("tm-portion-sheet-header"));
 const overlay=all.find(x=>x._classes?.has("tm-portion-overlay"));
 assert.ok(grip&&header&&overlay);
 const start={currentTarget:header,target:header,button:0,clientY:220,pointerId:2};
 header.listeners.pointerdown(start);
 header.listeners.pointermove({...start,clientY:315,preventDefault(){}});
 header.listeners.pointerup({...start,clientY:315});
 assert.equal(overlay.isConnected,false);
 assert.equal(body._classes.has("visual-portions-open"),false);
 assert.match(css,/\.tm-portion-sheet\{[^}]*border:0;/s);
 assert.match(css,/\.tm-portion-photo-tile\{[^}]*border:0;/s);
});
