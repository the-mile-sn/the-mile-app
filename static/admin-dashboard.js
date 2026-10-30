"use strict";
(()=> {
 const $=id=>document.getElementById(id);
 const section=$("tm-dashboard"),legacy=$("tm-admin-legacy"),playersPage=$("tm-players-page"),dash=$("tm-admin-nav-dashboard"),playersBtn=$("tm-admin-nav-players"),planningBtn=$("tm-admin-nav-planning");
 if(!section||!legacy||!dash)return;
 const meals=["breakfast","lunch","snack","dinner","supper"];
 const icons=["coffee","restaurant","veg","restaurant","moon"];
 const iconPaths={"pitch":["M2 8.57143C2 6.41644 2 5.33894 2.58579 4.66947C3.17157 4 4.11438 4 6 4H18C19.8856 4 20.8284 4 21.4142 4.66947C22 5.33894 22 6.41644 22 8.57143V15.4286C22 17.5836 22 18.6611 21.4142 19.3305C20.8284 20 19.8856 20 18 20H6C4.11438 20 3.17157 20 2.58579 19.3305C2 18.6611 2 17.5836 2 15.4286V8.57143Z","M12 10V5M12 14V19","M22 9H19.5C18.9477 9 18.5 9.44772 18.5 10V14C18.5 14.5523 18.9477 15 19.5 15H22","M2 9H4.5C5.05228 9 5.5 9.44772 5.5 10V14C5.5 14.5523 5.05228 15 4.5 15H2"],"scale":["M6.68262 5C5.31812 5.06167 4.47505 5.2536 3.87868 5.851C3 6.73119 3 8.14783 3 10.9811V15.9897C3 18.823 3 20.2396 3.87868 21.1198C4.75736 22 6.17157 22 9 22H15C17.8284 22 19.2426 22 20.1213 21.1198C21 20.2396 21 18.823 21 15.9897V10.9811C21 8.14783 21 6.73119 20.1213 5.851C19.5249 5.2536 18.6819 5.06167 17.3174 5","M7.02532 6.54026C6.54474 4.66034 6.30445 3.72039 6.69501 3.03089C6.79898 2.84733 6.93184 2.68092 7.08871 2.53776C7.67799 2 8.66873 2 10.6502 2H13.3498C15.3313 2 16.322 2 16.9113 2.53776C17.0682 2.68092 17.201 2.84733 17.305 3.03089C17.6955 3.72039 17.4553 4.66034 16.9747 6.54026C16.5915 8.03898 16.4 8.78834 15.8877 9.28153C15.7483 9.41576 15.5936 9.5339 15.4266 9.63362C14.8131 10 14.0233 10 12.4436 10H11.5564C9.97674 10 9.18689 10 8.5734 9.63362C8.40642 9.5339 8.2517 9.41576 8.11228 9.28153C7.60002 8.78834 7.40846 8.03898 7.02532 6.54026Z","M10 18H14","M11.5 10L12.5 7"],"coffee":["M17 11H18C18.9319 11 19.3978 11 19.7654 11.1522C20.2554 11.3552 20.6448 11.7446 20.8478 12.2346C21 12.6022 21 13.0681 21 14C21 14.9319 21 15.3978 20.8478 15.7654C20.6448 16.2554 20.2554 16.6448 19.7654 16.8478C19.3978 17 18.9319 17 18 17H17","M15 9H5C4.05719 9 3.58579 9 3.29289 9.29289C3 9.58579 3 10.0572 3 11V14C3 16.8089 3 18.2134 3.67412 19.2223C3.96596 19.659 4.34096 20.034 4.77772 20.3259C5.78661 21 7.19108 21 10 21C12.8089 21 14.2134 21 15.2223 20.3259C15.659 20.034 16.034 19.659 16.3259 19.2223C17 18.2134 17 16.8089 17 14V11C17 10.0572 17 9.58579 16.7071 9.29289C16.4142 9 15.9428 9 15 9Z","M10 3V5","M14 3V5","M6 3V5"],"veg":["M17 13.2308C17 13.2308 16.0909 12.7693 15.1818 12.7693C13.8182 12.7693 12 14.6154 12 17.3846C12 20.1537 14.4896 22 17 22C19.5104 22 22 20.1537 22 17.3846C22 14.6154 20.1818 12.7693 18.8182 12.7693C17.9091 12.7693 17 13.2308 17 13.2308ZM17 13.2308C17 11.8462 17.9091 10 19.7273 10","M10.655 5C11.5512 5 12.2778 4.32843 12.2778 3.5C12.2778 2.67157 11.5512 2 10.655 2H5.24561C4.34936 2 3.6228 2.67157 3.6228 3.5C3.6228 4.32843 4.34936 5 5.24561 5M11.1693 4.92311C12.1247 6.68943 12.9095 8.28337 13.3888 10C13.4279 10.1401 13.465 10.281 13.5 10.4229M10.428 22H6.32748C2.74721 22 2 21.3093 2 18V13.7771C2 10.3773 3.09757 7.88562 4.70467 4.91465"],"restaurant":["M4 21.001L7.00071 18","M15 10.001L14 11.001","M17.9999 3.00098L14.9999 6.00098C14.4547 6.54623 14.1821 6.81885 14.0363 7.11295C13.759 7.6725 13.759 8.32945 14.0363 8.88901C14.1821 9.1831 14.4547 9.45573 14.9999 10.001C15.5452 10.5462 15.8178 10.8189 16.1119 10.9646C16.6715 11.2419 17.3284 11.2419 17.888 10.9646C18.1821 10.8189 18.4547 10.5462 18.9999 10.001L21.9999 7.00098","M20 5L17 8","M20 21L12 13M12 13L2 3C2 6.84174 3.52612 10.5261 6.24264 13.2426L9 16L12 13Z"],"moon":["M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z"]};
 function hugeIcon(kind,cls=""){const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.5");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");svg.setAttribute("class","tm-hugeicon "+cls);for(const path of iconPaths[kind]||[]){const el=document.createElementNS("http://www.w3.org/2000/svg","path");el.setAttribute("d",path);svg.append(el);}if(kind==="pitch"){const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");circle.setAttribute("cx","12");circle.setAttribute("cy","12");circle.setAttribute("r","2");svg.append(circle);}return svg;}

 let weekMonday,seq=0,cache=null;
 function dateParts(date){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));return obj.year+"-"+obj.month+"-"+obj.day;}
 function monday(dateString){const d=new Date(dateString+"T12:00:00Z");const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10);}
 function shifted(iso,delta){const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
 function formatDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d))?d.slice(8,10)+"/"+d.slice(5,7):"—";}
 function dateLabel(d){return new Intl.DateTimeFormat("pt-PT",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(d+"T12:00:00Z"));}
 function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
 function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
 function navActive(target){for(const b of document.querySelectorAll(".tm-admin-nav-link")){b.classList.toggle("is-active",b===target);if(b===target)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");}}
 const clinicalPages={assessments:$("tm-assessments-page"),forms:$("tm-forms-page")};
 const assessmentPanel=$("assessments-admin-panel"),monitoringPanel=$("profile-monitoring");
 const assessmentHome=document.createComment("assessments-original"),monitoringHome=document.createComment("forms-original");
 assessmentPanel.before(assessmentHome);monitoringPanel.before(monitoringHome);
 let clinicalToken=0;
 function closeClinical(){
  ++clinicalToken;
  for(const page of Object.values(clinicalPages))page.hidden=true;
  if(assessmentHome.parentNode)assessmentHome.after(assessmentPanel);
  if(monitoringHome.parentNode)monitoringHome.after(monitoringPanel);
 }
 function syncClinicalSelectors(){
  const original=$("athlete");
  for(const kind of ["assessments","forms"]){
   const select=$("tm-"+kind+"-player"),value=original.value;select.replaceChildren();
   for(const option of original.options){const o=document.createElement("option");o.value=option.value;o.textContent=option.textContent;select.append(o);}
   if(value)select.value=value;
   syncClinicalPicker(kind);
  }
 }
 const normalizedClinicalName=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 function syncClinicalPicker(kind){
  const select=$("tm-"+kind+"-player"),search=$("tm-"+kind+"-search"),avatar=$("tm-"+kind+"-avatar");
  const name=select.selectedOptions[0]?.textContent||"";
  search.value="";search.placeholder=name?"Pesquisar jogador · "+name:"Pesquisar jogador";avatar.textContent=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toLocaleUpperCase("pt-PT")||"—";
  $("tm-"+kind+"-results").hidden=true;search.setAttribute("aria-expanded","false");
 }
 function drawClinicalResults(kind){
  const select=$("tm-"+kind+"-player"),list=$("tm-"+kind+"-results"),search=$("tm-"+kind+"-search"),query=normalizedClinicalName(search.value);
  const words=query.split(/\s+/).filter(Boolean);list.replaceChildren();
  for(const option of select.options){
   if(!words.every(w=>normalizedClinicalName(option.textContent).split(/\s+/).some(part=>part.startsWith(w))))continue;
   const btn=el("button","tm-clinical-option",option.textContent);btn.type="button";btn.setAttribute("role","option");
   btn.setAttribute("aria-selected",String(option.value===select.value));
   btn.onmousedown=e=>e.preventDefault();
   btn.onclick=()=>{if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));}syncClinicalPicker(kind);};
   list.append(btn);
  }
  if(!list.children.length)list.append(el("div","tm-clinical-empty","Nenhum jogador encontrado."));
  list.hidden=false;search.setAttribute("aria-expanded","true");
 }
 for(const kind of ["assessments","forms"]){
  const search=$("tm-"+kind+"-search");
  search.addEventListener("focus",()=>drawClinicalResults(kind));
  search.addEventListener("input",()=>drawClinicalResults(kind));
  search.addEventListener("keydown",e=>{if(e.key==="Escape"){syncClinicalPicker(kind);}else if(e.key==="Enter"){const first=$("tm-"+kind+"-results").querySelector("button");if(first&&!$("tm-"+kind+"-results").hidden){e.preventDefault();first.click();}}});
 }
 document.addEventListener("pointerdown",e=>{for(const kind of ["assessments","forms"]){if(!e.target.closest('[data-clinical-picker="'+kind+'"]')){$("tm-"+kind+"-results").hidden=true;$("tm-"+kind+"-search").setAttribute("aria-expanded","false");}}});
 async function openClinical(kind,aid,monitoringKind,recordDate){
  if($("admin-workspace").hidden)return;
  closeClinical();const token=++clinicalToken;
  section.hidden=true;playersPage.hidden=true;legacy.hidden=true;
  const page=clinicalPages[kind],feedback=$("tm-"+kind+"-error");page.hidden=false;navActive($("tm-admin-nav-"+kind));feedback.textContent="";
  syncClinicalSelectors();const original=$("athlete");
  if(aid&&Array.from(original.options).some(o=>o.value===aid))original.value=aid;
  $("tm-"+kind+"-player").value=original.value;syncClinicalPicker(kind);
  if(!original.value){feedback.textContent="Ainda não existem jogadores.";return;}
  let deepLinked=false;
  try{
   if(typeof loadModel==="function")await loadModel();
   if(token!==clinicalToken)return;
   if(kind==="assessments"){
    if(typeof showBackofficeView==="function")showBackofficeView("assessments");
    $("tm-assessments-slot").append(assessmentPanel);assessmentPanel.hidden=false;
    if(typeof window.tmRefreshAssessmentRegistry==="function")window.tmRefreshAssessmentRegistry().catch(e=>{feedback.textContent="Não foi possível carregar a tabela global: "+e.message;});
   }else{
    if(typeof showBackofficeView==="function")showBackofficeView("profile");
    $("tm-forms-slot").append(monitoringPanel);monitoringPanel.hidden=false;
    const selectedKind=monitoringKind==="game"?"game":"weight";
    if(typeof openMonitoring==="function")await openMonitoring(selectedKind);
    if(token!==clinicalToken)return;
    if(recordDate){
     const content=$("monitoring-"+selectedKind+"-content");
     const entry=Array.from(content?.querySelectorAll(".monitoring-entry")||[]).find(row=>row.dataset.monitoringDate===recordDate);
     if(entry){entry.classList.add("tm-monitoring-target");entry.scrollIntoView({behavior:"smooth",block:"center"});deepLinked=true;}
    }
   }
  }catch(err){if(token===clinicalToken)feedback.textContent="Não foi possível carregar: "+err.message;}
  if(token===clinicalToken&&!deepLinked)window.scrollTo({top:0,behavior:"smooth"});
 }
 for(const kind of ["assessments","forms"]){
  $("tm-admin-nav-"+kind).addEventListener("click",()=>openClinical(kind));
  $("tm-"+kind+"-player").addEventListener("change",e=>{const aid=e.target.value;if(aid&&$("athlete").value!==aid){$("athlete").value=aid;openClinical(kind,aid);}});
 }
 window.tmOpenAdminAssessments=aid=>openClinical("assessments",aid);
 window.tmOpenAdminForms=aid=>openClinical("forms",aid);
 function openDashboard(){closeClinical();if($("admin-workspace").hidden)return;legacy.hidden=true;playersPage.hidden=true;section.hidden=false;navActive(dash);load().catch(err=>showError(err));window.scrollTo({top:0,behavior:"smooth"});}
 window.tmOpenAdminDashboard=openDashboard;
 async function openPlayers(aid,day,monitoringKind){closeClinical();
 section.hidden=true;playersPage.hidden=true;legacy.hidden=false;navActive(planningBtn);
 try{
  if(aid&&$("athlete")){
   const choice=$("athlete");
   if([...choice.options].some(o=>o.value===aid)&&choice.value!==aid){
    choice.value=aid;
    if(typeof loadModel==="function")await loadModel();
   }
  }
  if(monitoringKind){
   if(typeof showBackofficeView==="function")showBackofficeView("profile");
   const dateInput=$("monitoring-"+monitoringKind+"-date");
   if(dateInput&&day)dateInput.value=day;
   if(typeof openMonitoring==="function")await openMonitoring(monitoringKind);
   // Both forms use the already-existing monitoring panels in the profile.
   const root=$("monitoring-"+monitoringKind+"-content");
   if(root)root.scrollIntoView({behavior:"smooth",block:"center"});
   const matching=root&&Array.from(root.querySelectorAll(".monitoring-entry")).find(row=>
    row.dataset.monitoringDate===day);
   if(matching){matching.classList.add("tm-monitoring-target");matching.scrollIntoView({behavior:"smooth",block:"center"});}
   return;
  }
  if(day){
   const d=new Date(day+"T12:00:00Z");
   if(typeof calendarMonth!=="undefined")calendarMonth=new Date(d.getUTCFullYear(),d.getUTCMonth(),1);
   if(typeof selectedCalendarDay!=="undefined")selectedCalendarDay=day;
   if(typeof showBackofficeView==="function")await showBackofficeView("calendar");
   const preview=$("day-preview");
   if(preview&&!preview.hidden&&preview.querySelector(".day-meals")){
    preview.scrollIntoView({behavior:"smooth",block:"center"});
    return;
   }
   const calendar=$("calendar-section");
   if(calendar)calendar.scrollIntoView({behavior:"smooth",block:"start"});
   return;
  }
 }catch(err){if(typeof status==="function")status("Não foi possível abrir o jogador: "+err.message,"warn");}
 window.scrollTo({top:0,behavior:"smooth"});
 }
 dash.addEventListener("click",openDashboard);
 playersBtn.addEventListener("click",openPlayersList);
 function openPlanning(){closeClinical();
  if($("admin-workspace").hidden)return;
  section.hidden=true;playersPage.hidden=true;legacy.hidden=false;navActive(planningBtn);
  $("admin-account-panel").hidden=true;
  $("admin-account-toggle").setAttribute("aria-expanded","false");
  window.scrollTo({top:0,behavior:"smooth"});
 }
 planningBtn.addEventListener("click",openPlanning);
 window.tmOpenAdminPlanning=openPlanning;
 const chooseAccount=$("tm-admin-nav-account");if(chooseAccount)chooseAccount.addEventListener("click",()=>{closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=false;navActive(chooseAccount);});
 let playerProfile=null,playerProfileEditing=false,profileLoadToken=0,playerAccess=null;
 const accessIdentity=$("tm-players-access-identity"),accessToggle=$("tm-players-access-toggle"),accessFeedback=$("tm-players-access-feedback");
 function paintPlayerAccess(){
  accessToggle.hidden=!playerAccess;
  accessIdentity.textContent=playerAccess?"Utilizador: @"+playerAccess.username+" · "+(playerAccess.active?"Acesso ativo":"Acesso bloqueado"):"Ainda não existe uma conta associada.";
  if(playerAccess)accessToggle.textContent=playerAccess.active?"Bloquear acesso":"Reativar acesso";
 }
 async function loadPlayerAccess(aid,token){
  accessIdentity.textContent="A consultar conta associada…";accessFeedback.textContent="";accessToggle.hidden=true;playerAccess=null;
  try{
   const data=await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/access");
   if(token!==profileLoadToken||profilePanel.hidden)return;
   playerAccess=data.access;paintPlayerAccess();
  }catch(e){if(token===profileLoadToken&&!profilePanel.hidden)accessIdentity.textContent="Não foi possível consultar o acesso: "+e.message;}
 }
 accessToggle.addEventListener("click",async()=>{
  if(!playerProfile||!playerAccess)return;
  const athleteId=playerProfile.id,accessId=playerAccess.id,active=!Boolean(playerAccess.active);
  if(!window.confirm((active?"Reativar":"Bloquear")+" o acesso de "+playerProfile.name+" à App do Jogador?"+(active?"":" As sessões ativas serão terminadas.")))return;
  const token=profileLoadToken;accessToggle.disabled=true;accessFeedback.textContent="";
  try{
   const data=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/access",{method:"PUT",body:JSON.stringify({active})});
   if(token!==profileLoadToken||playerProfile?.id!==athleteId||playerAccess?.id!==accessId)return;
   playerAccess=data.access;paintPlayerAccess();accessFeedback.textContent=active?"Acesso reativado.":"Acesso bloqueado; sessões terminadas.";
   loadPlayers().catch(()=>{});
  }catch(e){if(token===profileLoadToken)accessFeedback.textContent="Não foi possível alterar o acesso: "+e.message;}
  finally{accessToggle.disabled=false;}
 });

 const profilePanel=$("tm-players-profile"),playersTable=playersPage.querySelector(".tm-players-panel:not(#tm-players-profile)");
 const profileFields=[["Nome","name","text"],["Sexo","sex","sex"],["Peso inicial (kg)","weight_kg","number"],["Notas internas","profile_notes","textarea"]];
 function displayPlayerProfile(){
  if(!playerProfile)return;
  const athlete=playerProfile,host=$("tm-players-profile-fields");host.replaceChildren();
  $("tm-players-profile-title").textContent=athlete.name;
  host.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin:18px 0";
  for(const [caption,key,type] of profileFields){
   const wrapper=el("label","profile-info-card");wrapper.style.cssText="display:flex;flex-direction:column;gap:8px;padding:15px;border:1px solid #36363c;border-radius:12px;min-width:0";
   wrapper.append(el("small","",caption));
   if(!playerProfileEditing){
    const v=athlete[key];wrapper.append(el("strong","",v==null||v===""?"Por preencher":key==="sex"?(v==="F"?"Feminino":v==="M"?"Masculino":"Por definir"):String(v)+(key==="weight_kg"?" kg":key==="height_cm"?" cm":"")));
   }else{
    const field=type==="textarea"?el("textarea"):type==="sex"?el("select"):el("input");
    if(type==="sex"){for(const [v,t] of [["","Por definir"],["F","Feminino"],["M","Masculino"]]){const o=el("option","",t);o.value=v;field.append(o);}}
    else if(type!=="textarea"){field.type=type;if(type==="number"){field.min=key==="weight_kg"?"20":"100";field.max=key==="weight_kg"?"250":"230";field.step="0.1";}}
    field.value=athlete[key]??"";field.dataset.playerProfileField=key;field.style.width="100%";wrapper.append(field);
   }
   host.append(wrapper);
  }
  $("tm-players-profile-edit").hidden=playerProfileEditing;
  $("tm-players-profile-save").hidden=!playerProfileEditing;
  $("tm-players-profile-cancel").hidden=!playerProfileEditing;
 }
 function closePlayerProfile(){
  ++profileLoadToken;
  profilePanel.hidden=true;playersTable.hidden=false;playerProfile=null;playerProfileEditing=false;playerAccess=null;accessToggle.hidden=true;
  $("tm-players-profile-feedback").textContent="";
 }
 async function openPlayerProfile(aid){
  const token=++profileLoadToken;
  playersTable.hidden=true;profilePanel.hidden=false;playerProfileEditing=false;
  $("tm-players-profile-title").textContent="A carregar perfil…";$("tm-players-profile-fields").replaceChildren();
  $("tm-players-profile-feedback").textContent="";
  try{
   const data=await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/microcycles");
   if(profilePanel.hidden||token!==profileLoadToken)return;
   playerProfile=data.athlete;displayPlayerProfile();loadPlayerAccess(aid,token);
  }catch(e){if(token===profileLoadToken)$("tm-players-profile-feedback").textContent="Não foi possível carregar o perfil: "+e.message;}
 }
 $("tm-players-profile-back").addEventListener("click",closePlayerProfile);
 $("tm-players-profile-edit").addEventListener("click",()=>{if(!playerProfile)return;playerProfileEditing=true;displayPlayerProfile();});
 $("tm-players-profile-cancel").addEventListener("click",()=>{playerProfileEditing=false;displayPlayerProfile();});
 $("tm-players-profile-save").addEventListener("click",async()=>{
  if(!playerProfile)return;
  const button=$("tm-players-profile-save");button.disabled=true;
  const get=k=>profilePanel.querySelector('[data-player-profile-field="'+k+'"]').value;
  const rawWeight=get("weight_kg");
  try{
   const result=await request("/api/v2/athletes/"+encodeURIComponent(playerProfile.id)+"/profile",{method:"PUT",body:JSON.stringify({
    name:get("name").trim(),sex:get("sex")||null,weight_kg:rawWeight===""?null:Number(rawWeight),height_cm:playerProfile.height_cm??null,profile_notes:get("profile_notes")
   })});
   playerProfile=result.athlete;playerProfileEditing=false;displayPlayerProfile();
   $("tm-players-profile-feedback").textContent="Perfil guardado.";
   if(typeof window.tmSyncPlanningAthleteProfile==="function")window.tmSyncPlanningAthleteProfile(playerProfile);
   loadPlayers().catch(e=>{$("tm-players-error").textContent="Atualiza a lista de jogadores: "+e.message;});
  }catch(e){$("tm-players-profile-feedback").textContent="Não foi possível guardar: "+e.message;}
  finally{button.disabled=false;}
 });
 let playersData=[],playersLoaded=false;
 function normalized(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();}
 function matchesName(name,query){const words=normalized(name).split(/\s+/).filter(Boolean);return normalized(query).split(/\s+/).filter(Boolean).every(part=>words.some(word=>word.startsWith(part)));}
 const playerStatus={active:"Ativo",no_account:"Sem conta",inactive:"Inativo",expired:"Expirado"};
 const fullDate=d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4):"—";
 function renderPlayers(){
  const body=$("tm-players-body");body.replaceChildren();
  const term=$("tm-players-filter").value,filter=$("tm-players-access").value;
  const items=playersData.filter(p=>(filter==="all"||p.access_status===filter)&&matchesName(p.name,term));
  $("tm-players-count").textContent=items.length+" jogador"+(items.length===1?"":"es");
  for(const p of items){
   const row=el("tr"),first=el("td");
   const link=el("button","tm-p-player");
   const avatar=el("span","tm-p-avatar",p.name.split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase());
   if(p.has_photo&&p.user_id){
    const img=el("img");img.src="/api/players/"+encodeURIComponent(p.user_id)+"/photo";img.alt="";img.loading="lazy";img.addEventListener("error",()=>img.remove());avatar.append(img);
   }
   const person=el("span","tm-p-identity");person.append(el("strong","",p.name),el("small","",p.username?"@"+p.username:"Conta ainda não criada"));
   link.append(avatar,person);link.addEventListener("click",()=>openPlayerProfile(p.id));first.append(link);row.append(first);
   const statusCell=el("td");statusCell.append(el("span","tm-p-status tm-p-"+p.access_status,playerStatus[p.access_status]||"—"));row.append(statusCell);
   const game=el("td");game.append(el("span","",p.next_match?fullDate(p.next_match.date):"—"));if(p.next_match?.time)game.append(el("small","tm-p-muted",p.next_match.time));row.append(game);
   const weight=el("td");if(p.latest_weight){weight.append(el("span","",Number(p.latest_weight.weight_kg).toLocaleString("pt-PT",{maximumFractionDigits:1})+" kg"),el("small","tm-p-muted",fullDate(p.latest_weight.date)));}else weight.textContent="—";row.append(weight);
   const reply=el("td");if(p.last_player_response){const isWeight=p.last_player_response.type==="weight";reply.append(el("span","",isWeight?"Peso":"Pós-jogo"),el("small","tm-p-muted",new Date(p.last_player_response.timestamp*1000).toLocaleDateString("pt-PT")));}else reply.textContent="—";row.append(reply);
   const action=el("td");const go=el("button","tm-p-go","Abrir");go.type="button";go.addEventListener("click",()=>openPlayerProfile(p.id));action.append(go);row.append(action);body.append(row);
  }
  if(!items.length){const row=el("tr"),cell=el("td","tm-p-empty","Nenhum jogador corresponde aos filtros.");cell.colSpan=6;row.append(cell);body.append(row);}
 }
 async function loadPlayers(){const data=await request("/api/v2/admin/players-overview");playersData=data.players||[];playersLoaded=true;renderPlayers();}
 window.tmRefreshPlayersList=()=>loadPlayers();
 function openPlayersList(){closeClinical();
  if($("admin-workspace").hidden)return;
  section.hidden=true;legacy.hidden=true;playersPage.hidden=false;navActive(playersBtn);
  closePlayerProfile();
  $("tm-players-error").textContent="";
  loadPlayers().catch(e=>{$("tm-players-error").textContent="Não foi possível carregar os jogadores: "+e.message;});
  window.scrollTo({top:0,behavior:"smooth"});
 }
 $("tm-players-filter").addEventListener("input",renderPlayers);
 $("tm-players-access").addEventListener("change",renderPlayers);
 $("tm-players-new").addEventListener("click",()=>{
  if(typeof window.tmOpenPlayerCreate==="function")window.tmOpenPlayerCreate();
 });
 function showError(err){$("tm-db-error").textContent="Não foi possível consultar o Dashboard: "+err.message;}
 function paintEvents(data){
  const host=$("tm-db-events"),recentHost=$("tm-db-recent");host.replaceChildren();recentHost.replaceChildren();
  const t=data.today_events||{};
  const makeItem=(item,label,day,highlight=false,target="planning")=>{
   const btn=el("button","tm-db-event"+(highlight?" tm-db-birthday":""));btn.type="button";
   btn.append(el("span","",item.name),el("small","",label));
   btn.addEventListener("click",()=>target==="assessments"?openClinical("assessments",item.athlete_id):openPlayers(item.athlete_id,day||data.today));return btn;
  };
  const events=[
   ...(t.games||[]).map(item=>({item,label:item.time?"Jogo · "+item.time:"Jogo agendado",day:data.today})),
   ...(t.events||[]).map(item=>({item,label:item.title||"Evento",day:data.today})),
   ...(t.assessments_today||[]).map(item=>({item,label:"Avaliação registada hoje",day:item.date,target:"assessments"})),
   ...(t.birthdays||[]).map(item=>({item,label:"🎂 Aniversário",day:data.today,birthday:true}))
  ];
  if(!events.length)host.append(el("p","tm-db-none","Sem nada hoje."));
  else for(const entry of events)host.append(makeItem(entry.item,entry.label,entry.day,entry.birthday,entry.target));
  const recent=t.recent_responses||[];
  if(!recent.length)recentHost.append(el("p","tm-db-none","Sem respostas recentes."));
  else for(const item of recent){
   const btn=el("button","tm-db-event tm-db-form-answer");btn.type="button";
   const kind=item.kind==="post_match"?"pitch":"scale";
   const iconSlot=el("span","tm-db-form-icon");iconSlot.append(hugeIcon(kind));
   const details=el("span","tm-db-form-details");
   const detail=kind==="pitch"?"Jogo de "+formatDay(item.match_date):Number(item.weight_kg).toLocaleString("pt-PT",{minimumFractionDigits:1,maximumFractionDigits:1})+" kg · "+formatDay(item.weigh_date);
   const shortTime=new Date(item.timestamp*1000).toLocaleDateString("pt-PT",{day:"2-digit",month:"2-digit"});
   details.append(el("span","tm-db-form-player",item.name),el("small","tm-db-form-sub",detail));
   const time=el("time","tm-db-form-time",shortTime);
   time.dateTime=new Date(item.timestamp*1000).toISOString();
   btn.setAttribute("aria-label",item.name+" · "+(kind==="pitch"?"Formulário pós-jogo":"Registo de peso")+" · "+detail+" · submetido em "+shortTime);
   btn.append(iconSlot,details,time);
   btn.addEventListener("click",()=>openClinical("forms",item.athlete_id,kind==="pitch"?"game":"weight",kind==="pitch"?item.match_date:item.weigh_date));
   recentHost.append(btn);
  }
 }
 const normalizeSearch=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 const matchesPlayer=(fullName,query)=>{
  const words=normalizeSearch(fullName).split(/\s+/).filter(Boolean);
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every(term=>words.some(word=>word.startsWith(term)));
 };
 let playerQuery="";
 function renderTable(data){const head=$("tm-db-thead"),body=$("tm-db-tbody");head.replaceChildren();body.replaceChildren();const today=data.today;const header=el("tr");const name=el("th","tm-db-name-cell");const search=el("input","tm-db-search");search.type="search";search.placeholder="Filtrar jogador";search.setAttribute("aria-label","Filtrar jogadores da matriz");search.value=playerQuery;name.append(search);header.append(name);
 const days=Array.from({length:7},(_,i)=>shifted(weekMonday,i));for(const [i,day] of days.entries()){const th=el("th",day===today?"tm-db-today":"");const lab=el("div","tm-db-date",["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][i]);const d=el("div","tm-db-day",dateLabel(day));const ico=el("div","tm-db-five-cols tm-db-icon-row");for(const kind of icons){const slot=el("span");slot.append(hugeIcon(kind));ico.append(slot);}th.append(lab,d,ico);header.append(th);}head.append(header);
 for(const player of data.players||[]){const tr=el("tr");tr.dataset.name=player.name;const first=el("td","tm-db-name-cell");const btn=el("button","tm-db-player-name");const avatar=el("span","tm-db-avatar");avatar.setAttribute("aria-hidden","true");avatar.textContent=player.name.split(/\s+/).slice(0,2).map(n=>n[0]||"").join("").toUpperCase();btn.append(avatar,el("span","tm-db-player-text",player.name));btn.addEventListener("click",()=>openPlayers(player.id));first.append(btn);tr.append(first);for(const item of player.days){const td=el("td",item.date===today?"tm-db-today":"");const cell=el("button","tm-db-cell"+(item.classification==="MD"?" tm-db-match":""));cell.type="button";cell.setAttribute("aria-label",player.name+", "+item.date+", "+(item.classification||"sem MD"));cell.append(el("span","tm-db-md",item.classification||"—"));const dots=el("span","tm-db-five-cols tm-db-dots");for(const meal of meals){const value=item.colors?.[meal];const dot=el("span","tm-db-dot "+(value?("tm-db-"+value):"tm-db-none-dot"));dot.title=({breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"}[meal]||meal)+": "+(value||"não prescrito");dots.append(dot);}cell.append(dots);cell.addEventListener("click",()=>openPlayers(player.id,item.date));td.append(cell);tr.append(td);}body.append(tr);}
 const applyPlayerFilter=()=>{
  let count=0;
  for(const tr of body.children){
   tr.hidden=!matchesPlayer(tr.dataset.name,playerQuery);
   if(!tr.hidden)count++;
  }
  $("tm-db-count").textContent=count+" jogador"+(count===1?"":"es");
 };
 search.addEventListener("input",()=>{playerQuery=search.value;applyPlayerFilter();});
 applyPlayerFilter();
 $("tm-db-week-title").textContent=dateLabel(days[0])+" – "+dateLabel(days[6]);$("tm-db-today-date").textContent=new Intl.DateTimeFormat("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(today+"T12:00:00Z"));
 }
 async function load(){const id=++seq;if(!weekMonday)weekMonday=monday(dateParts(new Date()));$("tm-db-error").textContent="";$("tm-db-events").textContent="A consultar…";$("tm-db-recent").textContent="A consultar…";const res=await request("/api/v2/admin/dashboard?week="+encodeURIComponent(weekMonday));if(id!==seq)return;cache=res;renderTable(res);paintEvents(res);}
 $("tm-db-prev").addEventListener("click",()=>{weekMonday=shifted(weekMonday,-7);load().catch(showError);});
 $("tm-db-next").addEventListener("click",()=>{weekMonday=shifted(weekMonday,7);load().catch(showError);});
 $("tm-db-go-today").addEventListener("click",()=>{weekMonday=monday(dateParts(new Date()));load().catch(showError);});
})();
