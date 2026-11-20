"use strict";
/* Internal admin events and tasks. Separate from customer bookings and player planning.
   The same controller powers Agendamentos and the compact Dashboard sidebar. */
(()=>{
 const $=id=>document.getElementById(id);
 const page=$("tm-appointments-root"),dashboard=$("tm-dashboard");
 if(!page&&!dashboard)return;
 const API="/api/v2/admin/work";
 let me=null,admins=null,events=[],tasks=[],editingEvent=null,editingTask=null;
 let eventRequest=0,taskRequest=0,dashRequest=0;
 const labels={meeting:"Reunião",training:"Formação",travel:"Deslocação",other:"Evento"};
 const dateFormat=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"});
 const todayFormatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"});
 const make=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=String(text);
  return node;
 };
 function today(){
  const parts=Object.fromEntries(todayFormatter.formatToParts(new Date()).map(part=>[part.type,part.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
 }
 const readable=iso=>iso?dateFormat.format(new Date(iso+"T12:00:00Z")):"Sem prazo";
 async function session(){
  if(me)return me;
  const response=await fetch("/api/me",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("Inicia sessão para continuar.");
  const data=await response.json();
  if(data.user?.role!=="admin"||!data.csrf)throw Error("Acesso reservado à equipa do backoffice.");
  me={id:data.user.id,csrf:data.csrf};return me;
 }
 async function api(path,method="GET",payload){
  const headers={Accept:"application/json"};
  if(method!=="GET"){
   const user=await session();
   headers["Content-Type"]="application/json";
   headers["X-CSRF-Token"]=user.csrf;
  }
  const response=await fetch(API+path,{
   method,headers,credentials:"same-origin",cache:"no-store",
   ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const errors={
    invalid_date:"Escolhe uma data válida.",invalid_range:"Intervalo de datas inválido.",
    invalid_time:"Indica horas válidas.",invalid_interval:"A hora de fim deve ser posterior ao início.",
    invalid_title:"Indica um título válido (máximo de 120 caracteres).",
    invalid_responsible:"Seleciona um responsável ativo.",
    invalid_version:"O registo precisa de ser atualizado.",
    stale_record:"Este registo foi alterado noutra sessão. Atualiza a lista antes de guardar.",
    event_not_found:"O evento já não está disponível.",task_not_found:"A tarefa já não está disponível."
   };
   throw Error(errors[data.error]||(response.status===401?"Sessão expirada. Volta a iniciar sessão.":response.status===403?"Não tens permissão para esta ação.":"Não foi possível guardar. Tenta novamente."));
  }
  return data;
 }
 async function loadAdmins(){
  const [user,response]=await Promise.all([session(),admins?Promise.resolve({admins}):api("/admins")]);
  admins=response.admins||[];
  return user;
 }
 function fillResponsible(select,chosen){
  select.replaceChildren();
  for(const item of admins||[]){
   const opt=make("option","",item.name);opt.value=item.id;select.append(opt);
  }
  select.value=chosen&&admins.some(x=>x.id===chosen)?chosen:me.id;
 }
 function showError(id,error){
  const field=$(id);
  if(!field)return;
  field.textContent=(error==null||error==="")?"":String(error?.message||error||"Erro desconhecido.");
 }
 function dateInPage(){
  return document.querySelector("#tm-appointments-days .tm-appointments-day.is-selected")?.dataset.date||
   new URLSearchParams(location.search).get("date")||today();
 }
 function formPayloadEvent(){
  return {
   date:$("tm-work-event-date").value,start:$("tm-work-event-start").value,
   end:$("tm-work-event-end").value,kind:$("tm-work-event-kind").value,
   title:$("tm-work-event-title").value,
   description:$("tm-work-event-description").value,
   participants:$("tm-work-event-participants").value,
   responsible_id:$("tm-work-event-responsible").value
  };
 }
 function formPayloadTask(){
  return {
   title:$("tm-work-task-title").value,
   description:$("tm-work-task-description").value,
   due_date:$("tm-work-task-date").value||null,
   status:$("tm-work-task-status").value,
   responsible_id:$("tm-work-task-responsible").value
  };
 }
 async function openEvent(item=null){
  showError("tm-work-event-error","");
  try{await loadAdmins();}catch(error){showError("tm-work-event-error",error);return;}
  editingEvent=item;
  $("tm-work-event-heading").textContent=item?"Editar evento":"Novo evento";
  $("tm-work-event-title").value=item?.title||"";
  $("tm-work-event-date").value=item?.event_date||dateInPage();
  $("tm-work-event-start").value=item?.starts_at||"09:00";
  $("tm-work-event-end").value=item?.ends_at||"10:00";
  $("tm-work-event-kind").value=item?.kind||"meeting";
  $("tm-work-event-participants").value=item?.participants||"";
  $("tm-work-event-description").value=item?.description||"";
  fillResponsible($("tm-work-event-responsible"),item?.responsible_id);
  $("tm-work-event-delete").hidden=!item;
  $("tm-work-event-dialog").showModal();
  $("tm-work-event-title").focus();
 }
 async function openTask(item=null,defaultDueDate=""){
  showError("tm-work-task-error","");
  try{await loadAdmins();}catch(error){showError("tm-work-task-error",error);return;}
  editingTask=item;
  $("tm-work-task-heading").textContent=item?"Editar tarefa":"Nova tarefa";
  $("tm-work-task-title").value=item?.title||"";
  $("tm-work-task-description").value=item?.description||"";
  $("tm-work-task-date").value=item?.due_date||defaultDueDate;
  $("tm-work-task-status").value=item?.status||"open";
  fillResponsible($("tm-work-task-responsible"),item?.responsible_id);
  $("tm-work-task-delete").hidden=!item;
  $("tm-work-task-dialog").showModal();
  $("tm-work-task-title").focus();
 }
 function taskBody(item,status){
  return {
   version:item.version,title:item.title,description:item.description,
   due_date:item.due_date,status:status||item.status,responsible_id:item.responsible_id
  };
 }
 function eventRow(item){
  const row=make("article","tm-work-line");
  const copy=make("div","tm-work-line-copy");
  const subtitle=[labels[item.kind]||"Evento",item.starts_at+"–"+item.ends_at,
   item.participants,item.responsible_name].filter(Boolean).join(" · ");
  copy.append(make("strong","tm-work-line-title",item.title),
   make("span","tm-work-line-details",subtitle));
  const actions=make("div","tm-work-line-actions");
  const edit=make("button","tm-work-line-action","Editar");edit.type="button";
  edit.setAttribute("aria-label","Editar evento "+item.title);
  edit.addEventListener("click",()=>openEvent(item));
  actions.append(edit);
  row.append(copy,actions);return row;
 }
 function taskRow(item){
  const row=make("article","tm-work-line");
  const copy=make("div","tm-work-line-copy");
  const subtitle=[item.due_date?readable(item.due_date):"Sem prazo",item.responsible_name].filter(Boolean).join(" · ");
  const title=make("strong","tm-work-line-title",item.title);
  if(item.status==="done")title.style.textDecoration="line-through";
  const details=make("span","tm-work-line-details",subtitle);
  if(item.status==="open"&&item.due_date&&item.due_date<today())details.classList.add("tm-work-overdue");
  copy.append(title,details);
  if(item.description)copy.append(make("span","tm-work-line-details",item.description));
  const actions=make("div","tm-work-line-actions");
  const status=make("span","tm-work-task-state "+(item.status==="done"?"is-done":"is-open"),item.status==="done"?"Concluída":"Por fazer");
  actions.append(status);
  const toggle=make("button","tm-work-line-action",item.status==="done"?"Reabrir":"Concluir");
  toggle.type="button";
  toggle.addEventListener("click",async()=>{
   toggle.disabled=true;
   try{
    await api("/tasks/"+encodeURIComponent(item.id),"PUT",taskBody(item,item.status==="done"?"open":"done"));
    await Promise.all([refreshTasks(),refreshDashboardTasks()]);
   }catch(error){$("tm-work-task-list").prepend(make("p","tm-work-empty",error.message));}
   finally{toggle.disabled=false;}
  });
  const edit=make("button","tm-work-line-action","Editar");edit.type="button";
  edit.addEventListener("click",()=>openTask(item));
  actions.append(toggle,edit);
  row.append(copy,actions);return row;
 }
 function selectedDates(){
  return [...document.querySelectorAll("#tm-appointments-days .tm-appointments-day")].map(x=>x.dataset.date).filter(Boolean);
 }
 async function refreshEvents(){
  if(!page)return;
  const dates=selectedDates();
  if(!dates.length)return;
  const token=++eventRequest;
  const list=$("tm-work-agenda-list");
  list.replaceChildren(make("p","tm-work-empty","A consultar eventos internos…"));
  try{
   const data=await api("/events?"+new URLSearchParams({from:dates[0],to:dates[dates.length-1]}));
   if(token!==eventRequest)return;
   events=data.events||[];
   for(const card of document.querySelectorAll("#tm-appointments-days .tm-appointments-day")){
    card.querySelectorAll(".tm-work-calendar-event").forEach(node=>node.remove());
    for(const item of events.filter(e=>e.event_date===card.dataset.date)){
     const event=make("span","tm-work-calendar-event",item.starts_at+" "+item.title);
     event.title=item.starts_at+"–"+item.ends_at+" · "+item.title;
     card.append(event);
    }
   }
   const date=dateInPage();
   const visible=events.filter(x=>x.event_date===date);
   list.replaceChildren();
   if(!visible.length)list.append(make("p","tm-work-empty","Sem eventos internos neste dia."));
   else visible.forEach(e=>list.append(eventRow(e)));
  }catch(error){
   if(token===eventRequest)list.replaceChildren(make("p","tm-work-empty",error.message));
  }
 }
 async function refreshTasks(){
  if(!dashboard)return;
  const token=++taskRequest;
  const filter=$("tm-work-task-filter")?.value||"open";
  const list=$("tm-work-task-list");
  list.replaceChildren(make("p","tm-work-empty","A consultar tarefas…"));
  try{
   const data=await api("/tasks?status="+encodeURIComponent(filter));
   if(token!==taskRequest)return;
   tasks=data.tasks||[];
   list.replaceChildren();
   if(!tasks.length)list.append(make("p","tm-work-empty","Sem tarefas nesta categoria."));
   else tasks.forEach(task=>list.append(taskRow(task)));
   if(data.truncated)list.append(make("p","tm-work-empty","Lista limitada. Utiliza os filtros para encontrar outras tarefas."));
  }catch(error){
   if(token===taskRequest)list.replaceChildren(make("p","tm-work-empty",error.message));
  }
 }
 async function refreshDashboardTasks(){
  if(!dashboard||dashboard.hidden)return;
  const token=++dashRequest,list=$("tm-db-tasks-list");
  if(!list)return;
  list.replaceChildren(make("p","tm-db-task-empty","A consultar tarefas…"));
  try{
   // Include pending tasks without a date. A deadline is optional, not a reservation.
   const data=await api("/tasks?status=open");
   if(token!==dashRequest)return;
   const pending=data.tasks||[];
   list.replaceChildren();
   if(!pending.length){list.append(make("p","tm-db-task-empty","Sem tarefas por fazer."));return;}
   for(const item of pending.slice(0,3)){
    const row=make("div","tm-db-task-row");
    const done=make("button","tm-db-task-check");
    done.type="button";done.setAttribute("aria-label","Concluir tarefa: "+item.title);
    done.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';
    done.addEventListener("click",async()=>{
     done.disabled=true;
     try{
      await api("/tasks/"+encodeURIComponent(item.id),"PUT",taskBody(item,"done"));
      await Promise.all([refreshDashboardTasks(),refreshTasks()]);
     }catch(error){list.prepend(make("p","tm-db-task-empty",error.message));done.disabled=false;}
    });
    const copy=make("div","tm-db-task-copy");
    const edit=make("button","tm-db-task-title tm-db-task-edit",item.title);
    edit.type="button";edit.setAttribute("aria-label","Editar tarefa: "+item.title);
    edit.addEventListener("click",()=>openTask(item));
    copy.append(edit);
    const due=item.due_date?(item.due_date<today()?"Em atraso":item.due_date===today()?"Hoje":readable(item.due_date)):"Sem prazo";
    copy.append(make("span","tm-db-task-meta",due+" · "+(item.responsible_name||"Equipa")));
    row.append(done,copy);list.append(row);
   }
   if(pending.length>3||data.truncated){
    const more=make("button","tm-db-task-more",data.truncated?"Ver todas as tarefas":"Ver todas ("+pending.length+")");
    more.type="button";more.addEventListener("click",openTasksManager);list.append(more);
   }
  }catch(error){
   if(token===dashRequest)list.replaceChildren(make("p","tm-db-task-empty",error.message));
  }
 }
 function openTasksManager(){
  const dialog=$("tm-work-tasks-dialog");
  if(!dialog||dialog.open)return;
  dialog.showModal();refreshTasks();
 }
 window.tmDashboardWorkRefresh=refreshDashboardTasks;
 if(dashboard){
  const add=$("tm-db-miniagenda-new"),menu=$("tm-db-add-menu");
  if(add&&menu){
   function closeMenu(){menu.hidden=true;add.setAttribute("aria-expanded","false");}
   function updateMenuLinks(){
    const date=add.dataset.date||today();
    const booking=menu.querySelector('[data-work-quick="booking"]');
    const event=menu.querySelector('[data-work-quick="event"]');
    booking.href=add.dataset.bookingHref||"/admin-appointments?new=1#agenda";
    event.href="/admin-appointments?"+new URLSearchParams({date,new:"event",view:"day"})+"#agenda";
   }
   add.addEventListener("click",()=>{
    updateMenuLinks();
    menu.hidden=!menu.hidden;
    add.setAttribute("aria-expanded",String(!menu.hidden));
    if(!menu.hidden)menu.querySelector("a,button")?.focus();
   });
   document.addEventListener("click",e=>{if(!menu.contains(e.target)&&!add.contains(e.target))closeMenu();});
   document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!menu.hidden){closeMenu();add.focus();}});
   menu.addEventListener("keydown",e=>{
    if(!["ArrowDown","ArrowUp","Home","End"].includes(e.key))return;
    e.preventDefault();
    const links=[...menu.querySelectorAll("a,button")];
    const current=links.indexOf(document.activeElement);
    const next=e.key==="Home"?0:e.key==="End"?links.length-1:
     (current+(e.key==="ArrowDown"?1:-1)+links.length)%links.length;
    links[next]?.focus();
   });
   menu.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeMenu));
   menu.querySelector('[data-work-quick="task"]').addEventListener("click",()=>{
    const selectedDate=add.dataset.date||today();
    closeMenu();
    openTask(null,selectedDate);
   });
  }
  const dashObserver=new MutationObserver(()=>{
   if(!dashboard.hidden)refreshDashboardTasks();
  });
  dashObserver.observe(dashboard,{attributes:true,attributeFilter:["hidden"]});
  if(!dashboard.hidden)refreshDashboardTasks();
 }
 if(dashboard){
  $("tm-db-tasks-open").addEventListener("click",openTasksManager);
  $("tm-work-new-task").addEventListener("click",()=>openTask());
  $("tm-work-task-filter").addEventListener("change",refreshTasks);
  $("tm-work-task-form").addEventListener("submit",async e=>{
   e.preventDefault();showError("tm-work-task-error","");
   const submit=e.target.querySelector('[type="submit"]');submit.disabled=true;
   try{
    const payload=formPayloadTask();
    if(editingTask)payload.version=editingTask.version;
    await api("/tasks"+(editingTask?"/"+encodeURIComponent(editingTask.id):""),
     editingTask?"PUT":"POST",payload);
    $("tm-work-task-dialog").close();
    await Promise.all([refreshTasks(),refreshDashboardTasks()]);
   }catch(error){showError("tm-work-task-error",error);}
   finally{submit.disabled=false;}
  });
  $("tm-work-task-delete").addEventListener("click",async()=>{
   if(!editingTask||!confirm("Eliminar esta tarefa?"))return;
   try{
    await api("/tasks/"+encodeURIComponent(editingTask.id),"DELETE",{version:editingTask.version});
    $("tm-work-task-dialog").close();
    await Promise.all([refreshTasks(),refreshDashboardTasks()]);
   }catch(error){showError("tm-work-task-error",error);}
  });
  for(const dialogId of ["tm-work-task-dialog","tm-work-tasks-dialog"]){
   const dialog=$(dialogId);
   dialog.querySelectorAll("[data-tm-work-close]").forEach(btn=>btn.addEventListener("click",()=>dialog.close()));
   dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
  }
 }
 if(!page)return;
 $("tm-work-new-event").addEventListener("click",()=>openEvent());
 const eventDialog=$("tm-work-event-dialog");
 eventDialog.querySelectorAll("[data-tm-work-close]").forEach(btn=>btn.addEventListener("click",()=>eventDialog.close()));
 eventDialog.addEventListener("click",e=>{if(e.target===eventDialog)eventDialog.close();});
 $("tm-work-event-form").addEventListener("submit",async e=>{
  e.preventDefault();showError("tm-work-event-error","");
  const submit=e.target.querySelector('[type="submit"]');submit.disabled=true;
  try{
   const payload=formPayloadEvent();
   if(editingEvent)payload.version=editingEvent.version;
   await api("/events"+(editingEvent?"/"+encodeURIComponent(editingEvent.id):""),
    editingEvent?"PUT":"POST",payload);
   eventDialog.close();
   await refreshEvents();
  }catch(error){showError("tm-work-event-error",error);}
  finally{submit.disabled=false;}
 });
 $("tm-work-event-delete").addEventListener("click",async()=>{
  if(!editingEvent||!confirm("Eliminar este evento interno?"))return;
  try{
   await api("/events/"+encodeURIComponent(editingEvent.id),"DELETE",{version:editingEvent.version});
   eventDialog.close();await refreshEvents();
  }catch(error){showError("tm-work-event-error",error);}
 });
 document.addEventListener("tm:appointments-range",refreshEvents);
 let initialized=false;
 function initializePage(){
  if(initialized||page.hidden)return;
  initialized=true;refreshEvents();
  const params=new URLSearchParams(location.search);
  if(params.get("new")==="event"){
   params.delete("new");
   history.replaceState(null,"",location.pathname+(params.toString()?"?"+params:"")+location.hash);
   openEvent();
  }
 }
 new MutationObserver(initializePage).observe(page,{attributes:true,attributeFilter:["hidden"]});
 initializePage();
})();
