"use strict";
/* The Mile bookings — organization-scoped internal availability planner (phase 3).
   All real schedule data is stored server-side; previews are NOT bookable.
*/
(()=>{
 const $=id=>document.getElementById(id);
 const endpoint="/api/v2/admin/appointments";
 const nowLisbon=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",day:"2-digit",month:"2-digit",year:"numeric"});
 const dateFormat=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"});
 const rangeFormat=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"});
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const isoDate=d=>d.toISOString().slice(0,10);
 const utc=iso=>new Date(iso+"T12:00:00Z");
 const shift=(iso,n)=>{const d=utc(iso);d.setUTCDate(d.getUTCDate()+n);return isoDate(d);};
 const monday=iso=>shift(iso,-((utc(iso).getUTCDay()+6)%7));
 function today(){
  const parts=Object.fromEntries(nowLisbon.formatToParts(new Date()).map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
 }
 const state={catalog:{services:[],professionals:[]},professionalId:"",selectedDate:today(),weekStart:monday(today()),data:{availability:[],blocks:[]},periodType:"availability",seq:0,csrf:null};
 const errors={invalid_date:"Data inválida.",invalid_time:"Confirma as horas.",invalid_interval:"A hora de fim tem de ser posterior ao início.",invalid_professional:"Seleciona um profissional.",professional_not_found:"O profissional não foi encontrado.",overlapping_period:"Já existe um período sobreposto neste dia. Edita ou remove primeiro o período existente.",invalid_range:"Intervalo de datas inválido.",invalid_days:"Só é possível copiar um dia ou uma semana.",same_date:"Escolhe uma data de destino diferente.",week_starts_monday:"Para copiar uma semana, seleciona a segunda-feira de origem e de destino.",period_not_found:"Este período já foi removido.",service_not_found:"O serviço selecionado não existe."};
 async function api(url,method="GET",body){
  const headers={Accept:"application/json"};
  if(method!=="GET"){
   if(!state.csrf){
    const session=await fetch("/api/me",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    if(!session.ok)throw Error("Sessão expirada. Inicia sessão novamente.");
    const data=await session.json();
    if(data.user?.role!=="admin")throw Error("Acesso reservado a administradores.");
    state.csrf=data.csrf;
   }
   headers["X-CSRF-Token"]=state.csrf;headers["Content-Type"]="application/json";
  }
  const response=await fetch(url,{method,credentials:"same-origin",cache:"no-store",headers,...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(errors[data.error]||"Não foi possível concluir a operação.");
  return data;
 }
 function professional(){
  return state.catalog.professionals.find(p=>p.id===state.professionalId);
 }
 function note(message,bad=false){
  const target=$("tm-appt-avail-feedback");target.textContent=message||"";target.classList.toggle("is-error",bad);
 }
 function setControls(){
  const disabled=!state.professionalId;
  for(const id of ["tm-appt-add-availability","tm-appt-add-block","tm-appt-copy-day","tm-appt-copy-week","tm-appt-preview-run"]){
   $(id).disabled=disabled;
  }
 }
 function option(select,value,label){
  const node=el("option","",label);node.value=value;select.append(node);
 }
 function syncCatalog(catalog){
  state.catalog=catalog;
  const select=$("tm-appt-avail-professional");
  const previous=state.professionalId;
  select.replaceChildren();option(select,"","Selecionar profissional");
  for(const p of catalog.professionals)option(select,p.id,p.name+(p.active?"":" (inativo)"));
  state.professionalId=catalog.professionals.some(p=>p.id===previous)?previous:
   (catalog.professionals.find(p=>p.active)?.id||catalog.professionals[0]?.id||"");
  select.value=state.professionalId;
  const service=$("tm-appt-preview-service");
  const before=service.value;service.replaceChildren();
  for(const s of catalog.services)option(service,s.id,s.name+" · "+s.duration_minutes+" min"+(s.active?"":" (inativo)"));
  const own=professional()?.service_ids||[];
  service.value=catalog.services.some(s=>s.id===before)?before:
    (catalog.services.find(s=>s.active&&own.includes(s.id))?.id||catalog.services[0]?.id||"");
  if(!state.professionalId)$("tm-appt-avail-week").replaceChildren(el("p","tm-appt-placeholder","Adiciona um profissional na Configuração para publicar disponibilidades."));
  setControls();
  loadWeek().catch(error=>note(error.message,true));
 }
 document.addEventListener("tm:appointments-catalog",event=>syncCatalog(event.detail));
 async function loadWeek(){
  const token=++state.seq;
  const mondayDay=state.weekStart,last=shift(mondayDay,6);
  $("tm-appt-avail-week-title").textContent=rangeFormat.format(utc(mondayDay))+" – "+rangeFormat.format(utc(last));
  if(!state.professionalId){$("tm-appt-avail-week").replaceChildren(el("p","tm-appt-placeholder","Seleciona um profissional."));return;}
  const params=new URLSearchParams({professional_id:state.professionalId,from:mondayDay,to:last});
  const data=await api(endpoint+"/schedule?"+params);
  if(token!==state.seq)return;
  state.data=data;
  renderWeek();
 }
 function renderWeek(){
  const host=$("tm-appt-avail-week");host.replaceChildren();
  for(let i=0;i<7;i++){
   const day=shift(state.weekStart,i);
   const panel=el("section","tm-appt-day-card"+(day===state.selectedDate?" is-selected":""));
   const title=el("button","tm-appt-day-title");
   title.type="button";title.setAttribute("aria-pressed",String(day===state.selectedDate));
   title.textContent=dateFormat.format(utc(day));
   title.addEventListener("click",()=>{state.selectedDate=day;$("tm-appt-preview-date").value=day;renderWeek();preview().catch(e=>showPreview(e.message,true));});
   panel.append(title);
   const ava=state.data.availability.filter(item=>item.date===day);
   const blocks=state.data.blocks.filter(item=>item.date===day);
   if(!ava.length&&!blocks.length)panel.append(el("p","tm-appt-day-empty","Sem períodos definidos"));
   for(const [kind,items] of [["availability",ava],["block",blocks]]){
    for(const item of items){
     const line=el("div","tm-appt-period-row "+(kind==="block"?"is-block":"is-available"));
     const text=el("div","tm-appt-period-description");
     text.append(el("span","tm-appt-period-type",kind==="block"?"Bloqueio":"Disponível"));
     text.append(el("strong","",item.start+"–"+item.end));
     if(item.note)text.append(el("small","",item.note));
     const remove=el("button","tm-appt-period-delete","×");
     remove.type="button";remove.title="Remover período";remove.setAttribute("aria-label","Remover "+(kind==="block"?"bloqueio":"disponibilidade")+" "+item.start+"–"+item.end);
     remove.addEventListener("click",()=>removePeriod(kind,item));
     line.append(text,remove);panel.append(line);
    }
   }
   const actions=el("div","tm-appt-day-actions");
   const add=el("button","","+ Horário");add.type="button";add.addEventListener("click",()=>openPeriod("availability",day));
   const block=el("button","","Bloquear");block.type="button";block.addEventListener("click",()=>openPeriod("block",day));
   actions.append(add,block);panel.append(actions);host.append(panel);
  }
 }
 async function removePeriod(kind,item){
  if(!confirm("Remover "+(kind==="block"?"bloqueio":"disponibilidade")+" de "+item.date+" ("+item.start+"–"+item.end+")?"))return;
  try{
   await api(endpoint+"/"+(kind==="block"?"blocks":"availability")+"/"+encodeURIComponent(item.id),"DELETE",{});
   note("Período removido.");
   await loadWeek();
   await preview();
  }catch(error){note(error.message,true);}
 }
 function openPeriod(kind,day){
  if(!state.professionalId){note("Seleciona primeiro um profissional.",true);return;}
  state.periodType=kind;
  $("tm-appt-period-form").reset();
  $("tm-appt-period-title").textContent=kind==="block"?"Novo bloqueio":"Nova disponibilidade";
  $("tm-appt-period-professional").textContent=professional()?.name||"";
  $("tm-appt-period-date").value=day||state.selectedDate;
  $("tm-appt-period-start").value=kind==="block"?"12:00":"09:00";
  $("tm-appt-period-end").value=kind==="block"?"13:00":"13:00";
  $("tm-appt-period-note").value="";
  $("tm-appt-period-error").textContent="";
  $("tm-appt-period-all-day-input").checked=false;
  $("tm-appt-period-time-fields").hidden=false;
  $("tm-appt-period-all-day-input").closest("label").hidden=kind!=="block";
  $("tm-appt-period-note").closest("label").hidden=kind!=="block";
  $("tm-appt-period-dialog").showModal();
 }
 $("tm-appt-period-all-day-input").addEventListener("change",e=>{
  $("tm-appt-period-time-fields").hidden=e.currentTarget.checked;
 });
 $("tm-appt-period-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const button=form.querySelector('[type="submit"]');
  button.disabled=true;$("tm-appt-period-error").textContent="";
  try{
   const all=state.periodType==="block"&&$("tm-appt-period-all-day-input").checked;
   const data={professional_id:state.professionalId,
    date:$("tm-appt-period-date").value,
    start:all?"00:00":$("tm-appt-period-start").value,
    end:all?"24:00":$("tm-appt-period-end").value};
   if(state.periodType==="block")data.note=$("tm-appt-period-note").value;
   await api(endpoint+"/"+(state.periodType==="block"?"blocks":"availability"),"POST",data);
   const chosen=data.date;
   $("tm-appt-period-dialog").close();
   state.selectedDate=chosen;state.weekStart=monday(chosen);
   $("tm-appt-preview-date").value=chosen;
   note(state.periodType==="block"?"Bloqueio guardado.":"Disponibilidade guardada.");
   await loadWeek();await preview();
  }catch(error){$("tm-appt-period-error").textContent=error.message;}
  finally{button.disabled=false;}
 });
 function openCopy(days){
  if(!state.professionalId){note("Seleciona primeiro um profissional.",true);return;}
  $("tm-appt-copy-form").reset();
  $("tm-appt-copy-days").value=String(days);
  $("tm-appt-copy-title").textContent=days===7?"Copiar semana":"Copiar dia";
  const source=days===7?state.weekStart:state.selectedDate;
  $("tm-appt-copy-source").value=source;
  $("tm-appt-copy-target").value=shift(source,days===7?7:1);
  $("tm-appt-copy-error").textContent="";
  $("tm-appt-copy-dialog").showModal();
 }
 $("tm-appt-copy-day").addEventListener("click",()=>openCopy(1));
 $("tm-appt-copy-week").addEventListener("click",()=>openCopy(7));
 $("tm-appt-copy-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('[type="submit"]');
  button.disabled=true;$("tm-appt-copy-error").textContent="";
  try{
   const days=Number($("tm-appt-copy-days").value);
   const target=$("tm-appt-copy-target").value;
   const result=await api(endpoint+"/availability/copy","POST",{
    professional_id:state.professionalId,
    source_date:$("tm-appt-copy-source").value,
    target_date:target,days});
   $("tm-appt-copy-dialog").close();
   state.selectedDate=target;state.weekStart=monday(target);
   $("tm-appt-preview-date").value=target;
   note(result.created+" período(s) copiado(s)"+(result.skipped?" · "+result.skipped+" já existentes":"")+".");
   await loadWeek();await preview();
  }catch(error){$("tm-appt-copy-error").textContent=error.message;}
  finally{button.disabled=false;}
 });
 for(const btn of document.querySelectorAll("#tm-appt-period-dialog [data-close-appointment-dialog],#tm-appt-copy-dialog [data-close-appointment-dialog]")){
  btn.addEventListener("click",()=>btn.closest("dialog").close());
 }
 function showPreview(message,error){
  const host=$("tm-appt-preview-result");host.replaceChildren(el("p",error?"tm-appt-form-error":"tm-appt-muted",message));
 }
 async function preview(){
  const service=$("tm-appt-preview-service").value,mode=$("tm-appt-preview-mode").value,day=$("tm-appt-preview-date").value;
  if(!state.professionalId||!service||!day){showPreview("Seleciona profissional, serviço e dia.");return;}
  try{
   const params=new URLSearchParams({professional_id:state.professionalId,service_id:service,mode,date:day});
   const result=await api(endpoint+"/slots-preview?"+params);
   const host=$("tm-appt-preview-result");host.replaceChildren();
   if(!result.slots?.length){
    const msg=result.reason==="outside_booking_window"?"Dia fora da janela de marcação (hoje + 60 dias).":
     result.reason==="service_not_available"?"O serviço ou formato não está ativo para este profissional.":
     "Sem horários possíveis para a duração selecionada e os bloqueios publicados.";
    showPreview(msg);return;
   }
   const chips=el("div","tm-appt-preview-slots");
   for(const slot of result.slots)chips.append(el("span","tm-appt-slot-chip",slot.start+"–"+slot.end));
   host.append(chips,el("p","tm-appt-form-hint",result.slots.length+" horário(s) potenciais. Não incluem ocupações do Google Calendar nem marcações do Sesami."));
  }catch(error){showPreview(error.message,true);}
 }
 $("tm-appt-preview-run").addEventListener("click",preview);
 $("tm-appt-preview-mode").addEventListener("change",preview);
 $("tm-appt-preview-service").addEventListener("change",preview);
 $("tm-appt-preview-date").addEventListener("change",event=>{state.selectedDate=event.target.value;if(state.selectedDate){state.weekStart=monday(state.selectedDate);loadWeek().catch(e=>note(e.message,true));}preview();});
 $("tm-appt-add-availability").addEventListener("click",()=>openPeriod("availability",state.selectedDate));
 $("tm-appt-add-block").addEventListener("click",()=>openPeriod("block",state.selectedDate));
 $("tm-appt-avail-professional").addEventListener("change",event=>{state.professionalId=event.target.value;setControls();loadWeek().catch(e=>note(e.message,true));preview();});
 $("tm-appt-avail-today").addEventListener("click",()=>{state.selectedDate=today();state.weekStart=monday(state.selectedDate);$("tm-appt-preview-date").value=state.selectedDate;loadWeek().catch(e=>note(e.message,true));preview();});
 $("tm-appt-avail-prev").addEventListener("click",()=>{state.weekStart=shift(state.weekStart,-7);state.selectedDate=state.weekStart;$("tm-appt-preview-date").value=state.selectedDate;loadWeek().catch(e=>note(e.message,true));preview();});
 $("tm-appt-avail-next").addEventListener("click",()=>{state.weekStart=shift(state.weekStart,7);state.selectedDate=state.weekStart;$("tm-appt-preview-date").value=state.selectedDate;loadWeek().catch(e=>note(e.message,true));preview();});
 $("tm-appt-preview-date").value=state.selectedDate;
 setControls();
})();
