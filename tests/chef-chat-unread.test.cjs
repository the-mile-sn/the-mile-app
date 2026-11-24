"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const code=fs.readFileSync("static/chef-chat-demo.js","utf8");
function harness({apiEnabled=true,acknowledged=true,failAck=false}={}){
 const events=new Map(),timers=new Map(),observers=[];
 let privacyAcked=acknowledged;
 let timerSeq=0, count=2, messages=[
  {id:"msg-1",author_id:"admin",body:"Primeira",created_at:1},
  {id:"msg-2",author_id:"admin",body:"Segunda",created_at:2}
 ];
 const requests=[];
 const elements=new Map();
 class Element{
  constructor(id=""){
   this.id=id;this.hidden=id==="chef-chat-trigger"||id==="chef-chat-unread";
   this.disabled=false;this.value="";this.open=false;this.scrollHeight=46;
   this.scrollTop=0;this.style={};this.textContent="";
   this.attrs={};this.children=[];this.maxLength=600;
  }
  setAttribute(k,v){this.attrs[k]=v}
  getAttribute(k){return this.attrs[k]}
  addEventListener(k,fn){const key=this.id+":"+k;events.set(key,[...(events.get(key)||[]),fn])}
  emit(k,value){for(const fn of events.get(this.id+":"+k)||[])fn(value||{})}
  append(...v){this.children.push(...v)}
  replaceChildren(...v){this.children=[...v]}
  focus(){}
  showModal(){this.open=true}
  close(){this.open=false;this.emit("close")}
 }
 const get=id=>{
  if(!elements.has(id))elements.set(id,new Element(id));
  return elements.get(id);
 };
 const document={
  hidden:false,documentElement:{lang:"pt"},
  getElementById:get,createElement:tag=>new Element(tag),
  addEventListener:(name,fn)=>{events.set("document:"+name,[...(events.get("document:"+name)||[]),fn]);}
 };
 const win={
  setInterval:fn=>{const id=++timerSeq;timers.set(id,fn);return id},
  clearInterval:id=>timers.delete(id)
 };
 const fetch=async (url,opts={})=>{
  requests.push({url,method:opts.method||"GET",body:opts.body});
  let body;
  if(url==="/api/me")body={user:{role:"chef",id:"chef"},admin_preview:false,csrf:"csrf"};
  else if(url==="/api/v2/chef/chat"){
   if(!apiEnabled)return {ok:false,status:404,json:async()=>({})};
   body={unread_count:count,conversation:{id:"thread"},
    privacy_notice:{version:"chef-chat-privacy-2026-11-v1",acknowledged:privacyAcked}};
  }else if(url==="/api/v2/chef/chat/privacy-ack"){
   if(failAck)return {ok:false,status:503,json:async()=>({})};
   const payload=JSON.parse(opts.body||"{}");
   assert.equal(payload.version,"chef-chat-privacy-2026-11-v1");
   privacyAcked=true;
   body={privacy_notice:{version:payload.version,acknowledged:true,acknowledged_at:1234}};
  }else if(url==="/api/v2/chef/chat/messages")body={messages};
  else if(url==="/api/v2/chef/chat/read"){
   count=0;body={changed:true,unread_count:0};
  }else throw new Error("Unexpected URL "+url);
  return {ok:true,status:200,json:async()=>body};
 };
 const observersClass=class {
  constructor(fn){this.fn=fn;observers.push(this)}
  observe(){}
 };
 vm.runInNewContext(code,{document,window:win,fetch,MutationObserver:observersClass,
  console,Math,Date},{filename:"chef-chat-demo.js"});
 const flush=async()=>{
  for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
 };
 const trigger=get("chef-chat-trigger"),badge=get("chef-chat-unread"),dialog=get("chef-chat-dialog");
 return {
  trigger,badge,dialog,get,requests,win,document,flush,
  reveal:async()=>{trigger.hidden=false;for(const o of observers)o.fn();await flush()},
  hide:async()=>{trigger.hidden=true;for(const o of observers)o.fn();await flush()},
  tick:async()=>{for(const callback of [...timers.values()])callback();await flush()},
  count:(value)=>{count=value},
  messages:value=>{messages=value},
  privacyAcknowledged:()=>privacyAcked,
  switchLanguage:lang=>win.themileChefChatDemo.setLanguage(lang),
  showMessageWindow:async()=>{trigger.emit("click");await flush()},
  closeMessageWindow:async()=>{dialog.close();await flush()}
 };
}

test("shows exactly two new staff messages; reading clears the count",async()=>{
 const h=harness();
 await h.reveal();
 assert.equal(h.badge.hidden,false);
 assert.equal(h.badge.textContent,"2");
 assert.match(h.trigger.getAttribute("aria-label"),/2 por ler/);
 await h.showMessageWindow();
 assert.equal(h.dialog.open,true);
 assert.equal(h.badge.hidden,true);
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/read").length,1);
 const unreadBefore=h.requests.filter(r=>r.url==="/api/v2/chef/chat").length;
 await h.tick();
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat").length,unreadBefore,
  "no separate badge polling while reading the open thread");
 await h.closeMessageWindow();
 h.count(3);
 await h.tick();
 assert.equal(h.badge.textContent,"3");
 h.switchLanguage("en");
 assert.match(h.trigger.getAttribute("aria-label"),/3 unread/);
 h.count(11);
 await h.tick();
 assert.equal(h.badge.textContent,"9+");
 assert.match(h.trigger.getAttribute("aria-label"),/11 unread/);
 await h.hide();
 assert.equal(h.badge.hidden,true);
 const callCount=h.requests.length;
 await h.tick();
 assert.equal(h.requests.length,callCount,"no fetch after leaving Chef view");
});

