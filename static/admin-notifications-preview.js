"use strict";
/* Manual pilot confirmation. No timer, polling or automatic delivery. */
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
 const historyRecipient=$("tm-notify-history-recipient"),historyField=$("tm-notify-history-recipient-field");
 function syncCustomFields(){
  const locales=new Set([...selected.values()].map(item=>item.language));
  const custom=tab==="new"&&kind.value==="custom";
  customFields.hidden=!custom||!locales.size;
  for(const [code,language,label] of [["pt","pt-PT","Português"],["en","en-GB","Inglês"]]){
   $("tm-notify-copy-"+code).hidden=!custom||!locales.has(language);
   $("tm-notify-caption-"+code).textContent=locales.size>1?"· "+label:"";
  }
 }
 let checked=false,checking=false,generation=0,tab="new",selectionRevision=0,sending=false;
 const selected=new Map();
 function clearConfirmation(){
  selectionRevision++;
  confirmationResult.replaceChildren();
  prepareButton.disabled=!selected.size;
  syncCustomFields();
  $("tm-notify-menu-change-field").hidden=kind.value!=="menu"||![...selected.values()].some(item=>!item.change_kind);
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
  const payload={kind:type,selections:[...selected.values()].map(item=>({
   recipient_id:item.recipient_id,target_id:item.target_id??null,version:item.version??null,manual:item.manual===true
  })),custom_copy:type==="custom"?customCopy():null,menu_change:type==="menu"?menuChange.value:null};

  prepareButton.disabled=true;
  confirmationResult.replaceChildren(make("p","tm-chat-empty","A validar seleção…"));
  try{
   const session=await fetch("/api/me",{credentials:"same-origin",cache:"no-store"});
   if(!session.ok)throw Error("session");
   const auth=await session.json();
   const res=await fetch("/api/v2/admin/notifications-prepare",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{Accept:"application/json","Content-Type":"application/json","X-CSRF-Token":auth.csrf||""},
    body:JSON.stringify(payload)
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
   if(!data.read_only&&/^[a-f0-9]{64}$/.test(data.confirmation||"")){
    const requestId=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,"0")).join("");
    const action=make("div","tm-work-dialog-actions");
    const send=make("button","tm-work-save","Confirmar envio");send.type="button";
    const feedback=make("p","tm-chat-empty","Envio limitado às contas de teste autorizadas.");
    action.append(send);confirmationResult.append(action,feedback);
    send.onclick=async()=>{
     if(sending||revision!==selectionRevision||!dialog.open)return;
     sending=true;
     const locked=[...dialog.querySelectorAll("button,input,select,textarea")].map(el=>[el,el.disabled]);
     for(const [el] of locked)el.disabled=true;
     feedback.textContent="A registar notificações…";
     let success=false;
     try{
      const res=await fetch("/api/v2/admin/notifications-send",{
       method:"POST",credentials:"same-origin",cache:"no-store",
       headers:{Accept:"application/json","Content-Type":"application/json","X-CSRF-Token":auth.csrf||""},
       body:JSON.stringify({...payload,request_id:requestId,confirmation:data.confirmation})
      });
      if(res.status===409){
       feedback.textContent="A seleção mudou. Valida novamente antes de enviar.";
       success=true;return;
      }
      if(!res.ok)throw Error(String(res.status));
      const result=await res.json();
      if(!Array.isArray(result.recorded_ids))throw Error("invalid_response");
      const accepted=Object.values(result.push||{}).filter(x=>x==="accepted").length;
      feedback.textContent=result.recorded_ids.length+" notificação(ões) registada(s). "+accepted+" com push aceite pelo serviço.";
      send.textContent="Registado";success=true;
     }catch(_){
      feedback.textContent="Não foi possível confirmar o resultado. Podes repetir este mesmo pedido sem duplicar o envio, ou consultar o histórico.";
      send.textContent="Verificar / repetir pedido";
     }finally{
      sending=false;
      for(const [el,disabled] of locked)el.disabled=disabled;
      if(success)send.disabled=true;
     }
    };
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
 async function request(type,recipient=null){
  const query=new URLSearchParams({kind:type});
  if(recipient)query.set("recipient",recipient);
  const res=await fetch("/api/v2/admin/notifications-preview?"+query.toString(),
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
  customFields.hidden=true;$("tm-notify-menu-change-field").hidden=true;
  const historical=type==="document"||type==="assessment";
  historyField.hidden=!historical;
  const chosen=historical?historyRecipient.value:null;
  try{
   const data=await request(type,chosen);
   if(token!==generation||!dialog.open)return;
   status.textContent="";
   if(historical){
    historyRecipient.replaceChildren(new Option("Alterações recentes",""));
    for(const player of data.players||[])historyRecipient.append(new Option(player.name,player.recipient_id));
    historyRecipient.value=chosen||"";
   }
   if(!data.items?.length){list.append(make("p","tm-chat-empty","Sem resultados."));return;}
   if(data.manual_selection)status.textContent="Os menus sem alteração confirmada estão identificados como seleção manual.";
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
     if(type==="custom"&&item.language)details.append(make("span","",item.language==="en-GB"?"Inglês":"Português"));
     if(type==="menu"||type==="document"||type==="assessment"){
      if(item.change_kind)details.append(make("span","",({new:"Novo",updated:"Atualizado",available:"Disponível"})[item.change_kind]||"Seleção manual"));
      else if(type==="menu")details.append(make("span","","Seleção manual"));
     }
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
  tab=next;historyRecipient.value="";
  for(const b of tabs){const on=b.dataset.notifyPreviewTab===next;b.classList.toggle("is-selected",on);b.setAttribute("aria-pressed",String(on));}
  load();
 }
 open.addEventListener("click",()=>{dialog.showModal();setTab("new");});
 close.addEventListener("click",()=>{if(!sending)dialog.close();});
 dialog.addEventListener("cancel",e=>{if(sending)e.preventDefault();});
 dialog.addEventListener("close",()=>{generation++;resetSelection();list.replaceChildren();status.textContent="";});
 kind.addEventListener("change",()=>{historyRecipient.value="";load();});
 historyRecipient.addEventListener("change",load);
 prepareButton.addEventListener("click",confirmSelection);
 menuChange.addEventListener("change",clearConfirmation);
 customFields.addEventListener("input",clearConfirmation);
 for(const b of tabs)b.addEventListener("click",()=>setTab(b.dataset.notifyPreviewTab));
 const observer=new MutationObserver(check);
 observer.observe(workspace,{attributes:true,attributeFilter:["hidden"]});
 check();
})();
