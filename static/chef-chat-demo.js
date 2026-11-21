"use strict";
/* Isolated design prototype. Does not transmit, persist or deliver any messages. */
(()=>{
 const $=id=>document.getElementById(id);
 const trigger=$("chef-chat-trigger"),dialog=$("chef-chat-dialog");
 const close=$("chef-chat-close"),thread=$("chef-chat-thread");
 const form=$("chef-chat-form"),input=$("chef-chat-input"),result=$("chef-chat-result");
 if(!trigger||!dialog||!close||!thread||!form||!input||!result)return;
 const copy={
  pt:{
   open:"Abrir mensagens (simulação)",title:"Mensagens",demo:"SIMULAÇÃO",
   close:"Fechar mensagens",
   disclaimer:"Pré-visualização: não introduzas dados pessoais. Nada é enviado ou guardado.",
   thread:"Mensagens de exemplo",team:"Equipa The Mile · exemplo",
   sample:"Olá! Aqui poderás conversar com a equipa The Mile sobre menus e outros pedidos.",
   mine:"Chef · exemplo",caption:"Apenas ilustrativo",
   label:"Mensagem de exemplo",placeholder:"Escreve uma mensagem de exemplo…",
   send:"Simular",notSent:"Mensagem apresentada apenas neste exemplo. Não foi enviada nem guardada."
  },
  en:{
   open:"Open messages (demo)",title:"Messages",demo:"DEMO",close:"Close messages",
   disclaimer:"Preview only: do not enter personal information. Nothing is sent or saved.",
   thread:"Example messages",team:"The Mile team · example",
   sample:"Hi! Here you will be able to message The Mile team about menus and other requests.",
   mine:"Chef · example",caption:"Illustration only",label:"Example message",
   placeholder:"Write an example message…",send:"Try it",
   notSent:"Message shown in this demo only. It was not sent or saved."
  }
 };
 let language="pt";
 const t=()=>copy[language];
 const make=(tag,cls,value)=>{
  const el=document.createElement(tag);el.className=cls;
  if(value!==undefined)el.textContent=value;
  return el;
 };
 function appendMessage(who,text){
  const item=make("article","chef-chat-message chef-chat-message-"+who);
  item.append(make("small","chef-chat-message-author",who==="team"?t().team:t().mine));
  item.append(make("p","chef-chat-bubble",text));
  item.append(make("small","chef-chat-message-caption",t().caption));
  thread.append(item);thread.scrollTop=thread.scrollHeight;
 }
 function reset(){
  thread.replaceChildren();input.value="";result.textContent="";
  appendMessage("team",t().sample);
 }
 function closeDemo(){if(dialog.open)dialog.close();}
 function setLanguage(value){
  const next=value==="en"?"en":"pt";
  const changed=next!==language;
  language=next;
  trigger.setAttribute("aria-label",t().open);
  $("chef-chat-title").textContent=t().title;
  $("chef-chat-kicker").textContent=t().demo;
  close.setAttribute("aria-label",t().close);
  $("chef-chat-disclaimer").textContent=t().disclaimer;
  thread.setAttribute("aria-label",t().thread);
  $("chef-chat-input-label").textContent=t().label;
  input.placeholder=t().placeholder;
  $("chef-chat-submit").textContent=t().send;
  if(dialog.open&&changed)reset();
 }
 trigger.addEventListener("click",()=>{
  if(trigger.hidden||dialog.open)return;
  reset();dialog.showModal();
  // Avoid automatically opening the iPhone keyboard.
  close.focus({preventScroll:true});
 });
 close.addEventListener("click",closeDemo);
 dialog.addEventListener("click",event=>{if(event.target===dialog)closeDemo();});
 dialog.addEventListener("close",()=>{
  thread.replaceChildren();input.value="";result.textContent="";
  if(!trigger.hidden)trigger.focus({preventScroll:true});
 });
 form.addEventListener("submit",event=>{
  event.preventDefault();
  if(!dialog.open)return;
  const message=input.value.trim();
  if(!message)return;
  appendMessage("local",message);input.value="";
  result.textContent=t().notSent;
 });
 input.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){
   event.preventDefault();form.requestSubmit();
  }
 });
 setLanguage(document.documentElement.lang==="en"?"en":"pt");
 window.themileChefChatDemo=Object.freeze({setLanguage,close:closeDemo});
})();
