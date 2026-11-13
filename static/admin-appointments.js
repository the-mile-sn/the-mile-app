"use strict";
/* Agendamentos — first-stage administrative shell.
 * No booking is created and no existing appointment is fetched in this phase.
 */
(()=>{
 const byId=id=>document.getElementById(id);
 const root=byId("tm-appointments-root"),auth=byId("tm-appointments-auth");
 if(!root||!auth)return;
 const tabNames=["agenda","reservas","disponibilidades","configuracao"];
 const range=byId("tm-appointments-range"),days=byId("tm-appointments-days");
 const locale=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"});
 const longRange=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric"});
 const lisbon=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"});
 function todayInLisbon(){
  const parts=Object.fromEntries(lisbon.formatToParts(new Date()).map(part=>[part.type,part.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
 }
 function utcDay(iso){return new Date(iso+"T12:00:00Z");}
 function shift(iso,delta){const d=utcDay(iso);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
 function monday(iso){const day=(utcDay(iso).getUTCDay()+6)%7;return shift(iso,-day);}
 let selected=todayInLisbon(),view="week";
 function render(){
  const now=todayInLisbon(),dates=view==="day"?[selected]:Array.from({length:7},(_,i)=>shift(monday(selected),i));
  const first=dates[0],last=dates[dates.length-1];
  const title=view==="day"?longRange.format(utcDay(selected)):
   new Intl.DateTimeFormat("pt-PT",{day:"numeric",month:"short",timeZone:"UTC"}).format(utcDay(first))+" – "+longRange.format(utcDay(last));
  range.textContent=title;
  byId("tm-appointments-previous").setAttribute("aria-label",view==="week"?"Semana anterior":"Dia anterior");
  byId("tm-appointments-next").setAttribute("aria-label",view==="week"?"Semana seguinte":"Dia seguinte");
  days.classList.toggle("is-day",view==="day");
  days.replaceChildren();
  for(const iso of dates){
   const node=document.createElement("div");
   node.className="tm-appointments-day"+(iso===now?" is-today":"");
   if(iso===now)node.setAttribute("aria-current","date");
   const dayName=document.createElement("small");
   dayName.textContent=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",weekday:"short"}).format(utcDay(iso));
   const date=document.createElement("strong");
   date.textContent=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",day:"2-digit",month:"short"}).format(utcDay(iso));
   node.append(dayName,date);
   days.append(node);
  }
 }
 function setView(next){
  view=next;
  for(const btn of document.querySelectorAll("[data-appointments-view]")){
   const active=btn.dataset.appointmentsView===next;
   btn.classList.toggle("is-active",active);
   btn.setAttribute("aria-pressed",String(active));
  }
  render();
 }
 function switchTab(key,changeHistory=false){
  if(!tabNames.includes(key))key="agenda";
  for(const name of tabNames){
   const active=name===key,tab=byId("tm-appointments-tab-"+name),panel=byId("tm-appointments-panel-"+name);
   panel.hidden=!active;
   tab.classList.toggle("is-active",active);
   tab.setAttribute("aria-selected",String(active));
   tab.tabIndex=active?0:-1;
  }
  if(changeHistory)history.replaceState(null,"",location.pathname+location.search+"#"+key);
 }
 for(const btn of document.querySelectorAll("[data-appointments-tab]")){
  btn.addEventListener("click",()=>switchTab(btn.dataset.appointmentsTab,true));
  btn.addEventListener("keydown",event=>{
   if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
   event.preventDefault();
   const current=tabNames.indexOf(btn.dataset.appointmentsTab);
   const next=event.key==="Home"?0:event.key==="End"?tabNames.length-1:
    (current+(event.key==="ArrowRight"?1:-1)+tabNames.length)%tabNames.length;
   const tab=byId("tm-appointments-tab-"+tabNames[next]);
   switchTab(tabNames[next],true);tab.focus();
  });
 }
 document.querySelectorAll("[data-appointments-view]").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.appointmentsView)));
 byId("tm-appointments-today").addEventListener("click",()=>{selected=todayInLisbon();render();});
 byId("tm-appointments-previous").addEventListener("click",()=>{selected=shift(selected,view==="week"?-7:-1);render();});
 byId("tm-appointments-next").addEventListener("click",()=>{selected=shift(selected,view==="week"?7:1);render();});
 window.addEventListener("hashchange",()=>switchTab(location.hash.slice(1)));
 switchTab(location.hash.slice(1));
 setView("week");

 /* Service/professional catalogue (phase 2). Server is the authority. */
 let csrf="",catalog={services:[],professionals:[]};
 let editingService=null,editingProfessional=null,pendingPhoto=null;
 const euros=new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"});
 const modeLabels={presencial:"Presencial",online:"Online"};
 const $=byId;
 function element(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 function feedback(message,isError=false){
  const target=$("tm-appt-catalog-feedback");
  target.textContent=message||"";
  target.classList.toggle("is-error",!!isError);
 }
 function formError(type,message){
  $(type==="service"?"tm-appt-service-error":"tm-appt-professional-error").textContent=message;
 }
 const errors={
  invalid_name:"Indica um nome válido.",
  invalid_category:"Seleciona uma categoria válida.",
  invalid_duration:"A duração deve estar entre 15 e 480 minutos.",
  invalid_price:"Confirma os preços indicados.",
  invalid_formats:"Configura os formatos disponíveis.",
  invalid_mode:"Indica os formatos disponíveis.",
  at_least_one_format:"Seleciona pelo menos um formato.",
  invalid_email:"Confirma o endereço de email.",
  invalid_services:"Um dos serviços selecionados deixou de estar disponível.",
  invalid_professionals:"Um dos profissionais selecionados deixou de estar disponível.",
  service_name_exists:"Já existe um serviço com este nome.",
  professional_email_exists:"Este email já está associado a um profissional.",
  invalid_shopify_id:"Confirma os identificadores Shopify ou deixa-os vazios.",
  variant_requires_product:"Para associar uma variante, indica também o produto Shopify.",
  service_not_found:"O serviço deixou de estar disponível.",
  professional_not_found:"O profissional deixou de estar disponível."
 };
 async function api(path,options={}){
  const hasBody=options.body!==undefined;
  const headers={Accept:"application/json"};
  if(hasBody){headers["Content-Type"]="application/json";headers["X-CSRF-Token"]=csrf;}
  const res=await fetch(path,{credentials:"same-origin",cache:"no-store",...options,headers});
  let data={};
  try{data=await res.json();}catch(_error){}
  if(!res.ok){
   if(res.status===401||res.status===403)throw new Error("A sessão expirou ou não tens acesso. Volta a iniciar sessão.");
   throw new Error(errors[data.error]||"Não foi possível concluir a operação. Tenta novamente.");
  }
  return data;
 }
 const endpoint="/api/v2/admin/appointments";
 function profileAvatar(item,large=false){
  const node=element("span","tm-appt-photo-avatar"+(large?" tm-appt-photo-large":""));
  const initials=(item?.name||"").trim().split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase();
  node.textContent=initials||"+";
  if(item?.has_photo&&item.id){
   const img=document.createElement("img");
   img.src=endpoint+"/professionals/"+encodeURIComponent(item.id)+"/photo?v="+(item.photo_updated_at||0);
   img.alt="";img.decoding="async";img.loading="lazy";
   img.addEventListener("error",()=>img.remove());node.append(img);
  }
  return node;
 }

 function statusPill(active){
  return element("span","tm-appt-status"+(active?" is-active":" is-inactive"),active?"Ativo":"Inativo");
 }
 function modesSummary(formats){
  const out=element("div","tm-appt-row-modes");
  for(const mode of ["presencial","online"]){
   const item=formats?.[mode];
   if(!item?.enabled)continue;
   out.append(element("span","tm-appt-mode-badge",modeLabels[mode]+" · "+euros.format((item.price_cents||0)/100)));
  }
  if(!out.childElementCount)out.append(element("span","tm-appt-muted","Sem formatos ativos"));
  return out;
 }
 function renderServices(){
  const list=$("tm-appt-services-list");list.replaceChildren();
  if(!catalog.services.length){
   list.append(element("p","tm-appt-placeholder","Ainda não existem serviços. Cria o primeiro para começar."));
   return;
  }
  for(const item of catalog.services){
   const card=element("article","tm-appt-record");
   const body=element("div","tm-appt-record-body");
   const heading=element("div","tm-appt-record-title");
   heading.append(element("h4","",item.name),statusPill(item.active));
   body.append(heading,element("p","tm-appt-record-meta",item.category+" · "+item.duration_minutes+" min"),modesSummary(item.formats));
   const names=item.professional_ids.map(id=>catalog.professionals.find(p=>p.id===id)?.name).filter(Boolean);
   body.append(element("p","tm-appt-record-assigned",names.length?"Profissionais: "+names.join(", "):"Sem profissionais associados"));
   const button=element("button","tm-appt-edit","Editar");
   button.type="button";button.dataset.editService=item.id;
   card.append(body,button);list.append(card);
  }
 }
 function renderProfessionals(){
  const list=$("tm-appt-professionals-list");list.replaceChildren();
  if(!catalog.professionals.length){
   list.append(element("p","tm-appt-placeholder","Ainda não existem profissionais. Adiciona o primeiro profissional."));
   return;
  }
  for(const item of catalog.professionals){
   const card=element("article","tm-appt-record tm-appt-prof-record");
   card.append(profileAvatar(item));
   const body=element("div","tm-appt-record-body");
   const heading=element("div","tm-appt-record-title");
   heading.append(element("h4","",item.name),statusPill(item.active));
   body.append(heading);
   if(item.email)body.append(element("p","tm-appt-record-meta",item.email));
   const modes=[item.presencial_enabled?"Presencial":null,item.online_enabled?"Online":null].filter(Boolean);
   body.append(element("p","tm-appt-record-meta",modes.join(" e ")));
   const names=item.service_ids.map(id=>catalog.services.find(s=>s.id===id)?.name).filter(Boolean);
   body.append(element("p","tm-appt-record-assigned",names.length?names.join(" · "):"Sem serviços associados"));
   const button=element("button","tm-appt-edit","Editar");
   button.type="button";button.dataset.editProfessional=item.id;
   card.append(body,button);list.append(card);
  }
 }
 async function loadCatalog(){
  const data=await api(endpoint+"/catalog");
  if(!Array.isArray(data.services)||!Array.isArray(data.professionals))throw Error("Resposta inesperada do servidor.");
  catalog=data;renderServices();renderProfessionals();
  document.dispatchEvent(new CustomEvent("tm:appointments-catalog",{detail:catalog}));
  return data;
 }
 function associationChoices(target,items,selected){
  const host=$(target);host.replaceChildren();
  if(!items.length){
   host.append(element("p","tm-appt-form-hint","Ainda não existem opções para associar."));
   return;
  }
  for(const item of items){
   const label=element("label","tm-appt-checkbox tm-appt-choice");
   const checkbox=document.createElement("input");
   checkbox.type="checkbox";checkbox.value=item.id;
   checkbox.checked=selected.includes(item.id);
   label.append(checkbox,element("span","",item.name));
   host.append(label);
  }
 }
 function checkedIds(host){return [...$(host).querySelectorAll('input[type="checkbox"]:checked')].map(el=>el.value);}
 function openService(item){
  editingService=item?.id||null;
  $("tm-appt-service-dialog-title").textContent=item?"Editar serviço":"Novo serviço";
  $("tm-appt-service-form").reset();
  formError("service","");
  $("tm-appt-service-name").value=item?.name||"";
  $("tm-appt-service-category").value=item?.category||"Wellness";
  $("tm-appt-service-duration").value=item?.duration_minutes||45;
  $("tm-appt-service-active").checked=item?.active??true;
  for(const mode of ["presencial","online"]){
   const f=item?.formats?.[mode];
   $("tm-appt-service-"+mode+"-enabled").checked=f?.enabled??true;
   $("tm-appt-service-"+mode+"-price").value=((f?.price_cents||0)/100).toFixed(2);
   $("tm-appt-service-"+mode+"-product").value=f?.shopify_product_id||"";
   $("tm-appt-service-"+mode+"-variant").value=f?.shopify_variant_id||"";
  }
  associationChoices("tm-appt-service-professionals",catalog.professionals,item?.professional_ids||[]);
  $("tm-appt-service-dialog").showModal();
  $("tm-appt-service-name").focus();
 }
 function openProfessional(item){
  editingProfessional=item?.id||null;pendingPhoto=null;
  const avatar=$("tm-appt-form-avatar");
  avatar.replaceChildren();
  const image=profileAvatar(item,true);
  avatar.replaceWith(image);image.id="tm-appt-form-avatar";
  $("tm-appt-photo-input").value="";
  $("tm-appt-photo-remove").hidden=!item?.has_photo;
  $("tm-appt-professional-dialog-title").textContent=item?"Editar profissional":"Novo profissional";
  $("tm-appt-professional-form").reset();
  formError("professional","");
  $("tm-appt-professional-name").value=item?.name||"";
  $("tm-appt-professional-email").value=item?.email||"";
  $("tm-appt-professional-active").checked=item?.active??true;
  $("tm-appt-professional-presencial").checked=item?.presencial_enabled??true;
  $("tm-appt-professional-online").checked=item?.online_enabled??true;
  associationChoices("tm-appt-professional-services",catalog.services,item?.service_ids||[]);
  $("tm-appt-professional-dialog").showModal();
  $("tm-appt-professional-name").focus();
 }
 $("tm-appt-photo-input").addEventListener("change",async event=>{
  const file=event.currentTarget.files?.[0];
  if(!file)return;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>3*1024*1024){
   formError("professional","Escolhe uma fotografia JPG, PNG ou WebP até 3 MB.");
   event.currentTarget.value="";return;
  }
  try{
   const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(Error("Não foi possível ler a fotografia."));
    reader.readAsDataURL(file);
   });
   pendingPhoto={action:"set",data};
   const avatar=$("tm-appt-form-avatar");avatar.replaceChildren();
   const img=document.createElement("img");img.alt="";img.src=data;avatar.append(img);
   $("tm-appt-photo-remove").hidden=false;formError("professional","");
  }catch(error){formError("professional",error.message);}
 });
 $("tm-appt-photo-remove").addEventListener("click",()=>{
  pendingPhoto={action:"delete"};
  const avatar=$("tm-appt-form-avatar");avatar.replaceChildren();
  const name=$("tm-appt-professional-name").value.trim();
  avatar.textContent=name.split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join("").toUpperCase()||"+";
  $("tm-appt-photo-remove").hidden=true;
  $("tm-appt-photo-input").value="";
 });

 $("tm-appt-create-service").addEventListener("click",()=>openService());
 $("tm-appt-create-professional").addEventListener("click",()=>openProfessional());
 $("tm-appt-services-list").addEventListener("click",event=>{
  const btn=event.target.closest("button[data-edit-service]");
  if(!btn)return;
  const item=catalog.services.find(s=>s.id===btn.dataset.editService);
  if(item)openService(item);
 });
 $("tm-appt-professionals-list").addEventListener("click",event=>{
  const btn=event.target.closest("button[data-edit-professional]");
  if(!btn)return;
  const item=catalog.professionals.find(p=>p.id===btn.dataset.editProfessional);
  if(item)openProfessional(item);
 });
 for(const btn of document.querySelectorAll("[data-close-appointment-dialog]")){
  btn.addEventListener("click",()=>btn.closest("dialog")?.close());
 }
 function priceCents(id){
  const value=$(id).value.trim();
  if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(value))throw new Error("Indica um preço válido com até duas casas decimais.");
  return Math.round(Number(value)*100);
 }
 async function submitForm(event,type){
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;formError(type,"");
  try{
   let payload,url,method;
   if(type==="service"){
    const formats={};
    for(const mode of ["presencial","online"]){
     formats[mode]={
      enabled:$("tm-appt-service-"+mode+"-enabled").checked,
      price_cents:priceCents("tm-appt-service-"+mode+"-price"),
      shopify_product_id:$("tm-appt-service-"+mode+"-product").value.trim(),
      shopify_variant_id:$("tm-appt-service-"+mode+"-variant").value.trim()
     };
    }
    payload={
     name:$("tm-appt-service-name").value.trim(),
     category:$("tm-appt-service-category").value,
     duration_minutes:Number($("tm-appt-service-duration").value),
     active:$("tm-appt-service-active").checked,
     formats,
     professional_ids:checkedIds("tm-appt-service-professionals")
    };
    method=editingService?"PUT":"POST";
    url=endpoint+"/services"+(editingService?"/"+encodeURIComponent(editingService):"");
   }else{
    payload={
     name:$("tm-appt-professional-name").value.trim(),
     email:$("tm-appt-professional-email").value.trim(),
     active:$("tm-appt-professional-active").checked,
     presencial_enabled:$("tm-appt-professional-presencial").checked,
     online_enabled:$("tm-appt-professional-online").checked,
     service_ids:checkedIds("tm-appt-professional-services")
    };
    method=editingProfessional?"PUT":"POST";
    url=endpoint+"/professionals"+(editingProfessional?"/"+encodeURIComponent(editingProfessional):"");
   }
   const saved=await api(url,{method,body:JSON.stringify(payload)});
   let photoWarning="";
   if(type==="professional"&&pendingPhoto){
    const id=editingProfessional||saved.id;
    const photoUrl=endpoint+"/professionals/"+encodeURIComponent(id)+"/photo";
    try{
     if(pendingPhoto.action==="set")await api(photoUrl,{method:"PUT",body:JSON.stringify({photo:pendingPhoto.data})});
     else if(pendingPhoto.action==="delete")await api(photoUrl,{method:"DELETE",body:"{}"});
     pendingPhoto=null;
    }catch(photoError){photoWarning="Os dados foram guardados, mas a fotografia não foi atualizada: "+photoError.message;}
   }
   form.closest("dialog").close();
   feedback(photoWarning||(type==="service"?"Serviço guardado com sucesso.":"Profissional guardado com sucesso."),!!photoWarning);
   try{await loadCatalog();}
   catch(error){feedback("Alteração guardada, mas não foi possível atualizar a lista. Reabre a página para confirmar.",true);}
  }catch(error){formError(type,error.message);}
  finally{submit.disabled=false;}
 }
 $("tm-appt-service-form").addEventListener("submit",event=>submitForm(event,"service"));
 $("tm-appt-professional-form").addEventListener("submit",event=>submitForm(event,"professional"));

 async function validate(){
  try{
   const res=await fetch("/api/me",{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}});
   if(!res.ok)throw new Error("unauthorized");
   const data=await res.json();
   if(data.user?.role!=="admin")throw new Error("forbidden");
   csrf=data.csrf||"";
   auth.hidden=true;root.hidden=false;
   try{await loadCatalog();}catch(error){feedback(error.message,true);}
  }catch(error){
   const title=document.createElement("h1");
   title.textContent="Acesso reservado";
   const explanation=document.createElement("p");
   explanation.textContent="É necessário iniciar sessão como administrador para aceder a Agendamentos.";
   const back=document.createElement("a");
   back.href="/";back.textContent="Entrar no backoffice";
   auth.replaceChildren(title,explanation,back);
  }
 }
 validate();
})();
