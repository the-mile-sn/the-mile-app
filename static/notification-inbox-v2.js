"use strict";
/* Shared player/chef inbox. No polling, no automatic permission prompts. */
window.tmNotificationInbox = (() => {
 function make(tag,cls,value){
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(value!==undefined)el.textContent=value;return el;
 }
 async function mount({container,request,language,active}){
  if(!container||!active())return;
  const original=container.querySelector(".profile-notifications-empty");
  const previous=container.querySelector(".tm-notification-inbox");
  if(previous)previous.remove();
  if(original)original.hidden=false;
  const root=make("div","tm-notification-inbox");
  container.append(root);
  const valid=()=>root.isConnected&&active();
  const t=(pt,en)=>language()==="en"?en:pt;
  const fail=()=>t("Não foi possível carregar as notificações.","Unable to load notifications.");
  let data;
  try{data=await request("/api/v2/notifications/inbox","GET");}
  catch(e){
   if(valid()&&e.status!==404){
    if(original)original.hidden=true;
    root.append(make("p","tm-notification-status",fail()));
   }
   return;
  }
  if(!valid())return;
  if(original)original.hidden=true;
  const items=Array.isArray(data.items)?data.items:[];
  if(!items.length){
   root.append(make("p","tm-notification-status",t("Ainda não existem notificações.","No notifications yet.")));return;
  }
  for(const item of items){
   const card=make("article","tm-notification-item");
   const button=make("button","tm-notification-open");
   button.type="button";button.setAttribute("aria-expanded","false");
   const copy=make("span","tm-notification-copy");
   copy.append(make("strong","",item.title),make("small","",new Date(item.created_at*1000).toLocaleDateString(language()==="en"?"en-GB":"pt-PT")));
   const dot=make("span","tm-notification-unread");
   dot.hidden=!!item.read_at;dot.setAttribute("aria-label",t("Por ler","Unread"));
   const arrow=make("span","tm-notification-arrow","›");arrow.setAttribute("aria-hidden","true");
   button.append(copy,dot,arrow);
   const detail=make("div","tm-notification-detail");detail.hidden=true;
   button.onclick=async()=>{
    if(!valid())return;
    if(!detail.hidden){detail.hidden=true;button.setAttribute("aria-expanded","false");return;}
    button.disabled=true;
    try{
     const response=await request("/api/v2/notifications/open","POST",{id:item.id});
     if(!valid())return;
     detail.replaceChildren(make("p","",response.item.body));
     detail.hidden=false;dot.hidden=true;button.setAttribute("aria-expanded","true");
    }catch(_){
     if(valid()){detail.replaceChildren(make("p","",fail()));detail.hidden=false;button.setAttribute("aria-expanded","true");}
    }finally{button.disabled=false;}
   };
   card.append(button,detail);root.append(card);
  }
 }
 function clear(container){
  if(!container)return;
  container.querySelector(".tm-notification-inbox")?.remove();
  const original=container.querySelector(".profile-notifications-empty");
  if(original)original.hidden=false;
 }
 return {mount,clear};
})();
