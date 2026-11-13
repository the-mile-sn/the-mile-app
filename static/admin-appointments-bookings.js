"use strict";
/* The Mile — internal bookings (phase 4.1).
   These are manual backoffice entries only, with no Sesami/Shopify/Google API.
*/
(()=>{
 const $=id=>document.getElementById(id);
 const endpoint="/api/v2/admin/appointments";
 const state={catalog:{services:[],professionals:[]},bookings:[],editing:null,csrf:null,rangeSequence:0,agendaSequence:0,slotSequence:0,monthSequence:0,month:"",monthDays:new Map(),selectedDate:"",selectedStart:"",visibleSlots:[]};
 const lisbon=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",day:"2-digit",month:"2-digit",year:"numeric"});
 const dayFmt=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short",year:"numeric"});
 const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
 function isoToday(){
  const parts=Object.fromEntries(lisbon.formatToParts(new Date()).map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
 }
 function shift(iso,delta){const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
 function dateLabel(iso){return dayFmt.format(new Date(iso+"T12:00:00Z"));}
 function addOption(select,value,label){const option=make("option","",label);option.value=value;select.append(option);}
 function populate(select,entries,initialLabel,current){
  select.replaceChildren();
  if(initialLabel!==null)addOption(select,"",initialLabel);
  for(const [value,label] of entries)addOption(select,value,label);
  if(current!==undefined&&[...select.options].some(o=>o.value===current))select.value=current;
 }
 function feedback(message,isError=false){
  const node=$("tm-appt-bookings-feedback");
  node.textContent=message||"";node.classList.toggle("is-error",isError);
 }
 const errors={
  invalid_customer_name:"Indica o nome completo do cliente.",
  invalid_customer_email:"Confirma o email do cliente.",
  invalid_customer_phone:"Confirma o telefone do cliente.",
  invalid_professional:"Seleciona um profissional.",
  invalid_service:"Seleciona um serviço.",
  service_not_found:"O serviço já não existe.",
  professional_not_found:"O profissional já não existe.",
  invalid_mode:"Seleciona o formato.",
  invalid_date:"Data inválida.",
  invalid_time:"Hora inválida.",
  invalid_interval:"A consulta não pode terminar depois da meia-noite.",
  invalid_dst_window:"Este horário não é válido na mudança de hora.",
  start_not_on_quarter:"Seleciona um horário múltiplo de 15 minutos.",
  start_must_be_future:"A consulta tem de começar depois da hora atual.",
  outside_booking_window:"Seleciona uma data até 60 dias no futuro.",
  outside_availability:"A consulta não cabe num período disponível publicado.",
  service_not_available:"O serviço ou formato não está ativo para este profissional.",
  blocked_period:"O horário coincide com um bloqueio manual.",
  booking_overlap:"Já existe uma marcação interna sobreposta para este profissional.",
  stale_booking:"Esta marcação foi alterada por outra pessoa. Atualiza a lista e tenta novamente.",
  booking_cancelled:"Esta marcação já está cancelada.",
  booking_not_found:"A marcação não foi encontrada.",
  invalid_range:"O intervalo máximo de pesquisa é de 93 dias.",
  google_busy:"O Google Calendar indica que este período já está ocupado.",
  google_unavailable:"Não foi possível verificar a agenda Google. A marcação não foi gravada para evitar sobreposições.",
  google_needs_reconnection:"A ligação Google precisa de nova autorização. Não foi possível confirmar a vaga.",
  google_not_configured:"A ligação Google precisa de configuração no servidor antes de disponibilizar horários.",
  invalid_month:"Mês inválido.",
  invalid_booking_id:"Esta marcação já não pode ser editada.",
  invalid_status:"O estado selecionado é inválido."
 };
 async function api(path,method="GET",body){
  const headers={Accept:"application/json"};
  if(method!=="GET"){
   if(!state.csrf){
    const result=await fetch("/api/me",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    if(!result.ok)throw Error("Sessão expirada. Entra novamente.");
    const data=await result.json();
    if(data.user?.role!=="admin")throw Error("Acesso reservado ao backoffice.");
    state.csrf=data.csrf;
   }
   headers["X-CSRF-Token"]=state.csrf;
   headers["Content-Type"]="application/json";
  }
  const response=await fetch(endpoint+path,{credentials:"same-origin",cache:"no-store",method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(errors[data.error]||(response.status===401?"A sessão expirou.":"Não foi possível concluir a operação."));
  return data;
 }
 function catalogChanged(data){
  if(!data||!Array.isArray(data.professionals)||!Array.isArray(data.services))return;
  state.catalog=data;
  const p=$("tm-appt-bookings-professional"),s=$("tm-appt-bookings-service");
  populate(p,data.professionals.map(x=>[x.id,x.name]),"Todos",p.value);
  populate(s,data.services.map(x=>[x.id,x.name]),"Todos",s.value);
  refreshBookings().catch(error=>feedback(error.message,true));
 }
 document.addEventListener("tm:appointments-catalog",event=>catalogChanged(event.detail));
 function bookingLine(item,forAgenda=false){
  const card=make("article","tm-appt-booking-record"+(item.status==="cancelled"?" is-cancelled":""));
  const time=make("div","tm-appt-booking-when");
  time.append(make("strong","",item.start+"–"+item.end));
  if(!forAgenda)time.append(make("span","",dateLabel(item.date)));
  const description=make("div","tm-appt-booking-info");
  description.append(make("h4","",item.customer_name));
  description.append(make("p","",item.service_name+" · "+item.professional_name+" · "+(item.mode==="online"?"Online":"Presencial")));
  if(!forAgenda){
   const contacts=[item.customer_email,item.customer_phone].filter(Boolean);
   if(contacts.length)description.append(make("p","tm-appt-booking-contact",contacts.join(" · ")));
  }
  const right=make("div","tm-appt-booking-right");
  right.append(make("span","tm-appt-booking-status"+(item.status==="cancelled"?" is-cancelled":""),item.status==="cancelled"?"Cancelada":"Agendada · Interna"));
  if(!forAgenda){
   right.append(make("span","tm-appt-booking-payment","Pagamento não associado"));
   if(item.status==="scheduled"){
    const actions=make("div","tm-appt-booking-actions");
    const edit=make("button","","Reagendar / editar");
    edit.type="button";edit.addEventListener("click",()=>openForm(item));
    const cancel=make("button","tm-appt-booking-cancel","Cancelar");
    cancel.type="button";cancel.addEventListener("click",()=>cancelBooking(item,cancel));
    actions.append(edit,cancel);right.append(actions);
   }
  }
  card.append(time,description,right);
  return card;
 }
 async function loadList(){
  const sequence=++state.rangeSequence;
  const from=$("tm-appt-bookings-from").value,to=$("tm-appt-bookings-to").value;
  if(!from||!to)return;
  const params=new URLSearchParams({from,to,status:$("tm-appt-bookings-status").value});
  if($("tm-appt-bookings-professional").value)params.set("professional_id",$("tm-appt-bookings-professional").value);
  if($("tm-appt-bookings-service").value)params.set("service_id",$("tm-appt-bookings-service").value);
  const result=await api("/bookings?"+params);
  if(sequence!==state.rangeSequence)return;
  state.bookings=result.bookings||[];
  const list=$("tm-appt-bookings-list");list.replaceChildren();
  $("tm-appt-bookings-count").textContent=state.bookings.length+" marcação(ões)"+(result.truncated?" · lista limitada":"");
  if(!state.bookings.length){
   list.append(make("p","tm-appt-booking-empty","Ainda não existem marcações internas para estes filtros."));
   return;
  }
  for(const item of state.bookings)list.append(bookingLine(item));
 }
 async function loadAgenda(){
  const dates=[...document.querySelectorAll("#tm-appointments-days .tm-appointments-day")].map(n=>n.dataset.date).filter(Boolean);
  if(!dates.length)return;
  const token=++state.agendaSequence;
  const params=new URLSearchParams({from:dates[0],to:dates[dates.length-1],status:"scheduled"});
  const result=await api("/bookings?"+params);
  if(token!==state.agendaSequence)return;
  const bookings=result.bookings||[];
  for(const card of document.querySelectorAll("#tm-appointments-days .tm-appointments-day")){
   card.querySelectorAll(".tm-appt-agenda-count").forEach(el=>el.remove());
   const count=bookings.filter(b=>b.date===card.dataset.date).length;
   if(count)card.append(make("span","tm-appt-agenda-count",count+" marcação(ões)"));
  }
  const feed=$("tm-appt-agenda-list");feed.replaceChildren();
  if(!bookings.length){
   feed.append(make("p","tm-appt-booking-empty","Sem marcações internas neste período."));
   return;
  }
  for(const item of bookings)feed.append(bookingLine(item,true));
 }
 async function refreshBookings(){
  await Promise.all([loadList().catch(error=>feedback(error.message,true)),loadAgenda().catch(error=>feedback(error.message,true))]);
 }
 document.addEventListener("tm:appointments-range",()=>loadAgenda().catch(error=>feedback(error.message,true)));
 function refreshServiceChoices(preferred){
  const pid=$("tm-appt-booking-professional").value;
  const professional=state.catalog.professionals.find(p=>p.id===pid);
  const eligible=state.catalog.services.filter(s=>
   (s.active||state.editing?.service_id===s.id)&&
   (professional?.service_ids?.includes(s.id)||state.editing?.service_id===s.id));
  const select=$("tm-appt-booking-service");
  const current=preferred||select.value;
  populate(select,eligible.map(s=>[s.id,s.name+" · "+s.duration_minutes+" min"]),"Selecionar serviço",current);
  if(!select.value&&eligible.length)select.value=eligible[0].id;
 }
 const monthFormat=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",month:"long",year:"numeric"});
 const monthYear=month=>new Date(month+"-01T12:00:00Z");
 const nextMonth=(month,delta)=>{
  const d=monthYear(month);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);
 };
 function paramsForAvailability(){
  const data={
   professional_id:$("tm-appt-booking-professional").value,
   service_id:$("tm-appt-booking-service").value,
   mode:$("tm-appt-booking-mode").value
  };
  if(state.editing?.id)data.exclude_booking_id=state.editing.id;
  return data;
 }
 function clearTime(message="Seleciona um dia com vagas no calendário."){
  state.selectedStart="";
  state.visibleSlots=[];
  $("tm-appt-booking-start").value="";
  const host=$("tm-appt-time-options");
  host.replaceChildren();host.setAttribute("aria-busy","false");
  $("tm-appt-times-title").textContent="Horários disponíveis";
  $("tm-appt-times-description").textContent=message;
 }
 function updateMonthControls(){
  $("tm-appt-cal-month-title").textContent=monthFormat.format(monthYear(state.month));
  $("tm-appt-cal-prev").disabled=state.month<=isoToday().slice(0,7);
  $("tm-appt-cal-next").disabled=state.month>=shift(isoToday(),60).slice(0,7);
 }
 function renderMonth(){
  const host=$("tm-appt-cal-days");host.replaceChildren();
  const today=isoToday(),max=shift(today,60);
  const first=monthYear(state.month);
  const offset=(first.getUTCDay()+6)%7;
  for(let i=0;i<offset;i++){
   const gap=make("span","tm-appt-cal-spacer");gap.setAttribute("aria-hidden","true");host.append(gap);
  }
  const daysInMonth=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
  let count=0;
  for(let number=1;number<=daysInMonth;number++){
   const iso=state.month+"-"+String(number).padStart(2,"0");
   const cell=state.monthDays.get(iso);
   const available=!!cell?.available && iso>=today && iso<=max;
   if(available)count++;
   const btn=make("button","tm-appt-cal-day"+(available?" is-available":" is-unavailable")+
     (iso===state.selectedDate?" is-selected":"")+(iso===today?" is-today":""),number);
   btn.type="button";btn.disabled=!available;btn.dataset.date=iso;
   btn.setAttribute("aria-pressed",String(iso===state.selectedDate));
   btn.setAttribute("aria-label",dateLabel(iso)+(available?
      ", "+cell.slots_count+" horários disponíveis":", sem horários disponíveis"));
   if(iso===today)btn.setAttribute("aria-current","date");
   if(available)btn.addEventListener("click",()=>chooseDay(iso));
   host.append(btn);
  }
  $("tm-appt-cal-feedback").textContent=count?
    count+" dia"+(count!==1?"s":"")+" com vagas neste mês.":
    "Sem dias com horários disponíveis neste mês para esta seleção.";
 }
 async function loadMonth(preferredDay=null,preferredStart=""){
  const token=++state.monthSequence;
  ++state.slotSequence;
  state.monthDays=new Map();
  updateMonthControls();
  const days=$("tm-appt-cal-days");days.setAttribute("aria-busy","true");
  days.replaceChildren(make("p","tm-appt-cal-loading","A consultar disponibilidades…"));
  $("tm-appt-cal-feedback").textContent="";
  clearTime();
  const params=paramsForAvailability();
  if(!params.professional_id||!params.service_id){
   days.replaceChildren();
   days.setAttribute("aria-busy","false");
   $("tm-appt-cal-feedback").textContent="Seleciona um profissional e um serviço para consultar vagas.";
   return;
  }
  try{
   const result=await api("/calendar-month?"+new URLSearchParams({...params,month:state.month}));
   if(token!==state.monthSequence||!$("tm-appt-booking-dialog").open)return;
   if(!Array.isArray(result.days)||result.month!==state.month)throw Error("Não foi possível validar o mês.");
   state.monthDays=new Map(result.days.map(d=>[d.date,d]));
   days.setAttribute("aria-busy","false");
   const preferred=preferredDay&&state.monthDays.get(preferredDay)?.available?preferredDay:"";
   state.selectedDate=preferred;
   $("tm-appt-booking-date").value=preferred;
   renderMonth();
   if(preferred)await loadSlots(preferredStart);
  }catch(error){
   if(token!==state.monthSequence)return;
   days.setAttribute("aria-busy","false");days.replaceChildren();
   $("tm-appt-cal-feedback").textContent="Não foi possível consultar as disponibilidades. Tenta mudar de mês ou de serviço.";
   $("tm-appt-booking-error").textContent=error.message;
  }
 }
 function chooseDay(iso){
  if(!state.monthDays.get(iso)?.available)return;
  state.selectedDate=iso;
  state.selectedStart="";
  $("tm-appt-booking-date").value=iso;
  $("tm-appt-booking-error").textContent="";
  renderMonth();
  loadSlots().catch(error=>{$("tm-appt-booking-error").textContent=error.message;});
 }
 function renderSlots(){
  const host=$("tm-appt-time-options");host.replaceChildren();
  host.setAttribute("aria-busy","false");
  if(!state.selectedDate){clearTime();return;}
  $("tm-appt-times-title").textContent="Horários · "+dateLabel(state.selectedDate);
  if(!state.visibleSlots.length){
   $("tm-appt-times-description").textContent="Não restam horários neste dia. Seleciona outra data.";
   return;
  }
  $("tm-appt-times-description").textContent="Escolhe a hora de início da consulta.";
  for(const slot of state.visibleSlots){
   const active=state.selectedStart===slot.start;
   const button=make("button","tm-appt-time-button"+(active?" is-selected":""),slot.start);
   button.type="button";button.setAttribute("aria-pressed",String(active));
   button.setAttribute("aria-label",slot.start+" até "+slot.end);
   button.addEventListener("click",()=>{
    state.selectedStart=slot.start;
    $("tm-appt-booking-start").value=slot.start;
    $("tm-appt-booking-error").textContent="";
    renderSlots();
   });
   host.append(button);
  }
 }
 async function loadSlots(preferred=""){
  const token=++state.slotSequence;
  const date=state.selectedDate;
  const host=$("tm-appt-time-options");host.replaceChildren();
  host.setAttribute("aria-busy","true");
  $("tm-appt-times-title").textContent="Horários · "+dateLabel(date);
  $("tm-appt-times-description").textContent="A consultar horários…";
  state.visibleSlots=[];state.selectedStart="";
  $("tm-appt-booking-start").value="";
  try{
   const result=await api("/slots-preview?"+new URLSearchParams({...paramsForAvailability(),date}));
   if(token!==state.slotSequence||date!==state.selectedDate||!$("tm-appt-booking-dialog").open)return;
   state.visibleSlots=result.slots||[];
   if(preferred&&state.visibleSlots.some(slot=>slot.start===preferred)){
    state.selectedStart=preferred;
    $("tm-appt-booking-start").value=preferred;
   }
   renderSlots();
   if(!state.visibleSlots.length){
    // The date may have become full since the month response; refresh it.
    loadMonth().catch(error=>{$("tm-appt-booking-error").textContent=error.message;});
   }
  }catch(error){
   if(token!==state.slotSequence)return;
   host.setAttribute("aria-busy","false");
   $("tm-appt-times-description").textContent="Não foi possível consultar horários.";
   $("tm-appt-booking-error").textContent=error.message;
  }
 }
 function enableForm(openItem){
  state.editing=openItem||null;
  const form=$("tm-appt-booking-form");
  form.reset();
  $("tm-appt-booking-title").textContent=openItem?"Reagendar / editar marcação":"Nova marcação interna";
  $("tm-appt-booking-error").textContent="";
  const people=state.catalog.professionals.filter(p=>p.active||p.id===openItem?.professional_id);
  populate($("tm-appt-booking-professional"),people.map(p=>[p.id,p.name]),"Selecionar profissional",openItem?.professional_id);
  if(!openItem&&people.length)$("tm-appt-booking-professional").value=people[0].id;
  refreshServiceChoices(openItem?.service_id);
  $("tm-appt-booking-mode").value=openItem?.mode||"presencial";
  $("tm-appt-booking-name").value=openItem?.customer_name||"";
  $("tm-appt-booking-email").value=openItem?.customer_email||"";
  $("tm-appt-booking-phone").value=openItem?.customer_phone||"";
  const date=openItem?.date;
  const today=isoToday();
  const allowed=date&&date>=today&&date<=shift(today,60);
  state.month=(allowed?date:today).slice(0,7);
  state.selectedDate="";
  state.selectedStart="";
  $("tm-appt-booking-date").value="";
  $("tm-appt-booking-start").value="";
  clearTime();
  $("tm-appt-booking-dialog").showModal();
  loadMonth(allowed?date:null,allowed?openItem?.start:"")
   .catch(error=>{$("tm-appt-booking-error").textContent=error.message;});
 }
 function openForm(item=null){
  if(!state.catalog.professionals.length||!state.catalog.services.length){
   feedback("Primeiro configura os serviços e profissionais na aba Configuração.",true);
   return;
  }
  enableForm(item);
 }
 $("tm-appt-new-booking").addEventListener("click",()=>openForm());
 for(const button of document.querySelectorAll("[data-close-booking-dialog]"))
  button.addEventListener("click",()=>button.closest("dialog").close());
 $("tm-appt-booking-dialog").addEventListener("close",()=>{
  ++state.monthSequence;++state.slotSequence;
 });
 $("tm-appt-cal-prev").addEventListener("click",()=>{
  if(state.month<=isoToday().slice(0,7))return;
  state.month=nextMonth(state.month,-1);state.selectedDate="";
  $("tm-appt-booking-date").value="";
  loadMonth().catch(error=>{$("tm-appt-booking-error").textContent=error.message;});
 });
 $("tm-appt-cal-next").addEventListener("click",()=>{
  if(state.month>=shift(isoToday(),60).slice(0,7))return;
  state.month=nextMonth(state.month,1);state.selectedDate="";
  $("tm-appt-booking-date").value="";
  loadMonth().catch(error=>{$("tm-appt-booking-error").textContent=error.message;});
 });
 for(const id of ["tm-appt-booking-professional","tm-appt-booking-service","tm-appt-booking-mode"]){
  $(id).addEventListener("change",()=>{
   if(id==="tm-appt-booking-professional")refreshServiceChoices();
   $("tm-appt-booking-error").textContent="";
   state.selectedDate="";state.selectedStart="";
   $("tm-appt-booking-date").value="";
   $("tm-appt-booking-start").value="";
   loadMonth().catch(error=>{$("tm-appt-booking-error").textContent=error.message;});
  });
 }
 $("tm-appt-booking-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  if(!$("tm-appt-booking-date").value||!state.monthDays.get(state.selectedDate)?.available){
   $("tm-appt-booking-error").textContent="Seleciona um dia com horários disponíveis.";
   return;
  }
  if(!$("tm-appt-booking-start").value||!state.visibleSlots.some(s=>s.start===state.selectedStart)){
   $("tm-appt-booking-error").textContent="Seleciona um horário disponível para a consulta.";
   return;
  }
  const button=$("tm-appt-booking-save");
  button.disabled=true;$("tm-appt-booking-error").textContent="";
  try{
   const data={
    professional_id:$("tm-appt-booking-professional").value,
    service_id:$("tm-appt-booking-service").value,
    mode:$("tm-appt-booking-mode").value,
    date:$("tm-appt-booking-date").value,
    start:$("tm-appt-booking-start").value,
    customer_name:$("tm-appt-booking-name").value.trim(),
    customer_email:$("tm-appt-booking-email").value.trim(),
    customer_phone:$("tm-appt-booking-phone").value.trim()
   };
   if(state.editing)data.version=state.editing.version;
   await api("/bookings"+(state.editing?"/"+encodeURIComponent(state.editing.id):""),
     state.editing?"PUT":"POST",data);
   $("tm-appt-booking-dialog").close();
   feedback(state.editing?"Marcação interna atualizada.":"Marcação interna criada.");
   document.dispatchEvent(new CustomEvent("tm:appointments-bookings-updated"));
   await refreshBookings();
  }catch(error){
   $("tm-appt-booking-error").textContent=error.message;
   if(/sobreposta|bloqueio|disponibilidade|alterada/.test(error.message)){
    const date=state.selectedDate;
    await loadMonth(date).catch(()=>{});
    $("tm-appt-booking-error").textContent=error.message;
   }
  }finally{button.disabled=false;}
 });
 async function cancelBooking(item,button){
  if(!confirm("Cancelar a marcação interna de "+item.customer_name+" em "+item.date+" às "+item.start+"? Esta ação não cancela reservas no Sesami nem em Google Calendar."))return;
  button.disabled=true;
  try{
   await api("/bookings/"+encodeURIComponent(item.id)+"/cancel","POST",{version:item.version});
   feedback("Marcação interna cancelada. O horário foi libertado.");
   document.dispatchEvent(new CustomEvent("tm:appointments-bookings-updated"));
   await refreshBookings();
  }catch(error){feedback(error.message,true);button.disabled=false;}
 }
 for(const id of ["tm-appt-bookings-professional","tm-appt-bookings-service","tm-appt-bookings-status",
                  "tm-appt-bookings-from","tm-appt-bookings-to"]){
  $(id).addEventListener("change",()=>loadList().catch(error=>feedback(error.message,true)));
 }
 $("tm-appt-bookings-refresh").addEventListener("click",()=>refreshBookings().catch(error=>feedback(error.message,true)));
 $("tm-appt-bookings-from").value=shift(isoToday(),-7);
 $("tm-appt-bookings-to").value=shift(isoToday(),60);
 if(window.tmAppointmentsCatalog)catalogChanged(window.tmAppointmentsCatalog);
 else refreshBookings().catch(error=>feedback(error.message,true));
})();
