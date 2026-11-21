"use strict";
/* Progressive enhancement for Chef ↔ team chat. A disabled API leaves the
   existing approved Dashboard placeholder completely unchanged. */
(()=>{
 const card=document.querySelector("#tm-dashboard .tm-db-today-chat");
 const placeholder=card?.querySelector(".tm-db-chat-placeholder");
 const workspace=document.getElementById("admin-workspace");
 if(!card||!placeholder||!workspace)return;
 const make=(tag,cls,txt)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(txt!==undefined)n.textContent=txt;
  return n;
 };
 const list=make("div","tm-chat-inbox");
 list.hidden=true;
 card.append(list);
 const dialog=make("dialog","tm-chat-dialog");
 dialog.setAttribute("aria-labelledby","tm-chat-dialog-title");
 const header=make("div","tm-chat-dialog-header");
 const title=make("h2","","Mensagens");
 title.id="tm-chat-dialog-title";
 const close=make("button","tm-chat-close","×");
 close.type="button";close.setAttribute("aria-label","Fechar mensagens");
 header.append(title,close);
 const thread=make("div","tm-chat-thread");
 thread.setAttribute("role","log");thread.setAttribute("aria-live","polite");
 const form=make("form","tm-chat-compose");
 const textarea=make("textarea");
 textarea.rows=2;textarea.maxLength=2000;
 textarea.placeholder="Escreve uma mensagem…";
 textarea.setAttribute("aria-label","Mensagem para o Chef");
 const send=make("button","","↑");send.type="submit";
 send.setAttribute("aria-label","Enviar mensagem");send.disabled=true;
 form.append(textarea,send);
 const feedback=make("p","tm-chat-feedback");
 feedback.setAttribute("role","status");
 dialog.append(header,thread,form,feedback);
 document.body.append(dialog);
 let actor=null,csrf="",selected=null,disabled=false,loading=false;
 let recent=[];
 const active=()=>!workspace.hidden && !document.hidden;
 async function json(path,method="GET",body){
  const response=await fetch(path,{method,credentials:"same-origin",
   headers:{"Accept":"application/json",...(method!=="GET"?{"Content-Type":"application/json","X-CSRF-Token":csrf}:{})},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(!response.ok){const error=new Error("chat_"+response.status);error.status=response.status;throw error;}
  return response.json();
 }
 function showError(text){feedback.textContent=text;}
 async function session(){
  const data=await json("/api/me");
  if(!data.user || data.user.role!=="admin")return false;
  actor=data.user;csrf=data.csrf||"";return true;
 }
 function conversationRow(item,pending){
  const row=make("div","tm-chat-inbox-row");
  const name=make("strong","",item.chef_name||"Chef");
  const context=make("span","",pending?"Por atribuir":item.unread_count?item.unread_count+" por ler":"Abrir conversa");
  const details=make("div","tm-chat-inbox-details");
  details.append(name,context);
  const action=make("button","",pending?"Atribuir-me":"Abrir");
  action.type="button";
  action.addEventListener("click",async()=>{
   action.disabled=true;
   try{
    if(pending){
     await json("/api/v2/admin/chat/assign","POST",
      {conversation_id:item.id,staff_id:actor.id});
     await refresh();
    }else await openThread(item);
   }catch(_e){showError("Não foi possível abrir esta conversa.");}
   finally{action.disabled=false;}
  });
  row.append(details,action);return row;
 }
 function paint(data){
  recent=data.assigned||[];
  list.replaceChildren();
  const owned=make("div","tm-chat-inbox-rows");
  if(!recent.length)owned.append(make("p","tm-chat-empty","Ainda não tens conversas atribuídas."));
  for(const item of recent.slice(0,12))owned.append(conversationRow(item,false));
  list.append(owned);
  if(data.pending?.length){
   const caption=make("p","tm-chat-inbox-subtitle","Conversas por atribuir");
   list.append(caption);
   const pendingList=make("div","tm-chat-inbox-rows");
   for(const item of data.pending.slice(0,12))pendingList.append(conversationRow(item,true));
   list.append(pendingList);
  }
  list.hidden=false;placeholder.hidden=true;
 }
 async function refresh(){
  if(!active()||loading||disabled)return;
  loading=true;
  try{
   if(!await session())return;
   const data=await json("/api/v2/admin/chat");
   paint(data);
  }catch(error){
   if(error.status===404){disabled=true;list.hidden=true;placeholder.hidden=false;}
   else if(error.status===401||error.status===403){
    list.hidden=true;placeholder.hidden=false;
   }else if(!list.hidden){showError("Não foi possível atualizar o chat.");}
  }finally{loading=false;}
 }
 async function updateThread(){
  if(!selected||!dialog.open)return;
  const result=await json("/api/v2/admin/chat/messages?conversation_id="+encodeURIComponent(selected.id));
  thread.replaceChildren();
  for(const msg of result.messages||[]){
   const mine=msg.author_id===actor.id;
   const article=make("article","tm-chat-bubble "+(mine?"is-mine":"is-chef"));
   const label=make("small","",mine?"Equipa The Mile":selected.chef_name||"Chef");
   article.append(label,make("p","",msg.body));
   thread.append(article);
  }
  thread.scrollTop=thread.scrollHeight;
  const last=(result.messages||[]).at(-1);
  if(last&&last.author_id!==actor.id){
   await json("/api/v2/admin/chat/read","POST",
    {conversation_id:selected.id,message_id:last.id});
  }
 }
 async function openThread(item){
  selected=item;title.textContent="Mensagens · "+(item.chef_name||"Chef");
  textarea.value="";send.disabled=true;showError("");
  dialog.showModal();
  try{await updateThread();}catch(_e){showError("Não foi possível carregar as mensagens.");}
 }
 close.addEventListener("click",()=>dialog.close());
 dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
 dialog.addEventListener("close",()=>{selected=null;thread.replaceChildren();textarea.value="";showError("");refresh();});
 textarea.addEventListener("input",()=>{send.disabled=!textarea.value.trim();});
 textarea.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){
   event.preventDefault();if(!send.disabled)form.requestSubmit();
  }
 });
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!selected||!textarea.value.trim())return;
  const content=textarea.value.trim();
  const key=typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():
   "ui-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  send.disabled=true;showError("");
  try{
   await json("/api/v2/admin/chat/messages","POST",
    {conversation_id:selected.id,body:content,client_key:key});
   textarea.value="";await updateThread();
  }catch(_e){showError("Não foi possível enviar. A mensagem continua no campo.");}
  finally{send.disabled=!textarea.value.trim();}
 });
 const observer=new MutationObserver(()=>{if(active())refresh();});
 observer.observe(workspace,{attributes:true,attributeFilter:["hidden"]});
 document.addEventListener("visibilitychange",()=>{if(active())refresh();});
 window.setInterval(()=>{
  if(dialog.open&&selected&&active())updateThread().catch(()=>{});
  else refresh();
 },30000);
 refresh();
})();
