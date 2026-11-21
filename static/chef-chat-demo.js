"use strict";
/* Approved design prototype; progressive real API mode is enabled only after the gated Chef endpoint returns 200. The original demo stays entirely local otherwise. */
(()=>{
 const $=id=>document.getElementById(id);
 const trigger=$("chef-chat-trigger"),dialog=$("chef-chat-dialog");
 const close=$("chef-chat-close"),thread=$("chef-chat-thread");
 const form=$("chef-chat-form"),input=$("chef-chat-input"),result=$("chef-chat-result");
 const send=$("chef-chat-submit");
 const kicker=$("chef-chat-kicker"),disclaimer=$("chef-chat-disclaimer");
 if(!trigger||!dialog||!close||!thread||!form||!input||!result||!send)return;
 const copy={
  pt:{
   open:"Abrir mensagens (simulação)",title:"Mensagens",demo:"SIMULAÇÃO",
   close:"Fechar mensagens",
   disclaimer:"Pré-visualização: não introduzas dados pessoais. Nada é enviado ou guardado.",
   thread:"Mensagens de exemplo",team:"Equipa The Mile · exemplo",
   sample:"Olá! Aqui poderás conversar com a equipa The Mile sobre menus e outros pedidos.",
   mine:"Chef · exemplo",caption:"Apenas ilustrativo",
   label:"Mensagem de exemplo",placeholder:"Escreve uma mensagem de exemplo…",
   send:"Simular envio (não enviado)",sendTitle:"Simular envio",notSent:"Mensagem apresentada apenas neste exemplo. Não foi enviada nem guardada.",
   realKicker:"THE MILE",realDisclaimer:"Comunicação com a equipa The Mile. As conversas são conservadas enquanto necessário durante a relação profissional e, depois de arquivadas, são revistas ao fim de 12 meses, salvo obrigações legais ou pedidos relativos aos teus direitos.",
   realSend:"Enviar mensagem",realThread:"Conversa com a equipa The Mile",realPlaceholder:"Escreve uma mensagem…",realEmpty:"Ainda não há mensagens nesta conversa.",
   realError:"Não foi possível carregar a conversa. Tenta novamente.",realSendError:"Não foi possível enviar. A mensagem continua no campo.",realSent:"Mensagem enviada.",privacy:"Informações e privacidade"
  },
  en:{
   open:"Open messages (demo)",title:"Messages",demo:"DEMO",close:"Close messages",
   disclaimer:"Preview only: do not enter personal information. Nothing is sent or saved.",
   thread:"Example messages",team:"The Mile team · example",
   sample:"Hi! Here you will be able to message The Mile team about menus and other requests.",
   mine:"Chef · example",caption:"Illustration only",label:"Example message",
   placeholder:"Write an example message…",send:"Simulate sending (not delivered)",sendTitle:"Simulate",
   notSent:"Message shown in this demo only. It was not sent or saved.",
   realKicker:"THE MILE",realDisclaimer:"Messaging with The Mile team. Messages are kept as needed during the professional relationship. After the conversation is archived, retention is reviewed after 12 months, subject to legal duties and your data rights.",
   realSend:"Send message",realThread:"Conversation with The Mile team",realPlaceholder:"Write a message…",realEmpty:"No messages in this conversation yet.",
   realError:"Unable to load the conversation. Try again.",realSendError:"Couldn't send. Your message remains in the field.",realSent:"Message sent.",privacy:"Information and privacy"
  }
 };
 let language="pt",mode="demo",csrf="",chefId="",pendingKey=null;
 let loading=false,openingToken=0,realMessages=[],pollTimer=null,refreshingToken=null;
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
 function updateSendState(){
  send.disabled=loading||!input.value.trim();
 }
 function reset(){
  thread.replaceChildren();input.value="";result.textContent="";
  updateSendState();
  appendMessage("team",t().sample);
 }
 function closeDemo(){if(dialog.open)dialog.close();}
 async function fetchReal(path,method="GET",body){
  const response=await fetch(path,{
   method,credentials:"same-origin",
   headers:{"Accept":"application/json",...(method!=="GET"?{"Content-Type":"application/json","X-CSRF-Token":csrf}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!response.ok){const error=new Error("chat_"+response.status);error.status=response.status;throw error;}
  return response.json();
 }
 function renderRealMessages(){
  if(mode!=="real")return;
  thread.replaceChildren();
  if(!realMessages.length)thread.append(make("p","chef-chat-message-caption",t().realEmpty));
  for(const m of realMessages){
   const who=m.author_id===chefId?"local":"team";
   const item=make("article","chef-chat-message chef-chat-message-"+who);
   item.append(make("small","chef-chat-message-author",who==="team"?"Equipa The Mile":"Chef"));
   item.append(make("p","chef-chat-bubble",m.body));
   thread.append(item);
  }
  thread.scrollTop=thread.scrollHeight;
 }
 function showLiveLabels(){
  kicker.textContent=t().realKicker;
  disclaimer.textContent=t().realDisclaimer;
  thread.setAttribute("aria-label",t().realThread);
  input.placeholder=t().realPlaceholder;
  input.maxLength=2000;
  send.setAttribute("aria-label",t().realSend);
  send.title=t().realSend;
  trigger.setAttribute("aria-label",t().title);
 }
 function stopRealPolling(){
  if(pollTimer!==null){window.clearInterval(pollTimer);pollTimer=null;}
 }
 function startRealPolling(){
  stopRealPolling();
  pollTimer=window.setInterval(()=>{
   if(mode!=="real"||!dialog.open||document.hidden)return;
   refreshReal().catch(()=>{
    if(mode==="real"&&dialog.open)result.textContent=t().realError;
   });
  },30000);
 }
 async function refreshReal(){
  const token=openingToken;
  if(mode!=="real"||!dialog.open||refreshingToken===token)return;
  refreshingToken=token;
  try{
   const data=await fetchReal("/api/v2/chef/chat/messages");
   if(mode!=="real"||!dialog.open||token!==openingToken)return;
   realMessages=data.messages||[];
   renderRealMessages();
   if(result.textContent===t().realError)result.textContent="";
   const last=realMessages.at(-1);
   // Read cursor tracks the newest displayed message, including own replies.
   if(last){
    await fetchReal("/api/v2/chef/chat/read","POST",{message_id:last.id});
   }
  }finally{
   if(refreshingToken===token)refreshingToken=null;
  }
 }
 async function maybeOpenReal(){
  const token=++openingToken;
  try{
   const session=await fetchReal("/api/me");
   if(!dialog.open||token!==openingToken||session.user?.role!=="chef"||session.admin_preview)return;
   csrf=session.csrf||"";chefId=session.user.id;
   await fetchReal("/api/v2/chef/chat");
   if(!dialog.open||token!==openingToken)return;
   mode="real";result.textContent="";realMessages=[];
   showLiveLabels();
   startRealPolling();
   await refreshReal();
  }catch(error){
   if(!dialog.open||token!==openingToken)return;
   if(error.status===404)return; // No API rollout: retain local-only demonstration.
   if(mode==="real")result.textContent=t().realError;
  }
 }
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
  send.setAttribute("aria-label",t().send);
  send.title=t().sendTitle;
  if(mode==="real"){
   showLiveLabels();
   if(dialog.open&&changed)renderRealMessages();
  }else if(dialog.open&&changed)reset();
 }
 trigger.addEventListener("click",()=>{
  if(trigger.hidden||dialog.open)return;
  mode="demo";pendingKey=null;
  reset();dialog.showModal();
  maybeOpenReal();
  // Give the modal a stable initial focus without drawing a selection ring
  // around the close button or opening the iPhone keyboard.
  $("chef-chat-title").focus({preventScroll:true});
 });
 close.addEventListener("click",closeDemo);
 dialog.addEventListener("click",event=>{if(event.target===dialog)closeDemo();});
 dialog.addEventListener("close",()=>{
  openingToken++;
  stopRealPolling();
  mode="demo";csrf="";chefId="";pendingKey=null;realMessages=[];
  input.maxLength=600;
  thread.replaceChildren();input.value="";result.textContent="";
  setLanguage(language);
  updateSendState();
  if(!trigger.hidden)trigger.focus({preventScroll:true});
 });
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!dialog.open||loading)return;
  const message=input.value.trim();
  if(!message)return;
  if(mode==="real"){
   const key=pendingKey||(typeof crypto!=="undefined"&&crypto.randomUUID
    ?crypto.randomUUID():"chef-"+Date.now()+"-"+Math.random().toString(36).slice(2));
   pendingKey=key;loading=true;updateSendState();result.textContent="";
   try{
    await fetchReal("/api/v2/chef/chat/messages","POST",{body:message,client_key:key});
    input.value="";pendingKey=null;
    try{await refreshReal();result.textContent=t().realSent;}
    catch(_error){result.textContent=t().realError;}
   }catch(_error){result.textContent=t().realSendError;}
   finally{loading=false;updateSendState();}
   return;
  }
  appendMessage("local",message);input.value="";
  updateSendState();
  result.textContent=t().notSent;
 });
 document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&mode==="real"&&dialog.open){
   refreshReal().catch(()=>{if(mode==="real")result.textContent=t().realError;});
  }
 });
 input.addEventListener("input",()=>{pendingKey=null;updateSendState();});
 input.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){
   event.preventDefault();form.requestSubmit();
  }
 });
 updateSendState();
 setLanguage(document.documentElement.lang==="en"?"en":"pt");
 window.themileChefChatDemo=Object.freeze({setLanguage,close:closeDemo});
})();
