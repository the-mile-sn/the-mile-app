"use strict";
/* Read-only development preview. No timer, polling or send request. */
(()=>{
 const workspace=document.getElementById("admin-workspace");
 const card=document.getElementById("tm-notify-preview-card");
 const dialog=document.getElementById("tm-notify-preview-dialog");
 if(!workspace||!card||!dialog)return;
 const $=id=>document.getElementById(id);
 const open=$("tm-notify-preview-open"),close=$("tm-notify-preview-close");
 const kind=$("tm-notify-preview-kind"),list=$("tm-notify-preview-list");
 const controls=$("tm-notify-preview-controls"),status=$("tm-notify-preview-status");
 const tabs=[...dialog.querySelectorAll("[data-notify-preview-tab]")];
 let checked=false,checking=false,generation=0,tab="new";
 const make=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 async function request(type){
  const res=await fetch("/api/v2/admin/notifications-preview?kind="+encodeURIComponent(type),
   {credentials:"same-origin",headers:{Accept:"application/json"},cache:"no-store"});
  if(!res.ok)throw Error(String(res.status));
  return res.json();
 }
 async function check(){
  if(checked||checking||workspace.hidden)return;
  checking=true;
  try{const data=await request("config");checked=true;card.hidden=data.enabled!==true;}
  catch(_){card.hidden=true;}
  finally{checking=false;}
 }
 async function load(){
  const token=++generation,type=tab==="history"?"history":kind.value;
  list.replaceChildren();status.textContent="A consultar…";
  controls.hidden=tab==="history";
  try{
   const data=await request(type);
   if(token!==generation||!dialog.open)return;
   status.textContent="";
   if(!data.items?.length){list.append(make("p","tm-chat-empty","Sem resultados."));return;}
   if(data.manual_selection)status.textContent="Seleção manual da semana atual e seguinte.";
   for(const item of data.items){
    const row=make("div","tm-chat-inbox-row");
    const details=make("div","tm-chat-inbox-details");
    details.append(make("strong","",item.name));
    if(type==="history"){
     const time=new Date(item.created_at*1000).toLocaleString("pt-PT");
     details.append(make("span","",item.title+" · "+time),
       make("span","",item.sender_name+" · "+(item.read_at?"Lida":"Por ler")+" · Push: "+item.push_status));
    }else{
     const label=item.label||item.match_date||item.last_weigh_date||item.role||"";
     if(label)details.append(make("span","",label));
     const select=make("input");select.type="checkbox";
     select.setAttribute("aria-label","Selecionar "+item.name);
     row.append(select);
    }
    row.append(details);list.append(row);
   }
  }catch(_){if(token===generation)status.textContent="Não foi possível consultar as notificações.";}
 }
 function setTab(next){
  tab=next;
  for(const b of tabs){const on=b.dataset.notifyPreviewTab===next;b.classList.toggle("is-selected",on);b.setAttribute("aria-pressed",String(on));}
  load();
 }
 open.addEventListener("click",()=>{dialog.showModal();setTab("new");});
 close.addEventListener("click",()=>dialog.close());
 dialog.addEventListener("close",()=>{generation++;list.replaceChildren();status.textContent="";});
 kind.addEventListener("change",load);
 for(const b of tabs)b.addEventListener("click",()=>setTab(b.dataset.notifyPreviewTab));
 const observer=new MutationObserver(check);
 observer.observe(workspace,{attributes:true,attributeFilter:["hidden"]});
 check();
})();
