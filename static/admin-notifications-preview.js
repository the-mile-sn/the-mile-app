"use strict";
/* Read-only development preview and confirmation. No timer, polling or delivery. */
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
 const confirmation=$("tm-notify-confirm-controls"),prepareButton=$("tm-notify-prepare");
 const confirmationResult=$("tm-notify-confirm-result"),menuChange=$("tm-notify-menu-change");
 const customFields=$("tm-notify-custom-copy");
 let checked=false,checking=false,generation=0,tab="new",selectionRevision=0;
 const selected=new Map();
 function clearConfirmation(){
  selectionRevision++;
  confirmationResult.replaceChildren();
  prepareButton.disabled=!selected.size;
 }
 function resetSelection(){
  selected.clear();clearConfirmation();
 }
 const customCopy=()=>Object.fromEntries(["pt","en"].map(lang=>[
  lang==="pt"?"pt-PT":"en-GB",
  {title:$("tm-notify-title-"+lang).value,body:$("tm-notify-body-"+lang).value}
 ]));
 async function confirmSelection(){
  if(!selected.size||tab!=="new")return;
  const revision=++selectionRevision, type=kind.value;
  prepareButton.disabled=true;
  confirmationResult.replaceChildren(make("p","tm-chat-empty","A validar seleção…"));
  try{
   const session=await fetch("/api/me",{credentials:"same-origin",cache:"no-store"});
   if(!session.ok)throw Error("session");
   const auth=await session.json();
   const res=await fetch("/api/v2/admin/notifications-prepare",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{Accept:"application/json","Content-Type":"application/json","X-CSRF-Token":auth.csrf||""},
    body:JSON.stringify({kind:type,selections:[...selected.values()].map(item=>({
     recipient_id:item.recipient_id,target_id:item.target_id??null,version:item.version??null
    })),custom_copy:type==="custom"?customCopy():null,menu_change:type==="menu"?menuChange.value:null})
   });
   if(!res.ok)throw Error(String(res.status));
   const data=await res.json();
   if(revision!==selectionRevision||!dialog.open)return;
   confirmationResult.replaceChildren(make("p","tm-chat-empty",data.items.length+" destinatário(s) validado(s)."));
   for(const item of data.items){
    const row=make("div","tm-chat-inbox-row");
    const details=make("div","tm-chat-inbox-details");
    details.append(make("strong","",selected.get(item.recipient_id)?.name||"Destinatário"),
     make("span","",item.language+" · "+item.title),make("span","",item.body));
    row.append(details);confirmationResult.append(row);
   }
  }catch(_){
   if(revision===selectionRevision)confirmationResult.replaceChildren(make("p","tm-chat-empty","Não foi possível validar a seleção. Atualiza os destinatários e verifica os textos."));
  }finally{
   if(revision===selectionRevision)prepareButton.disabled=!selected.size;
  }
 }
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
  resetSelection();list.replaceChildren();status.textContent="A consultar…";
  controls.hidden=tab==="history";confirmation.hidden=tab==="history";
  customFields.hidden=type!=="custom";$("tm-notify-menu-change-field").hidden=type!=="menu";
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
     select.addEventListener("change",()=>{
      if(select.checked){
       for(const other of list.querySelectorAll("input[type=checkbox]")){
        if(other!==select&&other.dataset.recipientId===item.recipient_id)other.checked=false;
       }
       selected.set(item.recipient_id,item);
      }else if(selected.get(item.recipient_id)===item)selected.delete(item.recipient_id);
      clearConfirmation();
     });
     select.dataset.recipientId=item.recipient_id;
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
 dialog.addEventListener("close",()=>{generation++;resetSelection();list.replaceChildren();status.textContent="";});
 kind.addEventListener("change",load);
 prepareButton.addEventListener("click",confirmSelection);
 menuChange.addEventListener("change",clearConfirmation);
 customFields.addEventListener("input",clearConfirmation);
 for(const b of tabs)b.addEventListener("click",()=>setTab(b.dataset.notifyPreviewTab));
 const observer=new MutationObserver(check);
 observer.observe(workspace,{attributes:true,attributeFilter:["hidden"]});
 check();
})();
