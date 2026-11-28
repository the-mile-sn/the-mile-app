"use strict";
/* Shared player/chef inbox. No polling, no automatic permission prompts. */
window.tmNotificationInbox = (() => {
 let context=null,count=0,generation=0,revision=0;
 function paint(){
  const n=context&&context.active()?count:0;
  const en=context?.language()==="en";
  for(const card of document.querySelectorAll(".profile-notifications-card")){
   let badge=card.querySelector(".tm-notification-count");
   if(!badge){badge=make("span","tm-notification-count");card.querySelector(".profile-action-chevron")?.before(badge);}
   badge.hidden=!n;badge.textContent=n>99?"99+":String(n);
   badge.setAttribute("aria-label",n+(en?" unread notifications":" notificações por ler"));
  }
  for(const avatar of document.querySelectorAll("#tabs [data-tab='profile'] .profile-tab-avatar,#chef-nav [data-tab='profile'] .chef-profile-tab-avatar")){
   avatar.classList.toggle("tm-notification-has-unread",n>0);
   const button=avatar.closest("button");
   if(button){if(n)button.setAttribute("aria-label",(en?"Profile":"Perfil")+", "+n+(en?" unread notifications":" notificações por ler"));else button.removeAttribute("aria-label");}
  }
 }
 function accept(data){if(Number.isInteger(data?.unread_count)&&data.unread_count>=0){revision++;count=data.unread_count;paint();}}
 async function refresh(){
  const c=context,g=generation,r=revision;
  if(!c||!c.active()||document.hidden)return;
  try{const d=await c.request("/api/v2/notifications/inbox","GET");if(g===generation&&r===revision&&c.active())accept(d);}catch(_){}
 }
 function reset(){generation++;revision++;context=null;count=0;paint();}
 function start(options){reset();context=options;refresh();}
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
 window.addEventListener("focus",refresh);
 function make(tag,cls,value){
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(value!==undefined)el.textContent=value;return el;
 }
 async function mount({container,request,language,active,navigate,initialId}){
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
  let data;const rev=revision;
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
  if(rev===revision)accept(data);
  const items=Array.isArray(data.items)?data.items:[];
  if(!items.length){
   root.append(make("p","tm-notification-status",t("Ainda não existem notificações.","No notifications yet.")));return;
  }
  const bar=make("div","tm-notification-list-heading");
  const countLabel=make("span","");
  const all=make("button","tm-notification-mark-all",t("Marcar todas como lidas","Mark all as read"));all.type="button";
  const sync=()=>{countLabel.textContent=count+" "+t("por ler","unread");all.hidden=!count;};
  sync();bar.append(countLabel,all);root.append(bar);
  all.onclick=async()=>{
   if(!valid())return;all.disabled=true;
   try{const result=await request("/api/v2/notifications/open","POST",{action:"mark_all_read"});
    if(!valid())return;accept(result);
    await mount({container,request,language,active,navigate});
   }catch(_){if(valid())root.prepend(make("p","tm-notification-status",fail()));}
   finally{all.disabled=false;}
  };
  const list=make("div","tm-notification-list");root.append(list);
  let highlighted=null;
  for(const item of items){
   const card=make("article","tm-notification-item");
   const button=make("button","tm-notification-open");
   button.type="button";button.setAttribute("aria-expanded","false");
   const copy=make("span","tm-notification-copy");
   card.classList.toggle("is-unread",!item.read_at);
   copy.append(make("strong","",item.title),make("span","tm-notification-body",item.body),make("small","",new Date(item.created_at*1000).toLocaleDateString(language()==="en"?"en-GB":"pt-PT")));
   const dot=make("span","tm-notification-unread");
   dot.hidden=!!item.read_at;dot.setAttribute("aria-label",t("Por ler","Unread"));
   const arrow=make("span","tm-notification-arrow","›");arrow.setAttribute("aria-hidden","true");
   button.append(copy,dot,arrow);
   const detail=make("div","tm-notification-detail");detail.hidden=true;
   button.onclick=async()=>{
    if(!valid())return;
    if(!detail.hidden){detail.hidden=true;button.setAttribute("aria-expanded","false");return;}
    card.classList.remove("is-push-target");
    button.disabled=true;
    try{
     const response=await request("/api/v2/notifications/open","POST",{id:item.id});
     if(!valid())return;
     accept(response);sync();dot.hidden=true;card.classList.remove("is-unread");
     if(response.destination&&navigate&&await navigate(response.destination))return;
     if(!valid())return;
     detail.replaceChildren();
    if(response.destination&&navigate){
     const go=make("button","tm-notification-destination",t("Abrir conteúdo","Open content"));
     go.type="button";
     go.onclick=async()=>{
      if(!valid())return;
      go.disabled=true;
      try{await navigate(response.destination);}catch(_){if(valid())detail.append(make("p","",fail()));}
      finally{go.disabled=false;}
     };
     detail.append(go);
    }
     detail.hidden=false;dot.hidden=true;button.setAttribute("aria-expanded","true");
    }catch(_){
     if(valid()){detail.replaceChildren(make("p","",fail()));detail.hidden=false;button.setAttribute("aria-expanded","true");}
    }finally{button.disabled=false;}
   };
   card.append(button,detail);list.append(card);
   if(item.id===initialId){card.classList.add("is-push-target");highlighted=card;}
  }
  if(highlighted){
   requestAnimationFrame(()=>{
    if(!valid()||!highlighted.isConnected)return;
    highlighted.scrollIntoView({block:"center",behavior:"auto"});
    setTimeout(()=>highlighted.classList.remove("is-push-target"),6000);
   });
  }
 }
 function clear(container){
  if(!container)return;
  container.querySelector(".tm-notification-inbox")?.remove();
  const original=container.querySelector(".profile-notifications-empty");
  if(original)original.hidden=false;
 }
 function pendingId(){
  const url=new URL(location.href);
  const id=url.searchParams.get("notification");
  return /^[a-f0-9]{32}$/.test(id||"")?id:null;
 }
 function consumePendingId(){
  const id=pendingId();if(!id)return null;
  const url=new URL(location.href);url.searchParams.delete("notification");
  history.replaceState(history.state,"",url.pathname+url.search+url.hash);
  return id;
 }
 return {mount,clear,pendingId,consumePendingId,start,reset,refresh,paint,accept};
})();
