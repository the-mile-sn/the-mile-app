'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'static/notification-activation-v2.js'),'utf8');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.className='';this.attributes={};this.isConnected=true;this.hidden=false;this.textContent='';}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 prepend(child){child.parent=this;this.children.unshift(child);}
 replaceChildren(){this.children=[];}
 remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 setAttribute(k,v){this.attributes[k]=String(v);}
 querySelectorAll(selector){const result=[];for(const c of this.children){if(selector==='button'&&c.tagName==='button'||selector.startsWith('.')&&c.className.split(' ').includes(selector.slice(1)))result.push(c);result.push(...c.querySelectorAll(selector));}return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
async function setup({missing=false,matching=false,active=true}={}){
 const next=Uint8Array.of(4,1,2),previous=Uint8Array.of(4,3,4);
 const body=new Element('body'),panel=new Element('section');
 const calls=[];let unsubscribe=0,subscribe=0;
 let subscription=missing?null:{options:{applicationServerKey:(matching?next:previous).buffer},
  async unsubscribe(){unsubscribe++;subscription=null;return true;},toJSON(){return {endpoint:'synthetic-old'};}};
 const pushManager={
  async getSubscription(){return subscription;},
  async subscribe(options){subscribe++;assert.deepEqual(Array.from(options.applicationServerKey),Array.from(next));subscription={options:{applicationServerKey:next.buffer},toJSON(){return {endpoint:'synthetic-new'};}};return subscription;}
 };
 const window={PushManager:function(){},scrollTo(){}};
 const ctx={window,Notification:{permission:'granted'},navigator:{serviceWorker:{async getRegistration(){return {active:true,pushManager};}}},
  document:{createElement:t=>new Element(t),body},localStorage:{getItem:()=> 'a'.repeat(32)},
  atob,Uint8Array,Array};
 vm.runInNewContext(source,ctx);
 const controller=window.tmNotificationActivation;
 await controller.start({active:()=>true,language:()=>'en',request:async(url,method,data)=>{
  if(method==='GET')return {active,prompted:true,publicKey:Buffer.from(next).toString('base64url')};
  calls.push(data);
  return {active:data.action==='activate',prompted:true};
 }});
 await controller.mount(panel);
 return {calls,counts:()=>({unsubscribe,subscribe}),button:()=>panel.querySelector('.tm-notification-switch')};
}
test('existing compatible subscription stays enabled without writing or subscribing',async()=>{
 const t=await setup({matching:true});
 assert.equal(t.button().attributes['aria-checked'],'true');
 assert.deepEqual(t.counts(),{unsubscribe:0,subscribe:0});
 assert.deepEqual(t.calls,[]);
});
test('old key requires two explicit activations before replacement',async()=>{
 const t=await setup();
 assert.equal(t.button().attributes['aria-checked'],'false');
 assert.deepEqual(t.counts(),{unsubscribe:0,subscribe:0});
 await t.button().onclick();
 assert.deepEqual(t.counts(),{unsubscribe:0,subscribe:0});
 assert.deepEqual(t.calls,[]);
 await t.button().onclick();
 assert.deepEqual(t.counts(),{unsubscribe:1,subscribe:1});
 assert.equal(t.calls.length,1);
 assert.equal(t.calls[0].action,'activate');
 assert.equal(t.button().attributes['aria-checked'],'true');
});
test('missing browser subscription can be recovered by one explicit activation',async()=>{
 const t=await setup({missing:true});
 assert.equal(t.button().attributes['aria-checked'],'false');
 assert.deepEqual(t.calls,[]);
 await t.button().onclick();
 assert.deepEqual(t.counts(),{unsubscribe:0,subscribe:1});
 assert.equal(t.calls[0].action,'activate');
});
test('turning off compatible push does not unsubscribe browser or touch legacy',async()=>{
 const t=await setup({matching:true});
 await t.button().onclick();
 assert.equal(t.calls[0].action,'deactivate');
 assert.deepEqual(t.counts(),{unsubscribe:0,subscribe:0});
 assert.equal(t.button().attributes['aria-checked'],'false');
});
