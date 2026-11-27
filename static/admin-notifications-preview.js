"use strict";
/* Manual pilot confirmation. No timer, polling or automatic delivery. */
(()=>{
 const workspace=document.getElementById("admin-workspace");
 const card=document.getElementById("tm-notify-preview-card");
 const dialog=document.getElementById("tm-notify-preview-dialog");
 if(!workspace||!card||!dialog)return;
 const $=id=>document.getElementById(id);
 const open=$("tm-notify-preview-open"),close=$("tm-notify-preview-close");
 const recent=$("tm-notify-recent");
 let recentRevision=0,recentMeasureQueued=false,recentFocusId=null;
 const recentObserver=typeof ResizeObserver==="function"?new ResizeObserver(scheduleRecentMeasure):null;
 const kind=$("tm-notify-preview-kind"),list=$("tm-notify-preview-list");
 const controls=$("tm-notify-preview-controls"),status=$("tm-notify-preview-status");
 const tabs=[...dialog.querySelectorAll("[data-notify-preview-tab]")];
 const confirmation=$("tm-notify-confirm-controls"),prepareButton=$("tm-notify-prepare");
 const confirmationResult=$("tm-notify-confirm-result"),menuChange=$("tm-notify-menu-change");
 const customFields=$("tm-notify-custom-copy");
 const historyRecipient=$("tm-notify-history-recipient"),historyField=$("tm-notify-history-recipient-field");
 const translateButton=$("tm-notify-translate"),translateControls=$("tm-notify-translate-controls");
 const translationStatus=$("tm-notify-translation-status");
 let translating=false,translatedSource=null,reviewNeeded=false;
 const fieldCopy=lang=>({title:$("tm-notify-title-"+lang).value.trim(),body:$("tm-notify-body-"+lang).value.trim()});
 const sourceKey=()=>JSON.stringify(fieldCopy("pt"));
 const needsEnglish=()=>kind.value==="custom"&&[...selected.values()].some(item=>item.language==="en-GB");
 async function translateDraft(){
  if(translating||!needsEnglish()||!dialog.open)return;
  const revision=selectionRevision,source=fieldCopy("pt"),key=sourceKey();
  if(!source.title||!source.body){translationStatus.textContent="Preenche o título e a mensagem.";return;}
  if(!window.tmNotificationTranslation?.supported()){
   translationStatus.textContent="Tradução local indisponível neste navegador. Preenche a versão inglesa.";return;
  }
  translating=true;translateButton.disabled=true;prepareButton.disabled=true;
  translationStatus.textContent="A preparar tradução…";
  try{
   const translated=await window.tmNotificationTranslation.translate(source,"pt-PT","en-GB",progress=>{
    if(dialog.open&&revision===selectionRevision)translationStatus.textContent="A preparar modelo local · "+progress+"%";
   });
   if(!dialog.open||revision!==selectionRevision||key!==sourceKey())return;
   $("tm-notify-title-en").value=translated.title;
   $("tm-notify-body-en").value=translated.body;
   translatedSource=key;reviewNeeded=false;
   translationStatus.textContent="Revê a versão inglesa antes de confirmar.";
   clearConfirmation();
  }catch(_){
   if(dialog.open&&revision===selectionRevision)translationStatus.textContent="Não foi possível traduzir localmente. Podes preencher a versão inglesa.";
  }finally{
   translating=false;
   if(dialog.open)syncCustomFields();
  }
 }

 function syncCustomFields(){
  const locales=new Set([...selected.values()].map(item=>item.language));
  const custom=tab==="new"&&kind.value==="custom";
  customFields.hidden=!custom||!locales.size;
  for(const [code,language,label] of [["pt","pt-PT","Português"],["en","en-GB","Inglês"]]){
   $("tm-notify-copy-"+code).hidden=!custom||!locales.size||(code==="en"&&!locales.has(language));
   $("tm-notify-caption-"+code).textContent=locales.has("en-GB")?"· "+label:"";
  }
  translateControls.hidden=!custom||!locales.has("en-GB");
  translateButton.disabled=translating||!window.tmNotificationTranslation?.supported();
  if(!translateControls.hidden&&!window.tmNotificationTranslation?.supported()){
   translationStatus.textContent="Tradução local indisponível neste navegador. Podes preencher a versão inglesa.";
  }
  prepareButton.disabled=!selected.size||translating||(needsEnglish()&&reviewNeeded);
 }
 let checked=false,checking=false,generation=0,tab="new",selectionRevision=0,sending=false;
 const selected=new Map();
 const recipientDetails=new Map();
 const dateLabel=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split("-").reverse().join("/"):value;
 function removePreview(){
  for(const node of list.querySelectorAll(".tm-notify-inline-preview"))node.remove();
  prepareButton.parentElement.hidden=false;
 }
 function clearConfirmation(){
  selectionRevision++;
  confirmationResult.replaceChildren();
  removePreview();
  prepareButton.disabled=!selected.size;
  syncCustomFields();
  $("tm-notify-menu-change-field").hidden=kind.value!=="menu"||![...selected.values()].some(item=>!item.change_kind);
 }
 function resetSelection(){
  selected.clear();clearConfirmation();
 }
 const customCopy=()=>Object.fromEntries([...new Set([...selected.values()].map(i=>i.language))]
 .filter(locale=>locale==="pt-PT"||locale==="en-GB").map(locale=>{
  const lang=locale==="en-GB"?"en":"pt";
  return [locale,{title:$("tm-notify-title-"+lang).value,body:$("tm-notify-body-"+lang).value}];
 }));
 async function confirmSelection(){
  if(!selected.size||tab!=="new"||translating||(needsEnglish()&&reviewNeeded))return;
  const revision=++selectionRevision, type=kind.value;
  const payload={kind:type,selections:[...selected.values()].map(item=>({
   recipient_id:item.recipient_id,target_id:item.target_id??null,version:item.version??null,manual:item.manual===true
  })),custom_copy:type==="custom"?customCopy():null,menu_change:type==="menu"?menuChange.value:null};

  removePreview();
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
   const data=await res.json();
   if(!res.ok)throw Error(data.error||String(res.status));
   if(revision!==selectionRevision||!dialog.open)return;
   confirmationResult.replaceChildren();
   if(!Array.isArray(data.items)||data.items.length!==selected.size)throw Error("invalid_preview");
   for(const item of data.items){
    const details=recipientDetails.get(selected.get(item.recipient_id));
    if(!details)throw Error("missing_recipient");
    const preview=make("div","tm-notify-inline-preview");
    const language=item.language==="en-GB"?"Inglês":"Português";
    preview.append(make("span","tm-notify-preview-language",language),
     make("strong","tm-notify-preview-message-title",item.title),
     make("p","tm-notify-preview-message-body",item.body));
    details.append(preview);
   }
   prepareButton.parentElement.hidden=true;
   if(data.read_only)confirmationResult.append(make("p","tm-chat-empty","Pré-visualização · envio indisponível."));
   if(!data.read_only&&/^[a-f0-9]{64}$/.test(data.confirmation||"")){
    const requestId=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,"0")).join("");
    const action=make("div","tm-work-dialog-actions");
    const send=make("button","tm-work-save","Confirmar envio");send.type="button";
    const feedback=make("p","tm-chat-empty");
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
       clearConfirmation();
       confirmationResult.replaceChildren(make("p","tm-chat-empty","A seleção mudou. Valida novamente antes de enviar."));
       success=true;return;
      }
      if(!res.ok)throw Error(String(res.status));
      const result=await res.json();
      if(!Array.isArray(result.recorded_ids))throw Error("invalid_response");
      const accepted=Object.values(result.push||{}).filter(x=>x==="accepted").length;
      feedback.textContent=result.recorded_ids.length+" notificação(ões) registada(s). "+accepted+" com push aceite pelo serviço.";
      send.textContent="Registado";success=true;
      refreshRecent();
     }catch(_){
      feedback.textContent="Não foi possível confirmar o resultado. Podes repetir este mesmo pedido sem duplicar o envio, ou consultar o histórico.";
      send.textContent="Verificar / repetir pedido";
     }finally{
      sending=false;
      for(const [el,disabled] of locked)el.disabled=disabled;
      if(success)send.disabled=true;
      if(revision!==selectionRevision)syncCustomFields();
     }
    };
   }
  }catch(error){
   if(revision===selectionRevision){
    removePreview();
    if(error.message==="notification_translation_requires_review"){
     const link=make("a","i18n-link","Rever traduções");
     link.href="/?nav=translations&entity_kind=notification";
     confirmationResult.replaceChildren(make("p","tm-chat-empty","A tradução inglesa desta notificação precisa de aprovação na Central de Traduções."),link);
    }else confirmationResult.replaceChildren(make("p","tm-chat-empty","Não foi possível validar a seleção. Atualiza os destinatários e verifica os textos."));
   }
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
 function resetRecentScroll(){
  recent.classList.remove("is-scrollable");
  recent.style.removeProperty("--tm-notify-recent-max-height");
  recent.removeAttribute("tabindex");recent.removeAttribute("role");recent.removeAttribute("aria-label");
 }
 function scheduleRecentMeasure(){
  if(recentMeasureQueued)return;
  recentMeasureQueued=true;
  requestAnimationFrame(()=>{
   recentMeasureQueued=false;
   if(!recent.offsetWidth)return;
   const rows=[...recent.children].filter(node=>node.classList.contains("tm-db-form-answer"));
   const count=window.matchMedia("(max-width:650px)").matches?2:4;
   resetRecentScroll();
   if(rows.length<=count)return;
   const heights=rows.slice(0,count).map(node=>node.getBoundingClientRect().height);
   if(heights.some(h=>h<=0))return;
   const gap=Number.parseFloat(getComputedStyle(recent).rowGap)||0;
   recent.style.setProperty("--tm-notify-recent-max-height",Math.ceil(heights.reduce((a,b)=>a+b,0)+(count-1)*gap+1)+"px");
   recent.classList.add("is-scrollable");
   recent.tabIndex=0;recent.setAttribute("role","region");recent.setAttribute("aria-label","Notificações recentes; desliza para consultar as restantes");
  });
 }
 window.addEventListener("resize",scheduleRecentMeasure,{passive:true});
 document.fonts?.ready.then(scheduleRecentMeasure);
 async function refreshRecent(){
  if(workspace.hidden||card.hidden)return;
  const rev=++recentRevision;
  try{
   const data=await request("history");
   if(rev!==recentRevision||workspace.hidden||card.hidden)return;
   recentObserver?.disconnect();resetRecentScroll();recent.replaceChildren();recent.scrollTop=0;
   const items=Array.isArray(data.items)?data.items:[];
   if(!items.length)recent.append(make("p","tm-db-none","Sem notificações enviadas."));
   for(const item of items){
    const row=make("button","tm-db-event tm-db-form-answer tm-notify-recent-row");row.type="button";
    const icon=make("span","tm-db-form-icon");
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");
    const p=document.createElementNS("http://www.w3.org/2000/svg","path");
    p.setAttribute("d","M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4");
    svg.append(p);icon.append(svg);
    const details=make("span","tm-db-form-details");
    details.append(make("span","tm-db-form-player",item.name),make("small","tm-db-form-sub",item.title));
    const date=new Date(item.created_at*1000);
    const time=make("time","tm-db-form-time",date.toLocaleDateString("pt-PT",{day:"2-digit",month:"2-digit"}));
    time.dateTime=date.toISOString();
    row.setAttribute("aria-label",item.name+" · "+item.title+" · "+time.textContent+" · Ver histórico");
    row.append(icon,details,time);
    row.addEventListener("click",()=>{recentFocusId=item.id;dialog.showModal();setTab("history");});
    recent.append(row);recentObserver?.observe(row);
   }
   scheduleRecentMeasure();
  }catch(_){
   if(rev===recentRevision&&!workspace.hidden&&!card.hidden){
    recentObserver?.disconnect();resetRecentScroll();recent.replaceChildren(make("p","tm-db-none","Não foi possível consultar as notificações."));
   }
  }
 }
 let configRevision=0;
 async function check(){
  if(workspace.hidden){
   configRevision++;recentRevision++;checked=false;checking=false;card.hidden=true;
   recentFocusId=null;recentObserver?.disconnect();resetRecentScroll();recent.replaceChildren();
   return;
  }
  if(checked||checking)return;
  checking=true;const rev=++configRevision;
  try{
   const data=await request("config");
   if(rev!==configRevision||workspace.hidden)return;
   checked=true;card.hidden=data.enabled!==true;
   if(!card.hidden)refreshRecent();
  }catch(_){if(rev===configRevision)card.hidden=true;}
  finally{if(rev===configRevision)checking=false;}
 }
 async function load(){
  const token=++generation,type=tab==="history"?"history":kind.value;
  resetSelection();recipientDetails.clear();list.replaceChildren();status.textContent="A consultar…";
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
     row.dataset.notificationId=item.id;
     const time=new Date(item.created_at*1000).toLocaleString("pt-PT");
     details.append(make("span","",item.title+" · "+time),
       make("span","",item.sender_name+" · "+(item.read_at?"Lida":"Por ler")+" · Push: "+item.push_status));
    }else{
     const label=item.label||item.match_date||item.last_weigh_date||item.role||"";
     if(label)details.append(make("span","",dateLabel(label)));
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
    if(type!=="history")recipientDetails.set(item,details);
   }
   if(type==="history"&&recentFocusId){
    const focused=[...list.children].find(row=>row.dataset.notificationId===recentFocusId);
    recentFocusId=null;
    focused?.scrollIntoView({block:"nearest"});
   }
  }catch(_){if(token===generation)status.textContent="Não foi possível consultar as notificações.";}
 }
 function setTab(next){
  tab=next;historyRecipient.value="";
  if(next!=="history")recentFocusId=null;
  for(const b of tabs){const on=b.dataset.notifyPreviewTab===next;b.classList.toggle("is-selected",on);b.setAttribute("aria-pressed",String(on));}
  load();
 }
 open.addEventListener("click",()=>{dialog.showModal();setTab("history");});
 $("tm-notify-add").addEventListener("click",()=>{dialog.showModal();setTab("new");});
 close.addEventListener("click",()=>{if(!sending)dialog.close();});
 dialog.addEventListener("cancel",e=>{if(sending)e.preventDefault();});
 dialog.addEventListener("close",()=>{
  generation++;recentFocusId=null;refreshRecent();translatedSource=null;reviewNeeded=false;translationStatus.textContent="";resetSelection();recipientDetails.clear();list.replaceChildren();status.textContent="";
  for(const lang of ["pt","en"]){$("tm-notify-title-"+lang).value="";$("tm-notify-body-"+lang).value="";}
 });
 kind.addEventListener("change",()=>{historyRecipient.value="";load();});
 historyRecipient.addEventListener("change",load);
 prepareButton.addEventListener("click",confirmSelection);
 menuChange.addEventListener("change",clearConfirmation);
 customFields.addEventListener("input",e=>{
  if(e.target.id==="tm-notify-title-pt"||e.target.id==="tm-notify-body-pt"){
   if(translatedSource!==null&&translatedSource!==sourceKey()){
    reviewNeeded=true;
    translationStatus.textContent="O original mudou. Atualiza ou revê a tradução inglesa.";
   }
  }else if(e.target.id==="tm-notify-title-en"||e.target.id==="tm-notify-body-en"){
   translatedSource=sourceKey();reviewNeeded=false;
   translationStatus.textContent="Revê a versão inglesa antes de confirmar.";
  }
  clearConfirmation();
 });
 translateButton.addEventListener("click",translateDraft);
 for(const b of tabs)b.addEventListener("click",()=>setTab(b.dataset.notifyPreviewTab));
 const observer=new MutationObserver(check);
 observer.observe(workspace,{attributes:true,attributeFilter:["hidden"]});
 check();
})();
