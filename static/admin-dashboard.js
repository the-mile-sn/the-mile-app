"use strict";

/* The Mile Backoffice appearance is local to this browser, never to a player account. */
(() => {
 const key="tm-admin-theme";
 const buttons=[...document.querySelectorAll("[data-admin-theme-choice]")];
 const apply=(value,save=false)=>{
  const theme=value==="light"?"light":"dark";
  document.documentElement.dataset.adminTheme=theme;
  for(const button of buttons)button.setAttribute("aria-pressed",String(button.dataset.adminThemeChoice===theme));
  if(save){try{window.localStorage.setItem(key,theme);}catch(_error){/* Private browsing keeps the theme for this page. */}}
 };
 let saved="dark";
 try{saved=window.localStorage.getItem(key)||"dark";}catch(_error){/* Storage may be disabled. */}
 apply(saved);
 for(const button of buttons){
  button.addEventListener("click",()=>apply(button.dataset.adminThemeChoice,true));
 }
})();
(()=> {
 const $=id=>document.getElementById(id);
 const section=$("tm-dashboard"),legacy=$("tm-admin-legacy"),playersPage=$("tm-players-page"),dash=$("tm-admin-nav-dashboard"),playersBtn=$("tm-admin-nav-players"),planningBtn=$("tm-admin-nav-planning"),recipesBtn=$("tm-admin-nav-menus-recipes"),recipesSubnav=$("tm-admin-recipes-subnav"),recipesPage=$("tm-menu-recipes-page"),recipeLibraryPage=$("tm-recipe-library-page"),dishesBtn=$("tm-admin-nav-dishes"),recipeLibraryBtn=$("tm-admin-nav-recipe-library"),foodLibraryBtn=$("tm-admin-nav-food-library"),foodLibraryPage=$("tm-food-library-page"),foodSubnav=$("tm-admin-food-subnav"),foodFoodsBtn=$("tm-admin-nav-foods"),foodPortionsBtn=$("tm-admin-nav-visual-portions"),plansBtn=$("tm-admin-nav-create-plan"),plansPage=$("tm-plan-page");
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
 const settingsPage=$("tm-admin-settings"),settingsAdmin=$("tm-settings-admins"),dashboardReturn=$("tm-dashboard-return");
 const accountPanel=$("admin-account-panel"),activationPanel=$("admin-access-panel");
 const adminList=$("admin-users-list"),inviteForm=$("admin-invite-form");
 // Keep the existing administrator controls in Settings at all times.
 // Navigation only changes visibility; it must never return these to Minha conta.
 if(settingsAdmin&&adminList&&inviteForm&&activationPanel){
  settingsAdmin.append(adminList,inviteForm,activationPanel);
  activationPanel.hidden=true; // Legacy single-user activation link is no longer shown.
 }
 function moveAdminControls(){/* Existing controls remain mounted in Settings. */}
 function navActive(target){
  // Navigation selected during startup must not be overridden by late data loading.
  window.tmAdminNavigationVersion=(window.tmAdminNavigationVersion||0)+1;
  const id=target?.id,accountView=id==="tm-admin-nav-account",settingsView=id==="tm-admin-nav-settings";
  moveAdminControls(settingsView);
  if(settingsPage)settingsPage.hidden=!settingsView;
  if(foodLibraryPage)foodLibraryPage.hidden=target!==foodLibraryBtn;
  if(foodSubnav)foodSubnav.hidden=target!==foodLibraryBtn;
  if(foodLibraryBtn)foodLibraryBtn.setAttribute("aria-expanded",String(target===foodLibraryBtn));
  if(target!==foodLibraryBtn)for(const b of [foodFoodsBtn,foodPortionsBtn]){if(b){b.classList.remove("is-active");b.removeAttribute("aria-current");}}
  if(plansPage)plansPage.hidden=target!==plansBtn;
  if(recipesPage)recipesPage.hidden=target!==recipesBtn;
  if(recipeLibraryPage)recipeLibraryPage.hidden=true;
  if(recipesSubnav)recipesSubnav.hidden=target!==recipesBtn;
  if(recipesBtn)recipesBtn.setAttribute("aria-expanded",String(target===recipesBtn));
  if(dishesBtn){dishesBtn.classList.toggle("is-active",target===recipesBtn);if(target===recipesBtn)dishesBtn.setAttribute("aria-current","page");else dishesBtn.removeAttribute("aria-current");}
  if(recipeLibraryBtn){recipeLibraryBtn.classList.remove("is-active");recipeLibraryBtn.removeAttribute("aria-current");}
  legacy.classList.toggle("tm-account-only",accountView);
  if(dashboardReturn)dashboardReturn.hidden=target===dash||target===foodLibraryBtn||target===plansBtn||!$("tm-players-profile").hidden;
  for(const b of document.querySelectorAll(".tm-admin-nav-link")){b.classList.toggle("is-active",b===target);if(b===target)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");}
  // Mobile: make the newly selected tab visible without changing the current page.
  if(window.matchMedia("(max-width: 830px)").matches&&target?.closest(".tm-admin-mobile-nav-track")){
   target.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});
  }
 }
 const clinicalPages={assessments:$("tm-assessments-page"),forms:$("tm-forms-page")};
 const assessmentPanel=$("assessments-admin-panel"),monitoringPanel=$("profile-monitoring");
 // Clinical editors have a single permanent home outside Planeamento.
 $("tm-assessments-slot").append(assessmentPanel);
 $("tm-forms-slot").append(monitoringPanel);
 let clinicalToken=0;
 function closeClinical(){
  ++clinicalToken;
  for(const page of Object.values(clinicalPages))page.hidden=true;
  // Hide the destinations, without moving their existing editor nodes.
 }
 function syncClinicalSelectors(){
  const original=$("athlete");
  for(const kind of ["assessments","forms"]){
   const select=$("tm-"+kind+"-player"),value=select.value;select.replaceChildren();
   const empty=document.createElement("option");empty.value="";empty.textContent="Selecionar jogador";select.append(empty);
   for(const option of original.options){const o=document.createElement("option");o.value=option.value;o.textContent=option.textContent;o.dataset.userId=option.dataset.userId||"";o.dataset.hasPhoto=option.dataset.hasPhoto||"false";select.append(o);}
   select.value=value&&Array.from(select.options).some(o=>o.value===value)?value:"";
   syncClinicalPicker(kind);
  }
 }
 const normalizedClinicalName=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 function syncClinicalPicker(kind){
  const select=$("tm-"+kind+"-player"),search=$("tm-"+kind+"-search"),avatar=$("tm-"+kind+"-avatar");
  const name=select.value?(select.selectedOptions[0]?.textContent||""):"";
  search.value=name;search.placeholder="Pesquisar jogador";avatar.textContent=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toLocaleUpperCase("pt-PT")||"—";
  const option=select.selectedOptions[0];if(option?.dataset.hasPhoto==="true"&&option.dataset.userId){const img=el("img","tm-picker-photo");img.src="/api/players/"+encodeURIComponent(option.dataset.userId)+"/photo";img.alt="";img.addEventListener("error",()=>img.remove());avatar.append(img);}
  $("tm-"+kind+"-results").hidden=true;search.setAttribute("aria-expanded","false");
 }
 function drawClinicalResults(kind){
  const select=$("tm-"+kind+"-player"),list=$("tm-"+kind+"-results"),search=$("tm-"+kind+"-search"),query=normalizedClinicalName(search.value);
  const words=query.split(/\s+/).filter(Boolean);list.replaceChildren();
  for(const option of select.options){
   if(!option.value)continue;
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
  search.addEventListener("focus",()=>{if($("tm-"+kind+"-player").value&&search.value===$("tm-"+kind+"-player").selectedOptions[0]?.textContent)search.select();drawClinicalResults(kind);});
  search.addEventListener("input",()=>{
   if(!search.value.trim()&&$("tm-"+kind+"-player").value){
    $("tm-"+kind+"-player").value="";
    syncClinicalPicker(kind);
    if(kind==="assessments"){$("assessments-admin-panel").hidden=true;}else{$("profile-monitoring").hidden=true;}
    $("tm-"+kind+"-error").textContent="";
    return;
   }
   drawClinicalResults(kind);
  });
  search.addEventListener("keydown",e=>{if(e.key==="Escape"){syncClinicalPicker(kind);}else if(e.key==="Enter"){const first=$("tm-"+kind+"-results").querySelector("button");if(first&&!$("tm-"+kind+"-results").hidden){e.preventDefault();first.click();}}});
 }
 document.addEventListener("pointerdown",e=>{for(const kind of ["assessments","forms"]){if(!e.target.closest('[data-clinical-picker="'+kind+'"]')){$("tm-"+kind+"-results").hidden=true;$("tm-"+kind+"-search").setAttribute("aria-expanded","false");}}});
 async function openClinical(kind,aid,monitoringKind,recordDate){
  if($("admin-workspace").hidden)return;
  closeClinical();const token=++clinicalToken;
  section.hidden=true;playersPage.hidden=true;legacy.hidden=true;
  const page=clinicalPages[kind],feedback=$("tm-"+kind+"-error");page.hidden=false;navActive($("tm-admin-nav-"+kind));feedback.textContent="";
  // On phones, position the newly opened view before async data loads.
  // Never scroll the viewport after the user may have focused its search.
  const mobileClinical=window.matchMedia("(max-width: 830px)").matches;
  if(mobileClinical&&!aid&&!recordDate)window.scrollTo({top:0,behavior:"instant"});
  if(window.tmAdminRosterReady)await window.tmAdminRosterReady;
  syncClinicalSelectors();const original=$("athlete");
  const selected=$("tm-"+kind+"-player");
  if(aid&&Array.from(original.options).some(o=>o.value===aid))selected.value=aid;
  syncClinicalPicker(kind);
  if(!selected.value){feedback.textContent="";return;}
  original.value=selected.value;
  let deepLinked=false;
  try{
   if(typeof loadModel==="function")await loadModel();
   if(token!==clinicalToken)return;
   if(kind==="assessments"){
    if(typeof showBackofficeView==="function")showBackofficeView("assessments");
    assessmentPanel.hidden=false;
    // Restore the assessment dashboard/cards: dedicated navigation owns this load.
    if(typeof loadAssessmentsAdmin!=="function")throw new Error("Editor de avaliações indisponível.");
    await loadAssessmentsAdmin();
    if(token!==clinicalToken)return;
    if(typeof window.tmRefreshAssessmentRegistry==="function")window.tmRefreshAssessmentRegistry().catch(e=>{feedback.textContent="Não foi possível carregar a tabela global: "+e.message;});
   }else{
    // No legacy profile switch or account fetch is needed for Formulários.
    monitoringPanel.hidden=false;
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
  if(token===clinicalToken&&!deepLinked&&!mobileClinical)window.scrollTo({top:0,behavior:"smooth"});
 }
 for(const kind of ["assessments","forms"]){
  $("tm-admin-nav-"+kind).addEventListener("click",()=>openClinical(kind));
  $("tm-"+kind+"-player").addEventListener("change",e=>{const aid=e.target.value;if(aid){openClinical(kind,aid);}});
 }
 window.tmOpenAdminAssessments=aid=>openClinical("assessments",aid);
 window.tmOpenAdminForms=aid=>openClinical("forms",aid);
 function openDashboard(){closeClinical();if($("admin-workspace").hidden)return;legacy.hidden=true;playersPage.hidden=true;section.hidden=false;navActive(dash);load().catch(err=>showError(err));window.scrollTo({top:0,behavior:"smooth"});}
 window.tmOpenAdminDashboard=openDashboard;
 $("tm-dashboard-return-button").addEventListener("click",openDashboard);
 $("tm-admin-brand-home").addEventListener("click",openDashboard);
function ensurePlanningOnlyView(){
 // Clinical and personal panels are mounted in dedicated sidebar areas, not Planeamento.
 if(typeof backofficeView!=="undefined"&&(backofficeView==="profile"||backofficeView==="assessments")&&typeof showBackofficeView==="function"){
  showBackofficeView("calendar");
 }
}
 async function openPlayers(aid,day,monitoringKind){
  if(monitoringKind)return openClinical("forms",aid,monitoringKind,day);
  closeClinical();
 section.hidden=true;playersPage.hidden=true;legacy.hidden=false;navActive(planningBtn);
  ensurePlanningOnlyView();
 try{
  if(window.tmAdminRosterReady)await window.tmAdminRosterReady;
  if(aid&&$("athlete")){
   const choice=$("athlete");
   if([...choice.options].some(o=>o.value===aid))choice.value=aid;
  }
  if(typeof window.tmEnsureAdminPlanning==="function")await window.tmEnsureAdminPlanning();
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
  ensurePlanningOnlyView();
  if(typeof window.tmEnsureAdminPlanning==="function")window.tmEnsureAdminPlanning().catch(err=>{if(typeof status==="function")status("Não foi possível carregar o Planeamento: "+err.message,"warn");});
  $("admin-account-panel").hidden=true;
  $("admin-account-toggle").setAttribute("aria-expanded","false");
  window.scrollTo({top:0,behavior:"smooth"});
 }
 planningBtn.addEventListener("click",openPlanning);
 window.tmOpenAdminPlanning=openPlanning;
 function openMenusRecipes(){
  if($("admin-workspace").hidden)return;
  closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=true;
  navActive(recipesBtn);
  if(recipesPage)recipesPage.hidden=false;
  if(recipeLibraryPage)recipeLibraryPage.hidden=true;
  const feedback=$("dish-catalog-feedback");
  if(typeof window.tmLoadDishLibrary==="function"){
   window.tmLoadDishLibrary().catch(err=>{if(feedback&&recipesPage&&!recipesPage.hidden)feedback.textContent="Não foi possível carregar a biblioteca: "+err.message;});
  }
  window.scrollTo({top:0,behavior:"smooth"});
 }
 if(recipesBtn&&dishesBtn){recipesBtn.addEventListener("click",openMenusRecipes);dishesBtn.addEventListener("click",openMenusRecipes);}
 window.tmOpenAdminMenusRecipes=openMenusRecipes;
 function openRecipeLibrary(){
  if($("admin-workspace").hidden)return;
  closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=true;
  navActive(recipesBtn);
  recipesPage.hidden=true;
  recipeLibraryPage.hidden=false;
  dishesBtn.classList.remove("is-active");dishesBtn.removeAttribute("aria-current");
  recipeLibraryBtn.classList.add("is-active");recipeLibraryBtn.setAttribute("aria-current","page");
  const loadPromise=typeof window.tmLoadRecipeLibrary==="function"?window.tmLoadRecipeLibrary():Promise.resolve();
  window.scrollTo({top:0,behavior:"smooth"});
  return loadPromise;
 }
 if(recipeLibraryBtn)recipeLibraryBtn.addEventListener("click",openRecipeLibrary);
 window.tmOpenAdminRecipeLibrary=openRecipeLibrary;
 function openFoodLibrary(which="foods"){
  if($("admin-workspace").hidden)return;
  const selected=which==="portions"?"portions":"foods";
  closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=true;
  navActive(foodLibraryBtn);
  if(foodLibraryPage)foodLibraryPage.hidden=false;
  for(const [b,active] of [[foodFoodsBtn,selected==="foods"],[foodPortionsBtn,selected==="portions"]]){
   if(!b)continue;b.classList.toggle("is-active",active);
   if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
  }
  window.tmShowAdminFoodLibrarySection?.(selected);
  if(selected==="foods"&&typeof window.tmEnsureAdminFoodLibrary==="function"){
   window.tmEnsureAdminFoodLibrary().catch(err=>{
    const feedback=foodLibraryPage?.querySelector("#feedback");
    if(feedback)feedback.textContent="Não foi possível carregar a Biblioteca Alimentar: "+err.message;
   });
  }
  window.scrollTo({top:0,behavior:"smooth"});
 }
 if(foodLibraryBtn)foodLibraryBtn.addEventListener("click",()=>openFoodLibrary("foods"));
 if(foodFoodsBtn)foodFoodsBtn.addEventListener("click",()=>openFoodLibrary("foods"));
 if(foodPortionsBtn)foodPortionsBtn.addEventListener("click",()=>openFoodLibrary("portions"));
 window.tmOpenAdminFoodLibrary=openFoodLibrary;
 function openPlans(){
  if($("admin-workspace").hidden)return;
  closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=true;
  navActive(plansBtn);
  if(plansPage)plansPage.hidden=false;
  if(typeof window.tmEnsureAdminPlans==="function")window.tmEnsureAdminPlans().catch(err=>{
   const feedback=plansPage?.querySelector("#tm-plan-status");
   if(feedback)feedback.textContent="Não foi possível carregar Planos: "+err.message;
  });
  window.scrollTo({top:0,behavior:"smooth"});
 }
 if(plansBtn)plansBtn.addEventListener("click",openPlans);
 window.tmOpenAdminPlans=openPlans;
 document.addEventListener("click",event=>{
  if(!plansPage||plansPage.hidden)return;
  const destination=event.target.closest(".tm-admin-sidebar .tm-admin-nav-link, #tm-admin-brand-home, #tm-dashboard-return-button, #admin-signout");
  if(!destination||destination===plansBtn)return;
  if(typeof window.tmPlanCanLeave==="function"&&!window.tmPlanCanLeave()){
   event.preventDefault();event.stopImmediatePropagation();
  }
 },true);
 const syncPlansTheme=()=>{if(plansPage)plansPage.dataset.adminTheme=document.documentElement.dataset.adminTheme==="light"?"light":"dark"};
 syncPlansTheme();
 if(plansPage)new MutationObserver(syncPlansTheme).observe(document.documentElement,{attributes:true,attributeFilter:["data-admin-theme"]});
 const chooseSettings=$("tm-admin-nav-settings");if(chooseSettings)chooseSettings.addEventListener("click",()=>{closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=true;navActive(chooseSettings);if(typeof loadAdminAccounts==="function")loadAdminAccounts().catch(()=>{});});
 const chooseAccount=$("tm-admin-nav-account");if(chooseAccount)chooseAccount.addEventListener("click",()=>{closeClinical();section.hidden=true;playersPage.hidden=true;legacy.hidden=false;navActive(chooseAccount);});
 let playerProfile=null,playerProfileEditing=false,profileLoadToken=0,playerAccess=null,playerDetails=null,playerPhotoData=null;
 const accessToggle=$("tm-players-access-toggle"),accessFeedback=$("tm-players-access-feedback");
 function paintPlayerAccess(){
  accessToggle.hidden=!playerAccess;
  $("tm-players-enter-app").hidden=!(playerAccess?.active&&playerDetails?.user_id);
  $("tm-players-password-toggle").hidden=!playerAccess;
  if(playerAccess){accessToggle.querySelector(".tm-access-action-text").textContent=playerAccess.active?"Bloquear acesso":"Reativar acesso";accessToggle.classList.toggle("is-unblocking",!playerAccess.active);}
 }
 async function loadPlayerAccess(aid,token){
  accessFeedback.textContent="";accessToggle.hidden=true;$("tm-players-enter-app").hidden=true;$("tm-players-password-toggle").hidden=true;resetPasswordForm();playerAccess=null;
  try{
   const data=await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/access");
   if(token!==profileLoadToken||profilePanel.hidden)return;
   playerAccess=data.access;paintPlayerAccess();
  }catch(e){if(token===profileLoadToken&&!profilePanel.hidden)accessFeedback.textContent="Não foi possível consultar o acesso: "+e.message;}
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

 const passwordForm=$("tm-players-password-form");
 $("tm-players-password-toggle").addEventListener("click",()=>{passwordForm.hidden=!passwordForm.hidden;if(!passwordForm.hidden)$("tm-players-password-new").focus();});
 function resetPasswordForm(){passwordForm.reset();passwordForm.hidden=true;for(const button of passwordForm.querySelectorAll(".tm-access-visibility-toggle")){const input=$(button.dataset.passwordTarget);input.type="password";button.setAttribute("aria-pressed","false");button.setAttribute("aria-label","Mostrar "+button.dataset.passwordLabel);}}
  $("tm-players-password-cancel").addEventListener("click",resetPasswordForm);
  for(const button of passwordForm.querySelectorAll(".tm-access-visibility-toggle"))button.addEventListener("click",()=>{const input=$(button.dataset.passwordTarget),visible=input.type==="password";input.type=visible?"text":"password";button.setAttribute("aria-pressed",String(visible));button.setAttribute("aria-label",(visible?"Ocultar ":"Mostrar ")+button.dataset.passwordLabel);});
 passwordForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!playerProfile||!playerAccess)return;
  const pwd=$("tm-players-password-new").value,confirmPwd=$("tm-players-password-confirm").value;
  if(pwd.length<12||pwd.length>256||pwd!==confirmPwd){accessFeedback.textContent="Confirma uma palavra-passe igual, com 12 a 256 caracteres.";return;}
  if(!window.confirm("Alterar a palavra-passe de "+playerProfile.name+"? Todas as sessões existentes serão terminadas."))return;
  const aid=playerProfile.id,token=profileLoadToken,btn=$("tm-players-password-save");btn.disabled=true;accessFeedback.textContent="";
  try{await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/password-reset",{method:"POST",body:JSON.stringify({password:pwd})});
   if(token!==profileLoadToken||playerProfile?.id!==aid)return;
   resetPasswordForm();accessFeedback.textContent="Palavra-passe alterada; sessões anteriores terminadas.";
  }catch(err){if(token===profileLoadToken)accessFeedback.textContent="Não foi possível alterar: "+err.message;}
  finally{btn.disabled=false;}
 });
 async function enterPlayerApp(uid,button,feedback){
  if(!uid)return;
  const tab=window.open("about:blank","_blank");
  if(!tab){feedback.textContent="Permite pop-ups deste site para abrir a app do jogador.";return;}
  tab.document.title="The Mile · Acesso de visualização";
  tab.document.body.textContent="A preparar acesso de visualização…";
  button.disabled=true;
  try{
   const response=await request("/api/admin/player-preview",{
    method:"POST",body:JSON.stringify({user_id:uid})
   });
   const url=new URL(response.url);
   if(url.origin!=="https://app.themile.pt"||url.pathname!=="/preview-entry")throw Error("Destino inesperado.");
   tab.location.replace(url.href);
   feedback.textContent="";
  }catch(err){
   tab.close();
   feedback.textContent="Não foi possível abrir a app do jogador: "+err.message;
  }finally{button.disabled=false;}
 }
 $("tm-players-enter-app").addEventListener("click",()=>{
  if(!playerAccess?.active||!playerDetails?.user_id)return;
  enterPlayerApp(playerDetails.user_id,$("tm-players-enter-app"),accessFeedback);
 });
 $("tm-players-archive").addEventListener("click",async()=>{
  if(!playerProfile)return;const aid=playerProfile.id,name=playerProfile.name,token=profileLoadToken;
  if(!window.confirm("Arquivar "+name+"? Vai desaparecer das listas e perder acesso à App. Os seus dados serão preservados."))return;
  if(window.prompt("Para confirmar, escreve ARQUIVAR:")!=="ARQUIVAR")return;
  const btn=$("tm-players-archive");btn.disabled=true;
  try{await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/archive",{method:"POST",body:JSON.stringify({confirmation:"ARQUIVAR"})});
   if(token!==profileLoadToken||playerProfile?.id!==aid)return;
   closePlayerProfile();await loadPlayers();await loadArchivedPlayers();
  }catch(err){if(token===profileLoadToken)$("tm-players-profile-feedback").textContent="Não foi possível arquivar: "+err.message;}
  finally{btn.disabled=false;}
 });
 async function loadArchivedPlayers(){
  const list=$("tm-players-archived-list");list.replaceChildren();
  const response=await request("/api/v2/admin/archived-players");
  if(!response.players?.length){list.append(el("p","hint","Sem jogadores arquivados."));return;}
  for(const player of response.players){
   const row=el("div","tm-archived-row"),button=el("button","tm-players-control","Restaurar");button.type="button";
   row.append(el("span","",player.name),button);
   button.addEventListener("click",async()=>{
    if(!window.confirm("Restaurar "+player.name+"? O acesso ficará bloqueado até ser reativado."))return;
    button.disabled=true;
    try{await request("/api/v2/athletes/"+encodeURIComponent(player.id)+"/restore",{method:"POST",body:"{}"});
     await Promise.all([loadPlayers(),loadArchivedPlayers()]);
     $("tm-players-archived-feedback").textContent="Jogador restaurado. Acesso à App ainda bloqueado.";
    }catch(err){$("tm-players-archived-feedback").textContent="Erro: "+err.message;}
    finally{button.disabled=false;}
   });list.append(row);
  }
 }
 $("tm-players-archived-box").addEventListener("toggle",event=>{
  if(event.target.open)loadArchivedPlayers().catch(err=>{$("tm-players-archived-feedback").textContent=err.message;});
 });
 const profilePanel=$("tm-players-profile"),playersTable=playersPage.querySelector(".tm-players-panel:not(#tm-players-profile)"),profileNav=$("tm-players-profile-nav"),playersHeader=playersPage.querySelector(".tm-players-heading-minimal");
 const profileFields=[["Nome","name","text"],["Sexo","sex","sex"],["Peso inicial (kg)","weight_kg","number"],["Posição em campo","field_position","position"],["Ponto braço (cm)","arm_point","number"],["Ponto coxa (cm)","thigh_point","number"],["Data de nascimento","birth_date","date"],["Plano de acompanhamento","followup_plan","followup"],["Data de renovação do acompanhamento","followup_renewal_date","date"],["Notas internas","profile_notes","textarea"]];
 let loadingPhotoPreviewSeq=0,stagedLoadingPhoto=null,playerLoadingPhotoEditing=false;
 function updateLoadingPhotoSaveState(){
  const button=$("tm-player-loading-photo-save");
  button.disabled=!stagedLoadingPhoto;
  button.classList.remove("is-saved");
  button.textContent="Guardar imagem";
 }
 function temporaryLoadingPhotoMessage(message){
  const feedback=$("tm-player-loading-photo-feedback"),token=profileLoadToken;
  feedback.textContent=message;
  window.setTimeout(()=>{if(token===profileLoadToken&&feedback.textContent===message)feedback.textContent="";},4000);
 }
 function refreshPlayerLoadingPhoto(){
  const seq=++loadingPhotoPreviewSeq,uid=playerDetails?.user_id;
  const box=$("tm-player-loading-photo-preview"),remove=$("tm-player-loading-photo-delete"),input=$("tm-player-loading-photo-input"),feedback=$("tm-player-loading-photo-feedback");
  stagedLoadingPhoto=null;updateLoadingPhotoSaveState();
  $("tm-player-loading-photo-edit").hidden=playerLoadingPhotoEditing||!uid;
  $("tm-player-loading-photo-actions").hidden=!playerLoadingPhotoEditing;
  box.replaceChildren();remove.hidden=true;input.disabled=!uid;
  if(!uid){box.append(el("span","","Este jogador ainda não tem conta associada."));feedback.textContent="";return;}
  box.append(el("span","","A verificar fotografia…"));
  // The image must load eagerly while detached; a detached lazy image never fires onload.
  const image=el("img");image.alt="Fotografia de carregamento";image.loading="eager";image.decoding="async";
  image.onload=()=>{
   if(seq!==loadingPhotoPreviewSeq||playerDetails?.user_id!==uid)return;
   box.replaceChildren(image);remove.hidden=false;
   updateLoadingPhotoSaveState();
  };
  image.onerror=()=>{
   if(seq!==loadingPhotoPreviewSeq||playerDetails?.user_id!==uid)return;
   box.replaceChildren(el("span","","Sem fotografia de carregamento"));remove.hidden=true;
   updateLoadingPhotoSaveState();
  };
  image.src="/api/players/"+encodeURIComponent(uid)+"/loading-photo?v="+Date.now();
 }
 async function resizePlayerLoadingPhoto(file){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Escolhe uma imagem JPG, PNG ou WebP.");
  if(file.size>15*1024*1024)throw Error("A fotografia original deve ter até 15 MB.");
  // Already optimized WebP files (including the supplied Dalot photo) must not
  // be re-encoded: some browsers can display WebP but cannot export WebP from canvas.
  if(file.type==="image/webp"&&file.size<=3*1024*1024){
   return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(Error("Não foi possível ler a fotografia."));
    reader.readAsDataURL(file);
   });
  }
  const picture=await new Promise((resolve,reject)=>{
   const img=new Image(),url=URL.createObjectURL(file);
   img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Não foi possível ler a fotografia."));};
   img.src=url;
  });
  const canvas=document.createElement("canvas");canvas.width=900;canvas.height=1600;
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Não foi possível otimizar a fotografia.");
  const scale=Math.max(900/picture.naturalWidth,1600/picture.naturalHeight);
  const width=picture.naturalWidth*scale,height=picture.naturalHeight*scale;
  ctx.drawImage(picture,(900-width)/2,(1600-height)/2,width,height);
  let data=canvas.toDataURL("image/webp",.79);
  // JPEG fallback is supported by the private endpoint and all target browsers.
  if(!data.startsWith("data:image/webp;"))data=canvas.toDataURL("image/jpeg",.77);
  if(!data.startsWith("data:image/webp;")&&!data.startsWith("data:image/jpeg;"))throw Error("Não foi possível otimizar a fotografia neste navegador.");
  if(data.length>4*1024*1024)throw Error("A imagem otimizada é demasiado grande.");
  return data;
 }
 $("tm-player-loading-photo-edit").addEventListener("click",()=>{
  if(!playerDetails?.user_id)return;
  playerLoadingPhotoEditing=true;
  $("tm-player-loading-photo-edit").hidden=true;
  $("tm-player-loading-photo-actions").hidden=false;
 });
 $("tm-player-loading-photo-cancel").addEventListener("click",()=>{
  playerLoadingPhotoEditing=false;
  $("tm-player-loading-photo-feedback").textContent="";
  refreshPlayerLoadingPhoto();
 });
 $("tm-player-loading-photo-input").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  const uid=playerDetails?.user_id,token=profileLoadToken,feedback=$("tm-player-loading-photo-feedback");
  event.target.disabled=true;feedback.textContent="A preparar imagem…";
  try{
   if(!uid)throw Error("O jogador ainda não tem uma conta associada.");
   const photo=await resizePlayerLoadingPhoto(file);
   if(profileLoadToken!==token||playerDetails?.user_id!==uid)return;
   stagedLoadingPhoto={uid,photo};
   const preview=$("tm-player-loading-photo-preview");
   const image=el("img");image.alt="Imagem App selecionada";image.src=photo;
   preview.replaceChildren(image);
   $("tm-player-loading-photo-delete").hidden=true;
   feedback.textContent="";
   updateLoadingPhotoSaveState(false);
  }catch(e){if(profileLoadToken===token)feedback.textContent="Não foi possível preparar: "+e.message;}
  finally{event.target.value="";event.target.disabled=!playerDetails?.user_id;}
 });
 $("tm-player-loading-photo-save").addEventListener("click",async()=>{
  const selected=stagedLoadingPhoto,token=profileLoadToken,feedback=$("tm-player-loading-photo-feedback");
  if(!selected||selected.uid!==playerDetails?.user_id)return;
  const button=$("tm-player-loading-photo-save");
  button.disabled=true;feedback.textContent="A guardar imagem…";
  try{
   await request("/api/players/"+encodeURIComponent(selected.uid)+"/loading-photo",{method:"PUT",body:JSON.stringify({photo:selected.photo})});
   if(profileLoadToken===token&&playerDetails?.user_id===selected.uid){
    playerLoadingPhotoEditing=false;refreshPlayerLoadingPhoto();
    temporaryLoadingPhotoMessage("Imagem guardada.");
   }
  }catch(e){
   if(profileLoadToken===token){feedback.textContent="Não foi possível guardar: "+e.message;button.disabled=false;}
  }
 });
 $("tm-player-loading-photo-delete").addEventListener("click",async()=>{
  const uid=playerDetails?.user_id,token=profileLoadToken,feedback=$("tm-player-loading-photo-feedback");
  if(!uid||!window.confirm("Remover a Imagem App deste jogador?"))return;
  const button=$("tm-player-loading-photo-delete");button.disabled=true;feedback.textContent="A eliminar…";
  try{await request("/api/players/"+encodeURIComponent(uid)+"/loading-photo",{method:"DELETE"});if(token===profileLoadToken&&playerDetails?.user_id===uid){playerLoadingPhotoEditing=false;refreshPlayerLoadingPhoto();temporaryLoadingPhotoMessage("Imagem removida.");}}
  catch(e){if(token===profileLoadToken)feedback.textContent="Erro: "+e.message;}
  finally{button.disabled=false;}
 });
 function displayPlayerProfile(){
  if(!playerProfile)return;
  const athlete={...playerProfile,...(playerDetails||{})},host=$("tm-players-profile-fields");host.replaceChildren();
  const settingsSlot=$("tm-players-settings-slot");
  settingsSlot.querySelector(".tm-player-permissions")?.remove();
  const photoHost=$("tm-players-profile-photo");photoHost.replaceChildren();
  const accountId=playerDetails?.user_id;
  const avatar=el("span","tm-player-photo-placeholder",(athlete.name||"").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase());
  if(accountId&&playerDetails.has_photo){
   const img=el("img","tm-player-photo-preview");img.src="/api/players/"+encodeURIComponent(accountId)+"/photo?reload="+Date.now();img.alt="Fotografia de "+athlete.name;img.onerror=()=>img.remove();avatar.append(img);
  }
  photoHost.append(avatar);
  refreshPlayerLoadingPhoto();
  const photoControl=$("tm-players-profile-photo-upload");
  photoControl.hidden=!playerProfileEditing;
  photoControl.closest(".tm-player-photo-control").hidden=!playerProfileEditing;
  photoControl.disabled=!accountId;
  $("tm-players-profile-title").textContent=athlete.name;
  host.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin:18px 0";
  for(const [caption,key,type] of profileFields){
   const wrapper=el("label","profile-info-card");wrapper.style.cssText="display:flex;flex-direction:column;gap:8px;padding:15px;border:1px solid #36363c;border-radius:12px;min-width:0";
   wrapper.append(el("small","",caption));
   if(!playerProfileEditing){
    const v=athlete[key];wrapper.append(el("strong","",v==null||v===""?"Por preencher":key==="sex"?(v==="F"?"Feminino":v==="M"?"Masculino":"Por definir"):String(v)+(key==="weight_kg"?" kg":key==="height_cm"?" cm":"")));
   }else{
    const field=type==="textarea"?el("textarea"):type==="sex"||type==="position"||type==="followup"?el("select"):el("input");
    if(type==="sex"){for(const [v,t] of [["","Por definir"],["F","Feminino"],["M","Masculino"]]){const o=el("option","",t);o.value=v;field.append(o);}}
    else if(type==="position"){for(const v of ["","GR","DD","DE","DC","MDC","MC","MOC","ED","EE","PL","Outro"]){const o=el("option","",v||"Por definir");o.value=v;field.append(o);}}
    else if(type==="followup"){for(const v of ["","Pro","Elite"]){const o=el("option","",v||"Por definir");o.value=v;field.append(o);}}
    else if(type!=="textarea"){field.type=type;if(type==="number"){field.min=key==="weight_kg"?"20":"0";field.max=key==="weight_kg"?"250":key==="arm_point"?"100":key==="thigh_point"?"150":"230";field.step="0.1";}}
    field.value=athlete[key]??"";field.dataset.playerProfileField=key;field.style.width="100%";wrapper.append(field);
   }
   host.append(wrapper);
  }

  // Account settings use the existing profile GET/PUT contract. The two
  // permissions remain opt-in and only change when "Guardar definições" is used.
  function permissionGlyph(parts){
   const ns="http://www.w3.org/2000/svg";
   const svg=document.createElementNS(ns,"svg");
   svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");
   svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");
   svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
   svg.setAttribute("aria-hidden","true");
   for(const pathData of parts){
    const p=document.createElementNS(ns,"path");p.setAttribute("d",pathData);svg.append(p);
   }
   return svg;
  }
  const permissions=el("section","tm-player-permissions");
  permissions.setAttribute("aria-labelledby","tm-player-permissions-title");
  const permissionHeading=el("div","tm-player-permissions-heading");
  const shield=el("span","tm-player-permissions-shield");
  shield.append(permissionGlyph(["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"]));
  const heading=el("h4","tm-player-permissions-title","Permissões e definições da conta");
  heading.id="tm-player-permissions-title";
  permissionHeading.append(shield,heading);
  permissions.append(permissionHeading);
  const permissionList=el("div","tm-player-permissions-list");
  function permissionRow({key,title,description,enabled,activeText,inactiveText,paths,ariaLabel}){
   const row=el("div","tm-player-permission-row"+(enabled?" is-enabled":""));
   const icon=el("span","tm-player-permission-icon");
   icon.append(permissionGlyph(paths));
   const copy=el("div","tm-player-permission-copy");
   copy.append(el("strong","tm-player-permission-name",title));
   copy.append(el("p","tm-player-permission-description",description));
   const actions=el("div","tm-player-permission-actions");
   const switchLabel=el("label","tm-player-permission-switch");
   const input=el("input","tm-player-permission-input");
   input.type="checkbox";input.checked=!!enabled;
   input.disabled=playerProfileEditing;
   input.setAttribute("aria-label",ariaLabel);
   input.dataset.playerPermissionField=key;
   const track=el("span","tm-player-permission-track");
   track.setAttribute("aria-hidden","true");
   switchLabel.append(input,track);
   const badge=el("span","tm-player-permission-state",enabled?activeText:inactiveText);
   badge.setAttribute("aria-live","polite");
   input.addEventListener("change",()=>{
    row.classList.toggle("is-enabled",input.checked);
    badge.textContent=input.checked?activeText:inactiveText;
    reflectPermissionChanges();
   });
   actions.append(switchLabel,badge);
   row.append(icon,copy,actions);
   permissionList.append(row);
  }
  permissionRow({
   key:"meal_option_selection_enabled",
   title:"Seleção de opções pelo nutricionista",
   description:"Permite definir opções específicas por refeição e data no Planeamento.",
   enabled:athlete.meal_option_selection_enabled,
   activeText:"Ativada",inactiveText:"Desativada",
   ariaLabel:"Ativar seleção de opções alimentares pelo nutricionista",
   paths:["M9 6h12","M9 12h12","M9 18h12","m3 6 2 2 3-4","m3 12 2 2 3-4","m3 18 2 2 3-4"]
  });
  permissionRow({
   key:"visual_portions_enabled",
   title:"Porções visuais",
   description:"Referências fotográficas para Almoço e Jantar.",
   enabled:athlete.visual_portions_enabled,
   activeText:"Ativadas",inactiveText:"Desativadas",
   ariaLabel:"Ativar porções visuais para este jogador",
   paths:["M4 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z","M7 2h13a2 2 0 0 1 2 2v12","m3 17 5-5 4 4 3-3 4 4","M7 9h.01"]
  });
  permissions.append(permissionList);
  const settingsActions=el("div","tm-player-settings-actions");
  const settingsSave=el("button","tm-player-settings-save","Guardar definições");
  const settingsCancel=el("button","tm-player-settings-cancel","Cancelar");
  settingsSave.type="button";settingsCancel.type="button";
  settingsActions.append(settingsSave,settingsCancel);
  settingsActions.hidden=true;
  const settingsFeedback=el("p","tm-player-settings-feedback");
  settingsFeedback.setAttribute("role","status");
  settingsFeedback.setAttribute("aria-live","polite");
  permissions.append(settingsActions,settingsFeedback);
  settingsSlot.prepend(permissions);
  let savedSettings={
   meal_option_selection_enabled:!!athlete.meal_option_selection_enabled,
   visual_portions_enabled:!!athlete.visual_portions_enabled
  };
  const permissionInputs=[...permissionList.querySelectorAll("[data-player-permission-field]")];
  function readPermissions(){
   return {
    meal_option_selection_enabled:permissionInputs.find(i=>i.dataset.playerPermissionField==="meal_option_selection_enabled").checked,
    visual_portions_enabled:permissionInputs.find(i=>i.dataset.playerPermissionField==="visual_portions_enabled").checked
   };
  }
  function reflectPermissionChanges(){
   const values=readPermissions();
   settingsActions.hidden=playerProfileEditing||Object.keys(savedSettings).every(key=>savedSettings[key]===values[key]);
   settingsFeedback.textContent="";
  }
  settingsCancel.addEventListener("click",()=>{
   permissionInputs.forEach(input=>{
    input.checked=savedSettings[input.dataset.playerPermissionField];
    input.dispatchEvent(new Event("change"));
   });
  });
  settingsSave.addEventListener("click",async()=>{
   if(!playerProfile||playerProfileEditing)return;
   const selectedId=playerProfile.id,selectedToken=profileLoadToken,flags=readPermissions();
   settingsSave.disabled=true;settingsCancel.disabled=true;
   permissionInputs.forEach(input=>input.disabled=true);
   try{
    // The profile endpoint requires core fields. Send the last SAVED values,
    // never unsaved personal data; images and access are excluded.
    const a={...playerProfile,...(playerDetails||{})};
    await request("/api/v2/athletes/"+encodeURIComponent(selectedId)+"/profile",{method:"PUT",body:JSON.stringify({
     name:a.name,sex:a.sex||null,weight_kg:a.weight_kg??null,height_cm:a.height_cm??null,
     profile_notes:a.profile_notes??"",field_position:a.field_position??null,
     arm_point:a.arm_point??null,thigh_point:a.thigh_point??null,
     followup_plan:a.followup_plan??null,followup_renewal_date:a.followup_renewal_date??null,
     ...flags
    })});
    if(selectedToken!==profileLoadToken||playerProfile?.id!==selectedId)return;
    savedSettings={...flags};
    Object.assign(playerProfile,flags);
    playerDetails={...playerDetails,...flags};
    settingsActions.hidden=true;
    settingsFeedback.textContent="Definições guardadas.";
    window.setTimeout(()=>{if(selectedToken===profileLoadToken&&settingsFeedback.textContent==="Definições guardadas.")settingsFeedback.textContent="";},4000);
   }catch(e){if(selectedToken===profileLoadToken)settingsFeedback.textContent="Não foi possível guardar: "+e.message;}
   finally{
    if(selectedToken===profileLoadToken&&playerProfile?.id===selectedId){
     permissionInputs.forEach(input=>input.disabled=playerProfileEditing);
     settingsSave.disabled=false;settingsCancel.disabled=false;
    }
   }
  });
  $("tm-players-profile-edit").hidden=playerProfileEditing;
  $("tm-players-profile-save").hidden=!playerProfileEditing;
  $("tm-players-profile-cancel").hidden=!playerProfileEditing;
 }
 function closePlayerProfile(){
  ++profileLoadToken;
  profileNav.hidden=true;playersHeader.hidden=false;
  if(dashboardReturn)dashboardReturn.hidden=false;
  profilePanel.hidden=true;playersTable.hidden=false;playerProfile=null;playerDetails=null;playerPhotoData=null;playerProfileEditing=false;playerLoadingPhotoEditing=false;stagedLoadingPhoto=null;playerAccess=null;accessToggle.hidden=true;$("tm-players-password-toggle").hidden=true;resetPasswordForm();
  $("tm-players-profile-feedback").textContent="";
 }
 async function openPlayerProfile(aid){
  const token=++profileLoadToken;
  playersHeader.hidden=true;profileNav.hidden=false;
  if(dashboardReturn)dashboardReturn.hidden=true;
  playersTable.hidden=true;profilePanel.hidden=false;playerProfileEditing=false;playerLoadingPhotoEditing=false;stagedLoadingPhoto=null;playerDetails=null;playerPhotoData=null;
  $("tm-player-loading-photo-feedback").textContent="";
  window.scrollTo({top:0,behavior:"smooth"});
  $("tm-players-profile-title").textContent="A carregar perfil…";$("tm-players-profile-fields").replaceChildren();
  $("tm-players-profile-feedback").textContent="";
  try{
   const [data,additional]=await Promise.all([request("/api/v2/athletes/"+encodeURIComponent(aid)+"/microcycles"),request("/api/v2/athletes/"+encodeURIComponent(aid)+"/profile")]);
   if(profilePanel.hidden||token!==profileLoadToken)return;
   playerProfile=data.athlete;playerDetails=additional.details;displayPlayerProfile();loadPlayerAccess(aid,token);
  }catch(e){if(token===profileLoadToken)$("tm-players-profile-feedback").textContent="Não foi possível carregar o perfil: "+e.message;}
 }
 $("tm-players-profile-back").addEventListener("click",closePlayerProfile);
 $("tm-players-profile-edit").addEventListener("click",()=>{
  if(!playerProfile)return;
  if(stagedLoadingPhoto){$("tm-player-loading-photo-feedback").textContent="Guarda ou cancela a Imagem App antes de editar os dados.";return;}
  playerProfileEditing=true;playerPhotoData=null;displayPlayerProfile();
 });
 $("tm-players-profile-photo-upload").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  const feedback=$("tm-players-profile-feedback");
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>3*1024*1024){feedback.textContent="Usa uma fotografia JPG, PNG ou WebP até 3 MB.";event.target.value="";return;}
  try{
   const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Não foi possível ler a fotografia."));reader.readAsDataURL(file);});
   if(!playerProfileEditing)return;
   playerPhotoData=value;feedback.textContent="Fotografia pronta. Guarda o perfil para aplicar.";
  }catch(e){feedback.textContent=e.message;}
 });
 $("tm-players-profile-cancel").addEventListener("click",()=>{playerProfileEditing=false;playerPhotoData=null;$("tm-players-profile-photo-upload").value="";displayPlayerProfile();});
 $("tm-players-profile-save").addEventListener("click",async()=>{
  if(!playerProfile)return;
  const button=$("tm-players-profile-save");button.disabled=true;
  const get=k=>profilePanel.querySelector('[data-player-profile-field="'+k+'"]').value;
  const rawWeight=get("weight_kg");
  try{
   const selectedId=playerProfile.id,selectedToken=profileLoadToken;
   const result=await request("/api/v2/athletes/"+encodeURIComponent(selectedId)+"/profile",{method:"PUT",body:JSON.stringify({
    name:get("name").trim(),sex:get("sex")||null,weight_kg:rawWeight===""?null:Number(rawWeight),height_cm:playerProfile.height_cm??null,profile_notes:get("profile_notes"),field_position:get("field_position"),arm_point:get("arm_point")===""?null:Number(get("arm_point")),thigh_point:get("thigh_point")===""?null:Number(get("thigh_point")),birth_date:get("birth_date"),followup_plan:get("followup_plan"),followup_renewal_date:get("followup_renewal_date"),meal_option_selection_enabled:!!playerDetails?.meal_option_selection_enabled,visual_portions_enabled:!!playerDetails?.visual_portions_enabled,...(playerPhotoData?{photo:playerPhotoData}:{})
   })});
   if(selectedToken!==profileLoadToken||playerProfile?.id!==selectedId)return;
   playerProfile=result.athlete;playerDetails={...playerDetails,birth_date:result.athlete.birth_date,followup_plan:result.athlete.followup_plan,followup_renewal_date:result.athlete.followup_renewal_date,meal_option_selection_enabled:result.athlete.meal_option_selection_enabled,visual_portions_enabled:result.athlete.visual_portions_enabled,has_photo:result.athlete.has_photo,user_id:result.athlete.user_id};
   playerProfileEditing=false;playerPhotoData=null;$("tm-players-profile-photo-upload").value="";displayPlayerProfile();
   $("tm-players-profile-feedback").textContent="Perfil guardado.";
   if(typeof window.tmSyncPlanningAthleteProfile==="function")window.tmSyncPlanningAthleteProfile(playerProfile);
   loadPlayers().catch(e=>{$("tm-players-error").textContent="Atualiza a lista de jogadores: "+e.message;});
  }catch(e){$("tm-players-profile-feedback").textContent="Não foi possível guardar: "+e.message;}
  finally{button.disabled=false;}
 });
 let playersData=[],playersLoaded=false,selectedPlayerId=null;
 const playerSearchInput=$("tm-players-filter"),playerSearchClear=$("tm-players-search-clear");
 const playerSearchHost=$("tm-players-search-combobox");
 const playerSearchOptions=el("div","tm-player-search-list");
 playerSearchOptions.id="tm-players-search-options";
 playerSearchOptions.setAttribute("role","listbox");
 playerSearchOptions.setAttribute("aria-label","Escolher jogador");
 playerSearchOptions.hidden=true;
 document.body.append(playerSearchOptions);
 let playerSearchOpen=false,playerSearchMatches=[],playerSearchActive=-1;
 function normalized(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();}
 function matchesName(name,query){const words=normalized(name).split(/\s+/).filter(Boolean);return normalized(query).split(/\s+/).filter(Boolean).every(part=>words.some(word=>word.startsWith(part)));}
 function matchesPlayerSearch(player,query){
  const text=String(query||"").trim().replace(/^@/,"");
  return matchesName(player.name,text)||normalized(player.username).startsWith(normalized(text));
 }
 function filteredPlayerOptions(){
  const access=$("tm-players-access").value;
  return playersData.filter(player=>(access==="all"||player.access_status===access)&&matchesPlayerSearch(player,playerSearchInput.value));
 }
 function positionPlayerSuggestions(){
  if(!playerSearchOpen)return;
  const rect=playerSearchInput.getBoundingClientRect();
  const width=Math.min(rect.width,document.documentElement.clientWidth-16);
  const left=Math.max(8,Math.min(rect.left,document.documentElement.clientWidth-width-8));
  const below=window.innerHeight-rect.bottom-12,above=rect.top-12;
  const showAbove=below<175&&above>below;
  const space=Math.max(90,showAbove?above:below);
  const height=Math.min(320,space);
  playerSearchOptions.style.width=width+"px";
  playerSearchOptions.style.left=left+"px";
  playerSearchOptions.style.maxHeight=height+"px";
  playerSearchOptions.style.top=(showAbove?Math.max(8,rect.top-6-Math.min(height,playerSearchOptions.scrollHeight)):rect.bottom+6)+"px";
 }
 function closePlayerSuggestions(){
  playerSearchOpen=false;playerSearchOptions.hidden=true;playerSearchActive=-1;
  playerSearchInput.setAttribute("aria-expanded","false");
  playerSearchInput.removeAttribute("aria-activedescendant");
 }
 function highlightPlayerSuggestion(index){
  if(!playerSearchMatches.length)return;
  playerSearchActive=(index+playerSearchMatches.length)%playerSearchMatches.length;
  for(const [i,item] of [...playerSearchOptions.querySelectorAll('[role="option"]')].entries()){
   const active=i===playerSearchActive;
   item.classList.toggle("is-active",active);
   item.setAttribute("aria-selected",String(active));
   if(active){
    playerSearchInput.setAttribute("aria-activedescendant",item.id);
    item.scrollIntoView({block:"nearest"});
   }
  }
 }
 function choosePlayerSuggestion(player){
  selectedPlayerId=player.id;
  playerSearchInput.value=player.name;
  playerSearchClear.hidden=false;
  closePlayerSuggestions();
  playerSearchInput.blur();
  renderPlayers();
 }
 function renderPlayerSuggestions(){
  if(!playerSearchOpen)return;
  playerSearchOptions.replaceChildren();
  playerSearchMatches=filteredPlayerOptions();
  playerSearchActive=-1;
  playerSearchInput.removeAttribute("aria-activedescendant");
  if(!playerSearchMatches.length){
   playerSearchOptions.append(el("p","tm-player-search-empty",playersLoaded?"Nenhum jogador encontrado.":"A carregar jogadores…"));
  }
  for(const [index,player] of playerSearchMatches.entries()){
   const option=el("button","tm-player-search-option");
   option.type="button";option.id="tm-player-search-option-"+index;
   option.setAttribute("role","option");option.setAttribute("aria-selected","false");
   const avatar=el("span","tm-player-search-avatar",String(player.name||"").split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase());
   if(player.has_photo&&player.user_id){
    const image=el("img");image.src="/api/players/"+encodeURIComponent(player.user_id)+"/photo?thumb=1";
    image.alt="";image.loading="lazy";image.addEventListener("error",()=>image.remove());avatar.append(image);
   }
   const copy=el("span","tm-player-search-copy");
   copy.append(el("strong","",player.name),el("small","",player.username?"@"+player.username:"Conta ainda não criada"));
   option.append(avatar,copy);
   option.addEventListener("click",()=>choosePlayerSuggestion(player));
   playerSearchOptions.append(option);
  }
  positionPlayerSuggestions();
 }
 function openPlayerSuggestions(){
  if(playersPage.hidden||!profilePanel.hidden)return;
  playerSearchOpen=true;playerSearchOptions.hidden=false;
  playerSearchInput.setAttribute("aria-expanded","true");
  renderPlayerSuggestions();
 }
 playerSearchInput.addEventListener("focus",openPlayerSuggestions);
 playerSearchInput.addEventListener("click",openPlayerSuggestions);
 playerSearchInput.addEventListener("input",()=>{
  selectedPlayerId=null;
  playerSearchClear.hidden=!playerSearchInput.value;
  renderPlayers();
  openPlayerSuggestions();
 });
 playerSearchInput.addEventListener("keydown",event=>{
  if(event.key==="Escape"){if(playerSearchOpen){event.preventDefault();closePlayerSuggestions();}return;}
  if(event.key==="Tab"){closePlayerSuggestions();return;}
  if(event.key==="ArrowDown"||event.key==="ArrowUp"){
   event.preventDefault();
   if(!playerSearchOpen)openPlayerSuggestions();
   if(playerSearchMatches.length)highlightPlayerSuggestion(playerSearchActive+(event.key==="ArrowDown"?1:-1));
  }else if(event.key==="Enter"&&playerSearchOpen&&playerSearchActive>=0){
   event.preventDefault();choosePlayerSuggestion(playerSearchMatches[playerSearchActive]);
  }
 });
 playerSearchClear.addEventListener("click",()=>{
  selectedPlayerId=null;playerSearchInput.value="";playerSearchClear.hidden=true;
  closePlayerSuggestions();renderPlayers();
 });
 document.addEventListener("pointerdown",event=>{
  if(playerSearchOpen&&!playerSearchHost.contains(event.target)&&!playerSearchOptions.contains(event.target))closePlayerSuggestions();
 });
 window.addEventListener("resize",positionPlayerSuggestions);
 window.addEventListener("scroll",positionPlayerSuggestions,true);
 const playerStatus={active:"Ativo",no_account:"Sem conta",inactive:"Inativo"};
 const fullDate=d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4):"—";
 function renderPlayers(){
  const body=$("tm-players-body");body.replaceChildren();
  const term=playerSearchInput.value,filter=$("tm-players-access").value;
  playerSearchClear.hidden=!term;
  const items=playersData.filter(p=>(filter==="all"||p.access_status===filter)&&(selectedPlayerId!==null?p.id===selectedPlayerId:matchesPlayerSearch(p,term)));
  for(const p of items){
   const card=el("article","tm-player-card");card.setAttribute("role","listitem");
   const identity=el("div","tm-player-card-identity");
   const link=el("button","tm-p-player");link.type="button";
   const avatar=el("span","tm-p-avatar",p.name.split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase());
   if(p.has_photo&&p.user_id){
    const img=el("img");img.src="/api/players/"+encodeURIComponent(p.user_id)+"/photo?thumb=1";img.alt="";img.loading="lazy";img.addEventListener("error",()=>img.remove());avatar.append(img);
   }
   const person=el("span","tm-p-identity");person.append(el("strong","",p.name),el("small","",p.username?"@"+p.username:"Conta ainda não criada"));
   link.append(avatar,person);link.addEventListener("click",()=>openPlayerProfile(p.id));identity.append(link);
   const status=el("div","tm-player-card-status");
   status.append(el("span","tm-p-status tm-p-"+p.access_status,playerStatus[p.access_status]||"—"));
   const renewal=el("div","tm-player-card-renewal");
   renewal.append(el("span","tm-player-card-meta-label","Renovação"));
   const renewalDate=el("time","tm-p-renewal",fullDate(p.renewal_date));
   if(p.renewal_date)renewalDate.dateTime=p.renewal_date;
   renewal.append(renewalDate);
   const action=el("div","tm-player-card-actions");
   const actions=el("div","tm-p-actions-wrap");
   const go=el("button","tm-p-icon-action");go.type="button";
   go.title="Ver perfil";go.setAttribute("aria-label","Ver perfil de "+p.name);
   go.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
   go.addEventListener("click",()=>openPlayerProfile(p.id));actions.append(go);
   const app=el("button","tm-p-icon-action tm-p-app-action");app.type="button";
   app.title="Entrar na app";app.setAttribute("aria-label","Entrar na app de "+p.name);
   app.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>';
   app.disabled=p.access_status!=="active"||!p.user_id;
   app.title=app.disabled?"Jogador sem acesso ativo":"Entrar na app";
   app.addEventListener("click",()=>enterPlayerApp(p.user_id,app,$("tm-players-error")));
   actions.append(app);action.append(actions);
   card.append(identity,status,renewal,action);
   // On small screens the full card opens the profile, except its action buttons.
   card.addEventListener("click",event=>{
    if(!window.matchMedia("(max-width: 830px)").matches)return;
    if(event.target.closest("button,a,input,select,textarea"))return;
    openPlayerProfile(p.id);
   });
   card.addEventListener("keydown",event=>{
    if(!window.matchMedia("(max-width: 830px)").matches||event.target!==card)return;
    if(event.key==="Enter"||event.key===" "){event.preventDefault();openPlayerProfile(p.id);}
   });
   if(window.matchMedia("(max-width: 830px)").matches){
    card.tabIndex=0;card.setAttribute("aria-label","Abrir perfil de "+p.name);
   }
   body.append(card);
  }
  if(!items.length)body.append(el("p","tm-p-empty","Nenhum jogador corresponde aos filtros."));
 }
 async function loadPlayers(){
  const data=await request("/api/v2/admin/players-overview");
  playersData=data.players||[];playersLoaded=true;
  if(selectedPlayerId!==null&&!playersData.some(player=>player.id===selectedPlayerId)){
   selectedPlayerId=null;playerSearchInput.value="";
  }
  renderPlayers();renderPlayerSuggestions();
 }
 window.tmRefreshPlayersList=()=>loadPlayers();
 function openPlayersList(){closeClinical();
  if($("admin-workspace").hidden)return;
  section.hidden=true;legacy.hidden=true;playersPage.hidden=false;navActive(playersBtn);
  closePlayerProfile();
  $("tm-players-error").textContent="";
  loadPlayers().catch(e=>{$("tm-players-error").textContent="Não foi possível carregar os jogadores: "+e.message;});
  window.scrollTo({top:0,behavior:"smooth"});
 }
 // Move the existing create button beside search on small screens only.
 // Keep its original listener and restore the exact desktop DOM on resize.
 const playersMobileQuery=window.matchMedia("(max-width: 830px)");
 const playersCreateButton=$("tm-players-new");
 const playersCreateHome=playersCreateButton.parentNode;
 const playersCreateAnchor=document.createComment("tm-players-create-original-position");
 playersCreateHome.insertBefore(playersCreateAnchor,playersCreateButton);
 const playersSearchCell=$("tm-players-filter-panel");
 function arrangeMobilePlayerSearch(){
  if(playersMobileQuery.matches){
   if(playersCreateButton.parentNode!==playersSearchCell)playersSearchCell.append(playersCreateButton);
  }else if(playersCreateButton.parentNode!==playersCreateHome){
   playersCreateHome.insertBefore(playersCreateButton,playersCreateAnchor.nextSibling);
  }
  if(!playersPage.hidden&&!profilePanel.hidden)return;
  if(!playersPage.hidden)renderPlayers();
 }
 playersMobileQuery.addEventListener("change",arrangeMobilePlayerSearch);
 arrangeMobilePlayerSearch();
 $("tm-players-access").addEventListener("change",()=>{
  if(selectedPlayerId!==null){
   selectedPlayerId=null;playerSearchInput.value="";playerSearchClear.hidden=true;
  }
  closePlayerSuggestions();
  const selector=$("tm-players-access");
  $("tm-players-access-value").textContent=selector.options[selector.selectedIndex]?.textContent||"Todos";
  renderPlayers();
 });
 $("tm-players-new").addEventListener("click",()=>{
  if(typeof window.tmOpenPlayerCreate==="function")window.tmOpenPlayerCreate();
 });
 function showError(err){$("tm-db-error").textContent="Não foi possível consultar o Dashboard: "+err.message;}
 function paintEvents(data){
  const host=$("tm-db-events"),recentHost=$("tm-db-recent");host.replaceChildren();recentHost.replaceChildren();
  const t=data.today_events||{};
  const makeItem=(item,label,day,highlight=false,target="planning")=>{
   const btn=el("button","tm-db-event"+(highlight?" tm-db-birthday":"")+(item.match_id?" tm-db-game":""));btn.type="button";
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

 // In-table search uses the entire first header cell and a portal dropdown,
 // so suggestions are never clipped by the weekly grid's scroll container.
 let dashboardPickerCleanup=null;
 function setupDashboardPlayerPicker(search,players,applyPlayerFilter){
  const results=el("div","tm-db-player-results");results.id="tm-db-player-results";
  results.setAttribute("role","listbox");results.setAttribute("aria-label","Filtrar jogador no microciclo");
  results.hidden=true;document.body.append(results);
  let choices=[],active=-1;
  const close=()=>{
   results.hidden=true;search.setAttribute("aria-expanded","false");
   search.removeAttribute("aria-activedescendant");active=-1;
  };
  const position=()=>{
   if(results.hidden)return;
   const rect=search.getBoundingClientRect();
   const vw=document.documentElement.clientWidth;
   const width=Math.min(Math.max(rect.width,268),Math.max(180,vw-16));
   results.style.width=width+"px";
   results.style.left=Math.max(8,Math.min(rect.left,vw-width-8))+"px";
   const below=window.innerHeight-rect.bottom-10;
   const above=rect.top-10;
   const abovePreferred=below<200&&above>below;
   const room=Math.max(100,abovePreferred?above:below);
   const height=Math.min(320,room);
   results.style.maxHeight=height+"px";
   results.style.top=(abovePreferred?Math.max(8,rect.top-6-Math.min(height,results.scrollHeight)):rect.bottom+6)+"px";
  };
  const choose=value=>{
   playerQuery=value;search.value=value;applyPlayerFilter();close();search.blur();
  };
  const highlight=index=>{
   if(!choices.length)return;
   active=(index+choices.length)%choices.length;
   for(const [i,node] of [...results.querySelectorAll('[role="option"]')].entries()){
    const selected=i===active;node.classList.toggle("is-active",selected);
    node.setAttribute("aria-selected",String(selected));
    if(selected){
     search.setAttribute("aria-activedescendant",node.id);
     node.scrollIntoView({block:"nearest"});
    }
   }
  };
  const open=()=>{
   const query=search.value.trim();
   choices=[{value:"",title:"Todos os jogadores",detail:"Mostrar o microciclo completo"}];
   for(const player of players||[]){
    if(matchesPlayer(player.name,query))choices.push({
     value:player.name,title:player.name,detail:"Filtrar microciclo semanal"
    });
   }
   results.replaceChildren();active=-1;search.removeAttribute("aria-activedescendant");
   for(const [i,item] of choices.entries()){
    const btn=el("button","tm-db-player-option");btn.type="button";
    btn.id="tm-db-player-option-"+i;
    btn.setAttribute("role","option");btn.setAttribute("aria-selected","false");
    btn.append(el("strong","tm-db-player-option-title",item.title),el("small","tm-db-player-option-detail",item.detail));
    btn.addEventListener("mousedown",event=>event.preventDefault());
    btn.addEventListener("click",()=>choose(item.value));
    results.append(btn);
   }
   if(choices.length===1&&query){
    results.append(el("p","tm-db-player-option-empty","Nenhum jogador encontrado."));
   }
   results.hidden=false;search.setAttribute("aria-expanded","true");position();
  };
  search.addEventListener("focus",open);
  search.addEventListener("click",open);
  search.addEventListener("input",()=>{
   playerQuery=search.value;applyPlayerFilter();open();
  });
  search.addEventListener("keydown",event=>{
   if(event.key==="Escape"){if(!results.hidden){event.preventDefault();close();}return;}
   if(event.key==="Tab"){close();return;}
   if(event.key==="ArrowDown"||event.key==="ArrowUp"){
    event.preventDefault();if(results.hidden)open();
    highlight(active+(event.key==="ArrowDown"?1:-1));
   }else if(event.key==="Enter"&&!results.hidden&&active>=0){
    event.preventDefault();choose(choices[active].value);
   }
  });
  const outside=event=>{
   if(!results.hidden&&event.target!==search&&!results.contains(event.target))close();
  };
  const onScroll=event=>{
   if(!results.hidden&&event.target!==results&&!results.contains(event.target))close();
  };
  document.addEventListener("pointerdown",outside);
  document.addEventListener("scroll",onScroll,true);
  window.addEventListener("resize",position);
  dashboardPickerCleanup=()=>{
   document.removeEventListener("pointerdown",outside);
   document.removeEventListener("scroll",onScroll,true);
   window.removeEventListener("resize",position);results.remove();
  };
 }
 function renderTable(data){dashboardPickerCleanup?.();dashboardPickerCleanup=null;const head=$("tm-db-thead"),body=$("tm-db-tbody");head.replaceChildren();body.replaceChildren();const today=data.today;const header=el("tr");const name=el("th","tm-db-name-cell");const searchWrap=el("div","tm-db-search-wrap");const glyph=el("span","tm-db-search-glyph");
 glyph.setAttribute("aria-hidden","true");glyph.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
 const search=el("input","tm-db-search");search.type="search";search.placeholder="Filtrar jogador";
 search.setAttribute("role","combobox");search.setAttribute("aria-autocomplete","list");
 search.setAttribute("aria-haspopup","listbox");search.setAttribute("aria-controls","tm-db-player-results");
 search.setAttribute("aria-expanded","false");search.setAttribute("aria-label","Filtrar jogadores da matriz");
 search.autocomplete="off";search.value=playerQuery;
 searchWrap.append(glyph,search);name.append(searchWrap);header.append(name);
 const days=Array.from({length:7},(_,i)=>shifted(weekMonday,i));for(const [i,day] of days.entries()){const th=el("th",day===today?"tm-db-today":"");const lab=el("div","tm-db-date",["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][i]);const d=el("div","tm-db-day",dateLabel(day));const ico=el("div","tm-db-five-cols tm-db-icon-row");for(const kind of icons){const slot=el("span");slot.append(hugeIcon(kind));ico.append(slot);}th.append(lab,d,ico);header.append(th);}head.append(header);
 for(const player of data.players||[]){const tr=el("tr");tr.dataset.name=player.name;const first=el("td","tm-db-name-cell");const btn=el("button","tm-db-player-name");const avatar=el("span","tm-db-avatar");avatar.setAttribute("aria-hidden","true");avatar.textContent=player.name.split(/\s+/).slice(0,2).map(n=>n[0]||"").join("").toUpperCase();if(player.has_photo&&player.user_id){const img=el("img","tm-db-avatar-photo");img.src="/api/players/"+encodeURIComponent(player.user_id)+"/photo?thumb=1";img.alt="";img.loading="lazy";img.addEventListener("error",()=>img.remove());avatar.append(img);}btn.append(avatar,el("span","tm-db-player-text",player.name));btn.addEventListener("click",()=>openPlayers(player.id));first.append(btn);tr.append(first);for(const item of player.days){const td=el("td",item.date===today?"tm-db-today":"");const isOff=Boolean(item.is_off)||["Off","Off (+1)","Off (+2)"].includes(item.classification);
 const state=item.classification==="MD"?" tm-db-match":isOff?" tm-db-off":item.classification==="Geral"?" tm-db-general":"";
 const pendingGeneral=Boolean(item.needs_confirmation)&&item.classification==="Geral";
 const cell=el("button","tm-db-cell"+state+(pendingGeneral?" tm-db-general-pending":""));cell.type="button";
 cell.setAttribute("aria-label",player.name+", "+item.date+", "+(pendingGeneral?"Geral, por definir":item.classification||"sem MD"));
 if(pendingGeneral){
  const stateHeading=el("span","tm-db-pending-state");
  stateHeading.append(el("span","tm-db-md","Geral"),el("span","tm-db-pending-hint","por definir"));
  cell.append(stateHeading);
 }else cell.append(el("span","tm-db-md",item.classification||"—"));const dots=el("span","tm-db-five-cols tm-db-dots");for(const meal of meals){const value=item.colors?.[meal];const dot=el("span","tm-db-dot "+(value?("tm-db-"+value):"tm-db-none-dot"));dot.title=({breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"}[meal]||meal)+": "+(value||"não prescrito");dots.append(dot);}cell.append(dots);cell.addEventListener("click",()=>openPlayers(player.id,item.date));td.append(cell);tr.append(td);}body.append(tr);}
 const applyPlayerFilter=()=>{
  let count=0;
  for(const tr of body.children){
   tr.hidden=!matchesPlayer(tr.dataset.name,playerQuery);
   if(!tr.hidden)count++;
  }
  $("tm-db-count").textContent=count+" jogador"+(count===1?"":"es");
 };
 setupDashboardPlayerPicker(search,data.players||[],applyPlayerFilter);
 applyPlayerFilter();
 $("tm-db-week-title").textContent=dateLabel(days[0])+" – "+dateLabel(days[6]);$("tm-db-today-date").textContent=new Intl.DateTimeFormat("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(today+"T12:00:00Z"));
 }
 async function load(){const id=++seq;if(!weekMonday)weekMonday=monday(dateParts(new Date()));$("tm-db-error").textContent="";$("tm-db-events").textContent="A consultar…";$("tm-db-recent").textContent="A consultar…";const res=await request("/api/v2/admin/dashboard?week="+encodeURIComponent(weekMonday));if(id!==seq)return;cache=res;renderTable(res);paintEvents(res);}
 $("tm-db-prev").addEventListener("click",()=>{weekMonday=shifted(weekMonday,-7);load().catch(showError);});
 $("tm-db-next").addEventListener("click",()=>{weekMonday=shifted(weekMonday,7);load().catch(showError);});
 $("tm-db-go-today").addEventListener("click",()=>{weekMonday=monday(dateParts(new Date()));load().catch(showError);});
})();

/* Navigate from standalone nutrition pages to the corresponding Backoffice section. */
(()=>{
 const target=new URLSearchParams(window.location.search).get("nav");
 const allowed=new Set(["players","planning","create-plan","food-library","visual-portions","menus-recipes","dishes","recipe-library","assessments","forms","dashboard","settings","account"]);
 if(!allowed.has(target)||target==="dashboard")return;
 const workspace=document.getElementById("admin-workspace");
 const open=()=>{if(workspace?.hidden)return false;const button=document.getElementById("tm-admin-nav-"+target);if(!button)return false;
  if(target==="food-library")window.tmOpenAdminFoodLibrary?.("foods");
  else if(target==="visual-portions")window.tmOpenAdminFoodLibrary?.("portions");
  else button.click();window.history.replaceState(null,"",window.location.pathname);return true};
 if(open())return;
 const observer=new MutationObserver(()=>{if(open())observer.disconnect()});
 if(workspace)observer.observe(workspace,{attributes:true,attributeFilter:["hidden"]});
 window.addEventListener("load",()=>{if(open())observer.disconnect()},{once:true});
})();


/* Native selects are intentionally not replaced with decorative wrappers.
   The previous global wrapper obscured meal colours, overlaid event controls
   and changed table filter heights in both admin themes. The Planos editor
   has its own independent presentation and is not affected here. */
