"use strict";
/* Approved design prototype; progressive real API mode is enabled only after the gated Chef endpoint returns 200. The original demo stays entirely local otherwise. */
(()=>{
 const $=id=>document.getElementById(id);
 const trigger=$("chef-chat-trigger"),dialog=$("chef-chat-dialog");
 const close=$("chef-chat-close"),thread=$("chef-chat-thread");
 const form=$("chef-chat-form"),input=$("chef-chat-input"),result=$("chef-chat-result");
 const send=$("chef-chat-submit"),unreadBadge=$("chef-chat-unread");
 const disclaimer=$("chef-chat-disclaimer"),privacyAck=$("chef-chat-privacy-ack");
 if(!trigger||!dialog||!close||!thread||!form||!input||!result||!send||!unreadBadge||!disclaimer||!privacyAck)return;
 const copy={
  pt:{
   open:"Abrir mensagens (simulação)",title:"Mensagens",unread:"por ler",
   close:"Fechar mensagens",
   disclaimer:"Pré-visualização: não introduzas dados pessoais. Nada é enviado ou guardado.",
   thread:"Mensagens de exemplo",team:"Equipa The Mile · exemplo",
   sample:"Olá! Aqui poderás conversar com a equipa The Mile sobre menus e outros pedidos.",
   mine:"Chef · exemplo",caption:"Apenas ilustrativo",
   label:"Mensagem de exemplo",placeholder:"Escreve uma mensagem de exemplo…",
   send:"Simular envio (não enviado)",sendTitle:"Simular envio",notSent:"Mensagem apresentada apenas neste exemplo. Não foi enviada nem guardada.",
   realDisclaimer:"Comunicação com a equipa The Mile. As conversas são conservadas enquanto necessário durante a relação profissional e, depois de arquivadas, são revistas ao fim de 12 meses, salvo obrigações legais ou pedidos relativos aos teus direitos.",
   realSend:"Enviar mensagem",realThread:"Conversa com a equipa The Mile",realPlaceholder:"Escreve uma mensagem…",realEmpty:"Ainda não há mensagens nesta conversa.",
   realError:"Não foi possível carregar a conversa. Tenta novamente.",realSendError:"Não foi possível enviar. A mensagem continua no campo.",realSent:"Mensagem enviada.",privacy:"Informações e privacidade",
   privacyAcknowledge:"Li e compreendi",privacyRequired:"Tens de aceitar o aviso de privacidade antes de enviar mensagens.",privacyError:"Não foi possível registar a confirmação. Tenta novamente."
  },
  en:{
   open:"Open messages (demo)",title:"Messages",unread:"unread",close:"Close messages",
   disclaimer:"Preview only: do not enter personal information. Nothing is sent or saved.",
   thread:"Example messages",team:"The Mile team · example",
   sample:"Hi! Here you will be able to message The Mile team about menus and other requests.",
   mine:"Chef · example",caption:"Illustration only",label:"Example message",
   placeholder:"Write an example message…",send:"Simulate sending (not delivered)",sendTitle:"Simulate",
   notSent:"Message shown in this demo only. It was not sent or saved.",
   realDisclaimer:"Messaging with The Mile team. Messages are kept as needed during the professional relationship. After the conversation is archived, retention is reviewed after 12 months, subject to legal duties and your data rights.",
   realSend:"Send message",realThread:"Conversation with The Mile team",realPlaceholder:"Write a message…",realEmpty:"No messages in this conversation yet.",
   realError:"Unable to load the conversation. Try again.",realSendError:"Couldn't send. Your message remains in the field.",realSent:"Message sent.",privacy:"Information and privacy",
   privacyAcknowledge:"I\'ve read and understood",privacyRequired:"You must accept the privacy notice before sending messages.",privacyError:"Unable to save your acknowledgement. Please try again."
  }
 };
 let language="pt",mode="demo",csrf="",chefId="",pendingKey=null;
 let loading=false,openingToken=0,realMessages=[],pollTimer=null,refreshingToken=null;
 let unreadCount=0,unreadEpoch=0,unreadBusy=false,apiUnavailable=false,liveAvailable=false;
 let privacyAcknowledged=false,privacyNoticeVersion="",privacyBusy=false;
 const t=()=>copy[language];
 function updateTriggerLabel(){
  const base=liveAvailable?t().title:t().open;
  trigger.setAttribute("aria-label",unreadCount>0?base+" · "+unreadCount+" "+t().unread:base);
 }
 function setUnreadCount(count){
  unreadCount=Number.isSafeInteger(count)&&count>0?count:0;
  unreadBadge.hidden=unreadCount===0;
  unreadBadge.textContent=unreadCount>9?"9+":String(unreadCount||"");
  updateTriggerLabel();
 }
 // Chef identity is always derived from the authenticated session. No old
 // notification service, push subscription or local unread counter is used.
 async function refreshUnread(){
  if(trigger.hidden||document.hidden||dialog.open||unreadBusy||apiUnavailable)return;
  const epoch=unreadEpoch;
  unreadBusy=true;
  try{
   const session=await fetchReal("/api/me");
   if(epoch!==unreadEpoch||trigger.hidden||document.hidden||dialog.open)return;
   if(session.user?.role!=="chef"||session.admin_preview){
    liveAvailable=false;setUnreadCount(0);return;
   }
   const status=await fetchReal("/api/v2/chef/chat");
   if(epoch!==unreadEpoch||trigger.hidden||document.hidden||dialog.open)return;
   liveAvailable=true;setUnreadCount(status.unread_count);
  }catch(error){
   if(epoch!==unreadEpoch)return;
   if(error.status===404)apiUnavailable=true;
   if(error.status===401||error.status===403||error.status===404){
    liveAvailable=false;setUnreadCount(0);
   }
  }finally{unreadBusy=false;}
 }
 function resizeComposer(){
  if(mode==="real"&&!privacyAcknowledged){
   // Allow the explanatory placeholder to wrap across lines on small phones.
   input.style.height="86px";
   return;
  }
  input.style.height="46px";
  input.style.height=Math.min(108,Math.max(46,input.scrollHeight))+"px";
 }
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
  send.disabled=loading||(mode==="real"&&!privacyAcknowledged)||!input.value.trim();
 }
 function reset(){
  thread.replaceChildren();input.value="";result.textContent="";
  resizeComposer();updateSendState();
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
 function showPrivacyGate(){
  const pending=mode==="real"&&!privacyAcknowledged;
  disclaimer.hidden=mode==="real"&&!pending;
  privacyAck.hidden=!pending;
  privacyAck.textContent=t().privacyAcknowledge;
  privacyAck.disabled=privacyBusy;
  // Keep the composer and send arrow visible but genuinely non-interactive.
  // The empty thread retains flex height, anchoring the composer at the bottom.
  thread.hidden=false;
  form.hidden=false;
  input.disabled=pending;
  input.placeholder=pending?t().privacyRequired:(mode==="real"?t().realPlaceholder:t().placeholder);
  input.setAttribute("aria-label",pending?t().privacyRequired:(mode==="real"?t().realPlaceholder:t().label));
  send.setAttribute("aria-label",pending?t().privacyRequired:(mode==="real"?t().realSend:t().send));
  send.title=pending?t().privacyRequired:(mode==="real"?t().realSend:t().sendTitle);
  resizeComposer();
  updateSendState();
 }
 function showLiveLabels(){
  disclaimer.textContent=t().realDisclaimer;
  thread.setAttribute("aria-label",t().realThread);
  input.placeholder=t().realPlaceholder;
  input.maxLength=2000;
  send.setAttribute("aria-label",t().realSend);
  send.title=t().realSend;
  showPrivacyGate();
  updateTriggerLabel();
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
  if(mode!=="real"||!privacyAcknowledged||!dialog.open||refreshingToken===token)return;
  refreshingToken=token;
  try{
   const data=await fetchReal("/api/v2/chef/chat/messages");
   if(mode!=="real"||!dialog.open||token!==openingToken)return;
   realMessages=data.messages||[];
   renderRealMessages();
   if(result.textContent===t().realError)result.textContent="";
   const last=realMessages.at(-1);
   // The authoritative read endpoint returns the exact remaining count.
   if(last){
    const read=await fetchReal("/api/v2/chef/chat/read","POST",{message_id:last.id});
    if(mode==="real"&&dialog.open&&token===openingToken)setUnreadCount(read.unread_count);
   }else setUnreadCount(0);
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
   const status=await fetchReal("/api/v2/chef/chat");
   if(!dialog.open||token!==openingToken)return;
   liveAvailable=true;apiUnavailable=false;setUnreadCount(status.unread_count);
   privacyNoticeVersion=status.privacy_notice?.version||"";
   privacyAcknowledged=status.privacy_notice?.acknowledged===true;
   mode="real";result.textContent="";realMessages=[];
   // Remove the temporary demo messages before showing an empty, locked thread.
   thread.replaceChildren();
   showLiveLabels();
   if(privacyAcknowledged){
    startRealPolling();
    await refreshReal();
   }
  }catch(error){
   if(!dialog.open||token!==openingToken)return;
   if(error.status===404){apiUnavailable=true;return;} // No API rollout: retain local-only demonstration.
   if(mode==="real")result.textContent=t().realError;
  }
 }
 function setLanguage(value){
  const next=value==="en"?"en":"pt";
  const changed=next!==language;
  language=next;
  updateTriggerLabel();
  $("chef-chat-title").textContent=t().title;
  close.setAttribute("aria-label",t().close);
  $("chef-chat-disclaimer").textContent=t().disclaimer;
  thread.setAttribute("aria-label",t().thread);
  $("chef-chat-input-label").textContent=t().label;
  input.placeholder=t().placeholder;
  send.setAttribute("aria-label",t().send);
  send.title=t().sendTitle;
  if(mode==="real"){
   showLiveLabels();
   if(dialog.open&&changed&&privacyAcknowledged)renderRealMessages();
  }else{
   showPrivacyGate();
   if(dialog.open&&changed)reset();
  }
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
 privacyAck.addEventListener("click",async()=>{
  if(mode!=="real"||privacyAcknowledged||privacyBusy||!privacyNoticeVersion)return;
  const token=openingToken,actorId=chefId,version=privacyNoticeVersion;
  privacyBusy=true;showPrivacyGate();result.textContent="";
  try{
   const data=await fetchReal("/api/v2/chef/chat/privacy-ack","POST",{version});
   if(!dialog.open||mode!=="real"||token!==openingToken||actorId!==chefId)return;
   if(data.privacy_notice?.acknowledged!==true||data.privacy_notice.version!==version)
    throw new Error("privacy_ack_not_saved");
   privacyAcknowledged=true;
   showPrivacyGate();
   startRealPolling();
   await refreshReal();
  }catch(_error){
   if(dialog.open&&mode==="real"&&token===openingToken)
    result.textContent=t().privacyError;
  }finally{
   if(token===openingToken){
    privacyBusy=false;
    if(mode==="real")showPrivacyGate();
   }
  }
 });
 close.addEventListener("click",closeDemo);
 dialog.addEventListener("click",event=>{if(event.target===dialog)closeDemo();});
 dialog.addEventListener("close",()=>{
  openingToken++;
  stopRealPolling();
  mode="demo";csrf="";chefId="";pendingKey=null;realMessages=[];
  privacyAcknowledged=false;privacyNoticeVersion="";privacyBusy=false;
  input.maxLength=600;
  thread.replaceChildren();input.value="";result.textContent="";
  setLanguage(language);
  updateSendState();
  if(!trigger.hidden){trigger.focus({preventScroll:true});refreshUnread();}
 });
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!dialog.open||loading||(mode==="real"&&!privacyAcknowledged))return;
  const message=input.value.trim();
  if(!message)return;
  if(mode==="real"){
   const key=pendingKey||(typeof crypto!=="undefined"&&crypto.randomUUID
    ?crypto.randomUUID():"chef-"+Date.now()+"-"+Math.random().toString(36).slice(2));
   pendingKey=key;loading=true;updateSendState();result.textContent="";
   try{
    await fetchReal("/api/v2/chef/chat/messages","POST",{body:message,client_key:key});
    input.value="";pendingKey=null;resizeComposer();
    try{await refreshReal();result.textContent=t().realSent;}
    catch(_error){result.textContent=t().realError;}
   }catch(_error){result.textContent=t().realSendError;}
   finally{loading=false;updateSendState();}
   return;
  }
  appendMessage("local",message);input.value="";
  resizeComposer();updateSendState();
  result.textContent=t().notSent;
 });
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;
  if(mode==="real"&&dialog.open){
   refreshReal().catch(()=>{if(mode==="real")result.textContent=t().realError;});
  }else refreshUnread();
 });
 // A hidden Chef action indicates logout, login page or session transition.
 // Revoke any old count before probing the newly authenticated Chef.
 const triggerObserver=new MutationObserver(()=>{
  unreadEpoch++;
  if(trigger.hidden){liveAvailable=false;apiUnavailable=false;setUnreadCount(0);}
  else refreshUnread();
 });
 triggerObserver.observe(trigger,{attributes:true,attributeFilter:["hidden"]});
 window.setInterval(()=>{
  if(!trigger.hidden&&!document.hidden&&!dialog.open)refreshUnread();
 },30000);
 if(!trigger.hidden)refreshUnread();
 input.addEventListener("input",()=>{pendingKey=null;resizeComposer();updateSendState();});
 input.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){
   event.preventDefault();form.requestSubmit();
  }
 });
 resizeComposer();updateSendState();
 setLanguage(document.documentElement.lang==="en"?"en":"pt");
 window.themileChefChatDemo=Object.freeze({setLanguage,close:closeDemo});
})();