test("unavailable chat stays demo-only and does not poll repeatedly",async()=>{
 const h=harness({apiEnabled:false});
 await h.reveal();
 assert.equal(h.badge.hidden,true);
 const first=h.requests.filter(r=>r.url==="/api/v2/chef/chat").length;
 assert.equal(first,1);
 await h.tick();await h.tick();
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat").length,first);
 await h.showMessageWindow();
 assert.equal(h.badge.hidden,true);
 const result=h.get("chef-chat-result");
 const input=h.get("chef-chat-input");
 input.value="Mensagem ilustrativa";
 input.emit("input");
 h.get("chef-chat-form").emit("submit",{preventDefault(){}});
 await h.flush();
 assert.match(result.textContent,/[Nn]ão foi enviada nem guardada/);
});

test("composer grows from one line to max only when needed",async()=>{
 const h=harness();
 const input=h.get("chef-chat-input");
 assert.equal(input.style.height,"46px");
 input.value="Uma mensagem longa\nOutra linha";
 input.scrollHeight=80;
 input.emit("input");
 assert.equal(input.style.height,"80px");
 input.scrollHeight=240;
 input.emit("input");
 assert.equal(input.style.height,"108px");
 input.value="";
 input.scrollHeight=46;
 input.emit("input");
 assert.equal(input.style.height,"46px");
});


test("first real chat visit requires an explicit, durable acknowledgement once per Chef",async()=>{
 const h=harness({acknowledged:false});
 await h.reveal();
 await h.showMessageWindow();
 const notice=h.get("chef-chat-disclaimer");
 const ack=h.get("chef-chat-privacy-ack");
 const composer=h.get("chef-chat-form");
 const thread=h.get("chef-chat-thread");
 const input=h.get("chef-chat-input");
 const send=h.get("chef-chat-submit");
 assert.equal(h.dialog.open,true);
 assert.equal(notice.hidden,false);
 assert.equal(ack.hidden,false);
 assert.equal(composer.hidden,false,"The message box remains visible");
 assert.equal(thread.hidden,false,"Empty thread keeps the composer at the bottom");
 assert.equal(thread.children.length,0,"Temporary demo messages must not be shown");
 assert.equal(input.disabled,true,"Typing/focus must be blocked");
 assert.equal(send.disabled,true,"Sending must be blocked");
 assert.equal(input.placeholder,"Tens de aceitar o aviso de privacidade antes de enviar mensagens.");
 assert.equal(input.getAttribute("aria-label"),input.placeholder);
 assert.equal(send.getAttribute("aria-label"),input.placeholder);
 assert.equal(input.style.height,"86px","The explanatory placeholder can wrap");
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/messages").length,0);
 input.value="Attempt to bypass the disabled field";
 composer.emit("submit",{preventDefault(){}});
 await h.flush();
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/messages"&&r.method==="POST").length,0);
 input.value="";
 h.switchLanguage("en");
 assert.equal(ack.textContent,"I\'ve read and understood");
 assert.equal(input.placeholder,"You must accept the privacy notice before sending messages.");
 assert.equal(input.disabled,true);
 assert.equal(thread.children.length,0);
 ack.emit("click");
 await h.flush();
 assert.equal(h.privacyAcknowledged(),true);
 assert.equal(ack.hidden,true);
 assert.equal(notice.hidden,true);
 assert.equal(composer.hidden,false);
 assert.equal(thread.hidden,false);
 assert.equal(input.disabled,false,"Composer must unlock after acknowledgement");
 assert.equal(input.placeholder,"Write a message…");
 assert.equal(input.style.height,"46px");
 assert.equal(send.disabled,true,"An empty composer still cannot send");
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/privacy-ack").length,1);
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/messages").length,1);
 await h.closeMessageWindow();
 await h.showMessageWindow();
 assert.equal(ack.hidden,true);
 assert.equal(notice.hidden,true);
 assert.equal(input.disabled,false);
 assert.equal(input.placeholder,"Write a message…");
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/privacy-ack").length,1,
  "acknowledgement must not be sent again on reopen");
 await h.closeMessageWindow();
});

test("failed server acknowledgement never hides privacy info or unlocks composer",async()=>{
 const h=harness({acknowledged:false,failAck:true});
 await h.reveal();
 await h.showMessageWindow();
 const ack=h.get("chef-chat-privacy-ack");
 ack.emit("click");
 await h.flush();
 assert.equal(h.privacyAcknowledged(),false);
 assert.equal(ack.hidden,false);
 assert.equal(ack.disabled,false);
 assert.equal(h.get("chef-chat-form").hidden,false);
 assert.equal(h.get("chef-chat-input").disabled,true);
 assert.equal(h.get("chef-chat-submit").disabled,true);
 assert.equal(h.get("chef-chat-input").placeholder,"Tens de aceitar o aviso de privacidade antes de enviar mensagens.");
 assert.equal(h.requests.filter(r=>r.url==="/api/v2/chef/chat/messages").length,0);
 assert.match(h.get("chef-chat-result").textContent,/registar a confirmação/);
});
