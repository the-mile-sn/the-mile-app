"use strict";
/* The Mile Google Calendar OAuth settings: never handles OAuth tokens directly. */
(()=>{
 const $=id=>document.getElementById(id);
 const root=$("tm-appt-google-professional");
 if(!root)return;
 const endpoint="/api/v2/admin/appointments/google";
 const state={catalog:{professionals:[]},id:"",csrf:null,seq:0,status:null,calendars:[]};
 const element=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=String(text);
  return node;
 };
 const dictionary={
  google_not_configured:"A ligação Google ainda precisa das credenciais OAuth no servidor The Mile.",
  google_not_connected:"Esta conta Google não está ligada.",
  google_needs_reconnection:"O acesso Google expirou ou foi revogado. Volta a autorizar a conta.",
  google_unavailable:"Não foi possível contactar o Google. Verifica a ligação ou tenta novamente.",
  google_missing_scope:"A conta não autorizou os calendários necessários. Volta a ligar a conta Google.",
  google_missing_refresh_token:"A autorização não forneceu acesso permanente. Tenta voltar a autorizar.",
  google_calendar_limit:"A conta tem demasiados calendários. Contacta a equipa técnica.",
  invalid_busy_calendars:"Seleciona pelo menos um calendário válido para bloquear horários.",
  invalid_target_calendar:"Escolhe um calendário onde possas criar eventos.",
  professional_not_found:"O profissional selecionado não foi encontrado."
 };
 async function api(path,method="GET",data){
  const headers={Accept:"application/json"};
  if(method!=="GET"){
   if(!state.csrf){
    const response=await fetch("/api/me",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    if(!response.ok)throw Error("A sessão expirou. Volta a entrar.");
    const session=await response.json();
    if(session.user?.role!=="admin")throw Error("Acesso apenas para administradores.");
    state.csrf=session.csrf;
   }
   headers["X-CSRF-Token"]=state.csrf;
   headers["Content-Type"]="application/json";
  }
  const response=await fetch(endpoint+path,{
   method,credentials:"same-origin",cache:"no-store",headers,
   ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  let body={};
  try{body=await response.json();}catch(_error){}
  if(!response.ok)throw Error(dictionary[body.error]||
    (response.status===401||response.status===403?
     "A sessão expirou ou não tens permissão.":"Ocorreu um erro ao configurar o Google Calendar."));
  return body;
 }
 function feedback(msg="",bad=false){
  const node=$("tm-appt-google-feedback");
  node.textContent=msg;
  node.classList.toggle("is-error",bad);
 }
 function mode(showConnected,configured){
  $("tm-appt-google-connect").hidden=showConnected;
  $("tm-appt-google-reconnect").hidden=!showConnected;
  $("tm-appt-google-disconnect").hidden=!showConnected;
  $("tm-appt-google-settings").hidden=!showConnected||!configured;
  $("tm-appt-google-connect").disabled=!state.id||!configured;
  $("tm-appt-google-reconnect").disabled=!state.id||!configured;
  $("tm-appt-google-save").disabled=!state.id||!configured;
 }
 function updateCatalog(data){
  if(!Array.isArray(data?.professionals))return;
  state.catalog=data;
  const old=state.id;
  root.replaceChildren();
  const placeholder=element("option","","Selecionar profissional");
  placeholder.value="";root.append(placeholder);
  for(const person of data.professionals){
   const option=element("option","",person.name+(person.active?"":" (inativo)"));
   option.value=person.id;root.append(option);
  }
  state.id=data.professionals.some(p=>p.id===old)?old:
    (data.professionals.find(p=>p.active)?.id||data.professionals[0]?.id||"");
  root.value=state.id;
  load().catch(error=>feedback(error.message,true));
 }
 document.addEventListener("tm:appointments-catalog",event=>updateCatalog(event.detail));
 function renderCalendarChoices(data){
  const host=$("tm-appt-google-calendar-list");
  host.replaceChildren();
  const target=$("tm-appt-google-target");
  target.replaceChildren();
  const none=element("option","","Selecionar calendário (opcional nesta fase)");
  none.value="";target.append(none);
  state.calendars=data.calendars||[];
  if(!state.calendars.length){
   host.append(element("p","tm-appt-form-hint","Não foram encontrados calendários nesta conta."));
   return;
  }
  for(const item of state.calendars){
   const label=element("label","tm-appt-google-calendar-row");
   const check=document.createElement("input");
   check.type="checkbox";
   check.value=item.id;
   check.checked=data.busy_calendar_ids?.includes(item.id)||false;
   check.name="tm-appt-google-busy";
   label.append(check);
   const text=element("span","",item.name+(item.primary?" · Principal":""));
   label.append(text);
   host.append(label);
   if(item.can_write){
    const option=element("option","",item.name+(item.primary?" · Principal":""));
    option.value=item.id;target.append(option);
   }
  }
  target.value=data.target_calendar_id||"";
 }
 async function load(){
  const token=++state.seq;
  feedback();
  state.status=null;
  $("tm-appt-google-status").textContent="A verificar a ligação…";
  mode(false,false);
  $("tm-appt-google-settings").hidden=true;
  if(!state.id){
   $("tm-appt-google-status").textContent="Adiciona ou seleciona um profissional.";
   return;
  }
  try{
   const status=await api("/status?"+new URLSearchParams({professional_id:state.id}));
   if(token!==state.seq)return;
   state.status=status;
   mode(status.connected,status.configured);
   if(!status.configured){
    $("tm-appt-google-status").textContent="Integração ainda não configurada: falta preparar o cliente OAuth Google Cloud e as credenciais seguras no Render.";
    $("tm-appt-google-settings").hidden=true;
    return;
   }
   if(!status.connected){
    $("tm-appt-google-status").textContent="Conta Google não ligada. O profissional deve autorizar o acesso aos calendários.";
    return;
   }
   $("tm-appt-google-status").textContent=status.busy_check_active?
    "Ligação ativa · "+status.busy_calendar_ids.length+" calendário(s) a bloquear horários.":
    "Conta ligada. Seleciona os calendários que devem bloquear horários.";
   const calendars=await api("/calendars?"+new URLSearchParams({professional_id:state.id}));
   if(token!==state.seq)return;
   renderCalendarChoices(calendars);
   $("tm-appt-google-settings").hidden=false;
  }catch(error){
   if(token!==state.seq)return;
   $("tm-appt-google-status").textContent="Não foi possível consultar os calendários desta conta.";
   $("tm-appt-google-settings").hidden=true;
   feedback(error.message,true);
  }
 }
 async function connect(){
  if(!state.id||!state.status?.configured)return;
  const button=$("tm-appt-google-connect");
  const reconnect=$("tm-appt-google-reconnect");
  button.disabled=true;reconnect.disabled=true;feedback();
  try{
   const data=await api("/start","POST",{professional_id:state.id});
   const url=new URL(data.authorization_url);
   if(url.origin!=="https://accounts.google.com")throw Error("Destino de autorização inesperado.");
   window.location.assign(url.href);
  }catch(error){
   feedback(error.message,true);
   button.disabled=false;reconnect.disabled=false;
  }
 }
 root.addEventListener("change",event=>{
  state.id=event.currentTarget.value;
  load().catch(error=>feedback(error.message,true));
 });
 $("tm-appt-google-connect").addEventListener("click",connect);
 $("tm-appt-google-reconnect").addEventListener("click",connect);
 $("tm-appt-google-disconnect").addEventListener("click",async ()=>{
  if(!state.id||!confirm("Desligar a conta Google deste profissional? Os horários deixarão de ser bloqueados por este calendário até voltar a autorizar."))return;
  const button=$("tm-appt-google-disconnect");
  button.disabled=true;feedback();
  try{
   await api("/disconnect","POST",{professional_id:state.id});
   document.dispatchEvent(new CustomEvent("tm:appointments-google-updated"));
   await load();
   feedback("Conta Google desligada. As disponibilidades internas foram preservadas.");
  }catch(error){feedback(error.message,true);}
  finally{button.disabled=false;}
 });
 $("tm-appt-google-save").addEventListener("click",async ()=>{
  const ids=[...document.querySelectorAll('#tm-appt-google-calendar-list input[name="tm-appt-google-busy"]:checked')]
    .map(node=>node.value);
  if(!ids.length){
   feedback("Seleciona pelo menos um calendário que bloqueia horários.",true);return;
  }
  const button=$("tm-appt-google-save");button.disabled=true;feedback();
  try{
   await api("/settings","PUT",{
    professional_id:state.id,busy_calendar_ids:ids,
    target_calendar_id:$("tm-appt-google-target").value
   });
   document.dispatchEvent(new CustomEvent("tm:appointments-google-updated"));
   await load();
   feedback("Calendários guardados. Os períodos ocupados passam a ser considerados nas vagas internas.");
  }catch(error){feedback(error.message,true);}
  finally{button.disabled=false;}
 });
 const outcome=new URLSearchParams(window.location.search).get("google");
 const msgs={
  connected:"Autorização Google concluída. Seleciona os calendários que devem bloquear horários.",
  denied:"A autorização Google não foi concedida. Nenhuma ligação foi criada.",
  failed:"Não foi possível concluir a ligação Google. Verifica as permissões e tenta novamente."
 };
 if(outcome&&msgs[outcome]){
  // Do not keep OAuth callback result flags in the navigation URL.
  window.history.replaceState(null,"",window.location.pathname+window.location.hash);
  document.addEventListener("tm:appointments-catalog",()=>feedback(msgs[outcome],outcome!=="connected"),{once:true});
 }
 if(window.tmAppointmentsCatalog)updateCatalog(window.tmAppointmentsCatalog);
})();
