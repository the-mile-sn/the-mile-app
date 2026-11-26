"use strict";
const $=id=>document.getElementById(id),names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"},colorNames={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"Verde preparação"};
// Native translations replace text only; never alter HTML/CSS or interactions.
let playerUiLanguage="pt";
const playerMealLanguages={
  pt:{breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"},
  en:{breakfast:"Breakfast",lunch:"Lunch",snack:"Snack",dinner:"Dinner",supper:"Supper"}
};
const playerColourLanguages={
  pt:{orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"Verde preparação"},
  en:{orange:"Orange",yellow:"Yellow",blue:"Blue",green:"Green",vp:"Preparation green"}
};
const playerTextBindings=[
  ["#tabs [data-tab='overview'] > span:last-child","Início","Home"],
  ["#tabs [data-tab='assessments'] > span:last-child","Progresso","Progress"],
  ["#tabs [data-tab='menus'] > span:last-child","Menus","Menus"],
  ["#tabs [data-tab='profile'] > span:last-child","Perfil","Profile"],
  ["#menus-recipe-switch [data-menu-mode='recipes']","Receitas","Recipes"],
  ["#player-panel .welcome p","Planeamento nutricional","Nutrition planning"],
  ["#profile-main .profile-plan-detail:first-child > span","Plano de acompanhamento","Support plan"],
  ["#profile-main .profile-renewal-detail > span","Data de renovação","Renewal date"],
  ["#profile-notifications-open .profile-notification-label","Notificações","Notifications"],
  ["#profile-language-label","Idioma","Language"],
  ["#menu-loading .loading-accessible-label","A carregar menus da semana","Loading this week's menus"],
  ["#player-session-retry","Tentar novamente","Try again"],
  ["#profile-password-open > span:nth-child(2)","Alterar palavra-passe","Change password"],
  ["#profile-logout > span:last-child","Terminar sessão","Sign out"],
  ["#profile-notifications-title","Notificações","Notifications"],
  ["#profile-notifications-page .profile-notifications-empty p","Ainda não existem notificações.","No notifications yet."],
  ["#profile-password-title","Alterar palavra-passe","Change password"],
  ["#profile-current-password + .mile-floating-label","Palavra-passe atual","Current password"],
  ["#profile-new-password + .mile-floating-label","Nova palavra-passe","New password"],
  ["#profile-confirm-password + .mile-floating-label","Confirmar nova palavra-passe","Confirm new password"],
  ["#profile-password-form .profile-password-save","Guardar nova palavra-passe","Save new password"],
  ["#plans-assessments [data-assessment-tab='resumo']","Resumo","Summary"],
  ["#plans-assessments [data-assessment-tab='pregas']","Pregas","Skinfolds"],
  ["#plans-assessments [data-assessment-tab='perimetros']","Perímetros","Circumferences"],
  ["#plans-assessments > .progress-heading .progress-title","Progresso","Progress"]
];
function playerText(pt,en){return playerUiLanguage==="en"?en:pt;}
function playerMacroLabel(key){
 const pt={protein_g:"Proteína",carbs_g:"Hidratos",fat_g:"Gordura"};
 const en={protein_g:"Protein",carbs_g:"Carbohydrates",fat_g:"Fat"};
 return (playerUiLanguage==="en"?en:pt)[key]||key;
}
function playerMacroAbbreviation(key){
 const pt={protein_g:"P",carbs_g:"HC",fat_g:"G"};
 const en={protein_g:"P",carbs_g:"C",fat_g:"F"};
 return (playerUiLanguage==="en"?en:pt)[key]||key;
}
function playerDateLocale(){return playerUiLanguage==="en"?"en-GB":"pt-PT";}
function playerClassification(name){
 return name==="Geral"?playerText("Geral","General"):name;
}
const playerAssessmentEnglish={
 sum_8:"Sum of 8 skinfolds",weight:"Body weight",body_fat:"Body fat",
 bmi:"BMI",muscle_index:"Muscle mass index",arm_muscle:"Arm muscle",
 thigh_muscle:"Thigh muscle",calf_muscle:"Calf muscle",
 sum_perimeters:"Sum of circumferences",
 back:"Back",triceps:"Triceps",biceps:"Biceps",suprailiac:"Suprailiac",
 supraspinal:"Supraspinal",abdominal_skin:"Abdomen",
 thigh_skin:"Thigh",calf_skin:"Calf",
 arm_right_relaxed:"Right arm (relaxed)",chest:"Chest",waist:"Waist",
 abdominal_perimeter:"Abdomen",thigh_right:"Right thigh",thigh_left:"Left thigh",
 calf_right:"Right calf",calf_left:"Left calf",
 avg_skinfolds:"Average sum of skinfolds",avg_weight:"Average weight",
 avg_body_fat:"Average body fat"
};
function playerAssessmentLabel(key,canonical){
 return playerUiLanguage==="en"?(playerAssessmentEnglish[key]||canonical):canonical;
}
function playerSupplementMomentLabel(value){
 if(playerUiLanguage!=="en")return value;
 return {"Pequeno-almoço":"Breakfast","Almoço":"Lunch","Lanche":"Snack",
         "Jantar":"Dinner","Ceia":"Supper","Treino":"Training",
         "Jogo":"Match","Almoço ou jantar":"Lunch or dinner"}[value]||value;
}
// Menu categories are canonical Portuguese values; translate only their display.
// Dish IDs, custom free text and menu data must never be changed.
const playerMenuCategoriesEnglish={
 "Carne branca":"White meat","Carne vermelha":"Red meat",
 "Peixe magro":"Lean fish","Peixe gordo":"Oily fish",
 "Livre":"Free choice","Pós-jogo":"Post-match","Mix":"Mix",
 "Estágio":"Training camp"
};
function playerMenuCategoryLabel(menu){
 const value=menu?.value||"";
 if(playerUiLanguage!=="en")return value;
 if(menu?.kind==="category")return playerMenuCategoriesEnglish[value]||value;
 // "Estágio" is a controlled menu preset saved historically as kind="text".
 // Never translate arbitrary user-authored free text or approved dish names.
 if(menu?.kind==="text"&&value.trim()==="Estágio")return "Training camp";
 return value;
}
// Only built-in training/match captions are translated for display.
// Custom event titles and canonical event data stay unchanged for editing and icons.
function playerEventTitle(event){
 if(event?.kind==="match"&&event.title==="Jogo")return playerText("Jogo","Match");
 if(event?.kind==="training"&&event.title==="Treino")return playerText("Treino","Training");
 return event?.title||"";
}
function playerPhaseLabel(value){
 if(playerUiLanguage!=="en")return value;
 return {"Pré-treino":"Pre-training","Pós-treino":"Post-training",
         "Pré-jogo":"Pre-match","Intra-jogo":"During match",
         "Pós-jogo":"Post-match"}[value]||value;
}
function applyPlayerNativeLanguage(language){
 playerUiLanguage=language==="en"?"en":"pt";
 Object.assign(names,playerMealLanguages[playerUiLanguage]);
 Object.assign(colorNames,playerColourLanguages[playerUiLanguage]);
 document.documentElement.lang=playerUiLanguage==="en"?"en-GB":"pt-PT";
 for(const [selector,pt,en] of playerTextBindings){
  const element=document.querySelector(selector);
  if(element)element.textContent=playerUiLanguage==="en"?en:pt;
 }
 const assessments=document.querySelector("#tabs [data-tab='assessments']");
 if(assessments){
  const label=playerText("Progresso","Progress");
  assessments.setAttribute("aria-label",label);assessments.title=label;
 }
}
let playerSessionEpoch=0;
let playerLanguageSaving=false;
function syncPlayerLanguageSelector(preferences){
 const card=$("profile-language-card");
 if(!card)return;
 const ready=preferences?.enabled===true;
 card.hidden=!ready;
 const label=playerText("Idioma","Language");
 card.setAttribute("aria-label",label);
 $("profile-language-selector").setAttribute("aria-label",label);
 for(const button of card.querySelectorAll("button[data-language]")){
  const selected=button.dataset.language===playerUiLanguage;
  button.classList.toggle("active",selected);
  button.setAttribute("aria-pressed",String(selected));
  button.disabled=playerLanguageSaving;
 }
 if(!ready)$("profile-language-feedback").textContent="";
}
async function updatePlayerLanguageChoice(code){
 if(!["pt","en"].includes(code)||playerLanguageSaving||!me||
    $("profile-language-card").hidden||code===playerUiLanguage)return;
 const epoch=playerSessionEpoch;
 const feedback=$("profile-language-feedback");
 playerLanguageSaving=true;
 syncPlayerLanguageSelector({enabled:true});
 feedback.textContent="";
 try{
  await api("/api/v2/player/preferences",{
   method:"PUT",
   headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},
   body:JSON.stringify({language:code})
  });
  if(epoch!==playerSessionEpoch)return;
  // Reload the authenticated data through the normal existing session path:
  // this also refreshes cached Planos, menus, daily supplements and recipes.
  overviewReadCache.clear();overviewSnapshot=null;
  lastOverviewPresentation=null;lastMenuPresentationWeek=null;
  window.themileRecipes?.reset();
  await session();
 }catch(err){
  if(epoch===playerSessionEpoch&&!err.stale){
   feedback.textContent=playerText(
    "Não foi possível alterar o idioma. Tenta novamente.",
    "Could not change language. Please try again.");
  }
 }finally{
  playerLanguageSaving=false;
  if(epoch===playerSessionEpoch)
   syncPlayerLanguageSelector({enabled:!$("profile-language-card").hidden});
 }
}

let visualPortionsByColor={};
let pendingIntraMatchExpansion=null;
let playerCsrf='',me=null,plans={},periPlans={},model=[],meals=[],calendarEvents=[],periMeals=[],publishedMealChoices={},dayColorOverrides={},weeklyContext=null,day=new Date(),menuWeek=new Date(),menuSelectedDate=null,tab="overview",dishIndex=[],overviewMode="day",weeklySelection=null;
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
function monday(d){const x=new Date(d);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;}
// A week swipe lands on its boundary: previous Sunday, next Monday.
function swipeWeekBoundary(current,offset){
 const start=monday(current);start.setDate(start.getDate()+(offset<0?-1:7));return start;
}
// Week navigation: horizontal touch gestures only; vertical scrolling and day taps stay native.
function enableWeekSwipe(element,onShift){
 if(element.dataset.weekSwipeBound)return;
 element.dataset.weekSwipeBound="true";
 let start=null;
 element.addEventListener("touchstart",event=>{
  if(event.touches.length!==1){start=null;return;}
  const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,at:Date.now()};
 },{passive:true});
 element.addEventListener("touchcancel",()=>{start=null;},{passive:true});
 element.addEventListener("touchend",event=>{
  if(!start||event.changedTouches.length!==1){start=null;return;}
  const touch=event.changedTouches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;
  start=null;
  if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.4)return;
  event.preventDefault();onShift(dx<0?7:-7);
 },{passive:false});
}
// Day-by-day navigation for the full Planning content area, in both views.
// The menus week strip keeps its independent, existing week gesture.
// A clear directional cue only in Daily mode. Weekly selection remains instant.
let pendingDailySwipeDirection=0,dailySwipeEntryAnimation=null;
// True while the Peso em jejum screen covers Início: day swipes are ignored there.
let weightDetailOpen=false;
// Left-edge zone reserved for the swipe back gesture (see initEdgeSwipeBack).
const PLAYER_EDGE_BACK_ZONE=28;
// Progresso metric page (see renderPlayerAssessments) and the scroll to restore on ‹.
let progressPage=null,progressReturnY=0;
function shiftOverviewDay(offset){
 if(offset!==1&&offset!==-1)return;
 const next=new Date(day);
 next.setDate(next.getDate()+offset);
 day=next;
 weeklySelection=null;
 pendingDailySwipeDirection=0;
 overview().catch(error);
}
function enableOverviewDaySwipe(element){
 if(element.dataset.overviewDaySwipeBound)return;
 element.dataset.overviewDaySwipeBound="true";
 let start=null,active=false,content=null;
 const cleanup=()=>{
  if(content){content.style.transform='';content.style.transition='';}
  start=null;active=false;
 };
 const transition=(dx,done)=>{
  if(!content){cleanup();done?.();return;}
  content.style.transition='transform 210ms cubic-bezier(.2,.8,.2,1)';
  content.style.transform='translate3d('+dx+'px,0,0)';
  setTimeout(()=>{cleanup();done?.();},215);
 };
 element.addEventListener('touchstart',event=>{
  cleanup();
  if(tab!=='overview'||element.hidden||event.touches.length!==1)return;
  const target=event.target;
  if(target?.closest?.('input,select,textarea,[contenteditable],[role="slider"],.consumption-editor,.consumption-sheet'))return;
  for(let node=target;node&&node!==element;node=node.parentElement){
   if(node.scrollWidth>node.clientWidth+6&&/^(auto|scroll)$/.test(getComputedStyle(node).overflowX))return;
  }
  const t=event.touches[0];if(t.clientX<PLAYER_EDGE_BACK_ZONE||t.clientX>innerWidth-22)return; // the left edge belongs to the back swipe
  content=overviewMode==='day'?$('day-details'):$('weekly-view');if(!content||content.hidden||weightDetailOpen)return;
  start={x:t.clientX,y:t.clientY,at:performance.now(),width:content.getBoundingClientRect().width};
 },{passive:true});
 element.addEventListener('touchmove',event=>{
  if(!start||event.touches.length!==1)return;
  const t=event.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(!active){
   if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*1.35){start=null;return;}
   if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*.8)return;
   active=true;

  }
  if(event.cancelable)event.preventDefault();
  const dxClamped=Math.max(-start.width,Math.min(start.width,dx));
  if(overviewMode==='day'){content.style.transition='none';content.style.transform='translate3d('+dxClamped+'px,0,0)';}
 },{passive:false});
 element.addEventListener('touchend',event=>{
  if(!start||!active){cleanup();return;}
  const dx=event.changedTouches[0].clientX-start.x;
  const speed=dx/Math.max(1,performance.now()-start.at);
  const direction=dx<0?1:-1;
  const commit=Math.abs(dx)>start.width*.38||(Math.abs(dx)>35&&Math.abs(speed)>.55);
  if(overviewMode==='week'){cleanup();if(commit)shiftOverviewDay(direction);return;}
  transition(commit?-direction*start.width:0,commit?()=>shiftOverviewDay(direction):null);
 },{passive:true});
 element.addEventListener('touchcancel',()=>{if(active)transition(0);else cleanup();},{passive:true});
}
function animateDailySwipeEntry(){
 const direction=pendingDailySwipeDirection;
 pendingDailySwipeDirection=0;
 if(!direction||overviewMode!=="day"||tab!=="overview")return;
 const content=$("day-details");
 if(!content||content.hidden||typeof content.animate!=="function")return;
 if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;
 dailySwipeEntryAnimation?.cancel();
 // Keep the calendar and date fixed; no opacity fade or loading flash.
 dailySwipeEntryAnimation=content.animate([
  {transform:"translateX("+(direction>0?60:-60)+"px)"},
  {transform:"translateX(0)"}
 ],{duration:320,easing:"cubic-bezier(0.2,0.7,0.2,1)"});
}
function revokePlayerView(){
 pendingDailySwipeDirection=0;
 dailySwipeEntryAnimation?.cancel();
 dailySwipeEntryAnimation=null;
 window.themileRecipes?.reset();
 // An account switch must invalidate cached data and every old request.
 ++playerSessionEpoch;++overviewRequestId;++menuRenderToken;
 consumptionPilotAllowed=null;
 overviewReadCache.clear();overviewSnapshot=null;lastOverviewPresentation=null;lastMenuPresentationWeek=null;
 setOverviewLoading(false);$("menu-loading").hidden=true;
 if(profilePhotoController){profilePhotoController.abort();profilePhotoController=null;}
 if(profilePhotoObjectUrl){URL.revokeObjectURL(profilePhotoObjectUrl);profilePhotoObjectUrl=null;}
 if(dishPhotoObserver)dishPhotoObserver.disconnect();
 for(const value of dishPhotoCache.values())value.then(url=>{if(url)URL.revokeObjectURL(url);});
 dishPhotoCache.clear();document.body.classList.remove("profile-active");
 if(window.tmVisualPortions)window.tmVisualPortions.close();visualPortionsByColor={};
 me=null;playerCsrf='';profileUsername='';plans={};periPlans={};model=[];meals=[];
 playerLanguageSaving=false;
 applyPlayerNativeLanguage("pt");
 syncPlayerLanguageSelector({enabled:false});
 calendarEvents=[];periMeals=[];publishedMealChoices={};dayColorOverrides={};supplementsByDay={};playerPostMatchRecords=[];
 effectiveScenarioColorsByDay={};scenarioNutritionPreviewByDay={};scenarioNutritionParityByDay={};
 assessmentRecords=[];assessmentFields={};assessmentAverages=[];assessmentGroup="resumo";
 weeklyContext=null;weeklySelection=null;menuSelectedDate=null;dishIndex=[];
 tab="overview";document.body.classList.add("overview-active");document.body.classList.remove("progress-active");closeProgressPage(false);overviewMode="day";day=new Date();menuWeek=new Date();
 for(const id of ["day-details","week-strip","weekly-view","plan-detail","menu-days","assessment-measurements","progress-kicker","post-match-form-area"]){
  const el=$(id);if(el)el.replaceChildren();
 }
 document.querySelectorAll("#menu-week-strip .week-day").forEach(el=>el.remove());
  mileLastCalendarSelectionByStrip.delete($("week-strip"));
  mileLastCalendarSelectionByStrip.delete($("menu-week-strip"));
 resetProfileSubpage();
 for(const id of ["profile-photo","header-player-photo"]){const image=$(id);image.hidden=true;image.removeAttribute("src");image.onload=null;image.onerror=null;}
 $("profile-photo-initials").hidden=false;$("avatar-initials").hidden=false;
 $("profile-plan-value").textContent="Por definir";$("profile-renewal-date").textContent="Por definir";
 $("player-name").textContent="";$("profile-display-name").textContent="";$("profile-display-username").textContent="";
 $("player-panel").hidden=true;$("login-panel").hidden=false;$("logout").hidden=true;
 resetPlayerLoadingPhoto();
 $("password").value="";$("status").textContent="Sessão terminada. Inicia sessão novamente.";
}
async function api(path,opts={}){
 const epoch=playerSessionEpoch;
 const r=await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},...opts});
 const data=await r.json().catch(()=>({}));
 // Never pass a response from a previous account to a new player's interface.
 if(epoch!==playerSessionEpoch){const err=new Error("stale_session");err.stale=true;throw err;}
 if(!r.ok){
  if(r.status===401&&path!=="/api/login"&&path!=="/api/logout")revokePlayerView();
  const err=new Error(data.error||data.code||playerText("Pedido indisponível","Request unavailable"));err.status=r.status;throw err;
 }
 return data;
}
function fmt(v,d=1){return Number(v).toLocaleString(playerDateLocale(),{minimumFractionDigits:d,maximumFractionDigits:d});}
// kcal are displayed without thousands separators; nutrient quantities keep their existing formatting.
function fmtKcal(v){return Number(v).toLocaleString(playerDateLocale(),{useGrouping:false,minimumFractionDigits:0,maximumFractionDigits:0});}
function nutrition(values){const el=document.createElement("span");el.className="macro";for(const [key,prefix,cls,d] of [["kcal","","kcal",0],["protein_g",playerMacroAbbreviation("protein_g")+" ","protein",0],["carbs_g",playerMacroAbbreviation("carbs_g")+" ","carbs",0],["fat_g",playerMacroAbbreviation("fat_g")+" ","fat",0]]){const n=Number(String(values[key]??"").replace(",","."));const span=document.createElement("span");span.className=cls;if(key!=="kcal"){const dot=document.createElement("i");dot.className="macro-dot";dot.setAttribute("aria-hidden","true");span.append(dot);span.setAttribute("aria-label",prefix.trim()+" "+(Number.isFinite(n)?fmt(n,d):"—")+" g");}span.append(document.createTextNode((Number.isFinite(n)?(key==="kcal"?fmtKcal(n):fmt(n,d)):"—")+(key==="kcal"?" kcal":" g")));el.append(span);}return el;}
function average(options){if(!options.length)return null;const out={kcal:0,protein_g:0,carbs_g:0,fat_g:0};for(const o of options){if(!o.totals)return null;for(const k in out){const raw=o.totals[k];if(raw===undefined||raw===null||String(raw).trim()==="")return null;const n=Number(String(raw).replace(",","."));if(!Number.isFinite(n)||n<0)return null;out[k]+=n/options.length;}}return out;}
const periTimingLabels={pre_warmup:"Pré-aquecimento",warmup:"Aquecimento",pre_match:"Pré-jogo",post_warmup:"Pós-aquecimento",first_half:"Durante a 1.ª parte",half_time:"Intervalo",second_half:"Durante a 2.ª parte",post_match:"Pós-jogo",throughout:"Ao longo do jogo"};
const periTimingEnglish={pre_warmup:"Before warm-up",warmup:"Warm-up",pre_match:"Pre-match",post_warmup:"After warm-up",first_half:"First half",half_time:"Half-time",second_half:"Second half",post_match:"Post-match",throughout:"Throughout the match"};
// Group the already prescribed intra-match items by their timing, keeping
// the first-seen timing order and each item's original position within its group.
function groupPeriItemsByTiming(items,order=[]){
 const groups=new Map();
 for(const food of items||[]){
  const timing=food.timing||"";
  if(!groups.has(timing))groups.set(timing,[]);
  groups.get(timing).push(food);
 }
 const sorted=[...(order||[]).filter(timing=>groups.has(timing)),...groups.keys()].filter((timing,index,list)=>list.indexOf(timing)===index);
 return sorted.map(timing=>({timing,foods:groups.get(timing)}));
}
function appendGroupedPeriItems(host,items,order=[]){
 for(const {timing,foods} of groupPeriItemsByTiming(items,order)){
  const group=document.createElement("div");group.className="peri-timing-group";group.dataset.timing=timing;
  const label=periTimingLabels[timing];
  if(label){const heading=document.createElement("div");heading.className="peri-timing-heading";heading.textContent=playerUiLanguage==="en"?(periTimingEnglish[timing]||label):label;group.append(heading);}
  const lines=document.createElement("div");lines.className="peri-timing-lines";
  for(const food of foods){
   const line=document.createElement("div");line.className="peri-timing-line";
   line.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" ").trim():food.text||"";
   lines.append(line);
  }
  group.append(lines);host.append(group);
 }
}
function periFoodText(food){const content=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";const timing=playerUiLanguage==='en'?periTimingEnglish[food.timing]:periTimingLabels[food.timing];return (timing?timing+" — ":"")+content;}
function mealNoteCard(food){
 const note=document.createElement("details");note.className="meal-collapsible-note";
 const head=document.createElement("summary");head.textContent=food.title?.trim()||"Nota";note.append(head);
 const body=document.createElement("div");body.className="meal-note-body";body.textContent=food.text||"";note.append(body);
 return note;
}
function appendMealItems(host,items){
 for(const food of items||[]){if(food.kind==="collapsible_note")continue;const p=document.createElement("div");p.className="foods";p.textContent=periFoodText(food);host.append(p);}
 for(const food of items||[]){if(food.kind==="collapsible_note")host.append(mealNoteCard(food));}
}
function optionEl(o,i,planView=false,groupPeriTiming=false){
 const details=document.createElement("details"),summary=document.createElement("summary"),line=document.createElement("div");
 line.className="option"+(planView?"":" day-option");
 const label=document.createElement("span");label.className="plan-option-label";
 const number=document.createElement("small");number.textContent=playerText("Opção ","Option ")+(o.number||i+1);label.append(number);
 if(o.title){const name=document.createElement("strong");name.textContent=o.title;label.append(name);}
 line.append(label);summary.append(line);details.append(summary);
 if(o.totals){const value=document.createElement("div");value.className="option-expanded-macros";value.append(nutrition(o.totals));details.append(value);}
 if(groupPeriTiming)appendGroupedPeriItems(details,o.items,o.timing_groups);
 else appendMealItems(details,o.items);
 return details;
}


// Hugeicons free stroke names are used through their published SVG collection.
const mealIconMap={breakfast:"coffee-03",snack:"vegetarian-food",lunch:"restaurant-02",dinner:"restaurant-02",supper:"moon-02",supplements:"pill"};
const mileSvgPaths={"coffee-03":"<path d=\"M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Zm12 1h1a3 3 0 0 1 0 6h-2M4 22h16M8 3v3m4-3v3m4-3v3\"/>","vegetarian-food":"<path d=\"M4 12c2-4 6-4 8 0 2-4 6-4 8 0l-2 7H6l-2-7ZM12 10V4M8 7 5 5m11 2 3-2M6 22h12\"/>","restaurant-02":"<path d=\"M4 3v8m3-8v8M4 7h3M5.5 11v10M13 3v18M13 12c7 0 8-8 3-9v9M20 3v18\"/>","moon-02":"<path d=\"M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z\"/>","football":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m12 7 4 3-1.5 5h-5L8 10l4-3Zm-4 3-4-1m12 1 4-1m-5.5 6 2 5m-7-5-2 5M12 7V3\"/>","football-pitch":"<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"1\"/><path d=\"M12 4v16m0-12a4 4 0 0 0 0 8M2.5 9h4v6h-4m19-6h-4v6h4\"/>","soft-drink-01":"<path d=\"M5 5h14l-2 16H7L5 5ZM4 3h16M12 5l4-4M8 11h8m-6 4h4\"/>","home-09":"<path d=\"m3 11 9-8 9 8v9H3v-9Zm6 9v-7h6v7\"/>","files-01":"<path d=\"M7 3h10l4 4v14H7V3Zm10 0v5h4M3 7v14h14\"/>","add-circle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v10m-5-5h10\"/>","menu-restaurant":"<path d=\"M4 4v7m3-7v7M4 7h3m-1.5 4v9M13 4v16m0-8c7 0 8-7 3-8v8M3 22h18\"/>","user-03":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>"};
function mealIcon(name){const el=document.createElement("span");el.className="mile-icon icon-"+name;el.setAttribute("aria-hidden","true");el.innerHTML='<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(mileSvgPaths[name]||"")+'</svg>';if(hugeiconsOfficial){const raw=hugeiconsOfficial[hugeiconsNames[name]];if(Array.isArray(raw)){el.replaceChildren(iconToSvg(raw));el.dataset.official="true";}}return el;}
const hugeiconsNames={"coffee-03":"Coffee03Icon","vegetarian-food":"VegetarianFoodIcon","restaurant-02":"Restaurant02Icon","moon-02":"Moon02Icon","football":"FootballIcon","football-pitch":"FootballPitchIcon","soft-drink-01":"SoftDrink01Icon","pill":"PillIcon","home-09":"Home09Icon","files-01":"Files01Icon","add-circle":"AddCircleIcon","menu-restaurant":"MenuRestaurantIcon","user-03":"User03Icon","key-01":"Key01Icon","door-01":"Door01Icon","chart-03":"Chart03Icon"};
const hugeiconsOfficial={
"Coffee03Icon":[
  ["path", { d: "M17 11H18C18.9319 11 19.3978 11 19.7654 11.1522C20.2554 11.3552 20.6448 11.7446 20.8478 12.2346C21 12.6022 21 13.0681 21 14C21 14.9319 21 15.3978 20.8478 15.7654C20.6448 16.2554 20.2554 16.6448 19.7654 16.8478C19.3978 17 18.9319 17 18 17H17", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M15 9H5C4.05719 9 3.58579 9 3.29289 9.29289C3 9.58579 3 10.0572 3 11V14C3 16.8089 3 18.2134 3.67412 19.2223C3.96596 19.659 4.34096 20.034 4.77772 20.3259C5.78661 21 7.19108 21 10 21C12.8089 21 14.2134 21 15.2223 20.3259C15.659 20.034 16.034 19.659 16.3259 19.2223C17 18.2134 17 16.8089 17 14V11C17 10.0572 17 9.58579 16.7071 9.29289C16.4142 9 15.9428 9 15 9Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M10 3V5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M14 3V5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M6 3V5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "4" }]
],
"VegetarianFoodIcon":[
  ["path", { d: "M17 13.2308C17 13.2308 16.0909 12.7693 15.1818 12.7693C13.8182 12.7693 12 14.6154 12 17.3846C12 20.1537 14.4896 22 17 22C19.5104 22 22 20.1537 22 17.3846C22 14.6154 20.1818 12.7693 18.8182 12.7693C17.9091 12.7693 17 13.2308 17 13.2308ZM17 13.2308C17 11.8462 17.9091 10 19.7273 10", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M10.655 5C11.5512 5 12.2778 4.32843 12.2778 3.5C12.2778 2.67157 11.5512 2 10.655 2H5.24561C4.34936 2 3.6228 2.67157 3.6228 3.5C3.6228 4.32843 4.34936 5 5.24561 5M11.1693 4.92311C12.1247 6.68943 12.9095 8.28337 13.3888 10C13.4279 10.1401 13.465 10.281 13.5 10.4229M10.428 22H6.32748C2.74721 22 2 21.3093 2 18V13.7771C2 10.3773 3.09757 7.88562 4.70467 4.91465", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
],
"Restaurant02Icon":[
  ["path", { d: "M4 21.001L7.00071 18", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M15 10.001L14 11.001", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M17.9999 3.00098L14.9999 6.00098C14.4547 6.54623 14.1821 6.81885 14.0363 7.11295C13.759 7.6725 13.759 8.32945 14.0363 8.88901C14.1821 9.1831 14.4547 9.45573 14.9999 10.001C15.5452 10.5462 15.8178 10.8189 16.1119 10.9646C16.6715 11.2419 17.3284 11.2419 17.888 10.9646C18.1821 10.8189 18.4547 10.5462 18.9999 10.001L21.9999 7.00098", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M20 5L17 8", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M20 21L12 13M12 13L2 3C2 6.84174 3.52612 10.5261 6.24264 13.2426L9 16L12 13Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "4" }]
],
"Moon02Icon":[
  ["path", { d: "M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]
],
"FootballIcon":[
  ["path", { d: "M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z", stroke: "currentColor", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M11.7077 9.34893C11.882 9.21702 12.118 9.21702 12.2923 9.34893L14.545 11.054C14.7193 11.1859 14.7922 11.4197 14.7256 11.6332L13.8652 14.3921C13.7986 14.6055 13.6077 14.75 13.3923 14.75H10.6077C10.3923 14.75 10.2014 14.6055 10.1348 14.3921L9.27437 11.6332C9.20781 11.4197 9.28073 11.1859 9.45499 11.054L11.7077 9.34893Z", stroke: "currentColor", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M12 9V5M15 11L19 9.5M14 15L16 18M10 14.5L8 17M9 11.5L5 10.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M9 2.5L12.0165 4.62241L15 2.5M2 12.7998L5.19655 10.4388L3.55548 6.72045M19.4703 18.8531L15.6158 18.1555L14.2655 22M20.0298 6.19586L18.8035 9.38978L22 11.7507M8.00992 21.4059L8.05142 17.1665L4.00331 17.21", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
],
"FootballPitchIcon":[
  ["path", { d: "M2 8.57143C2 6.41644 2 5.33894 2.58579 4.66947C3.17157 4 4.11438 4 6 4H18C19.8856 4 20.8284 4 21.4142 4.66947C22 5.33894 22 6.41644 22 8.57143V15.4286C22 17.5836 22 18.6611 21.4142 19.3305C20.8284 20 19.8856 20 18 20H6C4.11438 20 3.17157 20 2.58579 19.3305C2 18.6611 2 17.5836 2 15.4286V8.57143Z", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["circle", { cx: "12", cy: "12", r: "2", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M12 10V5M12 14V19", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M22 9H19.5C18.9477 9 18.5 9.44772 18.5 10V14C18.5 14.5523 18.9477 15 19.5 15H22", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M2 9H4.5C5.05228 9 5.5 9.44772 5.5 10V14C5.5 14.5523 5.05228 15 4.5 15H2", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "4" }]
],
"SoftDrink01Icon":[
  ["path", { d: "M12 7V4.34832C12 2.1606 12.3737 1.6318 14.4968 2.22769L18 3.21095", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M6 7L7.1398 18.1606C7.31099 19.8368 7.39658 20.6749 7.96796 21.1813C9.1458 22.225 14.7472 22.3198 16.032 21.1813C16.6034 20.6749 16.689 19.8368 16.8602 18.1606L18 7", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M5 7H19", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M7 12H17", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M7 16H17", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "4" }]
],
"PillIcon":[
  ["path", { d: "M11.4497 19.5503L19.5503 11.4497C20.4785 10.5215 21 9.2625 21 7.94975C21 5.21608 18.7839 3 16.0503 3C14.7375 3 13.4785 3.52149 12.5503 4.44975L4.44975 12.5503C3.52149 13.4785 3 14.7375 3 16.0503C3 18.7839 5.21608 21 7.94975 21C9.2625 21 10.5215 20.4785 11.4497 19.5503Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M8.5 8.5L15.5 15.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
],
"Home09Icon":[
  ["path", { d: "M13 13.5032H11C10.1716 13.5032 9.5 14.1748 9.5 15.0032V20.5012C9.5 21.0539 9.05114 21.5032 8.49854 21.4977C6.17337 21.4744 4.88133 21.3333 4.02513 20.4771C3 19.452 3 17.8021 3 14.5023V11.9918C3 10.3106 3 9.46999 3.3559 8.74231C3.71179 8.01463 4.37533 7.49854 5.70241 6.46637L7.70242 4.91081C9.76689 3.30511 10.7991 2.50226 12 2.50226C13.2009 2.50226 14.2331 3.30511 16.2976 4.91081L18.2976 6.46636C19.6247 7.49854 20.2882 8.01463 20.6441 8.74231C21 9.46999 21 10.3106 21 11.9918V14.5023C21 17.8021 21 19.452 19.9749 20.4771C19.1187 21.3333 17.8266 21.4744 15.5015 21.4977C14.9489 21.5032 14.5 21.0539 14.5 20.5012V15.0032C14.5 14.1748 13.8284 13.5032 13 13.5032Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]
],
"Files01Icon":[
  ["path", { d: "M14.4998 19H12.4998C9.67139 19 8.25718 19 7.3785 18.1213C6.49982 17.2426 6.49982 15.8284 6.49982 13V8C6.49982 5.17157 6.49982 3.75736 7.3785 2.87868C8.25718 2 9.67139 2 12.4998 2H13.843C14.6605 2 15.0692 2 15.4368 2.15224C15.8043 2.30448 16.0933 2.59351 16.6714 3.17157L19.3282 5.82843C19.9063 6.40648 20.1953 6.69552 20.3476 7.06306C20.4998 7.4306 20.4998 7.83935 20.4998 8.65685V13C20.4998 15.8284 20.4998 17.2426 19.6211 18.1213C18.7425 19 17.3282 19 14.4998 19Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M14.9998 2.5V3.5C14.9998 5.38562 14.9998 6.32843 15.5856 6.91421C16.1714 7.5 17.1142 7.5 18.9998 7.5H19.9998", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M6.49945 5C4.8426 5 3.49945 6.34315 3.49945 8V16C3.49945 18.8285 3.49945 20.2427 4.37813 21.1213C5.25681 22 6.67102 22 9.49945 22H14.4998C16.1566 22 17.4998 20.6568 17.4998 19", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M10 11H14M10 15H17", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
],
"AddCircleIcon":[
  ["path", { d: "M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M12 8V16M16 12H8", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
],
"MenuRestaurantIcon":[
  ["path", { d: "M20 17.9998V9.99976C20 8.11414 20 7.17133 19.4142 6.58554C18.8284 5.99976 17.8856 5.99976 16 5.99976H4V17.9998C4 19.8854 4 20.8282 4.58579 21.414C5.17157 21.9998 6.11438 21.9998 8 21.9998H16C17.8856 21.9998 18.8284 21.9998 19.4142 21.414C20 20.8282 20 19.8854 20 17.9998Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M12 10.9998C13.6569 10.9998 15 12.3429 15 13.9998M12 10.9998C10.3431 10.9998 9 12.3429 9 13.9998M12 10.9998V9.99976M15 13.9998H9M15 13.9998H16M9 13.9998H8", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M8 17.9998H16", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M4 5.99976L11.3846 2.90562C13.0337 2.21467 13.8582 1.8692 14.5149 2.04518C14.9408 2.1593 15.3173 2.41168 15.5859 2.76312C16 3.30508 16 4.2033 16 5.99976", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
],
"User03Icon":[
  ["path", { d: "M20 21C20 18.7328 20 17.5992 19.5929 16.7097C19.1649 15.7746 18.4287 15.0144 17.5071 14.5558C16.6305 14.1196 15.5 14 13.2263 14.0051L10.7728 14C8.49999 14 7.39496 14.1069 6.52924 14.528C5.57859 14.9904 4.82688 15.7651 4.39412 16.7284C4.00001 17.6057 4.00001 18.7371 4 21", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
]
};
hugeiconsOfficial["Key01Icon"]=[
  ["path", { d: "M15.5 14.5C18.8137 14.5 21.5 11.8137 21.5 8.5C21.5 5.18629 18.8137 2.5 15.5 2.5C12.1863 2.5 9.5 5.18629 9.5 8.5C9.5 9.38041 9.68962 10.2165 10.0303 10.9697L2.5 18.5V21.5H5.5V19.5H7.5V17.5H9.5L13.0303 13.9697C13.7835 14.3104 14.6196 14.5 15.5 14.5Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M17.5 6.5L16.5 7.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
hugeiconsOfficial["Door01Icon"]=[
  ["path", { d: "M18 20C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M4 6.84771V17.1523C4 18.7454 4 19.542 4.4645 20.0976C4.92899 20.6531 5.71415 20.7956 7.28446 21.0806L10.2845 21.6251C12.4701 22.0217 13.563 22.2201 14.2815 21.6215C15 21.023 15 19.9142 15 17.6968V6.30325C15 4.08578 15 2.97704 14.2815 2.37849C13.563 1.77994 12.4701 1.97827 10.2845 2.37495L7.28446 2.91941C5.71415 3.2044 4.92899 3.34689 4.4645 3.90244C4 4.45799 4 5.25457 4 6.84771Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M11.625 12H11.5M11.75 12C11.75 12.1381 11.6381 12.25 11.5 12.25C11.3619 12.25 11.25 12.1381 11.25 12C11.25 11.8619 11.3619 11.75 11.5 11.75C11.6381 11.75 11.75 11.8619 11.75 12Z", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "2" }]
];
hugeiconsOfficial["Chart03Icon"]=[
  ["path", { d: "M3 4V14C3 16.8284 3 18.2426 3.87868 19.1213C4.75736 20 6.17157 20 9 20H21", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M6 14L9.25 10.75C9.89405 10.1059 10.2161 9.78392 10.5927 9.67766C10.8591 9.60254 11.1409 9.60254 11.4073 9.67766C11.7839 9.78392 12.1059 10.1059 12.75 10.75C13.3941 11.3941 13.7161 11.7161 14.0927 11.8223C14.3591 11.8975 14.6409 11.8975 14.9073 11.8223C15.2839 11.7161 15.6059 11.3941 16.25 10.75L20 7", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
function iconToSvg(nodes){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","100%");svg.setAttribute("height","100%");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.5");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
 const append=(items,parent)=>{for(const node of items||[]){if(!Array.isArray(node))continue;const [tag,props,children]=node;if(typeof tag!=="string"||!["path","circle","rect","line","polyline","polygon","ellipse","g"].includes(tag))continue;const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(props||{})){if(k==="key"||k==="ref"||typeof v==="object")continue;el.setAttribute(k.replace(/[A-Z]/g,c=>"-"+c.toLowerCase()),String(v));}parent.append(el);if(Array.isArray(children))append(children,el);}};
 append(nodes,svg);return svg;
}
// Official Hugeicons icon data, unchanged from @hugeicons/core-free-icons.
hugeiconsOfficial["UndoIcon"]=[
  ["path", { d: "M3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C8.79275 3 5.97733 4.67765 4.38341 7.20327M3.29339 3.00076L3.46556 5.05452C3.58958 6.53384 3.65159 7.27349 4.13359 7.68914C4.61559 8.10479 5.32673 8.03185 6.74899 7.88595L8.79339 7.67625", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]
];
hugeiconsOfficial["Edit02Icon"]=[
  ["path", { d: "M14.0737 3.88545C14.8189 3.07808 15.1915 2.6744 15.5874 2.43893C16.5427 1.87076 17.7191 1.85309 18.6904 2.39232C19.0929 2.6158 19.4769 3.00812 20.245 3.79276C21.0131 4.5774 21.3972 4.96972 21.6159 5.38093C22.1438 6.37312 22.1265 7.57479 21.5703 8.5507C21.3398 8.95516 20.9446 9.33578 20.1543 10.097L10.7506 19.1543C9.25288 20.5969 8.504 21.3182 7.56806 21.6837C6.63212 22.0493 5.6032 22.0224 3.54536 21.9686L3.26538 21.9613C2.63891 21.9449 2.32567 21.9367 2.14359 21.73C1.9615 21.5234 1.98636 21.2043 2.03608 20.5662L2.06308 20.2197C2.20301 18.4235 2.27297 17.5255 2.62371 16.7182C2.97444 15.9109 3.57944 15.2555 4.78943 13.9445L14.0737 3.88545Z", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M13 4L20 11", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M14 22L22 22", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }]
];
hugeiconsOfficial["CheckmarkCircle02Icon"]=[
  ["path", { d: "M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z", stroke: "currentColor", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M8 12.5L10.5 15L16 9", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
function consumptionActionIcon(name){const span=document.createElement('span');span.className='consumption-action-icon';span.setAttribute('aria-hidden','true');span.append(iconToSvg(hugeiconsOfficial[name]));return span;}
function consumptionActionLabel(el,name,label){el.replaceChildren(consumptionActionIcon(name),document.createTextNode(label));}
/* Registered meal/option marker: the check icon alone, with the full meaning kept for assistive technology. */
function registeredMark(el,label){el.replaceChildren(consumptionActionIcon('CheckmarkCircle02Icon'));el.setAttribute('role','img');el.setAttribute('aria-label',label);el.title=label;}
/* One recorded-action component for meals, alternative colours and peri-events. */
/* Universal registered-consumption action family for meals and peri-events.
   Surface differences are inherited as colour tokens, never separate markup. */
/* Jogo alone remembers its open state when a timing action refreshes Dia.
   All other cards retain their existing collapse/refresh contract. */
async function refreshAfterConsumption(host,meal,eventId){
 if(meal==='intra_match'){
  const match=host.closest('.match-intra-card');
  if(match?.open)pendingIntraMatchExpansion={date:match.dataset.matchDate,eventId};
 }
 await overview();
}
function makeRecordedConsumptionTags({host,date,meal,eventId='',optionIndex=null,consumedColor=null,description=playerText('consumo','consumption'),timing=null,optionRef=null,extraTiming=false}){
 const actions=document.createElement('div');actions.className='consumption-actions consumption-actions--recorded';
 const registered=document.createElement('span');registered.className='action-pill action-pill--registered';
 consumptionActionLabel(registered,'CheckmarkCircle02Icon',playerText(' Registado',' Recorded'));registered.setAttribute('aria-label',playerText('Registado: ','Recorded: ')+description);
 const edit=document.createElement('button');edit.type='button';edit.className='action-pill action-pill--secondary';
 consumptionActionLabel(edit,'Edit02Icon',playerText(' Editar',' Edit'));edit.setAttribute('aria-label',playerText('Editar ','Edit ')+description);
 edit.onclick=()=>openConsumptionEditor(host,date,meal,eventId,optionIndex,consumedColor,timing,optionRef,extraTiming);
 const undo=document.createElement('button');undo.type='button';undo.className='action-pill action-pill--secondary';
 consumptionActionLabel(undo,'UndoIcon',playerText(' Anular',' Undo'));undo.setAttribute('aria-label',playerText('Anular ','Undo ')+description);
 const feedback=document.createElement('p');feedback.className='consumption-feedback';
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 undo.onclick=async(event)=>{
  event.preventDefault();event.stopPropagation();if(undo.disabled)return;
  undo.disabled=true;edit.disabled=true;undo.setAttribute('aria-busy','true');
  try{
   await api('/api/v2/player/consumption-records',{method:'DELETE',headers:{'Content-Type':'application/json','X-CSRF-Token':playerCsrf},body:JSON.stringify({date,meal,event_id:eventId,...(timing?{timing}:{})})});
   await refreshAfterConsumption(host,meal,eventId);
  }catch(err){
   undo.disabled=false;edit.disabled=false;undo.removeAttribute('aria-busy');
   feedback.textContent=playerText('Não foi possível anular. Tenta novamente.','Could not undo. Please try again.');error(err);
  }
 };
 actions.append(registered,edit,undo);
 if(consumedColor){
  const names={green:'Verde',yellow:'Amarelo',orange:'Laranja',blue:'Azul',red:'Vermelho',vp:'Verde preparação'};
  const note=document.createElement('span');note.className='consumption-color-note';
  note.textContent=playerText('Consumido: ','Consumed: ')+(playerUiLanguage==='en'?(playerColourLanguages.en[consumedColor]||consumedColor):(names[consumedColor]||consumedColor));actions.append(note);
 }
 actions.append(feedback);
 return actions;
}

function showConsumptionSuccess(button){
 button.classList.add('consumption-confirm-success');
 button.replaceChildren(consumptionActionIcon('CheckmarkCircle02Icon'));
 button.setAttribute('aria-label','Consumo registado');
 if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  const burst=document.createElement('span');burst.className='consumption-confetti-burst';burst.setAttribute('aria-hidden','true');
  for(let j=0;j<12;j++){const particle=document.createElement('i');particle.style.setProperty('--angle',(j*30)+'deg');particle.style.setProperty('--distance',(35+(j%3)*9)+'px');particle.style.setProperty('--delay',(j%3)*35+'ms');burst.append(particle);}
  button.append(burst);
 }
}
function updateOfficialIcons(){
 if(!hugeiconsOfficial)return;
 for(const icon of document.querySelectorAll(".mile-icon")){const name=[...icon.classList].find(x=>x.startsWith("icon-"))?.slice(5);const raw=hugeiconsOfficial[hugeiconsNames[name]];if(raw&&Array.isArray(raw)){icon.replaceChildren(iconToSvg(raw));icon.dataset.official="true";}}
}
function loadOfficialHugeicons(){updateOfficialIcons();}
function decorateLabel(el,key){
 if(!el||el.querySelector(".meal-leading-icon"))return;
 const iconName=mealIconMap[key]||(/p[oó]s/i.test(key)||/pr[eé][- ]treino/i.test(key)?"soft-drink-01":/jogo/i.test(key)?"football":/treino/i.test(key)?"football-pitch":null);
 if(!iconName)return;
 const item=document.createElement("span");item.className="meal-leading-icon tm-day-icon";item.append(mealIcon(iconName));el.prepend(item);
 if(el.classList.contains("daily-meal-head"))el.classList.add("tm-day-header");
 const title=el.querySelector(":scope > strong, :scope > span:not(.meal-leading-icon)");
 if(title)title.classList.add("tm-day-title");
 updateOfficialIcons();
}

let profileUsername="";
let profilePhotoController=null,profilePhotoObjectUrl=null;
function paintPlayerPhoto(hasPhoto,initials,epoch){
 const pairs=[["profile-photo","profile-photo-initials"],["header-player-photo","avatar-initials"]];
 if(profilePhotoController){profilePhotoController.abort();profilePhotoController=null;}
 if(profilePhotoObjectUrl){URL.revokeObjectURL(profilePhotoObjectUrl);profilePhotoObjectUrl=null;}
 for(const [imageId,fallbackId] of pairs){
  const image=$(imageId),fallback=$(fallbackId);
  fallback.textContent=initials;
  image.onload=null;image.onerror=null;image.hidden=true;image.removeAttribute("src");fallback.hidden=false;
 }
 if(!hasPhoto)return;
 // One authenticated request and a shared private object URL for both avatars.
 const controller=new AbortController();profilePhotoController=controller;
 fetch("/api/v2/player/profile-photo",{credentials:"same-origin",cache:"no-store",signal:controller.signal})
  .then(r=>{if(!r.ok)throw Error("photo_unavailable");return r.blob();})
  .then(blob=>{
   if(epoch!==playerSessionEpoch||controller.signal.aborted)return;
   const url=URL.createObjectURL(blob);profilePhotoObjectUrl=url;
   for(const [imageId,fallbackId] of pairs){
    const image=$(imageId),fallback=$(fallbackId);
    image.onload=()=>{if(epoch!==playerSessionEpoch)return;image.hidden=false;fallback.hidden=true;};
    image.onerror=()=>{if(epoch!==playerSessionEpoch)return;image.hidden=true;fallback.hidden=false;};
    image.src=url;
   }
  }).catch(()=>{});
}
function displayPlayerRenewal(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return playerText("Por definir","Not set");
 return value.slice(8,10)+"/"+value.slice(5,7)+"/"+value.slice(0,4);
}
let playerLoadingPhotoController=null;
let playerLoadingPhotoUrl=null;
let playerLoadingPhotoReadyAt=0;
let playerLoadingPhotoPending=null;
let playerLoadingPhotoClosing=false;
function resetPlayerLoadingPhoto(){
 playerLoadingPhotoClosing=true;
 playerLoadingPhotoReadyAt=0;
 playerLoadingPhotoPending=null;
 if(playerLoadingPhotoController){playerLoadingPhotoController.abort();playerLoadingPhotoController=null;}
 if(playerLoadingPhotoUrl){URL.revokeObjectURL(playerLoadingPhotoUrl);playerLoadingPhotoUrl=null;}
 const layer=$("player-loading-photo");
 if(layer){layer.classList.remove("is-visible");layer.style.backgroundImage="";}
}
function loadPlayerLoadingPhoto(epoch){
 resetPlayerLoadingPhoto();
 playerLoadingPhotoClosing=false;
 const controller=new AbortController();playerLoadingPhotoController=controller;
 playerLoadingPhotoPending=new Promise(resolve=>{
  const unavailable=()=>resolve(false);
  fetch("/api/v2/player/loading-photo",{credentials:"same-origin",cache:"no-store",signal:controller.signal})
   .then(r=>{if(!r.ok)throw Error("no_loading_photo");return r.blob();})
   .then(blob=>{
    if(epoch!==playerSessionEpoch||controller.signal.aborted||playerLoadingPhotoClosing)return unavailable();
    const url=URL.createObjectURL(blob),img=new Image();
    playerLoadingPhotoUrl=url;
    img.onload=()=>{
     if(epoch!==playerSessionEpoch||controller.signal.aborted||playerLoadingPhotoClosing||$("player-session-loading").hidden)return unavailable();
     const layer=$("player-loading-photo");
     layer.style.backgroundImage="url("+JSON.stringify(url)+")";
     requestAnimationFrame(()=>{
      if(epoch!==playerSessionEpoch||controller.signal.aborted||playerLoadingPhotoClosing||$("player-session-loading").hidden)return unavailable();
      playerLoadingPhotoReadyAt=Date.now();
      layer.classList.add("is-visible");
      resolve(true);
     });
    };
    img.onerror=unavailable;
    img.src=url;
   }).catch(unavailable);
 });
}
async function finishPlayerLoading(epoch){
 // On fast sessions, give the optional image a brief chance to appear.
 // A missing or slow image must never hold up the app.
 if(!playerLoadingPhotoReadyAt&&playerLoadingPhotoPending){
  await Promise.race([playerLoadingPhotoPending,new Promise(resolve=>setTimeout(resolve,140))]);
 }
 if(epoch!==playerSessionEpoch)return;
 if(playerLoadingPhotoReadyAt){
  // Keep a loaded player photo visible long enough to avoid a fleeting flash.
  const remaining=Math.max(0,400-(Date.now()-playerLoadingPhotoReadyAt));
  if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
 }
 if(epoch!==playerSessionEpoch)return;
 playerLoadingPhotoClosing=true;
 playerSessionReady(true);
}
function playerSessionScreen(message,retry=false){
 const loading=$("player-session-loading");
 loading.hidden=false;
 loading.classList.remove("is-leaving");
 $("player-session-loading-text").textContent=message;
 $("player-session-retry").hidden=!retry;
 $("login-panel").hidden=true;
 $("player-panel").hidden=true;
}
function playerSessionReady(animated=false){
 const loading=$("player-session-loading");
 if(animated&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  loading.classList.add("is-leaving");
  let finished=false;
  const finish=()=>{
   if(finished||!loading.classList.contains("is-leaving"))return;
   finished=true;loading.hidden=true;loading.classList.remove("is-leaving");resetPlayerLoadingPhoto();
  };
  loading.addEventListener("transitionend",event=>{if(event.target===loading)finish();},{once:true});
  // Safari can suspend CSS transitions when its installed PWA changes state.
  setTimeout(finish,450);
  // The animation is purely visual and does not wait for an artificial loading period.
 }else{loading.hidden=true;loading.classList.remove("is-leaving");resetPlayerLoadingPhoto();}
}
async function session(){
 resetPlayerLoadingPhoto();
 playerSessionScreen("A abrir a The Mile…");
 const epoch=playerSessionEpoch;
 const sessionData=await api("/api/me");
 if(epoch!==playerSessionEpoch)return;
 // /api/me intentionally returns 200 with user:null for an anonymous visitor.
 // Do not treat an ordinary first opening as an expired session.
 if(!sessionData.user){
  playerSessionReady();
  $("status").textContent="";
  $("login-panel").hidden=false;
  $("player-panel").hidden=true;
  $("logout").hidden=true;
  return;
 }
 if(sessionData.user.role==="chef"){
  window.location.replace("/chef");
  return;
 }
 if(sessionData.user.role!=="player"){
  playerSessionReady();
  $("login-panel").hidden=false;
  $("status").textContent="Este acesso não pertence à área do jogador.";
  return;
 }
 playerSessionScreen("A carregar os teus dados…");
 loadPlayerLoadingPhoto(epoch);
 profileUsername=sessionData.user.username||"";
 playerCsrf=sessionData.csrf||"";
 // The server has four request threads. Give the two required identity/plan
 // reads a head start before background navigation prefetch can occupy them.
 const profilePromise=api("/api/v2/player/me");
 const plansPromise=api("/api/v2/player/plans");
 // The control is only shown once both approved-data gates are available.
 // Run the preference read after the core identity fetch starts to avoid
 // blocking the existing published-plan loading order.
 const preferencesPromise=profilePromise.then(()=>
  api("/api/v2/player/preferences")).catch(()=>({enabled:false,language:"pt"}));
 if(sessionData.user?.role==="player"){
  const weekStart=monday(day),weekEnd=new Date(weekStart);
  weekEnd.setDate(weekStart.getDate()+6);
  const weekFrom=iso(weekStart),weekTo=iso(weekEnd);
  // Weight is noncritical and overview() loads it when required.
  for(const path of [
   "/api/v2/player/calendar?start="+weekFrom+"&end="+weekTo,
   "/api/v2/player/menus?start="+weekFrom+"&end="+weekTo,
   "/api/v2/player/reference-weights?start="+weekFrom+"&end="+weekTo
  ])cachedOverviewRead(path).catch(()=>{});
 }
 const [r,p]=await Promise.all([profilePromise,plansPromise]);
 const preferences=await preferencesPromise;
 me=r.player;
 if(epoch!==playerSessionEpoch)return;
 applyPlayerNativeLanguage(me?.language);
 syncPlayerLanguageSelector(preferences);
 const plan=String(me.followup_plan||"").trim();
 $("profile-plan-value").textContent=/^(elite|pro)$/i.test(plan)?plan.charAt(0).toUpperCase()+plan.slice(1).toLowerCase():playerText("Por definir","Not set");
 $("profile-renewal-date").textContent=displayPlayerRenewal(me.followup_renewal_date);
 $("player-name").textContent=me.name;
 const initials=String(me.name||"TM").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
 $("profile-display-name").textContent=me.name;
 $("profile-display-username").textContent=profileUsername?"@"+profileUsername:"";
 paintPlayerPhoto(!!sessionData.user?.has_photo,initials,epoch);
 if(epoch!==playerSessionEpoch)return;
 plans=p.options_by_color;
 periPlans=p.peri_plans||{};
 visualPortionsByColor={};
 if(me.visual_portions_enabled){
  try{
   const photoIndex=await api("/api/v2/player/visual-portions");
   if(epoch!==playerSessionEpoch)return;
   visualPortionsByColor=photoIndex.options_by_color||{};
  }catch(err){
   if(epoch!==playerSessionEpoch)return;
   visualPortionsByColor={};
  }
 }
 $("login-panel").hidden=true;
 $("player-panel").hidden=false;
 $("logout").hidden=false;
 $("status").textContent=""; // Never keep a stale pre-login session warning on screen.
 await show(tab);
 if(epoch===playerSessionEpoch)await finishPlayerLoading(epoch);
}
/* Adaptive navigation: hysteresis prevents flicker on short scroll gestures. */
let mileLastScrollY=0,mileScrollAccum=0,mileScrollDirection=0,mileScrollFrame=0;
function updateAdaptiveNav(){
 mileScrollFrame=0;
 const nav=$("tabs");
 if(!nav||$("player-panel").hidden)return;
 const y=Math.max(0,window.scrollY||document.documentElement.scrollTop||0);
 const delta=y-mileLastScrollY;
 mileLastScrollY=y;
 if(y<32){nav.classList.remove("tabs-compact");mileScrollAccum=0;return;}
 if(Math.abs(delta)<1)return;
 const direction=Math.sign(delta);
 if(direction!==mileScrollDirection){mileScrollDirection=direction;mileScrollAccum=0;}
 mileScrollAccum+=Math.abs(delta);
 if(mileScrollAccum>=28){
  nav.classList.toggle("tabs-compact",direction>0);
  mileScrollAccum=0;
 }
}
window.addEventListener("scroll",()=>{
 if(!mileScrollFrame)mileScrollFrame=window.requestAnimationFrame(updateAdaptiveNav);
},{passive:true});
async function show(t){
 // Leaving through the tab bar closes an open plan page (no scroll restore: the tab is re-shown fresh).
 if(document.body.classList.contains("plan-page-open")){document.body.classList.remove("plan-page-open");planPageReturn=null;$("plans-prescriptions").querySelector(".plan-page-head")?.remove();}
 if(t!=="overview")pendingDailySwipeDirection=0;
 $("tabs").classList.remove("tabs-compact");mileScrollAccum=0;mileLastScrollY=Math.max(0,window.scrollY||0);
 if(t!=="profile")resetProfileSubpage();
 // The tab bar always opens a tab fresh: close an open metric page or the Peso em jejum screen.
 closeProgressPage(false);if(weightDetailOpen)closeWeightDetail();
 if(t!=="overview"){++overviewRequestId;setOverviewLoading(false);}
 if(t!=="menus"){++menuRenderToken;$("menu-loading").hidden=true;}
 const tabOrder=["overview","plans","assessments","menus","profile"];
 const oldIndex=tabOrder.indexOf(tab),newIndex=tabOrder.indexOf(t);
 const direction=oldIndex<newIndex?1:-1;
 const animateTransition=oldIndex!==newIndex&&oldIndex>=0;
 tab=t;document.body.classList.toggle("profile-active",t==="profile");document.body.classList.toggle("overview-active",t==="overview");document.body.classList.toggle("progress-active",t==="assessments");
 for(const key of ["overview","plans","assessments","menus","profile"])$(key).hidden=key!==(t==="assessments"?"plans":t);
 window.themileRecipes?.syncHeaderBack?.();
 for(const b of document.querySelectorAll("[data-tab]"))b.setAttribute("aria-pressed",String(b.dataset.tab===t));
 document.querySelector(".welcome").hidden=true;
 if(animateTransition&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  const destination=$(t==="assessments"?"plans":t);
  destination.getAnimations().forEach(animation=>animation.cancel());
  destination.animate([
   {transform:"translateX("+(direction*24)+"px)",opacity:0.55},
   {transform:"translateX(0)",opacity:1}
  ],{duration:500,easing:"cubic-bezier(0.2,0.7,0.2,1)"});
 }
 if(t==="overview")await overview();
 if(t==="assessments")openPlansSection("assessments");
 if(t==="menus"){
  window.themileRecipes?.onShow();
  if(window.themileRecipes?.mode()!=="recipes")await menusView();
 }
}

async function renderSupplementPlan(target){
 const data=await api("/api/v2/player/supplements"),root=target||$("plan-detail");if(!root.isConnected)return;root.replaceChildren();
 if(!data.plan.length){root.textContent=playerText("Ainda não existe plano de suplementação publicado.","No supplement plan published yet.");return;}
 const labels={daily:"Todos os dias",training:"Dias de treino",match:"MD","md-1":"MD-1","md+1":"MD+1"};
 for(const item of data.plan){
  const box=document.createElement("div");box.className="supplement-entry";
  if(item.library_id){const img=document.createElement("img");img.className="supplement-product-image";img.src="/api/v2/supplement-library/"+encodeURIComponent(item.library_id)+"/image";img.alt=item.name;img.loading="lazy";img.onerror=()=>img.remove();box.append(img);}
  const title=document.createElement("strong");title.textContent=item.name+" · "+item.dose;
  const ruleLabel=playerUiLanguage==="en"?
   ({daily:"Every day",training:"Training days",match:"Match day",
      "md-1":"MD-1","md+1":"MD+1"}[item.rule]||item.rule):
   (labels[item.rule]||item.rule);
  const momentLabels=playerUiLanguage==="en"?
   ({breakfast:"Breakfast",lunch:"Lunch",snack:"Snack",dinner:"Dinner",supper:"Supper",
     training:"Training",match:"Match",lunch_or_dinner:"Lunch or dinner"}):
   ({breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",
     supper:"Ceia",training:"Treino",match:"Jogo",lunch_or_dinner:"Almoço ou jantar"});
  const meta=document.createElement("small");meta.textContent=ruleLabel+" · "+
    (item.timing_text||momentLabels[item.moment]||playerText("Sem associação","Not assigned"));
  box.append(title,meta);if(item.note){const note=document.createElement("small");note.textContent=item.note;box.append(note);}root.append(box);
 }
}
// Inactive integration seam: the live player UI always uses its existing
// prescription until an explicitly reviewed activation enables this flag.
const POST_MATCH_DISPLAY_ENABLED=false;
let effectiveScenarioColorsByDay={};
let canonicalMealColorsByDay={};
function assignedColor(date,meal,classification){
 const effective=canonicalMealColorsByDay[date]?.[meal];
 if(effective&&Object.prototype.hasOwnProperty.call(effective,"color"))return effective.color;
 if(POST_MATCH_DISPLAY_ENABLED){
  const simulated=effectiveScenarioColorsByDay[date];
  if(simulated&&Object.prototype.hasOwnProperty.call(simulated,meal)){
   return simulated[meal]==="none"?null:simulated[meal];
  }
 }
 const own=dayColorOverrides[date+"|"+meal];
 if(own==="none")return null;
 if(own)return own;
 return model.find(c=>c.name===(classification||"Geral"))?.meals?.[meal]||null;
}
// Date-specific nutritionist choices are an opt-in overlay on immutable Planos.
 // No published choice (or a stale reference) means all Planos options remain.
function datedPlanOptions(date,meal,color,assignments=publishedMealChoices){
 const options=plans[color]?.[meal]||[];
 const selected=assignments[date+"|"+meal];
 if(!selected||selected.source_color!==color)return options;
 const index=selected.option_index-1,choice=options[index];
 if(!choice||choice.option_ref!==selected.option_ref||
    choice.source_draft_id!==selected.source_draft_id)return options;
 return [choice];
}
// Read-only nutritional parity check, never rendered and never persisted.
let scenarioNutritionPreviewByDay={};
let scenarioNutritionParityByDay={};
const SCENARIO_NUTRITION_KEYS=["kcal","protein_g","carbs_g","fat_g"];
function nutritionPreviewParity(local,remote){
 if(!local||!remote?.complete||!remote?.totals)return null;
 const differences={};
 for(const key of SCENARIO_NUTRITION_KEYS){
  const expected=Number(remote.totals[key]),actual=Number(local[key]);
  if(!Number.isFinite(expected)||!Number.isFinite(actual))return null;
  differences[key]=actual-expected;
 }
 return {matches:Object.values(differences).every(value=>Math.abs(value)<0.01),differences};
}
function previewNutritionForColors(entry,colorMap,planData,periData,mealKeys){
 const total={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let count=0;
 for(const meal of mealKeys){
  const color=colorMap?.[meal];
  if(!color||color==="none")continue;
  const avg=average(planData[color]?.[meal]||[]);
  if(!avg)return null;
  count++;for(const key in total)total[key]+=avg[key];
 }
 for(const item of periData.filter(x=>x.event_date===entry.date)){
  const avg=average(item.options||[]);
  if(!avg)return null;
  count++;for(const key in total)total[key]+=avg[key];
 }
 return count?total:null;
}
function dayNutritionTotal(entry){
 if(!entry?.date)return null;
 const total={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let count=0;
 for(const meal of meals){
  const color=assignedColor(entry.date,meal,entry.classification);
  if(!color)continue;
  const avg=average(datedPlanOptions(entry.date,meal,color));
  if(!avg)return null;
  count++;for(const k in total)total[k]+=avg[k];
 }
 for(const item of periMeals.filter(x=>x.event_date===entry.date)){
  const avg=average(item.options||[]);
  if(!avg)return null;
  count++;for(const k in total)total[k]+=avg[k];
 }
 return count?total:null;
}
function weeklyDayTotal(entry){return dayNutritionTotal(entry);}
// Seven-day averages require seven complete days; /kg always uses each day's reference weight.
function summarizeWeekNutrition(dates,totals,referenceWeights={}){
 const fields=["kcal","protein_g","carbs_g","fat_g"];
 const completeDays=totals.filter(row=>row&&fields.every(k=>Number.isFinite(row[k])&&row[k]>=0)).length;
 if(dates.length!==7||totals.length!==7||completeDays!==7)
  return {complete:false,completeDays,means:null,perKg:{},hasAllReferenceWeights:false};
 const means=Object.fromEntries(fields.map(k=>[k,totals.reduce((sum,row)=>sum+row[k],0)/7]));
 const weights=dates.map(date=>{
  const raw=referenceWeights?.[date]?.weight_kg;
  const value=raw==null?NaN:Number(raw);
  return Number.isFinite(value)&&value>0?value:null;
 });
 const hasAllReferenceWeights=weights.every(w=>w!==null);
 const perKg=hasAllReferenceWeights?
  Object.fromEntries(fields.map(k=>[k,totals.reduce((sum,row,i)=>sum+row[k]/weights[i],0)/7])):{};
 return {complete:true,completeDays:7,means,perKg,hasAllReferenceWeights};
}
function weeklySummary(data,relativeMeans={}){
 const section=document.createElement("section");section.className="weekly-average-summary";
 for(const [key,label,cls] of [["kcal","kcal","kcal"],["protein_g",playerMacroLabel("protein_g"),"protein"],["carbs_g",playerMacroLabel("carbs_g"),"carbs"],["fat_g",playerMacroLabel("fat_g"),"fat"]]){
  const item=document.createElement("div");item.className="weekly-average-metric "+cls;
  const title=document.createElement("small");title.textContent=label;
  const value=document.createElement("strong");value.textContent=(key==="kcal"?fmtKcal(data[key]):fmt(data[key],0))+(key==="kcal"?"":" g");
  item.append(title,value);
  if(Number.isFinite(relativeMeans[key])){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=(key==="kcal"?fmtKcal(relativeMeans[key]):fmt(relativeMeans[key],1))+(key==="kcal"?" kcal/kg":" g/kg");item.append(ratio);}
  section.append(item);
 }
 return section;
}
// Everything the player can record on a date, read from one calendar response:
// - main meals with a planned colour (same precedence as the day view: canonical effective colour,
//   then the player's own colour change, then the day classification);
// - meals tied to a training or match shown that day (Pré/Pós-treino, Pré/Intra/Pós-jogo), keyed by event.
function plannedRecordItemsForDay(calendar,dateKey){
 const day=calendar?.days?.find(x=>x.date===dateKey);if(!day)return [];
 const overrides=Object.fromEntries((calendar.meal_color_overrides||[]).map(x=>[x.meal_date+"|"+x.meal,x.color]));
 const main=(calendar.meals||[]).filter(meal=>{
  const effective=calendar.effective_colors?.[dateKey]?.[meal];
  if(effective&&Object.prototype.hasOwnProperty.call(effective,"color"))return !!effective.color;
  const own=overrides[dateKey+"|"+meal];
  if(own)return own!=="none";
  return !!(calendar.classifications||[]).find(x=>x.name===(day.classification||"Geral"))?.meals?.[meal];
 }).map(meal=>({meal,event_id:""}));
 const shown=new Set((calendar.events||[]).filter(e=>e.kind!=="off"&&e.event_date===dateKey&&(e.session==="morning"||e.session==="afternoon")).map(e=>e.id)
  .concat((calendar.matches||[]).filter(m=>m.match_date===dateKey).map(m=>m.id)));
 const peri=(calendar.peri_meals||[]).filter(p=>p.event_date===dateKey&&shown.has(p.event_id)&&(p.options||[]).length)
  .map(p=>({meal:p.selection_phase,event_id:p.event_id}));
 return main.concat(peri);
}
// A day's records: each planned item registered plus the fasting weight.
function dayRecordProgress(planned,records,dateKey,weighed){
 const done=planned.filter(item=>records.some(r=>r.meal_key===item.meal&&r.meal_date===dateKey&&(r.event_id||"")===(item.event_id||""))).length+(weighed?1:0);
 return {done,total:planned.length+1};
}
const REGISTOS_CHECK='<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="17" class="registos-done-fill"/><path d="M11 17.5l4 4 8-9" class="registos-done-tick"/></svg>';
function registosRing(done,total,today){
 const r=15,c=2*Math.PI*r,arc=total?c*done/total:0;
 return '<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="'+r+'" class="registos-track"/>'+
  (arc?'<circle cx="17" cy="17" r="'+r+'" class="registos-arc'+(today?' today':'')+'" stroke-dasharray="'+arc.toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 17 17)"/>':'')+
  (done?'<text x="17" y="21" text-anchor="middle" class="registos-count">'+done+'/'+total+'</text>':'')+'</svg>';
}
// Planos widget (25/11): the full plans, reached from Início instead of a tab.
// Carbohydrate level is fixed per colour (decided with the nutrition team): 4 = most carbohydrates.
const PLAN_CARB_LEVEL={green:4,vp:4,blue:3,yellow:2,orange:1};
const PLAN_ORDER=["green","vp","blue","yellow","orange"];
function planCarbBars(level){
 let bars="";for(let i=0;i<4;i++){const h=0.28+i*0.22,x=0.14+i*0.19;bars+='<rect x="'+(x*40).toFixed(1)+'" y="'+((0.92-h*0.85)*40).toFixed(1)+'" width="5.2" height="'+(h*0.85*40).toFixed(1)+'" rx="1.6" class="'+(i<level?"on":"off")+'"/>';}
 return '<svg viewBox="0 0 40 40" aria-hidden="true">'+bars+'</svg>';
}
function planDailyTotals(color){
 const sum={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let any=false;
 for(const meal of ["breakfast","lunch","snack","dinner","supper"]){const avg=average(plans[color]?.[meal]||[]);if(!avg)continue;any=true;for(const k in sum)sum[k]+=avg[k];}
 return any?sum:null;
}
function availablePlanEntries(){
 const hasPeri=kind=>Object.values(periPlans[kind]?.options||{}).some(options=>options?.length);
 const colours=PLAN_ORDER.filter(c=>plans[c]&&Object.values(plans[c]).some(a=>a.length));
 const out=colours.map(c=>{const t=planDailyTotals(c);return {key:c,label:colorNames[c]||c,tone:c,carbs:PLAN_CARB_LEVEL[c]||0,sub:t?fmtKcal(t.kcal)+playerText(" kcal/dia"," kcal/day"):""};});
 if(hasPeri("training"))out.push({key:"peri-training",label:playerText("Treino","Training"),icon:"soft-drink-01",sub:playerText("Pré e pós-treino","Pre and post-training")});
 if(hasPeri("match"))out.push({key:"peri-match",label:playerText("Jogo","Match"),icon:"football",sub:playerText("Intra e pós-jogo","Intra and post-match")});
 out.push({key:"supplements",label:playerText("Suplementação","Supplements"),icon:"pill",sub:playerText("Ver plano","View plan")});
 return out;
}
function planBadge(entry){
 const badge=document.createElement("span");badge.className="plan-badge"+(entry.tone?" tone-"+entry.tone:" neutral");
 if(entry.tone)badge.innerHTML=planCarbBars(entry.carbs);else badge.append(mealIcon(entry.icon));
 return badge;
}
function renderPlansWidget(root){
 const entries=availablePlanEntries();if(!entries.length)return;
 const heading=document.createElement("div");heading.className="day-section-heading plans-heading";
 const title=document.createElement("h3");title.textContent=playerText("Planos","Plans");heading.append(title);
 const card=document.createElement("section");card.className="plans-widget";card.setAttribute("aria-label",playerText("Planos completos","Full plans"));
 const top=document.createElement("div");top.className="plans-widget-top";top.textContent=playerText("Os teus planos completos","Your full plans");
 const row=document.createElement("div");row.className="plans-widget-row";row.id="plans-widget-row";
 for(const entry of entries){
  const b=document.createElement("button");b.type="button";b.className="plans-widget-item";
  const name=document.createElement("span");name.className="plans-widget-name";name.textContent=entry.label;
  const sub=document.createElement("span");sub.className="plans-widget-sub";sub.textContent=entry.sub;
  b.append(planBadge(entry),name,sub);
  b.setAttribute("aria-label",entry.label+(entry.tone?playerText(", hidratos ",", carbohydrates ")+entry.carbs+playerText(" de 4"," of 4"):"")+(entry.sub?", "+entry.sub:""));
  b.onclick=()=>openPlanPage(entry);
  row.append(b);
 }
 card.append(top,row);root.append(heading,card);
}
// Plan page: opened over Início and closed back to the exact place (Início is not re-rendered).
let planPageReturn=null;
function openPlanPage(entry){
 planPageReturn={scrollY:window.scrollY};
 const detail=$("plan-detail"),host=$("plans-prescriptions");
 $("overview").hidden=true;$("plans").hidden=false;openPlansSection("prescriptions");
 document.body.classList.add("plan-page-open");
 host.querySelector(".plan-page-head")?.remove();
 const head=document.createElement("div");head.className="plan-page-head";
 const back=document.createElement("button");back.type="button";back.className="plan-page-back";back.setAttribute("aria-label",playerText("Voltar ao Início","Back to Home"));
 const arrow=document.createElement("span");arrow.setAttribute("aria-hidden","true");arrow.textContent="‹";back.append(arrow);back.onclick=closePlanPage;
 const titleRow=document.createElement("div");titleRow.className="plan-page-title";
 const words=document.createElement("div");const kicker=document.createElement("span");kicker.textContent=playerText("Plano","Plan");
 const name=document.createElement("h2");name.textContent=entry.label;words.append(kicker,name);
 titleRow.append(planBadge(entry),words);head.append(back,titleRow);
 if(entry.tone){
  const t=planDailyTotals(entry.key);
  if(t){
   const stats=document.createElement("div");stats.className="plan-page-stats";
   for(const [label,value,cls] of [[playerText("kcal/dia","kcal/day"),fmtKcal(t.kcal),"kcal"],[playerMacroLabel("protein_g"),fmt(t.protein_g,0)+" g","protein"],[playerMacroLabel("carbs_g"),fmt(t.carbs_g,0)+" g","carbs"],[playerMacroLabel("fat_g"),fmt(t.fat_g,0)+" g","fat"]]){
    const cell=document.createElement("div");const l=document.createElement("small");l.textContent=label;const v=document.createElement("strong");v.className=cls;v.textContent=value;cell.append(l,v);stats.append(cell);
   }
   head.append(stats);
  }
 }
 host.prepend(head);
 detail.replaceChildren();planPhase=null;renderPlanContent(entry.key,detail);
 window.scrollTo({top:0});back.focus({preventScroll:true});
}
function closePlanPage(){
 const ret=planPageReturn;planPageReturn=null;
 document.body.classList.remove("plan-page-open");
 $("plans-prescriptions").querySelector(".plan-page-head")?.remove();$("plan-detail").replaceChildren();
 $("plans").hidden=true;$("overview").hidden=false;
 if(ret)requestAnimationFrame(()=>window.scrollTo({top:ret.scrollY}));
}
// Registos: the last 7 days (ending on the selected day, never after today), complete = all meals + fasting weight.
async function renderRegistosCard(root,selectedKey,isCurrent){
 const todayKey=iso(new Date()),endKey=selectedKey<todayKey?selectedKey:todayKey;
 const end=new Date(endKey+"T12:00:00"),start=new Date(end);start.setDate(end.getDate()-6);const startKey=iso(start);
 const heading=document.createElement("div");heading.className="day-section-heading registos-heading";
 const title=document.createElement("h3");title.textContent=playerText("Registos","Records");heading.append(title);
 const card=document.createElement("section");card.className="registos-card";card.setAttribute("aria-label",playerText("Registos dos últimos 7 dias","Records for the last 7 days"));
 heading.hidden=true;card.hidden=true;root.append(heading,card);
 let calendar,records,weights;
 try{[calendar,records,weights]=await Promise.all([
  cachedOverviewRead("/api/v2/player/calendar?start="+startKey+"&end="+endKey),
  api("/api/v2/player/consumption-records?start="+startKey+"&end="+endKey),
  api("/api/v2/player/weight-history?end="+endKey+"&days=7&local_date="+todayKey)]);}
 catch{heading.remove();card.remove();return;}
 if(!isCurrent()||!card.isConnected)return;
 const weighed=new Set((weights.entries||[]).map(x=>x.weigh_date));
 const recs=records.records||[];
 const top=document.createElement("div");top.className="registos-top";top.textContent=playerText("Últimos 7 dias","Last 7 days");
 const row=document.createElement("div");row.className="registos-days";
 let complete=0,counted=0;
 for(let i=0;i<7;i++){
  const dt=new Date(start);dt.setDate(start.getDate()+i);const key=iso(dt);
  const {done,total}=dayRecordProgress(plannedRecordItemsForDay(calendar,key),recs,key,weighed.has(key));
  const full=done>=total,isToday=key===todayKey;
  if(!isToday||full)counted++;if(full)complete++;
  const b=document.createElement("button");b.type="button";b.className="registos-day"+(key===selectedKey?" selected":"")+(isToday?" today":"");
  const label=document.createElement("span");label.className="registos-label";label.textContent=dt.toLocaleDateString(playerDateLocale(),{weekday:"long"}).replace(/-feira$/,"").slice(0,3).replace(/^./,x=>x.toLocaleUpperCase(playerDateLocale()));
  const mark=document.createElement("span");mark.className="registos-mark"+(full?" done":done?" partial":" none");mark.innerHTML=full?REGISTOS_CHECK:registosRing(done,total,isToday);
  const dot=document.createElement("span");dot.className="registos-dot";dot.setAttribute("aria-hidden","true");
  b.append(label,mark,dot);
  b.setAttribute("aria-label",dt.toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"})+": "+(full?playerText("completo","complete"):done?done+playerText(" de "," of ")+total+playerText(" registos"," records"):playerText("sem registos","no records")));
  b.onclick=()=>{day=dt;weeklySelection=null;overview().catch(error);};
  row.append(b);
 }
 const foot=document.createElement("div");foot.className="registos-foot";
 const summary=document.createElement("span");const strong=document.createElement("strong");strong.textContent=complete+playerText(" de "," of ")+counted;summary.append(strong,document.createTextNode(playerText(" dias completos"," complete days")));
 const rule=document.createElement("span");rule.textContent=playerText("Refeições + peso","Meals + weight");
 foot.append(summary,rule);
 card.append(top,row,foot);heading.hidden=false;card.hidden=false;
}
// Planned calories and macros of the week, day by day (moved from the Dia ring card to Semana).
// g/kg divides each day by that day's reference weight, as in the weekly daily average.
function buildWeeklyNutritionCharts(weekDays,referenceWeights={}){
 const charts=document.createElement("section");charts.className="nutrition-weekly-charts";
 const dayWeight=key=>{const raw=referenceWeights?.[key]?.weight_kg;const value=raw==null?NaN:Number(raw);return Number.isFinite(value)&&value>0?value:NaN;};
 function buildBars(title,key,color,perKg=false,decimals=0){
  const wrap=document.createElement("section");wrap.className="nutrition-chart-section";
  const heading=document.createElement("strong");heading.textContent=title;wrap.append(heading);
  const bars=document.createElement("div");bars.className="nutrition-chart-bars";
  const valueOf=item=>item.found?item.total[key]/(perKg?dayWeight(item.key):1):NaN;
  const valid=weekDays.filter(x=>Number.isFinite(valueOf(x)));
  const mean=valid.length?valid.reduce((sum,x)=>sum+valueOf(x),0)/valid.length:null;
  const max=Math.max(1,...valid.map(valueOf),mean||0);
  for(const item of weekDays){
   const value=valueOf(item),known=Number.isFinite(value);
   const column=document.createElement("div");column.className="nutrition-chart-column";
   if(item.key===iso(new Date()))column.classList.add("nutrition-chart-today");
   const n=document.createElement("span");n.className="nutrition-chart-number";n.textContent=known?(key==="kcal"?fmtKcal(value):fmt(value,decimals)):"–";n.style.color=color;
   const track=document.createElement("div");track.className="nutrition-chart-track";
   const fill=document.createElement("div");fill.className="nutrition-chart-fill";fill.style.height=(known?Math.max(4,value/max*100):0)+"%";fill.style.background=color;track.append(fill);
   const dayLabel=document.createElement("small");dayLabel.textContent=String(new Date(item.key+"T12:00:00").getDate());column.append(n,track,dayLabel);bars.append(column);
  }
  if(mean!==null){
   const line=document.createElement("div");line.className="nutrition-chart-average";
   line.style.setProperty("--avg-offset",String(72*Math.min(1,mean/max))+"px");
   line.setAttribute("aria-label",playerText("Média semanal: ","Weekly average: ")+(key==="kcal"?fmtKcal(mean):fmt(mean,decimals))+(key==="kcal"?" kcal":perKg?" g/kg":" g"));
   bars.append(line);
  }
  wrap.append(bars);return wrap;
 }
 charts.append(buildBars(playerText("Calorias da semana","Weekly calories"),"kcal","#82d4a4"));
 const macroHeader=document.createElement("div");macroHeader.className="macro-chart-header";const macroTitle=document.createElement("strong");macroTitle.textContent=playerText("Macros da semana","Weekly macros");macroTitle.className="macro-chart-heading";macroHeader.append(macroTitle);charts.append(macroHeader);
 const modes=document.createElement("div");modes.className="macro-chart-switch";const gramsMode=document.createElement("button");gramsMode.type="button";gramsMode.textContent="g";const kgMode=document.createElement("button");kgMode.type="button";kgMode.textContent="g/kg";modes.append(gramsMode,kgMode);macroHeader.append(modes);
 const macArea=document.createElement("div");charts.append(macArea);
 const anyWeight=weekDays.some(x=>Number.isFinite(dayWeight(x.key)));
 const renderMacroMode=mode=>{
  macArea.replaceChildren();gramsMode.classList.toggle("selected",mode==="g");kgMode.classList.toggle("selected",mode==="kg");
  if(mode==="kg"&&!anyWeight){const info=document.createElement("p");info.className="hint";info.textContent=playerText("Para consultar g/kg, falta o Peso de referência destes dias.","Reference weight is missing for these days, so g/kg is unavailable.");macArea.append(info);return;}
  for(const [key,title,color] of [["protein_g",playerMacroLabel("protein_g"),"#64b4f7"],["carbs_g",playerMacroLabel("carbs_g"),"#f0a077"],["fat_g",playerMacroLabel("fat_g"),"#eed076"]])macArea.append(buildBars(title,key,color,mode==="kg",mode==="kg"?1:0));
 };
 gramsMode.onclick=e=>{e.stopPropagation();renderMacroMode("g");};kgMode.onclick=e=>{e.stopPropagation();renderMacroMode("kg");};
 renderMacroMode("g");
 return charts;
}
function renderWeekly(mon,r,weekMenus=[],weeklyWeights={}){
 weeklyContext={mon,r,weekMenus,weeklyWeights};
 const root=$("weekly-view");root.replaceChildren();
 // Full-view day swipe is registered once on #overview, including this grid.
 const grid=document.createElement("div");grid.className="weekly-calendar-grid";root.append(grid);
 const selectedWeeklyDate=weeklySelection?.date||iso(day);
 if(selectedWeeklyDate){const selectedIndex=Math.round((new Date(selectedWeeklyDate+"T12:00:00")-new Date(iso(mon)+"T12:00:00"))/86400000);if(selectedIndex>=0&&selectedIndex<7){grid.classList.add("has-weekly-selection");grid.style.setProperty("--selected-column-left",`calc(${selectedIndex} * (100% - 24px) / 7 + ${selectedIndex*4}px)`);grid.style.setProperty("--selected-column-left-mobile",`calc(${selectedIndex} * (100% - 18px) / 7 + ${selectedIndex*3}px)`);}}
 const markWeeklyColumn=(el,date)=>{if(date===selectedWeeklyDate)el.classList.add("weekly-selected-column");};
 const dates=[],classes=[],totals=[];
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);const key=iso(dt),entry=r.days.find(x=>x.date===key);
  dates.push(key);classes.push(model.find(c=>c.name===entry?.classification));totals.push(weeklyDayTotal(entry||{date:key,classification:null}));
  const header=document.createElement("button");header.type="button";header.className="weekly-day-header week-day"+(key===iso(day)?" selected":"")+(key===iso(new Date())?" today":"");header.setAttribute("aria-pressed",String(key===iso(day)));header.setAttribute("aria-label",playerText("Abrir vista diária: ","Open day view: ")+dt.toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"}));
  for(const [cls,val] of [["weekday",dt.toLocaleDateString(playerDateLocale(),{weekday:"short"}).replace(".","").replace(/^./,letter=>letter.toLocaleUpperCase(playerDateLocale()))],["day-number",String(dt.getDate())],["day-classification",playerClassification(entry?.classification||"Geral")]]){
   const span=document.createElement("span");span.className=cls;span.textContent=val;header.append(span);
  }
  markWeeklyColumn(header,key);header.onclick=()=>{day=dt;overviewMode="day";weeklySelection=null;overview().catch(error);};grid.append(header);
 }
 for(const meal of meals){
  if(meal==="lunch")appendWeeklyEvents(grid,dates,"morning");
  if(meal==="dinner")appendWeeklyEvents(grid,dates,"afternoon");
  for(let i=0;i<7;i++){
   const color=assignedColor(dates[i],meal,r.days.find(e=>e.date===dates[i])?.classification),avg=color?average(datedPlanOptions(dates[i],meal,color)):null;
   if(!color){const empty=document.createElement("div");empty.className="weekly-empty";markWeeklyColumn(empty,dates[i]);grid.append(empty);continue;}
   const active=weeklySelection?.date===dates[i]&&weeklySelection?.meal===meal;
   const b=document.createElement("button");b.type="button";b.className="weekly-meal tone-"+color+(active?" is-active":"");markWeeklyColumn(b,dates[i]);
   const label=document.createElement("span");label.className="weekly-meal-name";label.textContent=meal==="breakfast"?playerText("Peq Alm.","Breakfast"):names[meal]||meal;b.append(label);
   if(avg){const value=document.createElement("span");value.className="weekly-meal-kcal";value.textContent=fmtKcal(avg.kcal);b.append(value);}
   b.setAttribute("aria-label",(names[meal]||meal)+" "+dates[i]+playerText(" — abrir opções"," — open options"));b.setAttribute("aria-pressed",String(active));
   b.onclick=()=>{weeklySelection=active?null:{date:dates[i],meal,color};renderWeekly(mon,r,weekMenus,weeklyWeights);};grid.append(b);
  }
 }
 for(let i=0;i<7;i++){
  const box=document.createElement("div");box.className="weekly-day-total";markWeeklyColumn(box,dates[i]);const total=totals[i];
  if(!total){box.textContent="—";grid.append(box);continue;}
  const energy=document.createElement("div");energy.className="weekly-total-kcal";energy.textContent=fmtKcal(total.kcal);energy.setAttribute("aria-label",playerText("Energia ","Energy ")+fmtKcal(total.kcal)+" kcal");box.append(energy);
  const line=document.createElement("div");line.className="weekly-total-macros";
  for(const k of ["protein_g","carbs_g","fat_g"]){const v=document.createElement("span");v.className=k==="protein_g"?"protein":k==="carbs_g"?"carbs":"fat";v.textContent=fmt(total[k],0);line.append(v);}
  box.append(line);grid.append(box);
 }
 const detail=document.createElement("div");detail.id="weekly-selection-detail";root.append(detail);
 if(weeklySelection&&!weeklySelection.periEventId&&dates.includes(weeklySelection.date)){
  const {date,meal,color}=weeklySelection;
  const section=document.createElement("section");section.className="weekly-detail weekly-color-detail tone-"+color;
  const dayData=r.days.find(x=>x.date===date);
  const top=document.createElement("div");top.className="weekly-detail-heading";
  const caption=document.createElement("small");caption.textContent=new Date(date+"T12:00:00").toLocaleDateString(playerDateLocale(),{weekday:"short",day:"2-digit",month:"2-digit"}).replace(".","")+" · "+playerClassification(dayData?.classification||"Geral");
  const title=document.createElement("strong");title.textContent=names[meal]||meal;
  const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label",playerText("Fechar refeição","Close meal"));close.onclick=()=>{weeklySelection=null;renderWeekly(mon,r,weekMenus,weeklyWeights);};
  const titleGroup=document.createElement("div");titleGroup.className="weekly-detail-titles";titleGroup.append(caption,title);top.append(titleGroup,close);section.append(top);
  const options=datedPlanOptions(date,meal,color),avg=average(options);
  if(avg){const line=document.createElement("div");line.className="weekly-meal-average";line.append(nutrition(avg));section.append(line);}
  if(meal==="lunch"||meal==="dinner"){
   const menu=weekMenus.find(x=>x.menu_date===date&&x.meal===meal);
   if(menu){const line=document.createElement("div");line.className="weekly-menu-line";line.textContent=playerMenuCategoryLabel(menu);section.append(line);}
  }
  if(!options.length){const note=document.createElement("p");note.className="hint";note.textContent=playerText("Plano ainda não publicado.","Plan not yet published.");section.append(note);}
  else if(options.length===1){
   appendMealItems(section,options[0].items);
  }else options.forEach((o,i)=>{const item=optionEl(o,i,true);item.classList.add("weekly-option-card");section.append(item);});
  attachSupplements(section,(supplementsByDay[date]||[]).filter(x=>x.moment===meal||(meal==="lunch"&&x.moment==="lunch_or_dinner")));
  detail.append(section);
 }
 if(weeklySelection?.periEventId&&dates.includes(weeklySelection.date)){
   const item=periMeals.find(x=>x.event_id===weeklySelection.periEventId&&x.selection_phase===weeklySelection.selectionPhase&&x.event_date===weeklySelection.date);
   if(item){
    const section=document.createElement("section");section.className="weekly-detail peri-weekly-detail";
    const top=document.createElement("div");top.className="weekly-detail-heading";
    const caption=document.createElement("small");caption.textContent=new Date(item.event_date+"T12:00:00").toLocaleDateString(playerDateLocale(),{weekday:"short",day:"2-digit",month:"2-digit"});
    const title=document.createElement("strong");title.textContent=item.selection_phase==="intra_match"?playerText("Jogo","Match"):item.title;
    const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label",playerText("Fechar refeição","Close meal"));close.onclick=()=>{weeklySelection=null;renderWeekly(mon,r,weekMenus,weeklyWeights);};
    const group=document.createElement("div");group.className="weekly-detail-titles";group.append(caption,title);top.append(group,close);section.append(top);
    const opts=item.options||[],avg=average(opts);
    if(avg){const line=document.createElement("div");line.className="weekly-meal-average";line.append(nutrition(avg));section.append(line);}
    if(opts.length===1){for(const food of opts[0].items||[]){const line=document.createElement("div");line.className="foods";line.textContent=periFoodText(food);section.append(line);}}
    else opts.forEach((option,index)=>{const card=optionEl(option,index,true);card.classList.add("weekly-option-card");section.append(card);});
    detail.append(section);
   }
  }

 const heading=document.createElement("div");heading.className="weekly-summary-heading";const h=document.createElement("h2");h.textContent=playerText("Média diária","Daily average");heading.append(h);root.append(heading);
 const weeklyNutrition=summarizeWeekNutrition(dates,totals,weeklyWeights);
 if(!weeklyNutrition.complete){
  const hint=document.createElement("p");hint.className="hint";
  hint.textContent=playerText("Média semanal indisponível · ","Weekly average unavailable · ")+weeklyNutrition.completeDays+playerText("/7 dias com prescrição nutricional completa.","/7 days with a complete meal plan.");
  root.append(hint);
 }else{
  root.append(weeklySummary(weeklyNutrition.means,weeklyNutrition.perKg));
  if(!weeklyNutrition.hasAllReferenceWeights){
   const hint=document.createElement("p");hint.className="hint";
   hint.textContent=playerText("Rácios por kg indisponíveis: falta o Peso de referência de um ou mais dias.","Per-kg ratios unavailable: reference weight missing for one or more days.");
   root.append(hint);
  }
 }
 const chartDays=dates.map(key=>{const total=dayNutritionTotal(r.days.find(x=>x.date===key)||{date:key,classification:null});return {key,total,found:!!total};});
 root.append(buildWeeklyNutritionCharts(chartDays,weeklyWeights));
 const weeklySupplements=new Map();
 for(const date of dates){
  for(const item of supplementsByDay[date]||[]){
   const group=item.rule==="daily"?"Diariamente":item.rule==="match"?"MD":item.rule==="md-1"?"MD-1":item.rule==="md+1"?"MD+1":item.rule==="training"?"Treino":"Outros";
   const key=group+"|"+(item.library_id||item.name)+"|"+item.dose;
   if(!weeklySupplements.has(key))weeklySupplements.set(key,{group,name:item.name,dose:item.dose,dates:[],timing:item.display_moment||item.timing_text||""});
   weeklySupplements.get(key).dates.push(date);
  }
 }
 if(weeklySupplements.size){
  const summary=document.createElement("details");summary.className="weekly-supplement-summary";
  const header=document.createElement("summary");header.textContent=playerText("Suplementação","Supplements");header.prepend(mealIcon("pill"));summary.append(header);
  for(const group of ["Diariamente","Treino","MD-1","MD","MD+1","Outros"]){
   const items=[...weeklySupplements.values()].filter(x=>x.group===group);
   if(!items.length)continue;
   const row=document.createElement("div");row.className="weekly-supplement-group";
   const label=document.createElement("strong");label.textContent=group;row.append(label);
   for(const item of items){const entry=document.createElement("div");entry.className="weekly-supplement-entry";entry.textContent=item.name+" - "+item.dose+(item.timing?", "+item.timing.toLowerCase():"");row.append(entry);}summary.append(row);
  }
  root.append(summary);
 }
}


/* All five published peri phases reuse the existing event-scoped meal-consumption flow.
   Only attach after an option is visible in the calendar; never mutate Planos. */
function appendIntraTimingConsumption(card,item,previous,date,meal,eventId){
 const options=item.options||[];
 const hosts=options.length===1?[card]:[...card.children].filter(child=>child.tagName==='DETAILS');
 const entries=hosts.flatMap((host,index)=>[...host.querySelectorAll(':scope > .peri-timing-group')]
  .map(group=>({group,index,timing:group.dataset.timing||''})));
 if(!entries.length||entries.some(x=>!x.timing))return false;
 // Preserve historical whole-match entries. They must be annulled explicitly
 // before independent timing entries can be created, never silently migrated.
 if(previous&&!previous.timing_records?.length){
  const title=card.querySelector('.daily-meal-head > strong');
  if(title){const badge=document.createElement('span');badge.className='meal-registered-badge meal-registered-meal-badge';registeredMark(badge,playerText('Refeição registada','Meal recorded'));title.after(badge);}
  card.append(makeRecordedConsumptionTags({host:card,date,meal,eventId,description:playerText('consumo anterior de Jogo','previous match consumption')}));
  return true;
 }
 const current=previous?.timing_records||[];
 const available=new Set(entries.map(x=>x.timing));
 if(current.length&&[...available].every(t=>current.some(row=>row.timing===t))){
  const title=card.querySelector('.daily-meal-head > strong');
  if(title){const badge=document.createElement('span');badge.className='meal-registered-badge meal-registered-meal-badge';registeredMark(badge,playerText('Refeição registada','Meal recorded'));title.after(badge);}
 }
 for(const {group,index,timing} of entries){
  const optionRef=options[index].option_ref;
  const saved=current.find(row=>row.timing===timing&&row.option_ref===optionRef);
  if(saved){
   group.append(makeRecordedConsumptionTags({host:group,date,meal,eventId,optionIndex:index,optionRef,timing,description:playerText('consumo de ','consumption at ')+((playerUiLanguage==='en'?periTimingEnglish[timing]:periTimingLabels[timing])||timing)}));
   continue;
  }
  const actions=document.createElement('div');actions.className='consumption-actions consumption-actions--pending consumption-quick-actions';
  const edit=document.createElement('button');edit.type='button';edit.className='consumption-quick-edit';edit.textContent=playerText('Editar consumo','Edit consumption');
  const quick=document.createElement('button');quick.type='button';quick.className='consumption-quick-confirm';consumptionActionLabel(quick,'CheckmarkCircle02Icon',playerText(' Cumpri',' Done'));
  const feedback=document.createElement('p');feedback.className='consumption-feedback consumption-quick-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  edit.onclick=()=>{edit.disabled=true;openConsumptionEditor(group,date,meal,eventId,index,null,timing,optionRef).finally(()=>{edit.disabled=false;});};
  quick.onclick=async()=>{
   if(current.some(row=>row.timing===timing)&&!window.confirm(playerText('Já existe um registo neste momento. Substituir?','A record already exists for this time. Replace it?')))return;
   quick.disabled=true;edit.disabled=true;quick.textContent=playerText('A guardar…','Saving…');feedback.textContent='';
   try{
    const qs=new URLSearchParams({date,meal,event_id:eventId,timing});
    const source=await api('/api/v2/player/consumption-options?'+qs);
    const option=source.options?.find(row=>row.option_ref===optionRef);
    if(!option)throw new Error(playerText('Opção ou timing publicado indisponível','Published option or timing unavailable'));
    await api('/api/v2/player/consumption-records',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':playerCsrf},body:JSON.stringify({date,meal,event_id:eventId,timing,option_ref:option.option_ref,status:'all'})});
    showConsumptionSuccess(quick);feedback.textContent='';
    await new Promise(resolve=>setTimeout(resolve,900));await refreshAfterConsumption(group,meal,eventId);
   }catch(err){feedback.textContent=playerText('Não foi possível registar este momento.','Could not record this moment.');quick.disabled=false;edit.disabled=false;consumptionActionLabel(quick,'CheckmarkCircle02Icon',playerText(' Cumpri',' Done'));error(err);}
  };
  actions.append(edit,quick);group.append(actions,feedback);
 }
 // A new ingestion moment is only a consumption record, never a prescription.
 const extras=current.filter(record=>record.prescription?.origin==='player_added');
 for(const saved of extras){
  if(available.has(saved.timing))continue;
  const group=document.createElement('div');group.className='peri-timing-group intra-added-timing';
  group.dataset.timing=saved.timing;
  const heading=document.createElement('div');heading.className='peri-timing-heading';
  heading.textContent=(playerUiLanguage==='en'?periTimingEnglish[saved.timing]:periTimingLabels[saved.timing])||saved.timing;
  const origin=document.createElement('small');origin.className='intra-added-origin';origin.textContent=playerText('Adicionado pelo jogador','Added by player');
  heading.append(origin);group.append(heading);
  for(const food of saved.consumed_foods||[]){
   const line=document.createElement('div');line.className='peri-timing-line';
   const grams=Number(food.grams);const quantity=Number.isFinite(grams)?String(Math.round(grams*10)/10)+' g ':'';
   line.textContent=quantity+(food.display_name||food.library_name||food.name||playerText('Alimento da biblioteca','Library food'));
   group.append(line);
  }
  group.append(makeRecordedConsumptionTags({host:group,date,meal,eventId,timing:saved.timing,
   optionRef:saved.option_ref,extraTiming:true,description:playerText('consumo adicional de ','additional consumption at ')+((playerUiLanguage==='en'?periTimingEnglish[saved.timing]:periTimingLabels[saved.timing])||saved.timing)}));
  card.append(group);
 }
 const reserved=new Set();
 for(const option of options){
  for(const food of option.items||[]){
   if(food.timing)reserved.add(food.timing);
   for(const part of food.timing_splits||[])if(part.timing)reserved.add(part.timing);
  }
  for(const timing of option.timing_groups||[])reserved.add(timing);
 }
 for(const record of current)reserved.add(record.timing);
 const choices=Object.entries(periTimingLabels).filter(([timing])=>!reserved.has(timing)).map(([timing,label])=>[timing,playerUiLanguage==='en'?(periTimingEnglish[timing]||label):label]);
 if(choices.length){
  // Keep moment selection and the existing food editor in one inline flow.
  const group=document.createElement('div');group.className='peri-timing-group intra-add-moment-group';
  const addButton=document.createElement('button');addButton.type='button';
  addButton.className='intra-add-moment-trigger';addButton.textContent=playerText('⊕ Adicionar','⊕ Add');
  addButton.setAttribute('aria-expanded','false');
  const picker=document.createElement('div');picker.className='intra-add-moment-panel';picker.hidden=true;
  // Match the approved food-search option cards, not an iOS-native select.
  const label=document.createElement('div');label.className='intra-timing-select-label';
  label.textContent=playerText('Momento do consumo','Consumption time');
  const selector=document.createElement('div');selector.className='intra-timing-select';
  const trigger=document.createElement('button');trigger.type='button';
  trigger.className='intra-timing-select-trigger';
  trigger.setAttribute('aria-label',playerText('Selecionar momento do consumo','Select consumption time'));
  trigger.setAttribute('aria-haspopup','listbox');
  trigger.setAttribute('aria-expanded','false');
  const selectedLabel=document.createElement('span');selectedLabel.className='intra-timing-selected-label';
  const arrow=document.createElement('span');arrow.className='intra-timing-select-chevron';
  arrow.setAttribute('aria-hidden','true');
  trigger.append(selectedLabel,arrow);
  const menu=document.createElement('div');menu.className='intra-timing-option-list';
  menu.setAttribute('role','listbox');menu.setAttribute('aria-label',playerText('Momentos de consumo disponíveis','Available consumption times'));
  menu.hidden=true;
  const options=[];
  let selectedTiming=choices[0][0],selectedIndex=0;
  const refreshSelection=()=>{
   selectedLabel.textContent=choices[selectedIndex][1];
   options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===selectedIndex)));
  };
  // A touch scroll begins with pointerdown; closing there made swiping the
  // page dismiss this list before the player could reach Adicionar alimento.
  // Actual taps still close the menu, while scrolling remains uninterrupted.
  const outsideClick=event=>{
   if(!selector.contains(event.target))closeOptions(false);
  };
  const closeOptions=(returnFocus=true)=>{
   menu.hidden=true;trigger.setAttribute('aria-expanded','false');
   document.removeEventListener('click',outsideClick);
   if(returnFocus&&trigger.isConnected)trigger.focus({preventScroll:true});
  };
  const editorHost=document.createElement('div');editorHost.className='intra-add-moment-editor-host';
  const revealTimingAndFood=()=>{
   if(menu.hidden||!selector.isConnected)return;
   const nav=document.getElementById('tabs');
   const viewport=window.visualViewport;
   const visualBottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight);
   const navTop=nav&&!nav.hidden?nav.getBoundingClientRect().top:visualBottom;
   const visibleBottom=Math.min(visualBottom,navTop)-16;
   // Reveal the bottom of the available choices and, if already rendered,
   // the normal food-add trigger. Do not scroll the field under the status bar.
   const foodTrigger=editorHost.querySelector('.consumption-add-trigger');
   const contentBottom=(foodTrigger||menu).getBoundingClientRect().bottom;
   const labelTop=label.getBoundingClientRect().top;
   const safeTop=(viewport?.offsetTop||0)+76;
   const room=Math.max(0,labelTop-safeTop);
   const move=Math.min(room,Math.max(0,contentBottom-visibleBottom));
   if(move>8)window.scrollBy({top:Math.ceil(move),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  };
  const openOptions=()=>{
   menu.hidden=false;trigger.setAttribute('aria-expanded','true');
   document.addEventListener('click',outsideClick);
   options[selectedIndex]?.focus({preventScroll:true});
   window.requestAnimationFrame(revealTimingAndFood);
  };
  const dismiss=()=>{
   closeOptions(false);
   picker.hidden=true;addButton.hidden=false;addButton.setAttribute('aria-expanded','false');
   editorHost.replaceChildren();
   document.querySelectorAll('.consumption-food-sheet,.consumption-food-sheet-backdrop').forEach(sheet=>sheet.remove());
   document.body.classList.remove('consumption-food-sheet-open');
  };
  const showEditor=()=>openConsumptionEditor(editorHost,date,meal,eventId,null,null,
   selectedTiming,'player-added:'+selectedTiming,true,dismiss);
  choices.forEach(([value,title],i)=>{
   const option=document.createElement('button');option.type='button';
   option.className='intra-timing-option';option.setAttribute('role','option');
   option.setAttribute('aria-selected',String(i===selectedIndex));
   const text=document.createElement('span');text.textContent=title;
   const mark=document.createElement('span');mark.className='intra-timing-option-check';
   mark.textContent='✓';mark.setAttribute('aria-hidden','true');
   option.append(text,mark);
   option.onclick=()=>{
    const changed=value!==selectedTiming;
    selectedTiming=value;selectedIndex=i;refreshSelection();closeOptions();
    if(changed)showEditor().catch(error);
   };
   options.push(option);menu.append(option);
  });
  trigger.onclick=()=>menu.hidden?openOptions():closeOptions();
  selector.onkeydown=event=>{
   if(menu.hidden){
    if(event.target===trigger&&['ArrowDown','ArrowUp'].includes(event.key)){
     event.preventDefault();openOptions();
    }
    return;
   }
   if(event.key==='Escape'){event.preventDefault();closeOptions();return;}
   const current=options.indexOf(document.activeElement);
   let next=current;
   if(event.key==='ArrowDown')next=Math.min(options.length-1,current+1);
   else if(event.key==='ArrowUp')next=Math.max(0,current-1);
   else if(event.key==='Home')next=0;
   else if(event.key==='End')next=options.length-1;
   else return;
   event.preventDefault();options[next]?.focus({preventScroll:true});
  };
  refreshSelection();selector.append(trigger,menu);
  addButton.onclick=()=>{
   picker.hidden=false;addButton.hidden=true;addButton.setAttribute('aria-expanded','true');
   showEditor().catch(error);
  };
  picker.append(label,selector,editorHost);group.append(addButton,picker);card.append(group);
 }
 return true;
}
function appendPeriConsumption(card,item,records){
 if(!['pre_training','post_training','pre_match','intra_match','post_match'].includes(item.selection_phase)||!item.event_id)return;
 const options=item.options||[];
 if(!options.length)return;
 const date=item.event_date,meal=item.selection_phase,eventId=item.event_id;
 const previous=(records||[]).find(row=>row.meal_date===date&&row.meal_key===meal&&row.event_id===eventId);
 if(item.selection_phase==='intra_match'&&appendIntraTimingConsumption(card,item,previous,date,meal,eventId))return;
 if(previous){
  const title=card.querySelector('.daily-meal-head > strong');
  if(title){const badge=document.createElement('span');badge.className='meal-registered-badge meal-registered-meal-badge';registeredMark(badge,playerText('Refeição registada','Meal recorded'));title.after(badge);}
 }
 const selected=options.findIndex(option=>option.option_ref===previous?.option_ref);
 const hosts=options.length===1?[card]:[...card.children].filter(child=>child.tagName==='DETAILS');
 hosts.forEach((host,index)=>{
  if(previous&&index===selected){host.append(makeRecordedConsumptionTags({host,date,meal,eventId,optionIndex:index,description:playerText('consumo de ','consumption of ')+playerPhaseLabel(item.title)}));return;}
  const actions=document.createElement('div');actions.className='consumption-actions consumption-actions--pending consumption-quick-actions';
  const edit=document.createElement('button');edit.type='button';edit.className='consumption-quick-edit';edit.textContent=playerText('Editar consumo','Edit consumption');
  const quick=document.createElement('button');quick.type='button';quick.className='consumption-quick-confirm';consumptionActionLabel(quick,'CheckmarkCircle02Icon',playerText(' Cumpri',' Done'));
  const feedback=document.createElement('p');feedback.className='consumption-feedback consumption-quick-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  edit.onclick=()=>{edit.disabled=true;openConsumptionEditor(host,date,meal,eventId,index).finally(()=>{edit.disabled=false;});};
  quick.onclick=async()=>{
   if(previous&&!window.confirm(playerText('Já existe um registo para ','A record already exists for ')+playerPhaseLabel(item.title)+playerText('. Substituir pela opção selecionada?','. Replace it with the selected option?')))return;
   quick.disabled=true;edit.disabled=true;quick.textContent=playerText('A guardar…','Saving…');feedback.textContent='';
   try{
    const qs=new URLSearchParams({date,meal,event_id:eventId});
    const source=await api('/api/v2/player/consumption-options?'+qs);
    const option=source.options?.find(row=>row.option_ref===options[index].option_ref);
    if(!option)throw new Error(playerText('Opção publicada indisponível ou alterada','Published option unavailable or changed'));
    await api('/api/v2/player/consumption-records',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':playerCsrf},body:JSON.stringify({date,meal,event_id:eventId,option_ref:option.option_ref,status:'all'})});
    showConsumptionSuccess(quick);feedback.textContent='';
    await new Promise(resolve=>setTimeout(resolve,900));
    if(host.tagName==='DETAILS')host.open=false;
    await overview();
   }catch(err){
    feedback.textContent=playerText('Não foi possível registar. Tenta novamente.','Could not save the record. Please try again.');
    quick.disabled=false;edit.disabled=false;consumptionActionLabel(quick,'CheckmarkCircle02Icon',playerText(' Cumpri',' Done'));error(err);
   }
  };
  actions.append(edit,quick);host.append(actions,feedback);
 });
 if(previous&&selected<0)card.append(makeRecordedConsumptionTags({host:card,date,meal,eventId,description:playerText('consumo de ','consumption of ')+playerPhaseLabel(item.title)}));
}
function makePeriCard(item,compact=false,consumptionEnabled=false,consumptionRecords=[]){
 const opts=item.options||[],avg=average(opts);
 const section=document.createElement(compact?"button":"details");section.className=compact?"weekly-peri-card":"meal daily-meal peri-meal";
 if(compact){
  section.type="button";
  const active=weeklySelection?.periEventId===item.event_id&&weeklySelection?.selectionPhase===item.selection_phase&&weeklySelection?.date===item.event_date;
  section.setAttribute("aria-pressed",String(active));
  section.onclick=()=>{
    weeklySelection=active?null:{date:item.event_date,periEventId:item.event_id,phase:item.phase,selectionPhase:item.selection_phase};
    if(weeklyContext)renderWeekly(weeklyContext.mon,weeklyContext.r,weeklyContext.weekMenus,weeklyContext.weeklyWeights);
  };
  const title=document.createElement("span");title.textContent=playerPhaseLabel(item.title);
  section.append(title);
  if(avg){const kcal=document.createElement("span");kcal.className="weekly-meal-kcal";kcal.textContent=fmtKcal(avg.kcal);section.append(kcal);}
  return section;
 }
 const head=document.createElement("summary");head.className="daily-meal-head tm-day-header";
 const title=document.createElement("strong");title.textContent=playerPhaseLabel(item.title);head.append(title);decorateLabel(head,item.title);
 if(avg){const nutritionSummary=document.createElement("span");nutritionSummary.className="meal-average meal-average-inline";nutritionSummary.append(nutrition(avg));head.append(nutritionSummary);}
 section.append(head);
 if(opts.length===1){for(const food of opts[0].items||[]){const p=document.createElement("div");p.className="foods";p.textContent=periFoodText(food);section.append(p);}}
 else opts.forEach((option,index)=>section.append(optionEl(option,index)));
 if(consumptionEnabled)appendPeriConsumption(section,item,consumptionRecords);
 return section;
}
function eventCard(event,compact=false){
 const section=document.createElement("div");section.className=compact?"weekly-event-card":"daily-event-card tm-day-header"+(event.kind==="match"?" daily-match-card":"");
 const label=document.createElement("span");label.className=compact?"":"tm-day-title";label.textContent=playerEventTitle(event);section.append(label);if(!compact)decorateLabel(section,event.title||event.kind);
 if(!compact&&event.kind!=="match"&&event.event_date>=iso(new Date())){
   const toggle=document.createElement("button");toggle.type="button";toggle.className="daily-event-edit";toggle.setAttribute("aria-label",playerText("Editar ","Edit ")+playerEventTitle(event));toggle.title=playerText("Editar ","Edit ")+playerEventTitle(event);toggle.innerHTML="<svg class=\"hugeicon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 5.41226 15.7842 5.05637 16.4211C4.70047 17.058 4.3424 18.5619 4 20C5.43809 19.6576 6.94199 19.2995 7.57889 18.9436C8.21579 18.5877 8.73844 18.0651 9.78375 17.0198L18.0176 8.78591M15.2141 5.98239L18.0176 8.78591\"/><path d=\"M11 20H17\"/></svg>";
   const editor=document.createElement("div");editor.hidden=true;editor.className="daily-event-editor";
   const date=document.createElement("input");date.type="date";date.value=event.event_date;date.setAttribute("aria-label",playerText("Data","Date"));
   const session=document.createElement("select");session.setAttribute("aria-label",playerText("Período","Period"));
   for(const [val,text] of [["morning",playerText("Manhã","Morning")],["afternoon",playerText("Tarde","Afternoon")]]){
     const option=document.createElement("option");option.value=val;option.textContent=text;session.append(option);
   }session.value=event.session;
   const save=document.createElement("button");save.type="button";save.textContent=playerText("Guardar","Save");
   const warning=document.createElement("small");
   toggle.onclick=()=>{editor.hidden=!editor.hidden;};
   save.onclick=async()=>{
     save.disabled=true;warning.textContent="";
     try{
       await api("/api/v2/player/events/"+encodeURIComponent(event.id),{method:"PUT",
         headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},
         body:JSON.stringify({event_date:date.value,session:session.value,local_date:iso(new Date())})});
       invalidatePlayerEventCalendarCache();
       await overview();
     }catch(e){warning.textContent=e.message;save.disabled=false;}
   };
   const fields=document.createElement("div");fields.className="daily-event-fields";const dateField=document.createElement("div");dateField.className="daily-event-field daily-event-date";dateField.append(date);const periodField=document.createElement("div");periodField.className="daily-event-field daily-event-period";periodField.append(session);fields.append(dateField,periodField);
   const actions=document.createElement("div");actions.className="daily-event-actions";save.className="daily-event-save";actions.append(save);
   editor.append(fields,actions,warning);
   const remove=document.createElement("button");remove.type="button";remove.className="daily-event-remove";
   remove.setAttribute("aria-label",playerText("Remover ","Remove ")+playerEventTitle(event));remove.title=playerText("Remover ","Remove ")+playerEventTitle(event);
   remove.innerHTML="<svg class=\"hugeicon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5\"/><path d=\"M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5\"/><path d=\"M9.5 16.5L9.5 10.5M14.5 16.5L14.5 10.5\"/></svg>";
   remove.onclick=async()=>{
     if(!confirm(playerText("Remover ","Remove ")+playerEventTitle(event)+playerText(" deste dia? As refeições peri-treino associadas deixam também de ser contabilizadas."," from this day? Associated peri-training meals will no longer be counted.")))return;
     remove.disabled=true;
     try{
       await api("/api/v2/player/events/"+encodeURIComponent(event.id)+"?local_date="+encodeURIComponent(iso(new Date())),{method:"DELETE",
         headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf}});
       invalidatePlayerEventCalendarCache();
       await overview();
     }catch(e){warning.textContent=e.message;editor.hidden=false;remove.disabled=false;}
   };
   section.append(toggle,remove,editor);
 }
 return section;
}
function matchWithIntraCard(event,item,consumptionEnabled=false,consumptionRecords=[]){
 const opts=item.options||[],avg=average(opts);
 const section=document.createElement("details");
 section.className="daily-event-card match-intra-card";section.dataset.eventId=event.id;section.dataset.matchDate=event.event_date;
 if(pendingIntraMatchExpansion?.date===event.event_date&&pendingIntraMatchExpansion?.eventId===event.id){
  section.open=true;pendingIntraMatchExpansion=null;
 }
 const head=document.createElement("summary");head.className="daily-meal-head tm-day-header";
 const matchIconBox=document.createElement("span");matchIconBox.className="meal-leading-icon tm-day-icon";matchIconBox.append(mealIcon("football"));head.append(matchIconBox);const label=document.createElement("strong");label.className="tm-day-title";label.textContent=playerEventTitle(event);head.append(label);
 if(avg){
  const totals=document.createElement("span");totals.className="meal-average meal-average-inline";
  totals.append(nutrition(avg));head.append(totals);
 }
 section.append(head);
 if(opts.length===1)appendGroupedPeriItems(section,opts[0].items,opts[0].timing_groups);
 else opts.forEach((option,index)=>section.append(optionEl(option,index,false,true)));
 if(consumptionEnabled)appendPeriConsumption(section,item,consumptionRecords);
 return section;
}

let supplementsByDay={};
function supplementsCard(items){
 const box=document.createElement("details");box.className="daily-supplements";
 const title=document.createElement("summary");title.className="tm-day-header";box.append(title);const iconBox=document.createElement("span");iconBox.className="meal-leading-icon supplement-leading-icon tm-day-icon";iconBox.append(mealIcon("pill"));const heading=document.createElement("strong");heading.className="tm-day-title";heading.textContent=playerText("Suplementação","Supplements");title.append(iconBox,heading);
 for(const x of items){
  const line=document.createElement("div");line.className="supplement-entry";
  const name=document.createElement("strong");name.textContent=x.name+" · "+x.dose;
  const moment=document.createElement("small");moment.textContent=playerSupplementMomentLabel(x.display_moment||x.timing_text||({"breakfast":"Pequeno-almoço","lunch":"Almoço","snack":"Lanche","dinner":"Jantar","supper":"Ceia","training":"Treino","match":"Jogo","lunch_or_dinner":"Almoço ou jantar"})[x.moment]||playerText("Sem associação","Not assigned"));
  line.append(name,moment);if(x.note){const note=document.createElement("small");note.textContent=x.note;line.append(note);}box.append(line);
 }
 return box;
}
function attachSupplements(card,items){
 if(!items.length)return;
 const area=document.createElement("div");area.className="supplement-in-meal";
 const label=document.createElement("strong");label.textContent=playerText("Suplementação","Supplements");area.append(label);
 for(const x of items){const line=document.createElement("div");line.textContent=x.name+" · "+x.dose;area.append(line);}
 card.append(area);
}
function appendDailyEvents(host,date,session,consumptionEnabled=false,consumptionRecords=[]){
 for(const event of calendarEvents.filter(e=>e.kind!=="off"&&e.event_date===date&&e.session===session)){
  const associated=periMeals.filter(p=>p.event_id===event.id&&p.event_date===date);
  // Pre-match is a standalone meal; intra-match belongs inside the match card.
  const intra=event.kind==="match"?associated.find(p=>p.selection_phase==="intra_match"):null;
  for(const item of associated.filter(p=>p.phase==="pre"&&p.selection_phase!=="intra_match"))
   host.append(makePeriCard(item,false,consumptionEnabled,consumptionRecords));
  const eventCardElement=intra?matchWithIntraCard(event,intra,consumptionEnabled,consumptionRecords):eventCard(event);
  host.append(eventCardElement);
  if(eventCardElement&&event.kind&&eventCardElement.tagName==="DETAILS")attachSupplements(eventCardElement,(supplementsByDay[date]||[]).filter(x=>x.moment===event.kind));
  for(const item of associated.filter(p=>p.phase==="post"))host.append(makePeriCard(item,false,consumptionEnabled,consumptionRecords));
 }
}
function appendWeeklyEvents(host,dates,session){
 if(!calendarEvents.some(e=>e.kind!=="off"&&dates.includes(e.event_date)&&e.session===session))return;
 for(const date of dates){
  const slot=document.createElement("div");slot.className="weekly-event-slot";if(weeklySelection?.date===date)slot.classList.add("weekly-selected-column");
  for(const event of calendarEvents.filter(e=>e.kind!=="off"&&e.event_date===date&&e.session===session)){
   const associated=periMeals.filter(p=>p.event_id===event.id&&p.event_date===date);
   const intra=event.kind==="match"?associated.find(p=>p.selection_phase==="intra_match"):null;
   for(const item of associated.filter(p=>p.phase==="pre"&&p.selection_phase!=="intra_match"))slot.append(makePeriCard(item,true));
   if(intra){
    const button=eventCard(event,true),avg=average(intra.options||[]);
    button.classList.add("weekly-meal");
    button.classList.add("weekly-match-with-intra");
    button.setAttribute("role","button");button.tabIndex=0;
    const active=weeklySelection?.periEventId===intra.event_id&&weeklySelection?.selectionPhase==="intra_match"&&weeklySelection?.date===date;
    button.setAttribute("aria-pressed",String(active));
    if(avg){const kcal=document.createElement("span");kcal.className="weekly-meal-kcal weekly-match-kcal";kcal.textContent=fmtKcal(avg.kcal);button.append(kcal);}
    const select=()=>{weeklySelection=active?null:{date,periEventId:intra.event_id,phase:"pre",selectionPhase:"intra_match"};if(weeklyContext)renderWeekly(weeklyContext.mon,weeklyContext.r,weeklyContext.weekMenus,weeklyContext.weeklyWeights);};
    button.onclick=select;button.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select();}};
    slot.append(button);
   }else slot.append(eventCard(event,true));
   for(const item of associated.filter(p=>p.phase==="post"))slot.append(makePeriCard(item,true));
  }
  host.append(slot);
 }
}

// Post-match form, ordered by game date. Admin corrections remain available.
let playerPostMatchRecords=[];
function injectPostMatchCard(){
 const root=$("day-details");
 if(!root||root.hidden)return;
 root.querySelectorAll(".post-match-inline").forEach(n=>n.remove());
 const date=iso(day);
 const games=playerPostMatchRecords.filter(m=>m.date===date&&m.can_answer);
 if(!games.length)return;
 const matchCards=Array.from(root.querySelectorAll(".daily-event-card,.daily-match-with-intra,details")).filter(n=>n.textContent?.includes(playerText("Jogo","Match")) || n.textContent?.includes("Jogo"));
 let anchor=matchCards[matchCards.length-1]||null;
 for(const game of games){
  const card=document.createElement("div");card.className="post-match-inline";card.dataset.matchId=game.id;
  const button=document.createElement("button");button.type="button";button.className="post-match-inline-trigger tm-day-header";
  const icon=document.createElement("span");icon.className="post-match-inline-icon tm-day-icon";icon.append(mealIcon("football-pitch"));
  const title=document.createElement("span");title.className="post-match-inline-title tm-day-title";title.textContent=playerText("Questionário pós-jogo","Post-match check-in");
  const status=document.createElement("span");status.className="post-match-inline-status";
  status.textContent=game.answered?playerText("✓ Preenchido","✓ Completed"):playerText("Por preencher","Not completed");
  button.append(icon,title,status);
  const action=document.createElement("button");action.type="button";action.className="post-match-edit";action.setAttribute("aria-label",game.answered?playerText("Editar questionário pós-jogo","Edit post-match questionnaire"):playerText("Preencher questionário pós-jogo","Complete post-match questionnaire"));
  action.innerHTML='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M15.5 5.5a2.12 2.12 0 0 1 3 3L8 19l-4 1 1-4Z"/></svg>';
  card.append(button,action);
  button.disabled=true;
  if(game.answered){card.classList.add("answered");}
  {
   const form=document.createElement("form");form.className="post-match-inline-form";form.hidden=true;
   const answers={...(game.answers||{})};
   const section=document.createElement("section");section.className="post-match-questionnaire";
   let step=0;
   const steps=[playerText("Participação e bem-estar","Participation and wellbeing"),playerText("Alimentação","Nutrition"),playerText("Suplementação","Supplements")];
   const heading=document.createElement("div");heading.className="post-match-progress";
   const content=document.createElement("div");content.className="post-match-questions";
   const nav=document.createElement("div");nav.className="post-match-navigation";
   const back=document.createElement("button");back.type="button";back.textContent="‹";back.setAttribute("aria-label",playerText("Anterior","Previous"));
   const next=document.createElement("button");next.type="button";
   const msg=document.createElement("p");msg.setAttribute("role","status");
   const select=document.createElement("select");select.required=true;
   const start=document.createElement("option");start.value="";start.textContent=playerText("Selecionar","Select");select.append(start);
   const none=document.createElement("option");none.value="not_played";none.textContent=playerText("Não joguei","Did not play");select.append(none);
   for(let n=5;n<=120;n+=5){const o=document.createElement("option");o.value=String(n);o.textContent=n+" min";select.append(o);}
   if(game.answered)select.value=game.minutes==null?"not_played":String(game.minutes);
   function question(title,control){const wrap=document.createElement("div");wrap.className="post-match-question";const h=document.createElement("label");h.textContent=title;wrap.append(h,control);content.append(wrap);return wrap;}
   function radio(name,title,items){
    const group=document.createElement("div");group.className="post-match-options";
    for(const [value,label] of items){const row=document.createElement("label");const input=document.createElement("input");input.type="radio";input.name="pm-"+game.id+"-"+name;input.checked=answers[name]===value;input.onchange=()=>{answers[name]=value;if(name==="gi_level")draw();};row.append(input,document.createTextNode(label));group.append(row);}
    question(title,group);
   }
   function multiple(name,title,items,exclusive=false){
    const group=document.createElement("div");group.className="post-match-options";
    for(const [value,label] of items){const row=document.createElement("label");const input=document.createElement("input");input.type="checkbox";input.checked=(answers[name]||[]).includes(value);input.onchange=()=>{
      const old=new Set(answers[name]||[]);
      if(input.checked){if(exclusive&&value==="none")old.clear();else old.delete("none");old.add(value);}else old.delete(value);
      answers[name]=[...old];draw();
    };row.append(input,document.createTextNode(label));group.append(row);}
    question(title,group);
   }
   function scale(name,title,left,right){
    const wrap=document.createElement("div");wrap.className="post-match-question";
    const h=document.createElement("label");h.textContent=title;
    const value=document.createElement("strong");value.textContent=answers[name]==null?"—":answers[name]+"/10";
    const line=document.createElement("div");line.className="post-match-scale";
    const input=document.createElement("input");input.type="range";input.min=1;input.max=10;input.step=1;input.value=answers[name]||5;
    input.oninput=()=>{answers[name]=Number(input.value);value.textContent=input.value+"/10";};
    line.append(input);const ends=document.createElement("div");ends.className="post-match-scale-ends";ends.innerHTML="<span></span><span></span>";ends.children[0].textContent=left;ends.children[1].textContent=right;
    wrap.append(h,value,line,ends);content.append(wrap);
   }
   function draw(){
    heading.replaceChildren();content.replaceChildren();
    
    const bars=document.createElement("div");bars.className="post-match-progress-bars";
    for(let i=0;i<3;i++){const bar=document.createElement("span");if(i<=step)bar.className="active";bars.append(bar);}heading.append(bars);
    if(step===0){
     question(playerText("1. Quantos minutos jogaste?","1. How many minutes did you play?"),select);
     if(select.value!=="not_played"){
      scale("feeling",playerText("2. Como te sentiste no jogo?","2. How did you feel during the match?"),playerText("Horrível","Terrible"),playerText("Muito bem","Very good"));
      scale("effort",playerText("3. Perceção do esforço","3. Perceived exertion"),playerText("Muito leve","Very light"),playerText("Esforço máximo","Maximum exertion"));
      radio("gi_level",playerText("4. Como te sentiste a nível gastrointestinal?","4. How did you feel gastrointestinally?"),[["none",playerText("Sem sintomas","No symptoms")],["mild",playerText("Desconforto ligeiro","Mild discomfort")],["moderate",playerText("Desconforto moderado","Moderate discomfort")],["severe",playerText("Desconforto intenso","Severe discomfort")]]);
      if(["mild","moderate","severe"].includes(answers.gi_level))multiple("gi_symptoms",playerText("Que sintomas tiveste?","Which symptoms did you experience?"),[["nausea",playerText("Náuseas","Nausea")],["abdominal_pain",playerText("Dor abdominal","Abdominal pain")],["bloating",playerText("Inchaço abdominal","Bloating")],["reflux",playerText("Refluxo / azia","Reflux / heartburn")],["urgency",playerText("Urgência para evacuar / diarreia","Urgency / diarrhoea")],["vomiting",playerText("Vómitos","Vomiting")],["other",playerText("Outro","Other")]]);
      multiple("game_symptoms",playerText("Durante o jogo, tiveste algum destes sintomas?","During the match, did you experience any of these symptoms?"),[["none",playerText("Nenhum","None")],["cramps",playerText("Cãibras","Cramps")],["muscle_pain",playerText("Dores musculares","Muscle pain")],["injury",playerText("Lesão","Injury")],["weakness_dizziness",playerText("Sensação de fraqueza / tonturas","Weakness / dizziness")],["other",playerText("Outro","Other")]],true);
     }
    }else if(step===1){
     for(const [name,title] of [["food_pre",playerText("O que comeste na refeição pré-jogo?","What did you eat at your pre-match meal?")],["food_between",playerText("O que consumiste entre a última refeição e o início do jogo, incluindo o aquecimento?","What did you consume between your last meal and kick-off, including the warm-up?")],["food_during",playerText("O que consumiste durante o jogo, incluindo primeira parte, intervalo e segunda parte?","What did you consume during the match, including both halves and half-time?")]]){
      const field=document.createElement("textarea");field.rows=3;field.maxLength=2000;field.value=answers[name]||"";field.oninput=()=>answers[name]=field.value;question(title,field);
     }
    }else{
     for(const [name,title] of [["caffeine_pre",playerText("Tomaste cafeína (cápsula ou shot) antes do jogo?","Did you take caffeine (capsule or shot) before the match?")],["caffeine_half",playerText("Tomaste cafeína (cápsula ou shot) no intervalo?","Did you take caffeine (capsule or shot) at half-time?")],["nitrates_pre",playerText("Tomaste nitratos antes do jogo?","Did you take nitrates before the match?")],["recovery_shake",playerText("Tomaste um batido recovery após o jogo?","Did you have a recovery shake after the match?")]])radio(name,title,[[true,playerText("Sim","Yes")],[false,playerText("Não","No")]]);
    }
    back.hidden=step===0;
    next.textContent=select.value==="not_played"||step===2?"✓":"›";next.setAttribute("aria-label",select.value==="not_played"||step===2?(game.answered?playerText("Guardar alteração","Save changes"):playerText("Concluir e enviar","Finish and submit")):playerText("Continuar","Continue"));
   }
   select.onchange=()=>draw();
   back.onclick=()=>{step=Math.max(0,step-1);draw();};
   next.onclick=()=>{if(!select.value){msg.textContent=playerText("Seleciona os minutos jogados.","Select the minutes played.");return;}if(step<2&&select.value!=="not_played"){step++;draw();}else form.requestSubmit();};
   nav.append(back,next);section.append(heading,content,nav,msg);form.append(section);card.append(form);draw();
   action.setAttribute("aria-expanded","false");
   action.onclick=()=>{form.hidden=!form.hidden;action.setAttribute("aria-expanded",String(!form.hidden));};
   form.onsubmit=async e=>{
    e.preventDefault();if(!select.value)return;next.disabled=true;msg.textContent="";
    try{
     await api("/api/v2/player/post-match",{method:"POST",
      headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},
      body:JSON.stringify({match_id:game.id,minutes:select.value,answers:select.value==="not_played"?{}:answers,local_date:iso(new Date())})});
     overviewReadCache.delete("/api/v2/player/post-match?local_date="+encodeURIComponent(iso(new Date())));
     await overview();
    }catch(err){msg.textContent=playerText("Não foi possível guardar: ","Could not save: ")+err.message;next.disabled=false;}
   };
  }
  if(anchor){anchor.after(card);}else root.append(card);
  anchor=card;
 }
}
async function loadPlayerPostMatch(){
 const epoch=playerSessionEpoch;
 const host=$("post-match-form-area");if(host){host.hidden=true;host.replaceChildren();}
 try{
  const result=await cachedOverviewRead("/api/v2/player/post-match?local_date="+encodeURIComponent(iso(new Date())));
  if(epoch!==playerSessionEpoch)return;
  playerPostMatchRecords=result.available?(result.matches||[]):[];
 }catch{if(epoch!==playerSessionEpoch)return;playerPostMatchRecords=[];}
 if(epoch!==playerSessionEpoch)return;
 injectPostMatchCard();
}
// Início widgets: Peso (fasting weight) and Semana, side by side. The weight entry form still opens below them.
function dayWidget(className,label){
 const card=document.createElement("section");card.className="day-widget "+className;
 const head=document.createElement("div");head.className="day-widget-head";
 const title=document.createElement("span");title.className="day-widget-label";title.textContent=label;
 head.append(title);card.append(head);
 return {card,head};
}
function renderWeekWidget(row,date,calendar){
 const {card,head}=dayWidget("day-week-widget",playerText("Semana","Week"));
 const open=document.createElement("button");open.type="button";open.className="day-widget-action";
 open.setAttribute("aria-label",playerText("Abrir vista semanal","Open week view"));
 open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
 open.onclick=()=>{weekReturnDay=date;overviewMode="week";weeklySelection=null;overview().catch(error);};
 head.append(open);head.onclick=event=>{if(!event.target.closest("button"))open.click();};
 const entry=calendar?.days?.find(x=>x.date===date);
 const value=document.createElement("strong");value.className="day-widget-value";value.textContent=playerClassification(entry?.classification||"Geral");card.append(value);
 const matchDates=new Set((calendar?.matches||[]).map(m=>m.match_date||m.date).filter(Boolean));
 const days=document.createElement("div");days.className="day-week-widget-days";
 const mon=monday(new Date(date+"T12:00:00"));
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);const key=iso(dt);
  const b=document.createElement("button");b.type="button";b.className="day-week-widget-day"+(key===date?" selected":"")+(matchDates.has(key)?" match":"");
  b.setAttribute("aria-label",dt.toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"})+(matchDates.has(key)?playerText(" · jogo"," · match"):""));
  b.setAttribute("aria-pressed",String(key===date));
  // Match day keeps the ball, also when it is the selected day (MD at a glance).
  if(matchDates.has(key))b.append(mealIcon("football"));
  else b.textContent=dt.toLocaleDateString(playerDateLocale(),{weekday:"narrow"}).toLocaleUpperCase(playerDateLocale());
  b.onclick=()=>{day=dt;weeklySelection=null;overview().catch(error);};
  days.append(b);
 }
 card.append(days);
 const next=[...matchDates].filter(key=>key>=date).sort()[0];
 const foot=document.createElement("small");foot.className="day-widget-foot";
 foot.textContent=next===date?playerText("Dia de jogo","Match day"):next&&next<=iso(new Date(mon.getTime()+6*86400000))
  ?playerText("Jogo ","Match ")+new Date(next+"T12:00:00").toLocaleDateString(playerDateLocale(),{weekday:"short"}).replace(".","")
  :matchDates.size&&[...matchDates].some(key=>key>=iso(mon)&&key<date)?playerText("Sem mais jogos esta semana","No more matches this week"):playerText("Sem jogos esta semana","No matches this week");
 card.append(foot);row.append(card);
}
// Peso em jejum screen (from the Peso widget): Semana / Mês chart, average, min, max, change and recent entries.
let weightDetailRange="week";
function closeWeightDetail(){
 const view=$("weight-detail");if(view){view.hidden=true;view.replaceChildren();}
 $("overview")?.classList.remove("weight-detail-open");$("plans-assessments")?.classList.remove("weight-detail-open");weightDetailOpen=false;
}
// Opened from Início (host #overview, ‹ Início) or from Progresso (host #plans-assessments, ‹ Progresso).
async function openWeightDetail(date,editToday,host=$("overview")){
 let view=$("weight-detail");
 if(!view){view=document.createElement("section");view.id="weight-detail";view.className="weight-detail";}
 if(view.parentNode!==host)host.append(view);
 const fromProgress=host.id==="plans-assessments";
 host.classList.add("weight-detail-open");weightDetailOpen=true;view.hidden=false;window.scrollTo({top:0});
 const locale=playerDateLocale(),format=x=>Number(x).toLocaleString(locale,{minimumFractionDigits:1,maximumFractionDigits:1});
 const female=String(me?.sex||"").toUpperCase()==="F";
 const render=async()=>{
  const days=weightDetailRange==="week"?7:30;
  view.replaceChildren();
  const bar=document.createElement("div");bar.className="weight-detail-bar";
  // Same circular ‹ as the other pages (plan, Progresso metric).
  const back=document.createElement("button");back.type="button";back.className="weight-detail-back";
  back.setAttribute("aria-label",fromProgress?playerText("Voltar ao Progresso","Back to Progress"):playerText("Voltar ao Início","Back to Home"));
  const backArrow=document.createElement("span");backArrow.setAttribute("aria-hidden","true");backArrow.textContent="‹";back.append(backArrow);
  back.onclick=fromProgress?()=>{closeWeightDetail();const y=progressReturnY;requestAnimationFrame(()=>window.scrollTo({top:y}));}:()=>{closeWeightDetail();window.scrollTo({top:0});};
  const title=document.createElement("strong");title.textContent=playerText("Peso em jejum","Fasting weight");
  const edit=document.createElement("button");edit.type="button";edit.className="weight-detail-edit";edit.textContent=playerText("Editar","Edit");
  if(editToday)edit.onclick=()=>{closeWeightDetail();editToday();};else edit.hidden=true;
  bar.append(back,title,edit);view.append(bar);
  const switcher=document.createElement("div");switcher.className="weight-detail-range";switcher.setAttribute("role","group");
  for(const [key,label] of [["week",playerText("Semana","Week")],["month",playerText("Mês","Month")]]){
   const b=document.createElement("button");b.type="button";b.textContent=label;b.setAttribute("aria-pressed",String(weightDetailRange===key));
   b.onclick=()=>{if(weightDetailRange===key)return;weightDetailRange=key;render().catch(error);};switcher.append(b);
  }
  view.append(switcher);
  let entries=[];
  try{entries=(await api("/api/v2/player/weight-history?end="+date+"&days="+days+"&local_date="+iso(new Date()))).entries||[];}
  catch{const p=document.createElement("p");p.className="hint";p.textContent=playerText("Não foi possível carregar o peso. Tenta novamente.","Could not load weight. Please try again.");view.append(p);return;}
  if(!view.isConnected||view.hidden)return;
  const values=entries.map(x=>Number(x.weight_kg));
  const end=new Date(date+"T12:00:00"),start=new Date(end);start.setDate(end.getDate()-(days-1));
  const period=start.toLocaleDateString(locale,{day:"numeric",month:"short"})+" – "+end.toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"});
  const summary=document.createElement("div");summary.className="weight-detail-summary";
  const caption=document.createElement("small");caption.textContent=playerText("Média","Average");
  const avg=document.createElement("strong");avg.textContent=values.length?format(values.reduce((a,b)=>a+b,0)/values.length):"—";
  const unit=document.createElement("span");unit.textContent=" kg";avg.append(unit);
  const when=document.createElement("span");when.className="weight-detail-period";when.textContent=period;
  summary.append(caption,avg,when);view.append(summary);
  const chartCard=document.createElement("div");chartCard.className="weight-detail-chart";view.append(chartCard);
  if(values.length<2){const p=document.createElement("p");p.className="hint";p.textContent=playerText("São necessários dois registos para apresentar a evolução.","Two measurements are needed to show a trend.");chartCard.append(p);}
  else{
   const W=330,H=190,plotW=W-36,top=10,bottom=H-28;
   let lo=Math.floor(Math.min(...values)*2)/2-.5,hi=Math.ceil(Math.max(...values)*2)/2+.5;
   const step=hi-lo<=3?.5:1;
   const X=key=>6+Math.round((new Date(key+"T12:00:00")-start)/86400000)*(plotW-12)/(days-1);
   const Y=v=>top+(hi-v)/(hi-lo)*(bottom-top);
   const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
   svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("role","img");svg.setAttribute("aria-label",playerText("Evolução do peso em jejum","Fasting weight trend"));
   const el=(tag,attrs)=>{const x=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))x.setAttribute(k,String(v));svg.append(x);return x;};
   for(let v=lo;v<=hi+1e-9;v+=step){const y=Y(v);el("line",{x1:0,x2:plotW,y1:y,y2:y,class:"weight-detail-grid"});el("text",{x:plotW+6,y:y+4,class:"weight-detail-tick"}).textContent=fmt(v,1);}
   const ticks=days===7?[...Array(7).keys()]:[0,7,14,21,28];
   for(const k of ticks){const dt=new Date(start);dt.setDate(start.getDate()+k);const t=el("text",{x:X(iso(dt)),y:H-8,"text-anchor":"middle",class:"weight-detail-tick"});t.textContent=days===7?dt.toLocaleDateString(locale,{weekday:"narrow"}).toLocaleUpperCase(locale):String(dt.getDate());}
   el("polyline",{points:entries.map(x=>X(x.weigh_date).toFixed(1)+","+Y(Number(x.weight_kg)).toFixed(1)).join(" "),class:"weight-detail-line"});
   const detail=document.createElement("p");detail.className="weight-detail-point";detail.setAttribute("aria-live","polite");
   const points=[];
   entries.forEach((x,i)=>{
    const last=i===entries.length-1,cx=X(x.weigh_date),cy=Y(Number(x.weight_kg));
    el("circle",{cx,cy,r:last?4.5:3,class:last?"weight-detail-dot last":"weight-detail-dot"});
    // Week: the weight above each marker (the month has too many points for labels).
    if(days===7)el("text",{x:cx,y:Math.max(9,cy-(last?11:9)),"text-anchor":"middle",class:last?"weight-detail-value last":"weight-detail-value"}).textContent=format(x.weight_kg);
    const flagged=female&&(x.menstruating===1||x.menstruating===true);
    if(flagged)el("circle",{cx,cy:cy+10,r:2.5,fill:"#d6a7bc","aria-hidden":"true"});
    const label=new Date(x.weigh_date+"T12:00:00").toLocaleDateString(locale,{weekday:"short",day:"numeric",month:"short"})+" · "+format(x.weight_kg)+" kg"+(flagged?playerText(" · Menstruação"," · Menstruation"):"");
    const touch=el("circle",{cx,cy,r:12,fill:"transparent",tabindex:0,role:"button","aria-label":label});
    const show=()=>{detail.textContent=label;};touch.addEventListener("click",show);touch.addEventListener("focus",show);
    points.push({cx,cy,label});
   });
   // Mês (26/11): slide a finger along the chart to run through the entries — a guide line and ring follow the
   // nearest entry, its date and weight show below the chart, with a light haptic tick per entry. Vertical page
   // scroll still works (touch-action: pan-y); lifting the finger keeps the last entry shown.
   if(days===30)weightDetailScrub(svg,points,detail,{top,bottom});
   chartCard.append(svg,detail);
   const stats=document.createElement("div");stats.className="weight-detail-stats";
   const change=values[values.length-1]-values[0];
   for(const [label,text] of [[playerText("Mínimo","Minimum"),format(Math.min(...values))+" kg"],[playerText("Máximo","Maximum"),format(Math.max(...values))+" kg"],[playerText("Variação","Change"),(change>0?"+":change<0?"−":"±")+format(Math.abs(change))+" kg"]]){
    const cell=document.createElement("div");const l=document.createElement("small");l.textContent=label;const v=document.createElement("strong");v.textContent=text;cell.append(l,v);stats.append(cell);
   }
   view.append(stats);
  }
  if(entries.length){
   const heading=document.createElement("h3");heading.className="weight-detail-heading";heading.textContent=playerText("Registos","Entries");view.append(heading);
   const list=document.createElement("div");list.className="weight-detail-list";
   const recent=entries.slice().reverse();
   recent.forEach((x,i)=>{
    const row=document.createElement("div");row.className="weight-detail-row";
    const when=document.createElement("span");const k=x.weigh_date;
    when.textContent=k===iso(new Date())?playerText("Hoje","Today"):new Date(k+"T12:00:00").toLocaleDateString(locale,{weekday:"short",day:"numeric",month:"short"});
    const diff=document.createElement("small");const prior=recent[i+1];
    if(prior){const d=Number(x.weight_kg)-Number(prior.weight_kg);diff.textContent=(d>0?"+":d<0?"−":"±")+format(Math.abs(d));}
    const v=document.createElement("strong");v.textContent=format(x.weight_kg)+" kg";
    row.append(when,diff,v);list.append(row);
   });
   view.append(list);
  }
 };
 await render();
}
function weightDetailScrub(svg,points,detail,{top,bottom}){
 if(!points.length)return;
 const ns="http://www.w3.org/2000/svg";
 const guide=document.createElementNS(ns,"line");guide.setAttribute("y1",top);guide.setAttribute("y2",bottom);guide.setAttribute("class","weight-detail-scrub-line");
 const ring=document.createElementNS(ns,"circle");ring.setAttribute("r","6.5");ring.setAttribute("class","weight-detail-scrub-ring");
 guide.style.visibility=ring.style.visibility="hidden";
 svg.insertBefore(guide,svg.querySelector(".weight-detail-line"));svg.append(ring);
 svg.classList.add("weight-detail-scrubbable");
 let current=-1,active=null;
 const pick=clientX=>{
  const matrix=svg.getScreenCTM();if(!matrix)return;
  const x=(clientX-matrix.e)/matrix.a;
  let best=0;for(let i=1;i<points.length;i++)if(Math.abs(points[i].cx-x)<Math.abs(points[best].cx-x))best=i;
  if(best===current)return;
  if(current>=0)playerHaptic();
  current=best;const p=points[best];
  guide.setAttribute("x1",p.cx);guide.setAttribute("x2",p.cx);ring.setAttribute("cx",p.cx);ring.setAttribute("cy",p.cy);
  guide.style.visibility=ring.style.visibility="visible";detail.textContent=p.label;
 };
 svg.addEventListener("pointerdown",event=>{active=event.pointerId;current=-1;pick(event.clientX);});
 svg.addEventListener("pointermove",event=>{if(active===event.pointerId)pick(event.clientX);});
 const end=event=>{if(active===event.pointerId)active=null;};
 svg.addEventListener("pointerup",end);svg.addEventListener("pointercancel",end);
 // Horizontal finger moves stay on the chart (no Início day swipe, no edge back) while scrubbing.
 svg.addEventListener("touchmove",event=>{if(active!==null)event.stopPropagation();},{passive:true});
}
// Haptic tick for wheels (like the iPhone alarm picker). Android: vibrate. iOS Safari (18+) has no
// vibrate API but plays the system haptic when a native switch toggles, so a hidden one is toggled.
let playerHapticSwitch=null;
function playerHaptic(){
 try{
  if(typeof navigator.vibrate==="function"){navigator.vibrate(8);return;}
  if(!playerHapticSwitch){
   const label=document.createElement("label");label.setAttribute("aria-hidden","true");
   label.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
   const input=document.createElement("input");input.type="checkbox";input.setAttribute("switch","");input.tabIndex=-1;
   const stop=event=>event.stopPropagation();label.addEventListener("click",stop);input.addEventListener("click",stop);
   label.append(input);document.body.append(label);playerHapticSwitch=label;
  }
  playerHapticSwitch.click();
 }catch{}
}
async function renderWeightCard(root,date,calendar=null){
 const row=document.createElement("div");row.className="day-widgets";
 const {card,head:header}=dayWidget("daily-weight-card day-weight-widget",playerText("Peso","Weight"));
 card.setAttribute("aria-label",playerText("Peso em jejum","Fasting weight"));
 const value=document.createElement("span");value.className="day-widget-value";
 const spark=document.createElement("div");spark.className="day-weight-widget-spark";
 const foot=document.createElement("small");foot.className="day-widget-foot";
 const action=document.createElement("button");action.type="button";action.className="daily-weight-action day-widget-action";
 header.append(action);card.append(value,spark,foot);row.append(card);
 renderWeekWidget(row,date,calendar);
 const editorCard=document.createElement("section");editorCard.className="daily-weight-card day-weight-editor";editorCard.hidden=true;
 const panel=document.createElement("div");panel.className="daily-weight-panel";panel.id="daily-weight-panel-"+date;panel.hidden=true;editorCard.append(panel);
 root.append(row,editorCard);
 // Future dates are visible in the calendar but cannot have a weight entry yet.
 // Do not issue a request that the API deliberately rejects for future dates.
 if(date>iso(new Date())){
  action.remove(); // Future dates have no entry action; the card still opens the weight screen (up to today).
  value.textContent="—";value.classList.add("empty");foot.textContent=playerText("Regista no próprio dia","Record it on the day");
  const openToday=()=>openWeightDetail(iso(new Date()),null);
  card.setAttribute("role","button");card.setAttribute("tabindex","0");card.addEventListener("click",openToday);
  card.addEventListener("keydown",event=>{if(event.target===card&&(event.key==="Enter"||event.key===" ")){event.preventDefault();openToday();}});
  return;
 }
 // Render the + immediately; only enable interaction once the weight data is confirmed.
 action.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
 action.setAttribute("aria-label",playerText("A carregar peso em jejum","Loading fasting weight"));
 action.disabled=true;
 let data;
 try{data=await cachedOverviewRead("/api/v2/player/weight?date="+date);}catch{
  if(card.isConnected){const notice=document.createElement("small");notice.textContent=playerText("Peso indisponível","Weight unavailable");value.append(notice);action.remove();}
  return;
 }
 if(iso(day)!==date||overviewMode!=="day"||!card.isConnected){row.remove();editorCard.remove();return;}
 action.disabled=false;
 const current=data.entries?.find(x=>x.weigh_date===date);
 const previous=data.previous;
 const format=x=>Number(x).toLocaleString(playerDateLocale(),{minimumFractionDigits:1,maximumFractionDigits:1});
 const existing=!!current;
 if(existing){
  const top=document.createElement("strong");top.textContent=format(current.weight_kg);const unit=document.createElement("span");unit.className="day-widget-unit";unit.textContent=" kg";top.append(unit);value.append(top);
  if(previous){const difference=Number(current.weight_kg)-Number(previous.weight_kg);foot.textContent=(difference>0?"+":difference<0?"−":"±")+format(Math.abs(difference))+playerText(" kg vs. anterior"," kg vs. previous");}
  action.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  action.setAttribute("aria-label",playerText("Ver evolução do peso","View weight trend"));
 }else{
  value.textContent="—";value.classList.add("empty");
  foot.textContent=date===iso(new Date())?playerText("Regista o peso de hoje","Record today's weight"):playerText("Sem registo neste dia","No entry on this day");
  action.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';action.setAttribute("aria-label",playerText("Registar peso em jejum","Record fasting weight"));
 }
 const recent=(data.entries||[]).filter(x=>x.weigh_date<=date).slice(-7).map(x=>Number(x.weight_kg));
 if(recent.length>=2){
  const lo=Math.min(...recent),hi=Math.max(...recent),w=120,h=30;
  const pts=recent.map((v,i)=>[i*w/(recent.length-1),h-4-(v-lo)/((hi-lo)||1)*(h-8)]);
  spark.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-hidden="true"><path d="M'+pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" L")+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
 }
 function editor(){
  panel.replaceChildren();
  const form=document.createElement("form");form.className="daily-weight-form";
  const picker=document.createElement("div");picker.className="daily-weight-picker daily-weight-wheel-group";
  const sharedBand=document.createElement("div");sharedBand.className="daily-weight-wheel-selection";sharedBand.setAttribute("aria-hidden","true");picker.append(sharedBand);
  const existingWeight=current?Number(current.weight_kg):Number(data.previous?.weight_kg??me?.weight_kg??75);
  const initial=Math.max(50,Math.min(110,Math.round(existingWeight*10)/10));
  const makeWheel=(caption,values,chosen)=>{
   const col=document.createElement("div");col.className="daily-weight-wheel-column";
   const label=document.createElement("div");label.className="daily-weight-wheel-label";label.textContent=caption;
   const viewport=document.createElement("div");viewport.className="daily-weight-wheel";
   viewport.tabIndex=0;viewport.setAttribute("role","listbox");viewport.setAttribute("aria-label",caption);
   const rail=document.createElement("div");rail.className="daily-weight-wheel-rail";
   const pad=()=>{const d=document.createElement("div");d.className="daily-weight-wheel-pad";rail.append(d);};
   pad();
   let index=Math.max(0,values.indexOf(chosen));
   const entries=values.map((v,i)=>{
    const el=document.createElement("div");el.className="daily-weight-wheel-option";el.textContent=String(v);
    el.setAttribute("role","option");el.onclick=()=>choose(i,true);rail.append(el);return el;
   });
   pad();viewport.append(rail);col.append(label,viewport);picker.append(col);
   function choose(i,smooth=false){
    index=Math.max(0,Math.min(values.length-1,i));
    entries.forEach((el,k)=>{el.classList.toggle("selected",k===index);el.setAttribute("aria-selected",String(k===index));});
    viewport.setAttribute("aria-valuetext",String(values[index])+" "+caption);
    viewport.scrollTo({top:index*44,behavior:smooth?"smooth":"instant"});
   }
   let ticking=false;
   viewport.addEventListener("scroll",()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;const next=Math.max(0,Math.min(values.length-1,Math.round(viewport.scrollTop/44)));if(next!==index){index=next;playerHaptic();entries.forEach((el,k)=>{el.classList.toggle("selected",k===index);el.setAttribute("aria-selected",String(k===index));});viewport.setAttribute("aria-valuetext",String(values[index])+" "+caption);}});},{passive:true});
   viewport.addEventListener("keydown",e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();choose(index+(e.key==="ArrowDown"?1:-1),true);}});
   requestAnimationFrame(()=>{choose(index);});
   return {get value(){return values[index];}};
  };
  const kg=makeWheel("kg",Array.from({length:61},(_,i)=>50+i),Math.floor(initial));
  const grams=makeWheel("g",Array.from({length:10},(_,i)=>i*100),Math.round((initial-Math.floor(initial))*10)*100);
  const save=document.createElement("button");save.type="submit";save.textContent="✓";save.setAttribute("aria-label",playerText("Guardar peso","Save weight"));save.className="daily-weight-save";
  const errorText=document.createElement("p");errorText.setAttribute("role","alert");
  form.append(picker);
  if(String(me?.sex||"").toUpperCase()==="F"){
   const questionCard=document.createElement("div");questionCard.className="daily-weight-menstruation-card";
   const group=document.createElement("fieldset");group.className="daily-weight-menstruation";const legend=document.createElement("legend");legend.textContent=playerText("Menstruação (opcional)","Menstruation (optional)");group.append(legend);
   for(const [v,t] of [["",playerText("Não responder","Skip")],["yes",playerText("Sim","Yes")],["no",playerText("Não","No")]]){
    const l=document.createElement("label"),input=document.createElement("input");input.type="radio";input.name="weight-menstruating";input.value=v;input.checked=current?(current.menstruating===null?v==="":current.menstruating?v==="yes":v==="no"):v==="";const caption=document.createElement("span");caption.className="daily-weight-radio-label";caption.textContent=t;l.append(input,caption);group.append(l);
   }questionCard.append(group);form.append(questionCard);
  }
  const buttons=document.createElement("div");buttons.className="daily-weight-form-actions";buttons.append(save);form.append(buttons,errorText);panel.append(form);
  form.onsubmit=async e=>{
   e.preventDefault();save.disabled=true;errorText.textContent="";
   try{
    const checked=form.querySelector('input[name="weight-menstruating"]:checked');
    const menstruating=checked?checked.value==="yes"?true:checked.value==="no"?false:null:null;
    await api("/api/v2/player/weight",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},
      body:JSON.stringify({date,weight:(Number(kg.value)+Number(grams.value)/1000).toFixed(1),menstruating,local_date:iso(new Date())})});
    overviewReadCache.clear(); // The reference-weight values can change after saving.
    overviewSnapshot=null;
    await overview();
   }catch(err){errorText.textContent=playerText("Não foi possível guardar: ","Could not save: ")+err.message;save.disabled=false;}
  };
 }
 // The card opens the weight screen (with or without a weight); only the + / ✕ control opens or closes the entry form.
 const collapsedIcon=action.innerHTML,collapsedLabel=action.getAttribute("aria-label");
 const closeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
 action.setAttribute("aria-controls",panel.id);
 action.setAttribute("aria-expanded","false");
 const toggleEditor=open=>{
  panel.hidden=!open;editorCard.hidden=!open;
  action.innerHTML=open?closeIcon:collapsedIcon;
  action.setAttribute("aria-label",open?playerText("Fechar registo de peso","Close weight entry"):collapsedLabel);
  action.setAttribute("aria-expanded",String(open));
  if(open)editor();
 };
 card.addEventListener("click",event=>{if(event.target.closest("button"))return;if(!action.disabled)openWeightDetail(date,()=>toggleEditor(true));});
 card.setAttribute("role","button");card.setAttribute("tabindex","0");
 card.addEventListener("keydown",event=>{if(event.target!==card)return;if(event.key==="Enter"||event.key===" "){event.preventDefault();if(!action.disabled)openWeightDetail(date,()=>toggleEditor(true));}});
 action.onclick=event=>{
  event?.stopPropagation(); // the icon is swapped during the click, so the card must not re-handle it
  if(existing&&panel.hidden){openWeightDetail(date,()=>toggleEditor(true));return;}
  toggleEditor(panel.hidden);
 };
}
let overviewRequestId=0;
const OVERVIEW_CACHE_MS=60000;
let overviewSnapshot=null;
const overviewReadCache=new Map();
function reusableOverviewSnapshot(weekKey,now=Date.now()){
 const snapshot=overviewSnapshot;
 return snapshot&&snapshot.weekKey===weekKey&&now>=snapshot.time&&now-snapshot.time<OVERVIEW_CACHE_MS?snapshot:null;
}
let lastOverviewPresentation=null;
const mileLastCalendarSelectionByStrip=new WeakMap();
function animateCalendarSelection(strip,dateKey){
 const selected=strip.querySelector('.week-day.selected .day-number');
 if(!selected)return;
 const selectedButton=selected.closest('.week-day');
 const previous=mileLastCalendarSelectionByStrip.get(strip);
 const current={key:dateKey,label:selectedButton.getAttribute('aria-label'),rect:selected.getBoundingClientRect(),index:[...strip.querySelectorAll('.week-day')].indexOf(selectedButton)};
 mileLastCalendarSelectionByStrip.set(strip,current);
 if(!previous||previous.key===dateKey||current.index<0)return;
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 if(reduce)return;
 const previousIndex=[...strip.querySelectorAll('.week-day')].findIndex(b=>b.getAttribute('aria-label')===previous.label);
 const source=previousIndex>=0?strip.querySelectorAll('.week-day')[previousIndex]?.querySelector('.day-number'):null;
 const from=source?.getBoundingClientRect()||previous.rect;
 const to=current.rect;
 if(!to.width||!from.width||Math.abs(from.left-to.left)>window.innerWidth*1.5)return;
 // Across a week boundary, avoid a long backwards jump across the whole strip.
 if(Math.abs(current.index-previous.index)>1)return;
 const ghost=document.createElement('span');
 ghost.className='mile-calendar-moving-circle';
 ghost.style.cssText='position:fixed;pointer-events:none;z-index:1;border-radius:50%;background:#f3f3f5;width:'+to.width+'px;height:'+to.height+'px;left:'+to.left+'px;top:'+to.top+'px;';
 document.body.append(ghost);
 selected.classList.add('mile-calendar-arriving');
 const dx=from.left-to.left,dy=from.top-to.top;
 const animation=ghost.animate([
  {transform:'translate3d('+dx+'px,'+dy+'px,0) scale(.97)',opacity:1},
  {offset:.72,transform:'translate3d('+(-dx*.025)+'px,'+(-dy*.025)+'px,0) scale(1.045)',opacity:1},
  {transform:'translate3d(0,0,0) scale(1)',opacity:1}
 ],{duration:460,easing:'cubic-bezier(.25,.75,.3,1)'});
 const finish=()=>{ghost.remove();selected.classList.remove('mile-calendar-arriving');};
 animation.onfinish=finish;animation.oncancel=finish;
 setTimeout(finish,550);
}
function renderPendingCalendar(mon,dateKey){
 const strip=$("week-strip");strip.replaceChildren();
 // Shared full-view swipe also covers the calendar, including during loading.
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);
  const key=iso(dt),b=document.createElement("button");b.type="button";
  b.className="week-day"+(key===dateKey?" selected":"")+(key===iso(new Date())?" today":"");
  b.setAttribute("aria-pressed",String(key===dateKey));
  b.setAttribute("aria-label",dt.toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"}));
  for(const [cls,label] of [
   ["weekday",dt.toLocaleDateString(playerDateLocale(),{weekday:"short"}).replace(".","").replace(/^./,c=>c.toLocaleUpperCase(playerDateLocale()))],
   ["day-number",String(dt.getDate())],["day-classification",""]
  ]){const span=document.createElement("span");span.className=cls;span.textContent=label;b.append(span);}
  b.onclick=()=>{day=new Date(dt);overview().catch(error);};strip.append(b);
 }
 animateCalendarSelection(strip,dateKey);
 $("date-title").textContent=day.toLocaleDateString(playerDateLocale(),{weekday:"short",day:"numeric",month:"numeric",year:"numeric"});
}
/* Neutral placeholder for the existing seven-column weekly calendar.
   Meal count follows the loaded player's meal configuration when available;
   event rows depend on the requested week and are intentionally not guessed. */
/* Day placeholders mirror the nutritional strip and approved 61px card family.
   They do not assert which prescriptions or events exist in the requested day. */
function renderPendingDaySkeleton(){
 const host=$("overview-day-skeleton-cards");
 const shape=name=>{
  const node=document.createElement("span");
  node.className="overview-skeleton-shape "+name;
  return node;
 };
 const card=()=>{
  const shell=document.createElement("div");shell.className="overview-day-skeleton-card";
  shell.append(shape("overview-day-skeleton-icon"),shape("overview-day-skeleton-card-title"),shape("overview-day-skeleton-card-value"),shape("overview-day-skeleton-chevron"));
  return shell;
 };
 const mealCount=Array.isArray(meals)&&meals.length?meals.length:5;
 const count=1+Math.min(7,Math.max(3,mealCount)); // Peso + neutral meal placeholders.
 host.replaceChildren(...Array.from({length:count},card));
}
function renderPendingWeeklySkeleton(){
 const host=$("overview-week-skeleton");
 const shape=(name)=>{
  const node=document.createElement("span");
  node.className="overview-skeleton-shape overview-week-skeleton-shape "+name;
  return node;
 };
 const grid=document.createElement("div");grid.className="overview-week-skeleton-grid";
 for(let i=0;i<7;i++){
  const header=document.createElement("div");header.className="overview-week-skeleton-header";
  header.append(shape("overview-week-skeleton-weekday"),shape("overview-week-skeleton-date"),shape("overview-week-skeleton-classification"));
  grid.append(header);
 }
 const mealRows=Array.isArray(meals)&&meals.length?meals.length:5;
 for(let row=0;row<mealRows;row++)
  for(let dayIndex=0;dayIndex<7;dayIndex++)grid.append(shape("overview-week-skeleton-meal"));
 for(let i=0;i<7;i++)grid.append(shape("overview-week-skeleton-total"));
 const summary=document.createElement("div");summary.className="overview-week-skeleton-summary";
 for(let i=0;i<4;i++){
  const metric=document.createElement("div");metric.className="overview-week-skeleton-metric";
  metric.append(shape("overview-week-skeleton-metric-label"),shape("overview-week-skeleton-metric-value"));
  summary.append(metric);
 }
 host.replaceChildren(grid,shape("overview-week-skeleton-summary-label"),summary);
}
/* Loading placeholders are a fallback for a genuinely slow Day request.
   Fast same-week navigation keeps its existing direct transition. */
const OVERVIEW_DAY_SKELETON_DELAY_MS=240;
let overviewDaySkeletonTimer=null;
function cancelOverviewDaySkeletonTimer(){
 if(overviewDaySkeletonTimer!==null){
  clearTimeout(overviewDaySkeletonTimer);
  overviewDaySkeletonTimer=null;
 }
}
function scheduleOverviewDaySkeleton(requestId,epoch,mon,dateKey){
 cancelOverviewDaySkeletonTimer();
 overviewDaySkeletonTimer=setTimeout(()=>{
  overviewDaySkeletonTimer=null;
  if(requestId!==overviewRequestId||epoch!==playerSessionEpoch||
     tab!=="overview"||overviewMode!=="day"||iso(day)!==dateKey)return;
  setOverviewLoading(true,mon,dateKey);
 },OVERVIEW_DAY_SKELETON_DELAY_MS);
}
function setOverviewLoading(loading,mon=null,dateKey=null){
 if(!loading)cancelOverviewDaySkeletonTimer();
 const indicator=$("overview-loading");
 const sameView=lastOverviewPresentation&&mon&&lastOverviewPresentation.weekKey===iso(mon)
  &&lastOverviewPresentation.dateKey===dateKey&&lastOverviewPresentation.mode===overviewMode;
 if(loading&&!sameView){
  if(overviewMode==="week")renderPendingWeeklySkeleton();
  else renderPendingDaySkeleton();
  indicator.hidden=false;
  indicator.classList.toggle("week-pending",overviewMode==="week");
  $("day-details").hidden=true;$("weekly-view").hidden=true;
  if(overviewMode==="day"&&mon){
   $("week-strip").hidden=false;$("date-title").hidden=false;
   renderPendingCalendar(mon,dateKey);
  }else{
   $("week-strip").hidden=true;$("date-title").hidden=true;
  }
 }else indicator.hidden=true;
 $("overview").toggleAttribute("aria-busy",loading);
}
function invalidatePlayerEventCalendarCache(){
 // Event mutations affect both the event's slot and the associated peri-meals.
 // Keep unrelated menu/weight reads cached, but refetch the calendar on success.
 overviewSnapshot=null;
 for(const path of overviewReadCache.keys()){
  if(path.startsWith("/api/v2/player/calendar?")||
     path.startsWith("/api/v2/player/effective-nutrition-preview?"))
   overviewReadCache.delete(path);
 }
}
function cachedOverviewRead(path){
 const now=Date.now(),old=overviewReadCache.get(path);
 if(old&&now-old.time<OVERVIEW_CACHE_MS)return old.promise;
 const promise=api(path).catch(err=>{if(overviewReadCache.get(path)?.promise===promise)overviewReadCache.delete(path);throw err;});
 overviewReadCache.set(path,{time:now,promise});
 if(overviewReadCache.size>30)overviewReadCache.delete(overviewReadCache.keys().next().value);
 return promise;
}
/* A dish subcard in the daily plan is a shortcut to that exact Menus
   date and meal. The main Almoço/Jantar summary stays an accordion. */
async function openDailyMealInMenus(dateKey,meal){
 if(tab!=="overview"||(meal!=="lunch"&&meal!=="dinner"))return;
 const selectedDay=new Date(dateKey+"T12:00:00");
 if(Number.isNaN(selectedDay.getTime()))return;
 menuWeek=selectedDay;
 menuSelectedDate=dateKey;
 // Reuse the actual Menus selector action: this also closes old recipe
 // subpages without changing navigation or recipe permissions.
 document.querySelector('#menus-recipe-switch [data-menu-mode="menus"]')?.click();
 await show("menus");
 // Wait for the rendered Menus DOM and any queued scroll restoration.
 window.requestAnimationFrame(()=>{
  if(tab!=="menus"||menuSelectedDate!==dateKey)return;
  const dayCard=document.querySelector('#menu-days .day-menu[data-date="'+dateKey+'"]');
  const mealCard=dayCard?.querySelector('.menu-entry[data-meal="'+meal+'"]');
  (mealCard||dayCard)?.scrollIntoView({
   behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches?"auto":"smooth",
   block:"center"
  });
 });
}
/* Editar consumo (25/11): the editor opens in a sheet that rises from the bottom instead of below the card.
   Header: Cancelar · meal · Guardar (Guardar = the editor's own save). Closing (Cancelar, swipe down, tap
   outside) asks before discarding changes. The editor itself (foods, grams wheel, add food, preview) is unchanged. */
let consumptionSheet=null;
function consumptionMealTitle(host){
 const card=host.closest('.daily-meal')||host.closest('.peri-meal,.match-intra-card,.meal')||host.closest('details');
 const title=card?.querySelector(':scope > summary strong, :scope > .daily-meal-head > strong, summary strong');
 return (title?.childNodes[0]?.textContent||title?.textContent||'').trim()||playerText('Consumo','Consumption');
}
function consumptionSheetSync(){
 const st=consumptionSheet;if(!st)return;
 const panelSave=st.body.querySelector('.consumption-editor .consumption-save');
 st.save.hidden=!panelSave;
 st.save.disabled=!panelSave||panelSave.disabled||!st.dirty;
 st.save.textContent=panelSave&&panelSave.disabled&&st.dirty?panelSave.textContent:playerText('Guardar','Save');
}
function consumptionSheetToast(text){
 document.querySelector('.consumption-sheet-toast')?.remove();
 const toast=document.createElement('div');toast.className='consumption-sheet-toast';toast.setAttribute('role','status');toast.textContent=text;
 document.body.append(toast);requestAnimationFrame(()=>toast.classList.add('is-visible'));
 setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>toast.remove(),260);},1800);
}
function closeConsumptionSheet(){
 const st=consumptionSheet;if(!st)return;consumptionSheet=null;
 st.observer.disconnect();st.parentObserver?.disconnect();document.removeEventListener('click',st.onDocClick,true);
 document.body.classList.remove('consumption-sheet-open');
 st.sheet.classList.remove('is-open');st.backdrop.classList.remove('is-open');
 document.querySelectorAll('.consumption-food-sheet,.consumption-food-sheet-backdrop,.consumption-grams-wheel-backdrop,.consumption-sheet-confirm').forEach(node=>node.remove());
 document.body.classList.remove('consumption-food-sheet-open');
 setTimeout(()=>{st.sheet.remove();st.backdrop.remove();},260);
 if(st.saved)consumptionSheetToast(playerText('Consumo guardado','Consumption saved'));
}
function requestCloseConsumptionSheet(){
 const st=consumptionSheet;if(!st)return;
 if(!st.dirty){closeConsumptionSheet();return;}
 st.sheet.querySelector('.consumption-sheet-confirm')?.remove();
 const layer=document.createElement('div');layer.className='consumption-sheet-confirm';
 const box=document.createElement('div');box.className='consumption-sheet-confirm-box';box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');
 const group=document.createElement('div');group.className='consumption-sheet-confirm-group';
 const text=document.createElement('p');text.textContent=playerText('Tens alterações por guardar em ','You have unsaved changes in ')+st.title+'. '+playerText('Queres guardar antes de fechar?','Save before closing?');
 const make=(label,cls,onClick)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=onClick;return b;};
 const saveBtn=st.body.querySelector('.consumption-editor .consumption-save');
 group.append(text);
 if(saveBtn&&!saveBtn.disabled)group.append(make(playerText('Guardar alterações','Save changes'),'is-primary',()=>{layer.remove();saveBtn.click();}));
 group.append(make(playerText('Descartar alterações','Discard changes'),'is-destructive',()=>{layer.remove();closeConsumptionSheet();}));
 const keep=document.createElement('div');keep.className='consumption-sheet-confirm-group';
 keep.append(make(playerText('Continuar a editar','Keep editing'),'is-primary',()=>layer.remove()));
 box.append(group,keep);layer.append(box);layer.addEventListener('click',e=>{if(e.target===layer)layer.remove();});
 st.sheet.append(layer);
}
function consumptionSheetMount(host){
 if(consumptionSheet&&consumptionSheet.sheet.isConnected){consumptionSheet.origin=host;consumptionSheet.dirty=false;consumptionSheet.body.replaceChildren();return consumptionSheet.body;}
 if(consumptionSheet)closeConsumptionSheet();
 const parent=host.closest('#day-details')||host.closest('#overview')||document.body;
 const backdrop=document.createElement('div');backdrop.className='consumption-sheet-backdrop';
 const sheet=document.createElement('section');sheet.className='consumption-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
 const tone=host.closest('[class*="tone-"]');if(tone)for(const c of tone.classList)if(c.startsWith('tone-'))sheet.classList.add(c);
 const title=consumptionMealTitle(host);sheet.setAttribute('aria-label',playerText('Editar consumo · ','Edit consumption · ')+title);
 const grabber=document.createElement('div');grabber.className='consumption-sheet-grabber';grabber.setAttribute('aria-hidden','true');
 const head=document.createElement('header');head.className='consumption-sheet-head';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='consumption-sheet-cancel';cancel.textContent=playerText('Cancelar','Cancel');
 const titles=document.createElement('div');titles.className='consumption-sheet-titles';
 const strong=document.createElement('strong');strong.textContent=title;const small=document.createElement('small');small.textContent=playerText('Editar consumo','Edit consumption');titles.append(strong,small);
 const save=document.createElement('button');save.type='button';save.className='consumption-sheet-save';save.textContent=playerText('Guardar','Save');save.disabled=true;
 head.append(cancel,titles,save);
 const body=document.createElement('div');body.className='consumption-sheet-body';
 sheet.append(grabber,head,body);parent.append(backdrop,sheet);
 const st={sheet,backdrop,body,save,origin:host,dirty:false,saved:false,title};
 consumptionSheet=st;
 const markDirty=()=>{st.dirty=true;requestAnimationFrame(consumptionSheetSync);};
 body.addEventListener('input',markDirty);body.addEventListener('change',markDirty);
 body.addEventListener('click',e=>{if(e.target.closest('.consumption-remove-all,.consumption-added-food'))markDirty();else requestAnimationFrame(consumptionSheetSync);});
 st.onDocClick=e=>{if(e.target.closest?.('.consumption-add-confirm'))markDirty();};document.addEventListener('click',st.onDocClick,true);
 // The editor removes its panel when it is done (saved, cancelled, failed): the sheet closes with it.
 st.observer=new MutationObserver(()=>{if(consumptionSheet===st&&!body.querySelector('.consumption-editor')){closeConsumptionSheet();return;}consumptionSheetSync();});
 st.observer.observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 // If Início re-renders underneath (the sheet lives in #day-details), release the sheet state too.
 st.parentObserver=new MutationObserver(()=>{if(consumptionSheet===st&&!sheet.isConnected)closeConsumptionSheet();});
 st.parentObserver.observe(parent,{childList:true});
 cancel.onclick=requestCloseConsumptionSheet;backdrop.onclick=requestCloseConsumptionSheet;
 save.onclick=()=>{const panelSave=body.querySelector('.consumption-editor .consumption-save');if(panelSave&&!panelSave.disabled)panelSave.click();};
 // Swipe the sheet down from the grabber or the header.
 let drag=null;
 const startDrag=e=>{if(e.touches.length!==1||e.target.closest('button'))return;drag={y:e.touches[0].clientY,at:performance.now(),dy:0};sheet.style.transition='none';};
 const moveDrag=e=>{if(!drag)return;drag.dy=Math.max(0,e.touches[0].clientY-drag.y);sheet.style.transform='translate3d(0,'+drag.dy+'px,0)';if(e.cancelable)e.preventDefault();};
 const endDrag=()=>{if(!drag)return;const {dy,at}=drag;drag=null;sheet.style.transition='';sheet.style.transform='';
  if(dy>120||(dy>40&&dy/Math.max(1,performance.now()-at)>.5))requestCloseConsumptionSheet();};
 for(const el of [grabber,head]){el.addEventListener('touchstart',startDrag,{passive:true});el.addEventListener('touchmove',moveDrag,{passive:false});el.addEventListener('touchend',endDrag,{passive:true});el.addEventListener('touchcancel',endDrag,{passive:true});}
 document.body.classList.add('consumption-sheet-open');
 requestAnimationFrame(()=>{sheet.classList.add('is-open');backdrop.classList.add('is-open');});
 return body;
}
async function openAlternativeColorPicker(host,mealDate,mealKey,eventId=''){
 const panel=document.createElement('div');panel.className='consumption-editor consumption-color-picker';
 const status=document.createElement('p');status.className='hint';status.textContent=playerText('A carregar cores disponíveis…','Loading available colours…');panel.append(status);consumptionSheetMount(host).append(panel);
 try{
  const qs=new URLSearchParams({date:mealDate,meal:mealKey,event_id:eventId});
  const data=await api('/api/v2/player/consumption-options?'+qs);
  if(!panel.isConnected)return;
  panel.replaceChildren();
  const header=document.createElement('div');header.className='consumption-color-header';const title=document.createElement('p');title.textContent=playerText('Que cor consumiste?','Which colour did you consume?');const close=document.createElement('button');close.type='button';close.className='consumption-color-close';close.textContent='×';close.setAttribute('aria-label',playerText('Fechar seleção de cor','Close colour selection'));close.onclick=()=>panel.remove();header.append(title,close);panel.append(header);panel.classList.add('consumption-color-picker');
  const colors=data.alternative_colors||[];
  if(!colors.length){const hint=document.createElement('p');hint.className='hint';hint.textContent=playerText('Não existem outras cores com opções publicadas.','No other colours have published options.');panel.append(hint);}
  // Same medal as the Início «Planos» widget: one row per colour, highest carbohydrates first.
  const rank=c=>{const i=PLAN_ORDER.indexOf(c);return i<0?PLAN_ORDER.length:i;};
  const list=document.createElement('div');list.className='consumption-color-list';
  for(const color of [...colors].sort((a,b)=>rank(a)-rank(b))){
   const label=playerUiLanguage==='en'?({green:'Green',yellow:'Yellow',orange:'Orange',blue:'Blue',red:'Red',vp:'Preparation green'})[color]||color:({green:'Verde',yellow:'Amarelo',orange:'Laranja',blue:'Azul',red:'Vermelho',vp:'Verde preparação'})[color]||color;
   const carbs=PLAN_CARB_LEVEL[color]||0;
   const button=document.createElement('button');button.type='button';
   button.className='consumption-color-option consumption-color-row consumption-color-'+color;
   const text=document.createElement('span');text.className='consumption-color-text';
   const name=document.createElement('span');name.className='consumption-color-name';name.textContent=label;text.append(name);
   if(carbs){const sub=document.createElement('span');sub.className='consumption-color-sub';sub.textContent=playerText('Hidratos ','Carbohydrates ')+carbs+playerText(' de 4',' of 4');text.append(sub);}
   const chevron=document.createElement('span');chevron.className='consumption-color-chevron';chevron.setAttribute('aria-hidden','true');chevron.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
   button.append(planBadge({tone:color,carbs}),text,chevron);
   button.setAttribute('aria-label',label+(carbs?playerText(', hidratos ',', carbohydrates ')+carbs+playerText(' de 4',' of 4'):''));
   button.onclick=()=>openAlternativeOptionPicker(host,mealDate,mealKey,eventId,color);
   list.append(button);
  }
  if(colors.length)panel.append(list);
 }catch(e){if(panel.isConnected){status.textContent=playerText('Não foi possível carregar as cores.','Could not load colours.');}error(e);}
}

async function openAlternativeOptionPicker(host,mealDate,mealKey,eventId,color){
 const panel=document.createElement('div');panel.className='consumption-editor consumption-color-picker';
 const status=document.createElement('p');status.className='hint';status.textContent=playerText('A carregar opções…','Loading options…');panel.append(status);consumptionSheetMount(host).append(panel);
 try{
  const qs=new URLSearchParams({date:mealDate,meal:mealKey,event_id:eventId,consumed_color:color});
  const data=await api('/api/v2/player/consumption-options?'+qs);
  if(!panel.isConnected)return;
  panel.replaceChildren();
  const header=document.createElement('div');header.className='consumption-color-header';
  const title=document.createElement('p');title.textContent=playerText('Qual foi a opção consumida?','Which option did you consume?');
  const close=document.createElement('button');close.type='button';close.className='consumption-color-close';close.textContent='×';close.setAttribute('aria-label',playerText('Fechar','Close'));close.onclick=()=>panel.remove();
  header.append(title,close);panel.append(header);
  const options=data.options||[];
  if(!options.length){const hint=document.createElement('p');hint.className='hint';hint.textContent=playerText('Não existem opções publicadas nesta cor.','No options published for this colour.');panel.append(hint);}
  options.forEach((option,index)=>{
   const button=document.createElement('button');button.type='button';button.className='consumption-alternative-option';
   button.textContent=option.title||playerText('Opção ','Option ')+(index+1);
   button.onclick=()=>openConsumptionEditor(host,mealDate,mealKey,eventId,index,color);
   panel.append(button);
  });
  const back=document.createElement('button');back.type='button';back.className='consumption-cancel';back.textContent=playerText('Voltar às cores','Back to colours');back.onclick=()=>openAlternativeColorPicker(host,mealDate,mealKey,eventId);panel.append(back);
 }catch(e){if(panel.isConnected)status.textContent=playerText('Não foi possível carregar as opções.','Could not load options.');error(e);}
}

async function openConsumptionEditor(host, mealDate, mealKey, eventId='', preferredOptionIndex=null, consumedColor=null, timing=null, preferredOptionRef=null, extraTiming=false, onCancel=null){
 // A new intra-match moment keeps its own inline flow; every other edit opens in the sheet.
 const sheetBody=extraTiming?null:consumptionSheetMount(host);
 if(!sheetBody)for(const existing of host.querySelectorAll('.consumption-editor'))existing.remove();
 const panel=document.createElement('div');panel.className='consumption-editor';
 const message=document.createElement('p');message.className='hint';message.textContent=extraTiming?playerText('A preparar registo de consumo…','Preparing consumption record…'):playerText('A carregar opções publicadas…','Loading published options…');
 panel.append(message);(sheetBody||host).append(panel);
 try{
  const qs=new URLSearchParams({date:mealDate,meal:mealKey,event_id:eventId});
  if(consumedColor)qs.set('consumed_color',consumedColor);
  if(timing)qs.set('timing',timing);
  if(extraTiming)qs.set('extra_timing','1');
  const data=await api('/api/v2/player/consumption-options?'+qs);
  const existing=await api('/api/v2/player/consumption-records?start='+mealDate+'&end='+mealDate);
  const parent=(existing.records||[]).find(x=>x.meal_key===mealKey&&x.event_id===eventId);
  const previous=timing?parent?.timing_records?.find(x=>x.timing===timing):parent;
  if(!panel.isConnected)return;
  if(!data.options?.length){panel.textContent=playerText('Não existem opções publicadas disponíveis para registo.','No published options available to record.');return;}
  panel.replaceChildren();

  const select=document.createElement('select');
  data.options.forEach((option,i)=>{const item=document.createElement('option');item.value=option.option_ref;item.textContent=option.title||playerText('Opção ','Option ')+(i+1);select.append(item);});
  if(previous&&data.options.some(x=>x.option_ref===previous.option_ref))select.value=previous.option_ref;
  if(Number.isInteger(preferredOptionIndex)&&data.options[preferredOptionIndex])select.value=data.options[preferredOptionIndex].option_ref;
  if(preferredOptionRef&&data.options.some(x=>x.option_ref===preferredOptionRef))select.value=preferredOptionRef;
  select.className='consumption-option-select';panel.append(select);
  // The editor derives the saved status from food selections, not a separate mode selector.
  const mode={value:'partial'};
  const foodsRoot=document.createElement('div');foodsRoot.className='consumption-foods-root';panel.append(foodsRoot);
  const additional=[];
  const previousFoods=previous?.option_ref===select.value&&previous?.status==='partial'?(previous.consumed_foods||[]):[];
  function redraw(){
   document.querySelectorAll('.consumption-food-sheet,.consumption-food-sheet-backdrop').forEach(node=>node.remove());document.body.classList.remove('consumption-food-sheet-open');
   foodsRoot.replaceChildren();
   const option=data.options.find(x=>x.option_ref===select.value),foods=option.foods||[];
   const groups=new Map();foods.forEach((food,i)=>{const parent=food.alternative_to??i;if(!groups.has(parent))groups.set(parent,[]);groups.get(parent).push(i);});
   for(const indices of groups.values()){
    if(indices.every(i=>foods[i]?.kind==='supplement'))continue;
    const group=document.createElement('div');group.className='consumption-food-group';
    for(const i of indices){const food=foods[i],line=document.createElement('label');line.className='consumption-food-line';
     if(food.kind==='supplement')continue;
     const check=document.createElement('input');check.type='checkbox';check.dataset.index=String(i);check.checked=initial&&previous?.status==='none'?false:initial&&previous?.status==='partial'?previousFoods.some(f=>!f.additional&&f.option_index===i):i===indices[0];
     check.onchange=()=>{if(check.checked&&indices.length>1){for(const other of group.querySelectorAll('input[type=checkbox]'))if(other!==check){other.checked=false;const otherGrams=other.closest('label')?.querySelector('input[type=number]');if(otherGrams){otherGrams.value='0';otherGrams.disabled=true;}}}grams.value=check.checked?String(food.grams??0):'0';grams.disabled=!check.checked;};
     const name=document.createElement('span');name.className='consumption-food-name';const label=document.createElement('span');label.textContent=food.display_name||food.library_name||food.name||playerText('Alimento','Food');name.append(label);
     const grams=document.createElement('input');grams.type='number';grams.min='0';grams.step='any';grams.value=String((initial?previousFoods.find(f=>!f.additional&&f.option_index===i)?.grams:null)??food.grams??0);grams.dataset.grams=String(i);grams.setAttribute('aria-label',playerText('Quantidade consumida em gramas','Amount consumed in grams'));grams.readOnly=true;grams.tabIndex=-1;grams.setAttribute('inputmode','none');grams.style.fontSize='16px';let portionTouchStart=null,portionTouchMoved=false,portionTouchEndedAt=0;
     grams.addEventListener('touchstart',e=>{const t=e.touches[0];if(!t)return;portionTouchStart={x:t.clientX,y:t.clientY};portionTouchMoved=false;},{passive:true});
     grams.addEventListener('touchmove',e=>{const t=e.touches[0];if(t&&portionTouchStart&&Math.hypot(t.clientX-portionTouchStart.x,t.clientY-portionTouchStart.y)>8)portionTouchMoved=true;},{passive:true});
     grams.addEventListener('touchend',()=>{portionTouchEndedAt=Date.now();portionTouchStart=null;},{passive:true});
     grams.addEventListener('touchcancel',()=>{portionTouchMoved=true;portionTouchStart=null;portionTouchEndedAt=Date.now();},{passive:true});
     grams.addEventListener('click',e=>{e.preventDefault();if(portionTouchMoved&&Date.now()-portionTouchEndedAt<600)return;if(!document.querySelector('.consumption-grams-wheel-backdrop'))openGramsWheel(grams);});grams.addEventListener('focus',()=>{if(grams.readOnly)grams.blur();});if(!check.checked){grams.value='0';grams.disabled=true;}
     const checkWrap=document.createElement('span');checkWrap.className='consumption-check-wrap';const checkVisual=document.createElement('span');checkVisual.className='consumption-check-visual';checkVisual.setAttribute('aria-hidden','true');checkWrap.append(check,checkVisual);const unit=document.createElement('span');unit.className='consumption-grams-unit';unit.textContent='g';line.append(checkWrap,name,grams,unit);group.append(line);
    }foodsRoot.append(group);
   }
   function openGramsWheel(input){
    if(input.disabled)return;
    document.querySelector('.consumption-grams-wheel-backdrop')?.remove();
    const current=Math.max(0,Math.round(Number(input.value)||0));
    const max=Math.max(2000,current+500);
    const overlay=document.createElement('div');overlay.className='consumption-grams-wheel-backdrop';
    const sheet=document.createElement('section');sheet.className='consumption-grams-wheel-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',playerText('Ajustar porção','Adjust portion'));
    const top=document.createElement('div');top.className='consumption-grams-wheel-top';
    const cancel=document.createElement('button');cancel.type='button';cancel.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';cancel.setAttribute('aria-label',playerText('Fechar','Close'));
    const title=document.createElement('strong');title.textContent=playerText('Porção (g)','Portion (g)');
    const done=document.createElement('button');done.type='button';done.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>';done.setAttribute('aria-label',playerText('Confirmar','Confirm'));top.append(cancel,title,done);
    const wrap=document.createElement('div');wrap.className='consumption-grams-wheel-wrap';
    const band=document.createElement('div');band.className='consumption-grams-wheel-band';
    const viewport=document.createElement('div');viewport.className='consumption-grams-wheel';viewport.setAttribute('role','listbox');viewport.setAttribute('aria-label',playerText('Gramas','Grams'));
    const rail=document.createElement('div');rail.className='consumption-grams-wheel-rail';
    const pad=()=>{const p=document.createElement('div');p.className='consumption-grams-wheel-pad';rail.append(p);};pad();
    for(let v=0;v<=max;v++){const el=document.createElement('div');el.className='consumption-grams-wheel-option';el.textContent=String(v);rail.append(el);}
    pad();viewport.append(rail);wrap.append(band,viewport);
    const manual=document.createElement('button');manual.type='button';manual.className='consumption-grams-wheel-manual';manual.textContent=playerText('Introduzir valor manualmente','Enter value manually');
    sheet.append(top,wrap,manual);overlay.append(sheet);document.body.append(overlay);
    let selected=current,previous=null;
    const update=()=>{selected=Math.max(0,Math.min(max,Math.round(viewport.scrollTop/44)));if(previous!==null&&previous!==selected)playerHaptic();if(previous!==null)rail.children[previous+1]?.classList.remove('selected');rail.children[selected+1]?.classList.add('selected');previous=selected;};
    viewport.scrollTop=current*44;update();
    let raf=0,settleTimer=0,touching=false;
    const settle=()=>{if(touching)return;const target=Math.max(0,Math.min(max,Math.round(viewport.scrollTop/44)))*44;if(Math.abs(viewport.scrollTop-target)>0.5)viewport.scrollTo({top:target,behavior:'smooth'});};
    viewport.addEventListener('touchstart',()=>{touching=true;clearTimeout(settleTimer);},{passive:true});
    viewport.addEventListener('touchend',()=>{touching=false;clearTimeout(settleTimer);settleTimer=setTimeout(settle,180);},{passive:true});
    viewport.addEventListener('touchcancel',()=>{touching=false;},{passive:true});
    viewport.addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;update();});clearTimeout(settleTimer);if(!touching)settleTimer=setTimeout(settle,180);},{passive:true});
    const close=()=>overlay.remove();
    cancel.onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    done.onclick=()=>{update();input.value=String(selected);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();};
    manual.onclick=()=>{close();input.readOnly=false;input.setAttribute('inputmode','decimal');input.style.fontSize='16px';input.focus();input.select();};
   }
   const removeAll=document.createElement('button');removeAll.type='button';removeAll.className='consumption-remove-all';
   const syncRemoveAll=()=>{
    const checks=[...foodsRoot.querySelectorAll('.consumption-food-line input[type=checkbox]')];
    removeAll.textContent=checks.length&&checks.every(c=>!c.checked)?playerText('Selecionar todos','Select all'):playerText('Remover todos','Remove all');
    if(extraTiming)removeAll.hidden=!checks.length;
   };
   removeAll.onclick=()=>{
    const checks=[...foodsRoot.querySelectorAll('.consumption-food-line input[type=checkbox]')];
    const restore=checks.every(c=>!c.checked);
    if(restore){
     const groups=new Set();
     for(const check of checks){const group=check.closest('.consumption-food-group');if(groups.has(group))continue;groups.add(group);
      const first=group.querySelector('input[type=checkbox]');if(first){first.checked=true;const quantity=first.closest('label')?.querySelector('input[type=number]');if(quantity){const food=foods[Number(first.dataset.index)];quantity.value=String(food?.grams??0);quantity.disabled=false;}}
     }
    }else{for(const check of checks){check.checked=false;const quantity=check.closest('label')?.querySelector('input[type=number]');if(quantity){quantity.value='0';quantity.disabled=true;}}}
    for(const entry of additional){entry.consumed=restore;}
    for(const row of foodsRoot.querySelectorAll('.consumption-added-food')){const check=row.querySelector('input[type=checkbox]'),amount=row.querySelector('input[type=number]');if(check)check.checked=restore;if(amount){amount.disabled=!restore;amount.value=restore?String(additional[[...foodsRoot.querySelectorAll('.consumption-added-food')].indexOf(row)]?.grams||0):'0';}}
    syncRemoveAll();queuePreview();
   };
   foodsRoot.append(removeAll);
   foodsRoot.addEventListener('change',syncRemoveAll,{once:true});
   syncRemoveAll();
   const search=document.createElement('input');search.type='search';search.placeholder=playerText('Inserir alimento','Add food');search.setAttribute('aria-label',playerText('Pesquisar alimento adicional','Search for another food'));
   const matches=document.createElement('select');matches.setAttribute('aria-label',playerText('Alimento da biblioteca','Food from library'));
   const quantity=document.createElement('input');quantity.type='number';quantity.min='0.01';quantity.step='any';quantity.placeholder=playerText('Porção','Portion');quantity.setAttribute('aria-label',playerText('Inserir porção em gramas','Enter portion in grams'));quantity.style.fontSize='16px';
   const add=document.createElement('button');add.type='button';add.textContent='✓';add.title=playerText('Confirmar alimento','Confirm food');add.setAttribute('aria-label',playerText('Confirmar alimento','Confirm food'));add.className='consumption-add-confirm';add.style.cssText='width:38px;height:38px;flex:0 0 38px;border-radius:50%;padding:0;background:#b9e2cf;color:#174e3d;font-size:20px;border:0;';;
   const added=document.createElement('div');added.className='consumption-added-list';const foodNotes=new Map();
   let request=0;const foodNames=new Map();const foodNameCacheKey='themile-consumption-food-names-'+playerUiLanguage;try{for(const [id,name] of Object.entries(JSON.parse(localStorage.getItem(foodNameCacheKey)||'{}')))foodNames.set(id,name);}catch(_){}const rememberFoodName=(id,name)=>{if(!id||!name)return;foodNames.set(String(id),name);try{const cached=JSON.parse(localStorage.getItem(foodNameCacheKey)||'{}');cached[String(id)]=name;localStorage.setItem(foodNameCacheKey,JSON.stringify(cached));}catch(_){}};
   const renderSuggestions=()=>{suggestions.replaceChildren();for(const opt of matches.options){const b=document.createElement('button');b.type='button';b.textContent=opt.textContent;b.onclick=()=>{choose(opt);updateAddState();confirm.disabled=false;};suggestions.append(b);}suggestions.hidden=!suggestions.childElementCount;};
   search.oninput=async()=>{const q=search.value.trim(),id=++request;matches.replaceChildren();suggestions.replaceChildren();suggestions.hidden=true;if(q.length<2)return;try{const result=await api('/api/v2/player/consumption-foods?q='+encodeURIComponent(q));if(id!==request)return;for(const food of result.foods||[]){const opt=document.createElement('option');opt.value=food.id;opt.textContent=food.display_name;rememberFoodName(food.id,food.display_name);foodNotes.set(String(food.id),String(food.note||''));matches.append(opt);}renderSuggestions();}catch(e){if(id===request)error(e);}};
   const renderAdditional=(entry,name)=>{const row=document.createElement('label');row.className='consumption-food-line consumption-added-food';const check=document.createElement('input');check.type='checkbox';check.checked=entry.consumed!==false;const checkWrap=document.createElement('span');checkWrap.className='consumption-check-wrap';const visual=document.createElement('span');visual.className='consumption-check-visual';visual.setAttribute('aria-hidden','true');checkWrap.append(check,visual);const title=document.createElement('span');title.className='consumption-food-name';title.textContent=name;const amount=document.createElement('input');amount.type='number';amount.min='0';amount.step='any';amount.value=String(entry.grams);amount.setAttribute('aria-label',playerText('Quantidade consumida em gramas','Amount consumed in grams'));const unit=document.createElement('span');unit.className='consumption-grams-unit';unit.textContent='g';check.onchange=()=>{entry.consumed=check.checked;amount.disabled=!check.checked;queuePreview();};amount.oninput=()=>{entry.grams=Number(amount.value)||0;queuePreview();};amount.disabled=!check.checked;row.append(checkWrap,title,amount,unit);added.append(row);};
   add.onclick=()=>{const id=matches.value,grams=Number(quantity.value);if(!id||!Number.isFinite(grams)||grams<=0)return;const entry={id,grams,consumed:true,name:matches.selectedOptions[0]?.textContent||search.value};rememberFoodName(id,entry.name);additional.push(entry);renderAdditional(entry,entry.name);quantity.value='';search.value='';matches.replaceChildren();suggestions.replaceChildren();suggestions.hidden=true;closeFoodSheet();syncRemoveAll();queuePreview();};
   if(initial&&previousFoods.length){for(const f of previousFoods.filter(x=>x.additional)){const entry={id:f.id,grams:f.grams,consumed:f.consumed!==false};additional.push(entry);renderAdditional(entry,f.display_name||f.library_name||f.name||foodNames.get(String(f.id))||playerText('Alimento adicional','Additional food'));if(!(f.display_name||f.library_name||f.name)){const title=added.lastElementChild?.querySelector('.consumption-food-name');api('/api/v2/player/consumption-foods?q='+encodeURIComponent(String(f.id))).then(result=>{const found=(result.foods||[]).find(food=>String(food.id)===String(f.id));if(found&&title){title.textContent=found.display_name;rememberFoodName(f.id,found.display_name);}}).catch(()=>{});}}}
   const extra=document.createElement('div');extra.className='consumption-extra';
   
   const fields=document.createElement('div');fields.className='consumption-add-fields';fields.hidden=true;fields.style.display='none';
   const suggestions=document.createElement('div');suggestions.className='consumption-suggestions';suggestions.hidden=true;
   matches.className='consumption-search-select';matches.hidden=true;
   const choose=(option)=>{matches.replaceChildren(option.cloneNode(true));matches.value=option.value;search.value=option.textContent;suggestions.hidden=true;foodNote.textContent=foodNotes.get(String(option.value))||'';foodNote.hidden=!foodNote.textContent;portionStep.hidden=false;quantity.focus({preventScroll:true});};
   search.addEventListener('focus',()=>{if(suggestions.childElementCount)suggestions.hidden=false;});
   const searchWrap=document.createElement('div');searchWrap.className='consumption-search-wrap';
    const searchIcon=document.createElement('span');searchIcon.className='consumption-search-symbol';searchIcon.setAttribute('aria-hidden','true');
    searchIcon.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>';
    searchWrap.append(search,searchIcon);const inputRow=document.createElement('div');inputRow.className='consumption-add-row';inputRow.style.cssText='display:flex;align-items:center;gap:8px;min-width:0';quantity.style.setProperty('flex','0 0 88px','important');quantity.style.setProperty('width','88px','important');quantity.style.setProperty('min-width','0','important');quantity.style.setProperty('max-width','88px','important');quantity.style.setProperty('padding','10px 8px','important');quantity.style.setProperty('font-size','16px','important');inputRow.append(searchWrap,quantity,add);inputRow.style.width='100%';add.style.setProperty('flex','0 0 38px','important');quantity.style.setProperty('background','rgba(255,255,255,.035)','important');quantity.style.borderRadius='14px';quantity.style.border='0';quantity.style.setProperty('color','var(--text-muted, #b7b3a9)','important');const updateAddState=()=>{add.disabled=!(matches.value&&Number(quantity.value)>0);add.style.opacity=add.disabled?'.4':'1';};quantity.addEventListener('input',updateAddState);search.addEventListener('input',updateAddState);const originalChoose=choose;const chooseWithState=(option)=>{originalChoose(option);updateAddState();};const addTrigger=document.createElement('button');addTrigger.type='button';addTrigger.className='consumption-add-trigger';addTrigger.textContent=playerText('⊕ Adicionar alimento','⊕ Add food');addTrigger.style.cssText='appearance:none;background:transparent!important;box-shadow:none!important;border:0!important;border-radius:0!important;color:inherit!important;padding:4px 0!important;width:auto!important;max-width:max-content!important;min-height:0!important;font:inherit;font-size:14px!important;font-weight:400!important;white-space:nowrap;cursor:pointer';
   const backdrop=document.createElement('div');backdrop.className='consumption-food-sheet-backdrop';backdrop.hidden=true;
   const sheet=document.createElement('section');sheet.className='consumption-food-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',playerText('Adicionar alimento','Add food'));sheet.hidden=true;
   const handle=document.createElement('div');handle.className='consumption-food-sheet-handle';handle.setAttribute('aria-hidden','true');
   const header=document.createElement('div');header.className='consumption-food-sheet-header';
   const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='consumption-food-sheet-close';dismiss.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';dismiss.setAttribute('aria-label',playerText('Fechar','Close'));
   const heading=document.createElement('h2');heading.textContent=playerText('Adicionar alimento','Add food');
   const confirm=document.createElement('button');confirm.type='button';confirm.className='consumption-food-sheet-confirm';confirm.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>';confirm.setAttribute('aria-label',playerText('Confirmar alimento','Confirm food'));
   header.append(dismiss,confirm);
   const foodNote=document.createElement('p');foodNote.className='consumption-food-sheet-note';foodNote.hidden=true;const portionStep=document.createElement('div');portionStep.className='consumption-food-sheet-portion';portionStep.hidden=true;
   const portionLabel=document.createElement('label');portionLabel.textContent=playerText('Porção (g)','Portion (g)');quantity.placeholder='';quantity.setAttribute('inputmode','decimal');portionLabel.append(quantity);
   portionStep.append(portionLabel);
   inputRow.replaceChildren(searchWrap);inputRow.classList.add('consumption-food-sheet-search');
   fields.replaceChildren(handle,header,heading,inputRow,suggestions,foodNote,portionStep,matches);
   fields.classList.add('consumption-food-sheet-content');fields.hidden=false;fields.style.display='block';
   sheet.append(fields);document.body.append(backdrop,sheet);
   const closeFoodSheet=()=>{sheet.style.removeProperty('--sheet-drag-height');sheet.style.removeProperty('--sheet-drag-max-height');backdrop.style.removeProperty('--sheet-keyboard-offset');sheet.style.removeProperty('--sheet-keyboard-offset');sheet.style.removeProperty('--sheet-viewport-height');sheet.style.removeProperty('height');sheet.style.removeProperty('max-height');sheet.classList.remove('is-dragging');sheet.classList.remove('is-expanded');sheet.hidden=true;backdrop.hidden=true;document.body.classList.remove('consumption-food-sheet-open');search.blur();quantity.blur();};
   const openFoodSheet=()=>{search.value='';quantity.value='';matches.replaceChildren();suggestions.replaceChildren();suggestions.hidden=true;foodNote.hidden=true;foodNote.textContent='';portionStep.hidden=true;updateAddState();sheet.hidden=false;backdrop.hidden=false;document.body.classList.add('consumption-food-sheet-open');sheet.style.removeProperty('height');sheet.style.removeProperty('max-height');sheet.classList.remove('is-expanded');sheet.scrollTop=0;syncSheetViewport();};
   const syncSheetViewport=()=>{
    if(sheet.hidden)return;
    const viewport=window.visualViewport;
    const visibleHeight=viewport?.height||window.innerHeight;
    const offset=Math.max(0,window.innerHeight-(viewport?.offsetTop||0)-visibleHeight);
    sheet.style.setProperty('--sheet-keyboard-offset',offset+'px');backdrop.style.setProperty('--sheet-keyboard-offset',offset+'px');
    sheet.style.setProperty('--sheet-viewport-height',visibleHeight+'px');
    if(offset>100){sheet.classList.add('keyboard-visible');sheet.classList.add('is-expanded');}
    else sheet.classList.remove('keyboard-visible');
   };
   window.visualViewport?.addEventListener('resize',syncSheetViewport);
   window.visualViewport?.addEventListener('scroll',syncSheetViewport);
   search.addEventListener('focus',()=>{sheet.classList.add('is-expanded');syncSheetViewport();});
   quantity.addEventListener('focus',()=>{sheet.classList.add('is-expanded');syncSheetViewport();});
   addTrigger.onclick=openFoodSheet;dismiss.onclick=closeFoodSheet;backdrop.onclick=closeFoodSheet;confirm.onclick=()=>add.click();
   const originalUpdate=updateAddState;
   quantity.addEventListener('input',()=>{confirm.disabled=!(matches.value&&Number(quantity.value)>0);});
   search.addEventListener('input',()=>{confirm.disabled=true;portionStep.hidden=true;});
   const originalRender=renderSuggestions;
   confirm.disabled=true;
   let dragStart=0,startHeight=0,restHeight=0,dragging=false,dragMoved=false,dragStartedAt=0;
   const expandedHeight=()=>Math.max(200,(window.visualViewport?.height||window.innerHeight)-50);
   const settleSheet=expanded=>{sheet.style.removeProperty('--sheet-drag-height');sheet.style.removeProperty('--sheet-drag-max-height');sheet.classList.remove('is-dragging');sheet.style.removeProperty('height');sheet.style.removeProperty('max-height');sheet.classList.toggle('is-expanded',expanded);};
   const gestureStart=e=>{
    if(e.target.closest('button,input,select,textarea,.consumption-suggestions'))return;
    dragStart=e.touches[0]?.clientY??0;dragStartedAt=performance.now();startHeight=sheet.getBoundingClientRect().height;
    if(!sheet.classList.contains('is-expanded'))restHeight=startHeight;
    dragging=true;dragMoved=false;
   };
   const gestureMove=e=>{
    if(!dragging)return;
    const y=e.touches[0]?.clientY??dragStart,delta=dragStart-y;
    if(Math.abs(delta)<10&&!dragMoved)return;
    e.preventDefault();
    const max=expandedHeight();
    // At the fully expanded limit, consume upward overscroll without touching
    // height or triggering WebKit's rubber-band/compositor repaint.
    if(delta>0&&startHeight>=max-2){return;}
    const next=Math.max(0,Math.min(max,startHeight+delta));
    if(Math.abs(next-startHeight)<1){return;}
    dragMoved=true;
    sheet.classList.add('is-dragging');
    sheet.style.setProperty('--sheet-drag-height',next+'px');
    sheet.style.setProperty('--sheet-drag-max-height',max+'px');
    sheet.style.setProperty('height',next+'px','important');
    sheet.style.setProperty('max-height',max+'px','important');
   };
   const gestureEnd=e=>{
    if(!dragging)return;dragging=false;
    const delta=dragStart-(e.changedTouches[0]?.clientY??dragStart);
    const current=sheet.getBoundingClientRect().height;
    if(!dragMoved||Math.abs(delta)<18){settleSheet(sheet.classList.contains('is-expanded'));return;}
    // Dismiss only after the finger has dragged the sheet almost entirely off screen.
    if(current<Math.max(55,restHeight*.18)){closeFoodSheet();return;}
    const midpoint=(restHeight+expandedHeight())/2;
    const elapsed=Math.max(1,performance.now()-dragStartedAt),speed=delta/elapsed;
    settleSheet(delta>18&&speed>.5?true:delta< -18&&speed<-.5?false:current>midpoint);
   };
   for(const target of [sheet]){
    target.addEventListener('touchstart',gestureStart,{passive:true});
    target.addEventListener('touchmove',gestureMove,{passive:false});
    target.addEventListener('touchend',gestureEnd,{passive:true});
    target.addEventListener('touchcancel',()=>{if(dragging){dragging=false;settleSheet(sheet.classList.contains('is-expanded'));}},{passive:true});
   }
   handle.addEventListener('click',()=>{if(!dragMoved)sheet.classList.toggle('is-expanded');});
   const controls=document.createElement('div');controls.className='consumption-secondary-actions';controls.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;width:100%';controls.append(addTrigger);if(removeAll.isConnected){removeAll.style.setProperty('margin','0 0 0 auto','important');removeAll.style.setProperty('align-self','center','important');removeAll.style.setProperty('position','static','important');removeAll.style.setProperty('text-align','right','important');removeAll.style.setProperty('white-space','nowrap','important');controls.append(removeAll);}foodsRoot.append(added,controls);updateAddState();
  }
  const progress=document.createElement('div');progress.className='consumption-energy-progress';
  progress.innerHTML='<div class="consumption-energy-values"><strong class="consumption-energy-ratio">'+playerText('A calcular…','Calculating…')+'</strong></div><div class="consumption-energy-track"><span class="consumption-energy-fill"></span></div><div class="consumption-macro-values"><span data-macro="protein"></span><span data-macro="carbs"></span><span data-macro="fat"></span></div>';
  panel.append(progress);
  let previewSeq=0,previewTimer;
  const updatePreview=async()=>{
   const seq=++previewSeq,option=data.options.find(x=>x.option_ref===select.value);
   if(!option)return;
   const extraFoods=additional.filter(x=>x.consumed&&x.grams>0);
   if(extraTiming){
    save.disabled=!extraFoods.length;
    progress.hidden=!extraFoods.length;
    if(!extraFoods.length)return;
   }
   const body={date:mealDate,meal:mealKey,event_id:eventId,option_ref:select.value,status:getConsumptionStatus()};
   if(consumedColor)body.consumed_color=consumedColor;
   if(timing)body.timing=timing;
   if(extraTiming)body.extra_timing=true;
   if(body.status==='partial'){
    body.edits=(option.foods||[]).map((food,i)=>({index:i,consumed:!!foodsRoot.querySelector('input[type=checkbox][data-index="'+i+'"]')?.checked,grams:Number(foodsRoot.querySelector('input[data-grams="'+i+'"]')?.value??food.grams)}));
    body.additional=additional.filter(x=>x.consumed&&x.grams>0).map(({id,grams})=>({id,grams}));
   }
   try{
    const result=await api('/api/v2/player/consumption-preview',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':playerCsrf},body:JSON.stringify(body)});
    if(seq!==previewSeq||!panel.isConnected)return;
    const actual=Number(result.nutrition?.kcal||0),planned=Number(result.planned?.kcal||0),pct=planned>0?actual/planned*100:0;
    progress.querySelector('.consumption-energy-fill').style.width=Math.min(100,Math.max(0,pct))+'%';
    progress.querySelector('.consumption-energy-ratio').textContent=extraTiming?Math.round(actual)+' kcal':Math.round(actual)+'/'+Math.round(planned)+' kcal';const fmt=v=>Math.round(Number(v||0));const nutrition=result.nutrition||{},target=result.planned||{};for(const [key,aliases,label] of [['protein',['protein','protein_g','proteins'],'P'],['carbs',['carbs','carbs_g','carbohydrates'],playerMacroAbbreviation('carbs_g')],['fat',['fat','fat_g','fats'],playerMacroAbbreviation('fat_g')]]){const read=obj=>aliases.map(k=>obj[k]).find(v=>v!==undefined);const node=progress.querySelector('[data-macro="'+key+'"]');node.textContent=extraTiming?fmt(read(nutrition))+'g '+label:fmt(read(nutrition))+'/'+fmt(read(target))+'g '+label;}
    
   }catch(e){if(seq===previewSeq)progress.querySelector('.consumption-energy-ratio').textContent=playerText('Não foi possível calcular as kcal','Could not calculate kcal');console.warn('Consumption preview failed',e);}
  };
  const queuePreview=()=>{clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,280);};
  foodsRoot.addEventListener('input',queuePreview);foodsRoot.addEventListener('change',queuePreview);
  let initial=true;
  select.onchange=()=>{initial=false;additional.length=0;redraw();queuePreview();};redraw();queuePreview();
  const getConsumptionStatus=()=>{
   const option=data.options.find(x=>x.option_ref===select.value);
   const foods=option?.foods||[];
   const active=foods.map((food,i)=>({food,i})).filter(x=>x.food.kind!=='supplement');
   const checked=active.filter(({i})=>foodsRoot.querySelector('input[type=checkbox][data-index="'+i+'"]')?.checked);
   if(!checked.length&&!additional.some(x=>x.consumed&&x.grams>0))return 'none';
   const allPlanned=active.every(({food,i})=>{
    const input=foodsRoot.querySelector('input[type=checkbox][data-index="'+i+'"]');
    const parent=food.alternative_to??i;
    const plannedIndex=foods.findIndex((candidate,j)=>(candidate.alternative_to??j)===parent&&candidate.kind!=='supplement');
    const expected=i===plannedIndex;
    return !!input?.checked===expected&&(!input?.checked||Number(foodsRoot.querySelector('input[data-grams="'+i+'"]')?.value)===Number(food.grams??0));
   });
   return allPlanned&&!additional.some(x=>x.consumed&&x.grams>0)?'all':'partial';
  };
  const save=document.createElement('button');save.type='button';save.textContent=playerText('Guardar','Save');if(extraTiming)save.disabled=true;
  const feedback=document.createElement('p');feedback.className='consumption-save-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');panel.append(feedback);
  save.onclick=async()=>{if(!panel.isConnected)return;const option=data.options.find(x=>x.option_ref===select.value);const body={date:mealDate,meal:mealKey,event_id:eventId,option_ref:select.value,status:getConsumptionStatus()};
   if(consumedColor)body.consumed_color=consumedColor;
   if(timing)body.timing=timing;
   if(extraTiming)body.extra_timing=true;
   if(body.status==='partial')body.edits=(option.foods||[]).map((food,i)=>({index:i,consumed:!!foodsRoot.querySelector('input[type=checkbox][data-index="'+i+'"]')?.checked,grams:Number(foodsRoot.querySelector('input[data-grams="'+i+'"]')?.value??food.grams)}));
   if(body.status==='partial')body.additional=additional.filter(x=>x.consumed&&x.grams>0).map(({id,grams})=>({id,grams}));
   if(extraTiming&&(!Array.isArray(body.additional)||!body.additional.length)){feedback.textContent=playerText('Adiciona pelo menos um alimento da biblioteca.','Add at least one food from the library.');return;}
   try{save.disabled=true;save.textContent=playerText('A guardar…','Saving…');feedback.textContent=playerText('A guardar o consumo…','Saving consumption…');await api('/api/v2/player/consumption-records',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':playerCsrf},body:JSON.stringify(body)});feedback.textContent=playerText('Registo guardado.','Record saved.');if(sheetBody&&consumptionSheet)consumptionSheet.saved=true;panel.remove();await refreshAfterConsumption(host,mealKey,eventId);}catch(e){feedback.textContent=playerText('Não foi possível guardar: ','Could not save: ')+(e.message||playerText('erro desconhecido','unknown error'));error(e);save.disabled=false;save.textContent=playerText('Tentar guardar novamente','Try saving again');}
  };
  save.className='consumption-save';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='consumption-cancel consumption-cancel-main';cancel.textContent=playerText('Cancelar','Cancel');cancel.onclick=()=>{if(typeof onCancel==='function')onCancel();else panel.remove();};const actions=document.createElement('div');actions.className='consumption-actions';if(consumedColor){const back=document.createElement('button');back.type='button';back.className='consumption-cancel';back.textContent=playerText('Voltar','Back');back.onclick=()=>openAlternativeColorPicker(host,mealDate,mealKey,eventId);actions.append(back);}if(!consumedColor)actions.append(cancel);actions.append(save);if(consumedColor)actions.classList.add('consumption-actions-two');panel.append(actions);
 }catch(e){panel.remove();error(e);}
}

let consumptionPilotAllowed=null;
// Início heading: the selected day (or week) as a large title. Semana opens from the Semana widget (with a back button).
// Day the Semana widget was opened from: Semana shows a back button to it.
let weekReturnDay=null;
function updateOverviewHeading(){
 const locale=playerDateLocale(),todayKey=iso(new Date()),dayKey=iso(day),isWeek=overviewMode==="week";
 const mon=monday(day),sun=new Date(mon);sun.setDate(mon.getDate()+6);
 const shift=n=>{const x=new Date();x.setDate(x.getDate()+n);return iso(x);};
 const capital=text=>text.replace(/^./,letter=>letter.toLocaleUpperCase(locale));
 let kicker,title;
 // Plain date, no "de" and no "-feira": "Segunda, 23 novembro 2026" / "Monday, 23 November 2026".
 const monthYear=d=>d.toLocaleDateString(locale,{month:"long"})+" "+d.getFullYear();
 if(isWeek){
  kicker=mon.getMonth()===sun.getMonth()?mon.getDate()+" – "+sun.getDate()+" "+monthYear(sun)
   :mon.getDate()+" "+mon.toLocaleDateString(locale,{month:"long"})+" – "+sun.getDate()+" "+monthYear(sun);
  title=playerText("Semana","Week");
 }else{
  kicker=capital(day.toLocaleDateString(locale,{weekday:"long"}).replace(/-feira$/,""))+", "+day.getDate()+" "+monthYear(day);
  title=dayKey===todayKey?playerText("Hoje","Today"):dayKey===shift(-1)?playerText("Ontem","Yesterday"):dayKey===shift(1)?playerText("Amanhã","Tomorrow"):capital(day.toLocaleDateString(locale,{weekday:"long"}));
 }
 $("overview-kicker").textContent=kicker;$("overview-title").textContent=title;
 if(!isWeek)weekReturnDay=null;
 const back=$("overview-back");back.hidden=!isWeek; // Semana is only reached from the widget: always offer the way back.
 back.setAttribute("aria-label",playerText("Voltar ao dia","Back to the day"));
 const today=$("overview-today");today.textContent=playerText("Hoje","Today");
 today.hidden=isWeek?iso(monday(new Date()))===iso(mon):dayKey===todayKey;
}
async function overview(){
 cancelOverviewDaySkeletonTimer();
 closeWeightDetail();updateOverviewHeading();
 const requestId=++overviewRequestId,epoch=playerSessionEpoch;
 const d=iso(day),mon=monday(day),end=new Date(mon);end.setDate(mon.getDate()+6);
 const weekKey=iso(mon),snapshot=reusableOverviewSnapshot(weekKey);
 // Start weight reading alongside the calendar, not after all its requests.
 if(overviewMode==="day"&&d<=iso(new Date()))
  cachedOverviewRead("/api/v2/player/weight?date="+d).catch(()=>{});
 let r,weekMenus,weekWeights;
 if(snapshot){
  ({r,weekMenus,weekWeights}=snapshot);
  // Reuse the week without forcing a loader on every day tap or swipe.
  // The new day is painted as soon as its consumption read completes.
  setOverviewLoading(false);
 }else{
  // Do not flash skeletons for requests completed within a normal tap.
  if(overviewMode==="day")scheduleOverviewDaySkeleton(requestId,epoch,mon,d);
  else setOverviewLoading(true,mon,d);
  try{
   [r,weekMenus,weekWeights]=await Promise.all([
    cachedOverviewRead("/api/v2/player/calendar?start="+weekKey+"&end="+iso(end)),
    cachedOverviewRead("/api/v2/player/menus?start="+weekKey+"&end="+iso(end)),
    cachedOverviewRead("/api/v2/player/reference-weights?start="+weekKey+"&end="+iso(end))
   ]);
  }catch(err){
   if(requestId!==overviewRequestId||epoch!==playerSessionEpoch)return;
   setOverviewLoading(false);
   pendingDailySwipeDirection=0;
   const target=overviewMode==="week"?$("weekly-view"):$("day-details");
   target.hidden=false;target.replaceChildren();
   const note=document.createElement("p");note.className="hint";note.textContent=playerText("Não foi possível carregar esta semana. Tenta novamente.","Could not load this week. Please try again.");
   target.append(note);
   throw err;
  }
  if(requestId!==overviewRequestId||epoch!==playerSessionEpoch)return;
  cancelOverviewDaySkeletonTimer();
  overviewSnapshot={weekKey,time:Date.now(),r,weekMenus,weekWeights};
 }
 if(requestId!==overviewRequestId||epoch!==playerSessionEpoch)return;
 // Day loading remains active while consumption records are fetched.
 // Week has no corresponding wait.
 if(overviewMode==="week")setOverviewLoading(false);
 loadPlayerPostMatch().catch(()=>{});
 if(!snapshot){
 // Avoid reusing a previous week\u0027s scenario if the preview is unavailable.
 effectiveScenarioColorsByDay={};scenarioNutritionPreviewByDay={};scenarioNutritionParityByDay={};
 // Shadow-read the simulation independently; never blocks rendering or changes UI.
 // An explicit future activation must separately enable POST_MATCH_DISPLAY_ENABLED.
 cachedOverviewRead("/api/v2/player/effective-nutrition-preview?start="+iso(mon)+"&end="+iso(end))
  .then(preview=>{
   if(!preview?.preview_only||preview.scenario_automation_enabled!==false||!preview.scenario_data_available)return;
   if(epoch!==playerSessionEpoch||iso(monday(day))!==iso(mon))return;
   for(const entry of preview.days||[]){
    if(!entry.date||!entry.simulated_colors||!entry.colors)continue;
    effectiveScenarioColorsByDay[entry.date]=entry.simulated_colors;
    const current=previewNutritionForColors(entry,entry.colors,plans,periMeals,meals);
    const simulated=previewNutritionForColors(entry,entry.simulated_colors,plans,periMeals,meals);
    const currentParity=nutritionPreviewParity(current,entry.current_nutrition);
    const simulatedParity=nutritionPreviewParity(simulated,entry.simulated_nutrition);
    scenarioNutritionParityByDay[entry.date]={current:currentParity,simulated:simulatedParity,
     verified:currentParity?.matches===true&&simulatedParity?.matches===true};
    if(current&&simulated){
     scenarioNutritionPreviewByDay[entry.date]={current,simulated,
      delta:Object.fromEntries(SCENARIO_NUTRITION_KEYS.map(key=>[key,simulated[key]-current[key]]))};
    }
   }
  }).catch(()=>{});

 }
 publishedMealChoices=Object.fromEntries((r.meal_option_selections||[]).filter(choice=>!choice.event_id).map(choice=>[choice.meal_date+"|"+choice.meal_key,choice]));
 model=r.classifications;meals=r.meals;canonicalMealColorsByDay=r.effective_colors||{};dayColorOverrides=Object.fromEntries((r.meal_color_overrides||[]).map(e=>[e.meal_date+"|"+e.meal,e.color]));periMeals=r.peri_meals||[];supplementsByDay=r.supplements_by_day||{};calendarEvents=(r.events||[]).concat((r.matches||[]).map(m=>({id:m.id,event_date:m.match_date,kind:"match",session:!m.match_time||m.match_time<"15:00"?"morning":"afternoon",title:"Jogo"})));
 const isWeek=overviewMode==="week";
 lastOverviewPresentation={weekKey,dateKey:d,mode:overviewMode};
 $("week-strip").hidden=isWeek;$("date-title").hidden=isWeek;
 $("day-details").hidden=isWeek||!$("overview-loading").hidden;$("weekly-view").hidden=!isWeek;
 if(isWeek){pendingDailySwipeDirection=0;renderWeekly(mon,r,weekMenus.menus||[],weekWeights.weights_by_date||{});return;}
 const dailyReferenceRaw=weekWeights.weights_by_date?.[d]?.weight_kg;
 const dailyReferenceWeight=dailyReferenceRaw==null?NaN:Number(dailyReferenceRaw);
 $("date-title").textContent=day.toLocaleDateString(playerDateLocale(),{weekday:"short",day:"numeric",month:"numeric",year:"numeric"});
 const strip=$("week-strip");strip.replaceChildren();
 // Shared full-view swipe also covers the calendar, including during loading.
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);
  const dayInfo=r.days.find(x=>x.date===iso(dt));
  const button=document.createElement("button");button.type="button";button.className="week-day"+(iso(dt)===d?" selected":"")+(iso(dt)===iso(new Date())?" today":"");
  button.setAttribute("aria-pressed",String(iso(dt)===d));
  button.setAttribute("aria-label",dt.toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"})+(dayInfo?.classification?" · "+playerClassification(dayInfo.classification):""));
  for(const [cls,text] of [["weekday",dt.toLocaleDateString(playerDateLocale(),{weekday:"short"}).replace(".","").replace(/^./,letter=>letter.toLocaleUpperCase(playerDateLocale()))],["day-number",String(dt.getDate())],["day-classification",playerClassification(dayInfo?.classification||"Geral")]]){
   const span=document.createElement("span");span.className=cls;span.textContent=text;button.append(span);
  }
  button.onclick=()=>{pendingDailySwipeDirection=0;day=dt;overview().catch(error);};strip.append(button);
 }
 animateCalendarSelection(strip,d);

 let consumptionEnabled=false,consumptionRecords=[],consumptionLoadError=false;
 // Consumption is available to all linked players; do not cache a transient 403
 // as a permanent pilot restriction. Retry short-lived request failures.
 for(let attempt=0;attempt<3;attempt++){
  try{
   const consumption=await api('/api/v2/player/consumption-records?start='+d+'&end='+d);
   consumptionEnabled=true;consumptionRecords=consumption.records||[];break;
  }catch(e){
   if(e.status===401)throw e;
   if(attempt===2){consumptionLoadError=true;console.warn('Registos de consumo temporariamente indisponíveis',e);}
   else await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
  }
 }
 if(requestId!==overviewRequestId||epoch!==playerSessionEpoch)return;
 const root=$("day-details");root.replaceChildren();
 if(consumptionLoadError){
  const notice=document.createElement("p");
  notice.setAttribute("role","status");
  notice.textContent=playerText("Não foi possível carregar os consumos. Atualiza a página para tentar novamente.","Could not load consumption records. Refresh the page to try again.");
  notice.style.cssText="color:var(--text-secondary,#a1a1aa);font-size:13px;padding:8px 12px;";
  root.append(notice);
 }

 const entry=r.days.find(x=>x.date===d);
 if(!entry?.classification&&!calendarEvents.some(e=>e.event_date===d)&&!meals.some(meal=>assignedColor(d,meal,entry?.classification))&&!(supplementsByDay[d]||[]).length&&!periMeals.some(item=>item.event_date===d)){
  renderWeightCard(root,d,r).catch(()=>{});
  const note=document.createElement("p");note.textContent=playerText("Sem programação definida para este dia.","No schedule set for this day.");root.append(note);
  root.hidden=false;setOverviewLoading(false);animateDailySwipeEntry();return;
 }

 const dailyTotal=dayNutritionTotal(entry||{date:d,classification:null});
 const assigned=meals.filter(meal=>assignedColor(d,meal,entry?.classification)).length+periMeals.filter(x=>x.event_date===d).length;
 const complete=!!dailyTotal;
 const total=dailyTotal;

 if(assigned){
  const summary=document.createElement("section");summary.className="daily-nutrition nutrition-donut-summary";
  if(complete){
   const hero=document.createElement("div");hero.className="nutrition-hero";
   const energy=document.createElement("div");energy.className="nutrition-energy";
   const label=document.createElement("small");label.textContent="kcal";
   const value=document.createElement("strong");value.textContent=fmtKcal(total.kcal);
   energy.append(label,value);
   const weight=dailyReferenceWeight,hasWeight=Number.isFinite(weight)&&weight>0;
   if(hasWeight){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmtKcal(total.kcal/weight)+" kcal/kg";energy.append(ratio);}
   hero.append(energy);summary.append(hero);
   const actual={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
   if(consumptionEnabled){
    for(const record of consumptionRecords)for(const key of Object.keys(actual)){const n=Number(record.nutrition?.[key]);if(Number.isFinite(n)&&n>=0)actual[key]+=n;}
   }

   const macros=document.createElement("div");macros.className="nutrition-macro-row";
   for(const [key,title,cls] of [["protein_g",playerMacroLabel("protein_g"),"protein"],["carbs_g",playerMacroLabel("carbs_g"),"carbs"],["fat_g",playerMacroLabel("fat_g"),"fat"]]){
    const cell=document.createElement("div");cell.className="nutrition-macro "+cls;
    const name=document.createElement("small");name.textContent=title;
    const grams=document.createElement("strong");grams.textContent=(consumptionEnabled?fmt(actual[key],0)+" / ":"")+fmt(total[key],0)+" g";
    cell.append(name,grams);
    if(hasWeight){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(total[key]/weight,1)+" g/kg";cell.append(ratio);}
    macros.append(cell);
   }
   summary.append(macros);
   const weekDays=[];
   for(let offset=0;offset<7;offset++){
    const date=new Date(mon);date.setDate(mon.getDate()+offset);const key=iso(date);
    const dayModel=r.days?.find(x=>x.date===key);
    const daily=dayNutritionTotal(dayModel||{date:key,classification:null});
    weekDays.push({date,key,total:daily,found:!!daily});
   }
   // The comparison uses the same completed totals as the day/week cards.
   const fullWeek=weekDays.length===7&&weekDays.every(x=>x.total&&Number.isFinite(x.total.kcal));
   const mean=fullWeek?weekDays.reduce((n,x)=>n+x.total.kcal,0)/7:null;
   const yesterday=new Date(d+"T12:00:00");yesterday.setDate(yesterday.getDate()-1);
   let previous=weekDays.find(x=>x.key===iso(yesterday)&&x.total?.kcal>0);
   const change=reference=>reference>0?100*(total.kcal-reference)/reference:null;
   const deviationMean=change(mean);let deviationPrevious=change(previous?.total.kcal);
   const visual=document.createElement("div");visual.className="nutrition-comparison";
   const heading=document.createElement("h3");heading.className="nutrition-comparison-heading";heading.textContent=playerText("Energia (kcal)","Energy (kcal)");visual.append(heading);
   const gauge=document.createElement("div");gauge.className="nutrition-comparison-gauge";
   const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 160 160");svg.setAttribute("aria-hidden","true");
   const ring=(radius,delta,pos,neg)=>{
    const track=document.createElementNS(svg.namespaceURI,"circle");
    for(const [key,value] of [["cx",80],["cy",80],["r",radius],["stroke-width",11],["stroke","#484b52"],["fill","none"]])track.setAttribute(key,String(value));
    svg.append(track);if(delta===null||Math.abs(delta)<.05)return;
    const magnitude=Math.min(180,Math.abs(delta)/30*180),direction=delta>=0?1:-1;
    const point=angle=>{const t=(angle-90)*Math.PI/180;return [80+radius*Math.cos(t),80+radius*Math.sin(t)]};
    const [x,y]=point(0),[endX,endY]=point(direction*magnitude);
    const path=document.createElementNS(svg.namespaceURI,"path");
    path.setAttribute("d",`M ${x} ${y} A ${radius} ${radius} 0 0 ${direction>0?1:0} ${endX} ${endY}`);
    path.setAttribute("stroke",delta>0?pos:neg);path.setAttribute("fill","none");
    path.setAttribute("stroke-width","11");path.setAttribute("stroke-linecap","round");svg.append(path);
   };
   const paintRings=()=>{svg.replaceChildren();ring(66,deviationMean,"#66d7a4","#ff996e");ring(52,deviationPrevious,"#c4e5dc","#ffb69b");};
   paintRings();
   gauge.append(svg);
   const center=document.createElement("div");center.className="nutrition-comparison-center";
   const number=document.createElement("strong");number.textContent=fmtKcal(total.kcal);
   center.append(number);
   if(hasWeight){const per=document.createElement("small");per.className="per-kg";per.textContent=fmtKcal(total.kcal/weight)+" /kg";center.append(per);}
   gauge.append(center);visual.append(gauge);
   if(consumptionEnabled){
    // The pilot is permission-gated server-side: only Jorge receives consumption data.
    visual.classList.add("has-consumption-ring","consumption-concentric");
    const rings=document.createElement("div");rings.className="consumption-concentric-rings";
    const chart=document.createElementNS("http://www.w3.org/2000/svg","svg");
    chart.setAttribute("viewBox","0 0 200 200");chart.setAttribute("role","img");
    chart.setAttribute("aria-label",playerText("Progresso de calorias, proteína, hidratos e gordura consumidos face ao planeado","Progress of calories, protein, carbohydrates and fat consumed compared with planned"));
    for(const [key,radius,color] of [["kcal",88,"#72ebbd"],["protein_g",66,"#45baff"],["carbs_g",44,"#ff9d70"],["fat_g",22,"#f4d778"]]){
     const circumference=2*Math.PI*radius;
     const ratio=total[key]>0?Math.max(0,Math.min(1,actual[key]/total[key])):0;
     for(const [stroke,progress] of [["#34363d",false],[color,true]]){
      const circle=document.createElementNS(chart.namespaceURI,"circle");
      for(const [attr,val] of [["cx",100],["cy",100],["r",radius],["fill","none"],["stroke",stroke],["stroke-width",13],["stroke-linecap","round"],["transform","rotate(-90 100 100)"],["stroke-dasharray",circumference],["stroke-dashoffset",progress?circumference*(1-ratio):0]])circle.setAttribute(attr,String(val));
      chart.append(circle);
     }
    }
    rings.append(chart);
    const figures=document.createElement("div");figures.className="consumption-concentric-figures";
    const energyRow=document.createElement("div");energyRow.className="consumption-concentric-energy-row";
    const energyLine=document.createElement("div");energyLine.className="consumption-concentric-energy";
    const current=document.createElement("strong");
    const planned=document.createElement("span");
    const suffix=document.createElement("span");suffix.className="consumption-concentric-unit";
    const energyLabel=document.createElement("span");energyLabel.className="consumption-concentric-energy-label";energyLabel.textContent="kcal";energyRow.append(energyLabel);energyLine.append(current,planned,suffix);
    const mode=document.createElement("div");mode.className="consumption-concentric-unit-switch";mode.setAttribute("role","group");mode.setAttribute("aria-label",playerText("Unidades nutricionais","Nutrition units"));
    const gramsButton=document.createElement("button");gramsButton.type="button";gramsButton.textContent="g";
    const kgButton=document.createElement("button");kgButton.type="button";kgButton.textContent="g/kg";
    const unitArrow=document.createElement("button");unitArrow.type="button";unitArrow.className="consumption-concentric-unit-arrow";unitArrow.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M20.5 5.5h-11C5.787 5.5 3 8.185 3 12m.5 6.5h11c3.713 0 6.5-2.685 6.5-6.5"/><path d="M18.5 3S21 4.841 21 5.5S18.5 8 18.5 8m-13 8S3 17.841 3 18.5S5.5 21 5.5 21"/></g></svg>';unitArrow.setAttribute("aria-label",playerText("Mostrar valores por kg","Show values per kg"));mode.append(unitArrow);energyRow.append(energyLine);figures.append(energyRow);
    const details=document.createElement("div");details.className="consumption-concentric-macros";
    const macroValues=[];
    for(const [key,title,cls] of [["protein_g",playerMacroLabel("protein_g"),"protein"],["carbs_g",playerMacroLabel("carbs_g"),"carbs"],["fat_g",playerMacroLabel("fat_g"),"fat"]]){
     const line=document.createElement("div");line.className="consumption-concentric-macro "+cls;
     const name=document.createElement("span");name.textContent=title;
     const amount=document.createElement("strong");amount.className="consumption-concentric-amount";
     const consumedValue=document.createElement("span");consumedValue.className="consumption-concentric-actual";
     const prescribedValue=document.createElement("span");prescribedValue.className="consumption-concentric-prescribed";
     const grams=document.createElement("span");grams.className="consumption-concentric-unit";
     amount.append(consumedValue,prescribedValue,grams);
     line.append(name,amount);details.append(line);
     macroValues.push({key,consumedValue,prescribedValue,grams});
    }
    const updateUnits=(perKg)=>{
     unitArrow.setAttribute("aria-label",perKg?playerText("Mostrar valores em gramas","Show values in grams"):playerText("Mostrar valores por kg","Show values per kg"));unitArrow.title=perKg?playerText("Voltar a g e kcal","Back to g and kcal"):playerText("Ver g/kg e kcal/kg","View g/kg and kcal/kg");
     gramsButton.setAttribute("aria-pressed",String(!perKg));kgButton.setAttribute("aria-pressed",String(perKg));
     const divisor=perKg&&hasWeight?weight:1;
     current.textContent=fmtKcal(actual.kcal/divisor);
     planned.textContent=" / "+fmtKcal(total.kcal/divisor);
     suffix.textContent="";energyLabel.textContent=perKg?"kcal/kg":"kcal";
     for(const item of macroValues){
      item.consumedValue.textContent=fmt(actual[item.key]/divisor,perKg?1:0);
      item.prescribedValue.textContent=" / "+fmt(total[item.key]/divisor,perKg?1:0);
      item.grams.textContent=perKg?" g/kg":" g";
     }
    };
    let showingPerKg=false;
    unitArrow.addEventListener("click",e=>{e.stopPropagation();if(!hasWeight)return;showingPerKg=!showingPerKg;updateUnits(showingPerKg);});
    unitArrow.disabled=!hasWeight;
    updateUnits(false);
    const trends=document.createElement("div");trends.className="consumption-concentric-trends";
    for(const [name,delta,cls] of [[playerText("ontem","yesterday"),deviationPrevious,"prior"],[playerText("média","average"),deviationMean,"mean"]]){
     const pill=document.createElement("div");pill.className="consumption-concentric-trend "+cls;
     const caption=document.createElement("span");caption.textContent=name;
     const value=document.createElement("strong");value.textContent=delta===null?"—":(Math.round(delta)>0?"+":"")+fmt(delta,0)+"%";
     if(delta!==null)pill.classList.add(delta>0?"above":delta<0?"below":"neutral");
     pill.append(value,caption);if(cls==="mean"){const sep=document.createElement("span");sep.className="consumption-concentric-trend-separator";sep.textContent="|";trends.append(sep);}trends.append(pill);
    }
    figures.append(trends,details);
    visual.append(rings,figures,mode);
   }
   const comparisons=document.createElement("div");comparisons.className="nutrition-comparison-stats";
   for(const [name,delta,cls] of [[playerText("vs média semanal","vs weekly average"),deviationMean,"mean"],[playerText("vs dia anterior","vs previous day"),deviationPrevious,"prior"]]){
    const stat=document.createElement("div");stat.className="nutrition-comparison-stat "+cls;
    const figure=document.createElement("strong");figure.textContent=delta===null?"—":(Math.round(delta)>0?"+":"")+fmt(delta,0)+"%";
    if(delta!==null)stat.classList.add(delta>0?"above":delta<0?"below":"neutral");
    const label=document.createElement("small");label.textContent=name;
    stat.append(figure,label);comparisons.append(stat);
   }
   visual.append(comparisons);
   const compactMacros=document.createElement("div");compactMacros.className="nutrition-comparison-macros";
   for(const [key,title,cls] of [["protein_g",playerMacroLabel("protein_g"),"protein"],["carbs_g",playerMacroLabel("carbs_g"),"carbs"],["fat_g",playerMacroLabel("fat_g"),"fat"]]){
    const cell=document.createElement("div");cell.className="nutrition-comparison-macro "+cls;
    const label=document.createElement("small");label.textContent=title;
    const value=document.createElement("strong");value.textContent=(consumptionEnabled?fmt(actual[key],0)+" / ":"")+fmt(total[key],0)+" g";
    cell.append(label,value);
    if(hasWeight){const per=document.createElement("small");per.className="per-kg";per.textContent=fmt(total[key]/weight,1)+" g/kg";cell.append(per);}
    compactMacros.append(cell);
   }
   visual.append(compactMacros);summary.append(visual);
   // A Monday compares with the preceding Sunday, even though it belongs to another weekly calendar response.
   // Fetch in the background to avoid delaying the daily view.
   if(!previous&&yesterday.getDay()===0){
    const priorMon=monday(yesterday),priorSunday=iso(yesterday);
    cachedOverviewRead("/api/v2/player/calendar?start="+iso(priorMon)+"&end="+priorSunday).then(previousCalendar=>{
     if(requestId!==overviewRequestId||epoch!==playerSessionEpoch||!summary.isConnected)return;
     const last=previousCalendar?.days?.find(x=>x.date===priorSunday);
     if(!last)return;
     const overrides=Object.fromEntries((previousCalendar.meal_color_overrides||[]).map(x=>[x.meal_date+"|"+x.meal,x.color]));
     const priorSelections=Object.fromEntries((previousCalendar.meal_option_selections||[]).filter(x=>!x.event_id).map(x=>[x.meal_date+"|"+x.meal_key,x]));
     const sum={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let assignedCount=0;
     for(const meal of previousCalendar.meals||[]){
      const own=overrides[priorSunday+"|"+meal];
      const color=own==="none"?null:own||(previousCalendar.classifications||[]).find(x=>x.name===(last.classification||"Geral"))?.meals?.[meal];
      if(!color)continue;
      const portion=average(datedPlanOptions(priorSunday,meal,color,priorSelections));
      if(!portion)return;
      for(const nutrient in sum)sum[nutrient]+=portion[nutrient];
      assignedCount++;
     }
     for(const peri of (previousCalendar.peri_meals||[]).filter(x=>x.event_date===priorSunday)){
      const portion=average(peri.options||[]);
      if(!portion)return;
      for(const nutrient in sum)sum[nutrient]+=portion[nutrient];
      assignedCount++;
     }
     if(!assignedCount||sum.kcal<=0)return;
     previous={key:priorSunday,total:sum,found:true};
     deviationPrevious=change(sum.kcal);
     const stat=comparisons.querySelector(".nutrition-comparison-stat.prior");
     const number=stat?.querySelector("strong");
     if(stat&&number){
      stat.classList.remove("above","below","neutral");
      stat.classList.add(deviationPrevious>0?"above":deviationPrevious<0?"below":"neutral");
      number.textContent=(Math.round(deviationPrevious)>0?"+":"")+fmt(deviationPrevious,0)+"%";
     }
     paintRings();
     const pill=visual.querySelector(".consumption-concentric-trend.prior");
     if(pill){const value=pill.querySelector("strong");pill.classList.remove("above","below","neutral");pill.classList.add(deviationPrevious>0?"above":deviationPrevious<0?"below":"neutral");if(value)value.textContent=(Math.round(deviationPrevious)>0?"+":"")+fmt(deviationPrevious,0)+"%";}
    }).catch(()=>{});
   }
  }else{const note=document.createElement("p");note.className="hint";note.textContent=playerText("Resumo incompleto: existem refeições sem plano publicado.","Incomplete summary: some meals have no published plan.");summary.append(note);}
  root.append(summary);
 }
 renderWeightCard(root,d,r).catch(()=>{});
 if(requestId!==overviewRequestId||epoch!==playerSessionEpoch)return;
 const planHeading=document.createElement("div");planHeading.className="day-section-heading day-plan-heading";
 const planTitle=document.createElement("h3");planTitle.textContent=playerText("Plano do dia","Day plan");planHeading.append(planTitle);
 if(consumptionEnabled&&d<=iso(new Date())){
  const progress=document.createElement("span");progress.className="day-plan-progress";planHeading.append(progress);
  const planned=plannedRecordItemsForDay(r,d);
  const show=weighed=>{const {done,total}=dayRecordProgress(planned,consumptionRecords,d,weighed);progress.textContent=done+playerText(" de "," of ")+total+playerText(" registos"," records");};
  show(false);
  cachedOverviewRead("/api/v2/player/weight?date="+d).then(data=>{if(planHeading.isConnected)show(!!data?.entries?.some(x=>x.weigh_date===d));}).catch(()=>{});
 }
 root.append(planHeading);
 for(const meal of meals){
  if(meal==="lunch")appendDailyEvents(root,d,"morning",consumptionEnabled,consumptionRecords);
  if(meal==="dinner")appendDailyEvents(root,d,"afternoon",consumptionEnabled,consumptionRecords);
  const color=assignedColor(d,meal,entry?.classification),menu=(meal==="lunch"||meal==="dinner")?(weekMenus.menus||[]).find(x=>x.menu_date===d&&x.meal===meal):null;
  if(!color&&!menu)continue;
  const section=document.createElement("details");section.className="meal daily-meal"+(color?" tone-"+color:"");
  const head=document.createElement("summary");head.className="daily-meal-head tm-day-header";const title=document.createElement("strong");title.textContent=names[meal];head.append(title);decorateLabel(head,meal);
  if(color){const indicator=document.createElement("span");indicator.className="daily-meal-indicator "+color;indicator.setAttribute("aria-label",colorNames[color]||color);head.append(indicator);}
  if(consumptionEnabled&&consumptionRecords.some(record=>record.meal_key===meal&&record.meal_date===d&&!record.event_id)){
   const badge=document.createElement('span');badge.className='meal-registered-badge meal-registered-meal-badge';
   registeredMark(badge,playerText('Refeição registada','Meal recorded'));
   head.append(badge);
  }
  section.append(head);
  const options=color?datedPlanOptions(d,meal,color):[];
  if(color||menu){
   const avg=average(options);
   if(avg){const p=document.createElement("span");p.className="meal-average meal-average-inline";p.append(nutrition(avg));head.append(p);}
   if(menu){
    const p=document.createElement("div");p.className="menu-line meal-menu-card";
    const name=document.createElement("span");name.className="daily-meal-menu-name";name.textContent=playerMenuCategoryLabel(menu);if(menu.kind==="text")name.classList.add("menu-free-text-value");
    p.append(name);section.append(p);
    if((meal==="lunch"||meal==="dinner")&&menu.kind==="dish"){
     p.classList.add("meal-menu-link");
     p.setAttribute("role","button");p.tabIndex=0;
     p.setAttribute("aria-label",playerText("Ver ","View ")+names[meal]+playerText(" nos Menus de "," in Menus for ")+new Date(d+"T12:00:00").toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"}));
     p.addEventListener("click",()=>{openDailyMealInMenus(d,meal).catch(error);});
     p.addEventListener("keydown",event=>{
      if(event.key==="Enter"||event.key===" "){event.preventDefault();p.click();}
     });
     attachDailyDishPhoto(section,p,menu,epoch,requestId);
    }
   }
   if(color&&!options.length){const p=document.createElement("p");p.className="hint";p.textContent=playerText("Plano ainda não publicado.","Plan not yet published.");section.append(p);}
   const showOptionPortions=!!(color&&(meal==="lunch"||meal==="dinner")&&me?.visual_portions_enabled&&window.tmVisualPortions);
   const addOptionPortions=(card,option)=>{
    if(!showOptionPortions)return;
    window.tmVisualPortions.appendAction({
     card,date:d,mealTitle:names[meal],color,meal,option,
     index:visualPortionsByColor,refresh:()=>api("/api/v2/player/visual-portions")
    });
   };
   if(options.length===1){
    const single=options[0],body=document.createElement("div");body.className="single-meal-option";
    appendMealItems(body,single.items);
    addOptionPortions(body,single);
    section.append(body);
   }else options.forEach((o,i)=>{
    const card=optionEl(o,i);
    card.classList.add("player-meal-option-subcard");
    // Append after macros, foods and notes. Native <details> conceals the
    // action until *this* option opens, while the summary remains unchanged.
    addOptionPortions(card,o);
    section.append(card);
   });
  }
  if(consumptionEnabled&&color){
   const previous=consumptionRecords.find(x=>x.meal_key===meal&&x.meal_date===d&&!x.event_id);
   const cards=options.length===1?[section.querySelector('.single-meal-option')]:Array.from(section.querySelectorAll('.player-meal-option-subcard'));
   if(previous){
    const otherColor=!!(previous.prescription?.color&&previous.prescription.color!==color);
    const optionIndex=otherColor?-1:options.findIndex(option=>option.option_ref===previous.option_ref);
    const optionCard=optionIndex>=0?cards[optionIndex]:null;
    const target=optionCard?.tagName==='DETAILS'?(optionCard.querySelector('.option-body')||optionCard):(optionCard||section);
    const tags=makeRecordedConsumptionTags({host:target,date:d,meal,eventId:'',optionIndex:optionIndex>=0?optionIndex:null,consumedColor:otherColor?previous.prescription.color:null,description:playerText('consumo de ','consumption of ')+names[meal]});
    if(optionCard&&options.length===1)target.prepend(tags);else target.append(tags);
    if(optionCard?.tagName==='DETAILS'){
     // The check sits right after «Opção X», not floating in the middle of the card.
     const summaryNumber=optionCard.querySelector('summary .plan-option-label>small');
     if(summaryNumber){const closedBadge=document.createElement('span');closedBadge.className='meal-registered-badge meal-registered-badge-closed';registeredMark(closedBadge,playerText('Opção registada','Option recorded'));summaryNumber.append(closedBadge);}
    }
   }
   cards.forEach((card,i)=>{
    if(!card)return;
    const target=card.tagName==='DETAILS'?(card.querySelector('.option-body')||card):card;
    const isRecordedOption=!!previous&&previous.prescription?.color===color&&previous.option_ref===options[i]?.option_ref;
    const actions=document.createElement('div');actions.className='consumption-actions consumption-actions--pending consumption-quick-actions';
    const quick=document.createElement('button');quick.type='button';quick.className='consumption-quick-confirm';
    consumptionActionLabel(quick,'CheckmarkCircle02Icon',isRecordedOption&&previous.status==='all'?playerText(' Consumido',' Consumed'):playerText(' Cumpri',' Done'));quick.classList.toggle('is-consumed',isRecordedOption&&previous.status==='all');
    const edit=document.createElement('button');edit.type='button';edit.className='consumption-quick-edit';edit.textContent=playerText('Editar consumo','Edit consumption');
    const feedback=document.createElement('p');feedback.className='consumption-feedback consumption-quick-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    quick.onclick=async()=>{
     if(isRecordedOption&&previous.status==='all')return;
     if(previous&&!isRecordedOption&&!window.confirm(playerText('Já existe um registo para esta refeição. Substituir pela opção selecionada?','A record already exists for this meal. Replace it with the selected option?')))return;
     quick.disabled=true;edit.disabled=true;quick.textContent=playerText('A guardar…','Saving…');feedback.textContent='';
     try{
      const qs=new URLSearchParams({date:d,meal:meal,event_id:''});
      const source=await api('/api/v2/player/consumption-options?'+qs);
      const selected=source.options?.[i];
      if(!selected?.option_ref)throw new Error(playerText('Opção indisponível','Option unavailable'));
      await api('/api/v2/player/consumption-records',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':playerCsrf},body:JSON.stringify({date:d,meal:meal,event_id:'',option_ref:selected.option_ref,status:'all'})});
      showConsumptionSuccess(quick);feedback.textContent='';await new Promise(resolve=>setTimeout(resolve,900));if(card.tagName==='DETAILS')card.open=false;await overview();
     }catch(e){feedback.textContent=playerText('Não foi possível registar. Tenta novamente.','Could not save the record. Please try again.');quick.disabled=false;edit.disabled=false;consumptionActionLabel(quick,'CheckmarkCircle02Icon',playerText(' Cumpri',' Done'));error(e);}
    };
    edit.onclick=()=>{edit.disabled=true;openConsumptionEditor(target,d,meal,'',i).finally(()=>{edit.disabled=false;});};
    if(!isRecordedOption&&!(previous?.prescription?.color&&previous.prescription.color!==color)){actions.append(edit,quick);target.append(actions,feedback);}
   });
  }
  if(consumptionEnabled&&color&&options.length){
   const change=document.createElement('button');change.type='button';change.className='consumption-cancel consumption-change-color';
   change.textContent=playerText('Alterar cor','Change colour');change.appendChild((()=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('consumption-link-chevron');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','m9 18 6-6-6-6');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;})());change.setAttribute('aria-label',playerText('Registar consumo de outra cor','Record consumption with a different colour'));
   
   change.onclick=()=>openAlternativeColorPicker(section,d,meal);
   section.append(change);
  }
  attachSupplements(section,(supplementsByDay[d]||[]).filter(x=>(x.moment===meal||(meal==="lunch"&&x.moment==="lunch_or_dinner"))));
  root.append(section);
 }
 if((supplementsByDay[d]||[]).length)root.append(supplementsCard(supplementsByDay[d]));
 if(consumptionEnabled)renderRegistosCard(root,d,()=>requestId===overviewRequestId&&epoch===playerSessionEpoch).catch(()=>{});
 renderPlansWidget(root);
 // Reveal a complete day's content only after consumption state is resolved.
 root.hidden=false;setOverviewLoading(false);
 injectPostMatchCard();
 animateDailySwipeEntry();
}
// The «plans» section now only hosts Progresso (assessments) and, from Início, the page of one plan.
function openPlansSection(section){
 $("plans-prescriptions").hidden=section!=="prescriptions";
 $("plans-assessments").hidden=section!=="assessments";
 if(section==="assessments")loadPlayerAssessments().catch(err=>{$("assessment-measurements").textContent=playerText("Não foi possível carregar as avaliações.","Could not load assessments.");});
}
let planPhase=null;
function renderPlanContent(key,target){
 if(key==="supplements"){renderSupplementPlan(target).catch(error);return;}
 if(key.startsWith("peri-")){
  const kind=key.slice(5),published=periPlans[kind]?.options||{};
  for(const [phase,label] of [["pre",periPlans[kind]?.phase_labels?.pre||(kind==="match"?"Intra-jogo":"Pré-treino")],["post",periPlans[kind]?.phase_labels?.post||(kind==="match"?"Pós-jogo":"Pós-treino")]]){
   if(planPhase&&planPhase!==phase)continue;
   const opts=published[phase]||[];if(!opts.length)continue;
   const section=document.createElement("section");section.className="meal plan-meal";
   const header=document.createElement("div");header.className="option";
   const heading=document.createElement("h3");heading.textContent=playerPhaseLabel(label);header.append(heading);
   const avg=average(opts);if(avg)header.append(nutrition(avg));section.append(header);
   // A single published option is the meal itself, as in colour plans and Dia.
   // Multiple options keep their independent expandable cards.
   if(opts.length===1)appendMealItems(section,opts[0].items);
   else opts.forEach((o,i)=>{const item=optionEl(o,i,true);item.classList.add("plan-option-card");section.append(item);});
   target.append(section);
  }
  return;
 }
 if(!plans[key])return;
 for(const meal of ["breakfast","lunch","snack","dinner","supper"]){
  const opts=plans[key][meal]||[];if(!opts.length)continue;
  const section=document.createElement("details");section.className="meal daily-meal plan-overview-meal tone-"+key;
  const header=document.createElement("summary");header.className="daily-meal-head";
  const h=document.createElement("strong");h.textContent=names[meal];header.append(h);decorateLabel(header,meal);
  const avg=average(opts);if(avg){const totals=document.createElement("span");totals.className="meal-average meal-average-inline";totals.append(nutrition(avg));header.append(totals);}
  section.append(header);
  if(opts.length===1){
   const body=document.createElement("div");body.className="single-meal-option";
   appendMealItems(body,opts[0].items);
   section.append(body);
  }else opts.forEach((o,i)=>{const card=optionEl(o,i);card.classList.add("player-meal-option-subcard");section.append(card);});
  target.append(section);
 }
}
const dishPhotoCache=new Map();
let menuRenderToken=0;
const dishPhotoObserver=typeof IntersectionObserver==="function"?new IntersectionObserver(entries=>{
 for(const entry of entries){
  if(!entry.isIntersecting)continue;
  dishPhotoObserver.unobserve(entry.target);
  activateDishPhoto(entry.target);
 }
},{rootMargin:"180px 0px"}):null;
function activateDishPhoto(photo){
 const epoch=Number(photo.dataset.playerEpoch),dishId=photo.dataset.dishId;
 if(!dishId||epoch!==playerSessionEpoch||!photo.isConnected)return;
 cachedDishPhoto(dishId).then(src=>{
  if(!src||epoch!==playerSessionEpoch||!photo.isConnected)return;
  photo.src=src;
  photo.classList.add("dish-photo-ready");
  photo.tabIndex=0;
  photo.setAttribute("role","button");
  const activate=()=>openDishPhoto(src,photo.alt);
  photo.setAttribute("aria-label","Ampliar fotografia: "+photo.alt);
  photo.onclick=activate;
  photo.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate();}};
 });
}
function cachedDishPhoto(id,thumbnail=false){
 const dishId=String(id),key=(thumbnail?"daily:":"full:")+dishId;
 if(!dishPhotoCache.has(key)){
  // Daily cards display 76px thumbnails; Menus retains its full image.
  const url="/api/v2/player/dish-photo/"+encodeURIComponent(dishId)+(thumbnail?"?size=thumbnail":"?v=2");
  const pending=fetch(url,{credentials:"same-origin"}).then(r=>{if(!r.ok)throw Error("Foto indisponível");return r.blob();}).then(blob=>URL.createObjectURL(blob)).catch(()=>null);
  dishPhotoCache.set(key,pending);
 }
 return dishPhotoCache.get(key);
}
function openDishPhoto(src,alt){
 if(!src)return;
 const overlay=document.createElement("div");overlay.className="dish-photo-overlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label",alt||"Fotografia do prato");
 const close=document.createElement("button");close.type="button";close.className="dish-photo-close";close.textContent="×";close.setAttribute("aria-label",playerText("Fechar fotografia","Close photo"));
 const image=document.createElement("img");image.src=src;image.alt=alt||"Prato";
 const previous=document.activeElement;const dismiss=()=>{overlay.remove();document.removeEventListener("keydown",onKey);previous?.focus?.();};
 const onKey=e=>{if(e.key==="Escape")dismiss();};
 close.onclick=dismiss;overlay.onclick=e=>{if(e.target===overlay)dismiss();};document.addEventListener("keydown",onKey);
 overlay.append(close,image);document.body.append(overlay);close.focus();
}
/* Prefetch up to the selected day's two assigned dish photos after the
   meal DOM is built, so expanding Almoço/Jantar does not start a cold request.
   Missing photographs leave the original text-only card unchanged. */
function attachDailyDishPhoto(section,card,menu,epoch,requestId){
 const load=async()=>{
  let dishId=menu.dish_id;
  if(epoch!==playerSessionEpoch||requestId!==overviewRequestId||!card.isConnected)return;
  if(!dishId){
   // Legacy menu rows may only have a name; never choose an ambiguous dish.
   try{
    const response=await cachedOverviewRead("/api/v2/player/dishes");
    const matches=(response.dishes||[]).filter(dish=>dish.name_pt===menu.value);
    if(matches.length===1)dishId=matches[0].id;
   }catch{return;}
  }
  if(!dishId||epoch!==playerSessionEpoch||requestId!==overviewRequestId||!card.isConnected)return;
  const src=await cachedDishPhoto(dishId,true);
  if(!src||epoch!==playerSessionEpoch||requestId!==overviewRequestId||!card.isConnected)return;
  const photo=document.createElement("img");
  photo.className="daily-meal-dish-photo";photo.alt="";photo.decoding="async";
  // Insert only once the image is ready: no broken icon or empty thumbnail.
  photo.onload=()=>{
   if(epoch!==playerSessionEpoch||requestId!==overviewRequestId||!card.isConnected)return;
   card.classList.add("has-dish-photo");
   card.append(photo);
  };
  photo.src=src;
 };
 // Deferring one microtask lets the entire day's cards attach to the DOM first.
 // At most Almoço and Jantar are prefetched; menus and other tabs are untouched.
 Promise.resolve().then(load);
}

let lastMenuPresentationWeek=null;
async function menusView(){
 const epoch=playerSessionEpoch,renderToken=++menuRenderToken;
 const start=monday(menuWeek),end=new Date(start);end.setDate(end.getDate()+6);
 const startKey=iso(start),endKey=iso(end);
 const pending=lastMenuPresentationWeek!==startKey;
 if(pending){
  $("menu-loading").hidden=false;$("menu-days").hidden=true;
  $("menu-loading-week").textContent=start.toLocaleDateString(playerDateLocale(),{day:"numeric",month:"short"})+" – "+end.toLocaleDateString(playerDateLocale(),{day:"numeric",month:"short"});
  $("menu-week-strip").querySelectorAll(".week-day").forEach(el=>el.remove());
 }
 let m,c,dishResponse;
 try{
  [m,c,dishResponse]=await Promise.all([
   cachedOverviewRead("/api/v2/player/menus?start="+startKey+"&end="+endKey),
   cachedOverviewRead("/api/v2/player/calendar?start="+startKey+"&end="+endKey),
   cachedOverviewRead("/api/v2/player/dishes")
  ]);
 }catch(err){
  if(epoch!==playerSessionEpoch||renderToken!==menuRenderToken||tab!=="menus")return;
  $("menu-loading").hidden=true;
  const target=$("menu-days");target.hidden=false;target.textContent=playerText("Não foi possível carregar os menus. Tenta novamente.","Could not load menus. Please try again.");
  throw err;
 }
 if(epoch!==playerSessionEpoch||renderToken!==menuRenderToken||tab!=="menus")return;
 const dishes=dishResponse.dishes||[];
 const dishById=new Map(dishes.map(d=>[d.id,d]));
 const dishNameCounts=new Map();
 for(const dish of dishes)dishNameCounts.set(dish.name_pt,(dishNameCounts.get(dish.name_pt)||0)+1);
 const uniqueDishByName=new Map(dishes.filter(d=>dishNameCounts.get(d.name_pt)===1).map(d=>[d.name_pt,d]));
 const strip=$("menu-week-strip");strip.querySelectorAll(".week-day").forEach(el=>el.remove());
 const todayKey=iso(new Date()),isCurrentWeek=todayKey>=iso(start)&&todayKey<=iso(end);
 if(!menuSelectedDate||menuSelectedDate<iso(start)||menuSelectedDate>iso(end))menuSelectedDate=isCurrentWeek?todayKey:iso(start);
 const selectMenuDay=key=>{
  menuSelectedDate=key;
  strip.querySelectorAll(".week-day").forEach(el=>{const active=el.dataset.date===key;el.classList.toggle("selected",active);el.setAttribute("aria-pressed",String(active));});
  document.querySelectorAll("#menu-days .day-menu").forEach(el=>el.classList.toggle("is-selected",el.dataset.date===key));
 };
 for(let i=0;i<7;i++){
  const dt=new Date(start);dt.setDate(start.getDate()+i);
  const key=iso(dt),classification=c.days.find(x=>x.date===key)?.classification||"Geral";
  const button=document.createElement("button");button.type="button";button.className="week-day"+(key===menuSelectedDate?" selected":"")+(key===todayKey?" today":"");button.dataset.date=key;
  button.setAttribute("aria-pressed",String(key===menuSelectedDate));
  button.setAttribute("aria-label",dt.toLocaleDateString(playerDateLocale(),{weekday:"long",day:"numeric",month:"long"})+" · "+playerClassification(classification));
  for(const [cls,value] of [["weekday",dt.toLocaleDateString(playerDateLocale(),{weekday:"short"}).replace(".","").replace(/^./,letter=>letter.toLocaleUpperCase(playerDateLocale()))],["day-number",String(dt.getDate())],["day-classification",playerClassification(classification)]]){
   const span=document.createElement("span");span.className=cls;span.textContent=value;button.append(span);
  }
  button.onclick=()=>{selectMenuDay(key);animateCalendarSelection(strip,key);document.querySelector("#menu-days .day-menu[data-date=\""+key+"\"]")?.scrollIntoView({behavior:"smooth",block:"start"});};
  strip.append(button);
 }
 animateCalendarSelection(strip,menuSelectedDate);
 const root=$("menu-days");const fragment=document.createDocumentFragment(),photosToObserve=[];for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=iso(d),dayClass=c.days.find(x=>x.date===key);const section=document.createElement("section");section.className="day-menu"+(key===menuSelectedDate?" is-selected":"");section.dataset.date=key;const h=document.createElement("div");h.className="menu-day-heading";const title=document.createElement("h3");title.textContent=d.toLocaleDateString(playerDateLocale(),{weekday:"long"}).replace(/-feira$/,"")+", "+d.getDate()+" "+d.toLocaleDateString(playerDateLocale(),{month:"long"})+" "+d.getFullYear();title.textContent=title.textContent.charAt(0).toUpperCase()+title.textContent.slice(1);const sub=document.createElement("span");sub.className="menu-day-subtitle";sub.textContent=playerClassification(dayClass?.classification||"Geral");h.append(title,sub);section.append(h);for(const meal of ["lunch","dinner"]){const menu=m.menus.find(x=>x.menu_date===key&&x.meal===meal);const isUnassigned=!menu;const div=document.createElement("div");div.className="row menu-entry"+(isUnassigned?" menu-entry--unassigned":"");div.dataset.meal=meal;
 const label=document.createElement("strong");label.textContent=names[meal];
 const rowClass=c.classifications.find(x=>x.name===(dayClass?.classification||"Geral"));const override=(c.meal_color_overrides||[]).find(x=>x.meal_date===key&&x.meal===meal);const color=menu?(Object.prototype.hasOwnProperty.call(menu,"effective_color")?menu.effective_color:(override?override.color:rowClass?.meals?.[meal])):null;
 div.classList.add(color&&color!=="none"?"tone-"+color:"tone-neutral");const title=document.createElement("div");title.className="menu-entry-heading";
 if(color&&color!=="none"){const dot=document.createElement("span");dot.className="color-dot "+color;title.append(dot);}
 title.append(label);
 const body=document.createElement("div");body.className="menu-entry-body";
 const name=document.createElement("span");name.className="value";name.textContent=menu?playerMenuCategoryLabel(menu):playerText("Menu por atribuir","Menu not assigned");if(menu?.kind==="text")name.classList.add("menu-free-text-value");
 const nameColumn=document.createElement("div");nameColumn.className="menu-dish-name-column";nameColumn.append(name);
 body.append(nameColumn);
 if(menu?.kind==="dish"){
  const dish=menu.dish_id?dishById.get(menu.dish_id):uniqueDishByName.get(menu.value);
  if(dish){
   const photo=document.createElement("img");
   photo.className="dish-img";photo.alt=menu.value;photo.loading="lazy";photo.decoding="async";
   photo.dataset.dishId=dish.id;photo.dataset.recipeCount=String(dish.recipe_count||0);
   photo.dataset.playerEpoch=String(epoch);
   const photoFrame=document.createElement("span");photoFrame.className="dish-photo-frame";
   const zoom=document.createElement("span");zoom.className="dish-photo-zoom";zoom.setAttribute("aria-hidden","true");
   zoom.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>';
   photoFrame.append(photo,zoom);body.append(photoFrame);photosToObserve.push(photo);
   if(Number(dish.recipe_count||0)>0){
    const recipeAction=document.createElement("button");recipeAction.type="button";recipeAction.className="menu-view-recipe";
    recipeAction.textContent=Number(dish.recipe_count||0)>1?playerText("Ver receitas","View recipes"):playerText("Ver receita","View recipe");
    recipeAction.setAttribute("aria-label",recipeAction.textContent+playerText(" de "," for ")+menu.value);
    const press=()=>recipeAction.classList.add("is-pressed");
    const clearPress=()=>{recipeAction.classList.remove("is-pressed");recipeAction.blur();};
    recipeAction.addEventListener("pointerdown",press);
    recipeAction.addEventListener("pointerup",()=>{if(recipeAction.dataset.navigating!=="true")clearPress();});
    recipeAction.addEventListener("pointercancel",clearPress);
    recipeAction.addEventListener("pointerleave",()=>{if(recipeAction.dataset.navigating!=="true")clearPress();});
    recipeAction.addEventListener("touchstart",press,{passive:true});
    recipeAction.addEventListener("touchend",()=>{if(recipeAction.dataset.navigating!=="true")clearPress();},{passive:true});
    recipeAction.addEventListener("touchcancel",clearPress);
    recipeAction.addEventListener("click",()=>{
     if(recipeAction.dataset.navigating==="true")return;
     recipeAction.dataset.navigating="true";press();
     window.setTimeout(()=>{
      // Never leave a hidden menu button in a pressed state when returning.
      clearPress();
      recipeAction.dataset.navigating="false";
      if(window.themileRecipes)window.themileRecipes.openDish(dish.id,menu.value);
     },120);
    });
    nameColumn.append(recipeAction);
   }
  }
 }
 div.append(title,body);section.append(div);}fragment.append(section);}if(renderToken===menuRenderToken){
  root.replaceChildren(fragment);
  if(dishPhotoObserver){
   dishPhotoObserver.disconnect();
   for(const photo of photosToObserve)dishPhotoObserver.observe(photo);
  }else for(const photo of photosToObserve)activateDishPhoto(photo);
  root.hidden=false;
  $("menu-loading").hidden=true;
  lastMenuPresentationWeek=startKey;
 }
}
function error(e){if(e.stale||e.status===401)return;$("status").textContent=e.message||String(e);}
$("login-form").onsubmit=async e=>{e.preventDefault();$("login-error").textContent="";try{const identifier=$("username").value.trim().toLowerCase(),password=$("password").value;revokePlayerView();$("status").textContent="";await api("/api/login",{method:"POST",body:JSON.stringify({identifier,password})});$("password").value="";await session();}catch(err){$("login-error").textContent="Não foi possível entrar. Verifica as credenciais e tenta novamente.";}};$("logout").onclick=async()=>{const button=$("logout");button.disabled=true;try{await api("/api/logout",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},body:"{}"});playerCsrf="";revokePlayerView();$("status").textContent="";$("login-error").textContent="";}catch(err){$("status").textContent="Não foi possível terminar a sessão. Tenta novamente.";}finally{button.disabled=false;}};for(const b of document.querySelectorAll("[data-tab]"))b.onclick=()=>show(b.dataset.tab).catch(error);enableWeekSwipe($("menu-week-strip"),offset=>{menuWeek=swipeWeekBoundary(menuWeek,offset);menuSelectedDate=iso(menuWeek);menusView().catch(error);});enableOverviewDaySwipe($("overview"));$("overview-back").onclick=()=>{const key=weekReturnDay||iso(new Date());day=new Date(key+"T12:00:00");weekReturnDay=null;overviewMode="day";weeklySelection=null;overview().catch(error);};$("overview-today").onclick=()=>{day=new Date();weeklySelection=null;overview().catch(error);};$("profile-logout").onclick=()=>$("logout").click();
for(const button of document.querySelectorAll("#profile-language-selector button[data-language]")){
 button.onclick=()=>updatePlayerLanguageChoice(button.dataset.language);
}
function resetProfilePassword(){
 $("profile-password-form").reset();
 $("profile-password-feedback").textContent="";
}
function resetProfileSubpage(){
 resetProfilePassword();
 $("profile-main").hidden=false;
 $("profile-notifications-page").hidden=true;
 $("profile-password-page").hidden=true;
}
function openProfileSubpage(page){
 resetProfilePassword();
 $("profile-main").hidden=true;
 $("profile-notifications-page").hidden=page!=="notifications";
 $("profile-password-page").hidden=page!=="password";
 window.scrollTo?.(0,0);
}
$("profile-notifications-open").onclick=()=>openProfileSubpage("notifications");
$("profile-password-open").onclick=()=>openProfileSubpage("password");
$("profile-notifications-back").onclick=resetProfileSubpage;
$("profile-password-back").onclick=resetProfileSubpage;
$("profile-password-form").onsubmit=async e=>{
 e.preventDefault();const feedback=$("profile-password-feedback"),button=e.currentTarget.querySelector('button[type="submit"]');
 const current=$("profile-current-password").value,next=$("profile-new-password").value,confirm=$("profile-confirm-password").value;
 if(next!==confirm){feedback.textContent=playerText("As novas palavras-passe não coincidem.","The new passwords do not match.");return;}
 if(next.length<8){feedback.textContent=playerText("Utiliza pelo menos 8 caracteres.","Use at least 8 characters.");return;}
 if(!profileUsername){feedback.textContent=playerText("Não foi possível identificar a conta. Volta a iniciar sessão.","Could not identify the account. Please sign in again.");return;}
 button.disabled=true;feedback.textContent="";
 try{await api("/api/change-password",{method:"POST",body:JSON.stringify({identifier:profileUsername,current_password:current,new_password:next})});
 resetProfilePassword();
 const successMessage=playerText("Palavra-passe alterada. Inicia sessão novamente.","Password changed. Please sign in again.");revokePlayerView();$("status").textContent=successMessage;
 }catch(err){feedback.textContent=playerText("Não foi possível alterar a palavra-passe. Confirma a palavra-passe atual e tenta novamente.","Could not change the password. Check your current password and try again.");}finally{button.disabled=false;}
};
for(const item of document.querySelectorAll("#profile .mile-icon")){const name=[...item.classList].find(x=>x.startsWith("icon-"))?.slice(5);if(name)item.replaceWith(mealIcon(name));}

loadOfficialHugeicons();
for(const icon of document.querySelectorAll("#tabs .mile-icon")){const name=[...icon.classList].find(x=>x.startsWith("icon-"))?.slice(5);if(name)icon.replaceWith(mealIcon(name));}
updateOfficialIcons();




$("player-session-retry").onclick=()=>session().catch(err=>{
 if(err.stale)return;
 if(err.status===401){playerSessionReady();$("login-panel").hidden=false;return;}
 playerSessionScreen("Não foi possível carregar a sessão. Verifica a ligação e tenta novamente.",true);
});
$("player-session-retry").onclick();


/* Player anthropometry data. Only clinician-published measurements are shown. */
let assessmentRecords=[],assessmentFields={},assessmentAverages=[],assessmentGroup="resumo";
const assessNumber=value=>Number(value).toLocaleString(playerDateLocale(),{minimumFractionDigits:1,maximumFractionDigits:1});
// Clinical sum-of-8 skinfold colours, matching the Backoffice.
function playerSkinfoldCategory(value,fieldPosition="",sex="M"){
 const n=Number(value);if(value===null||value===""||!Number.isFinite(n))return null;
 const base=String(sex||"").trim().toUpperCase()==="F"?[65,70,80]:[45,55,60];
 const offset=String(fieldPosition||"").trim().toUpperCase()==="GR"?5:0;
 const [darkMax,yellowMin,redMin]=base.map(limit=>limit+offset);
 if(n>=redMin)return {color:"#E17878",code:"red"};
 if(n>=yellowMin)return {color:"#E7C268",code:"yellow"};
 if(n>darkMax)return {color:"#A4D9AE",code:"light-green"};
 return {color:"#4A9879",code:"dark-green"};
}
function assessmentDate(iso){if(!iso)return"";const parts=iso.split("-");return parts.length===3?parts[2]+"/"+parts[1]+"/"+parts[0]:iso;}
async function loadPlayerAssessments(){
 const epoch=playerSessionEpoch;
 if(!assessmentRecords.length)$("assessment-measurements").textContent=playerText("A carregar avaliações…","Loading assessments…");
 const response=await cachedOverviewRead("/api/v2/player/assessments");
 if(epoch!==playerSessionEpoch)return;
 assessmentRecords=response.assessments||[];
 assessmentFields=response.fields||{};
 assessmentAverages=response.averages_fields||[];
 renderPlayerAssessments();
}

function buildAssessmentTrend(points,unit,axisStep,isSkinfoldSum=false){
 const holder=document.createElement("div");holder.className="assessment-trend";
 if(points.length<2){
  const note=document.createElement("p");note.className="assessment-trend-note";
  note.textContent=playerText("O gráfico ficará disponível após duas avaliações com este parâmetro.","Two assessments are needed to display this chart.");
  holder.append(note);return holder;
 }
 const visible=points,values=visible.map(p=>p.value);
 const step=axisStep||(unit==="kg"||unit==="cm"?1:unit==="mm"?5:1);
 const minimum=Math.min(...values),maximum=Math.max(...values);
 let low=Math.floor(minimum/step)*step,high=Math.ceil(maximum/step)*step;
 if(low===high){low-=step;high+=step;}
 const tickCount=Math.round((high-low)/step);
 const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
 const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
 // Keep the original 344x176 chart proportions for the latest ten points.
 // Older assessments extend leftwards in a scrollable horizontal plot.
 const width=344+Math.max(0,visible.length-10)*(311/9);
 svg.setAttribute("viewBox","0 0 "+width+" 176");
 svg.setAttribute("preserveAspectRatio","xMidYMid meet");
 svg.setAttribute("role","img");
 svg.setAttribute("aria-label",playerText("Evolução de todas as ","Trend across all ")+visible.length+playerText(" avaliações. Média: "," assessments. Average: ")+assessNumber(mean)+(unit?" "+unit:""));
 svg.style.width=width>344?width+"px":"min(100%, 344px)";
 // Reserve space for the last numeric label so it never clips at the right edge.
 const left=27,right=width-40,top=22,bottom=148;
 const y=v=>bottom-(v-low)/(high-low)*(bottom-top),x=i=>left+(right-left)*i/(visible.length-1);
 const add=(tag,attributes,css,text)=>{
  const node=document.createElementNS(ns,tag);
  for(const [name,value] of Object.entries(attributes||{}))node.setAttribute(name,String(value));
  if(css)node.setAttribute("class",css);
  if(text!==undefined)node.textContent=text;
  svg.append(node);return node;
 };
 for(let i=0;i<=tickCount;i++){
  const v=low+i*step,yy=y(v);
  add("line",{x1:left,y1:yy,x2:right,y2:yy},"assessment-chart-grid");
 }
 add("line",{x1:left,y1:y(mean),x2:right,y2:y(mean)},"assessment-chart-mean");
 const coords=visible.map((p,i)=>[x(i),y(p.value)]);
 add("polyline",{points:coords.map(p=>p.join(",")).join(" ")},"assessment-chart-line");
 const labels=[],dots=[];
 coords.forEach(([cx,cy],i)=>{
  const category=isSkinfoldSum?playerSkinfoldCategory(visible[i].value,me?.field_position,me?.sex):null;
  const dot=add("circle",{cx,cy,r:4.5},"assessment-chart-point");
  if(category){dot.style.stroke=category.color;dot.dataset.category=category.code;}
  dots.push(dot);
  const label=add("text",{x:cx,y:Math.max(12,cy-10),"text-anchor":"middle"},"assessment-chart-value",assessNumber(visible[i].value));
  if(category){label.style.fill=category.color;label.dataset.category=category.code;}
  labels.push(label);
 });
 const guide=add("line",{x1:left,y1:top,x2:left,y2:bottom},"assessment-chart-guide");
 guide.style.display="none";
 const focus=document.createElement("div");focus.className="assessment-chart-focus";focus.setAttribute("aria-live","off");
 const avg=document.createElement("div");avg.className="assessment-chart-average";avg.textContent=playerText("— Média: ","— Average: ")+assessNumber(mean)+(unit?" "+unit:"");
 let active=-1;
 const highlight=index=>{
  active=index;
  const p=visible[index];
  guide.setAttribute("x1",coords[index][0]);guide.setAttribute("x2",coords[index][0]);
  guide.style.display="";
  dots.forEach((dot,i)=>dot.classList.toggle("is-selected",i===index));
  focus.textContent=assessmentDate(p.date)+" · "+assessNumber(p.value)+(unit?" "+unit:"");
  labels.forEach((label,i)=>label.classList.toggle("is-selected",i===index));
 };
 const clear=()=>{active=-1;guide.style.display="none";dots.forEach(dot=>dot.classList.remove("is-selected"));focus.textContent="";labels.forEach(l=>l.classList.remove("is-selected"));};
 const move=event=>{
  const rect=svg.getBoundingClientRect();if(!rect.width)return;
  const px=(event.clientX-rect.left)/rect.width*width;
  let nearest=0;
  for(let i=1;i<coords.length;i++)if(Math.abs(coords[i][0]-px)<Math.abs(coords[nearest][0]-px))nearest=i;
  if(nearest!==active)highlight(nearest);
 };
 svg.addEventListener("pointerdown",event=>{if(event.pointerType==="mouse")move(event);});
 svg.addEventListener("pointermove",event=>{if(event.pointerType==="mouse"&&event.buttons)move(event);});
 svg.addEventListener("pointerleave",event=>{if(event.pointerType==="mouse")clear();});
 svg.addEventListener("click",move);
 clear();
 const scroll=document.createElement("div");scroll.className="assessment-trend-horizontal-scroll";
 scroll.append(svg);
 holder.append(scroll,focus,avg);
 // Open with the latest ten points in view, while earlier points remain to the left.
 if(width>344)requestAnimationFrame(()=>{scroll.scrollLeft=scroll.scrollWidth-scroll.clientWidth;});
 return holder;
}
// Provenance from an Excel import is not a clinical body-fat formula.
function playerBodyFatFormulaNote(value){
 const note=String(value||"").trim();
 if(!note)return "";
 const normalized=note.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(/^(?:(?:historico|dados|valores)\s+)?importad[oa]s?\s+d(?:e|o)\s+(?:ficheiro\s+)?(?:excel|csv)\s*[.!]?$/.test(normalized))return "";
 if(/^(?:excel|csv)\s*[.!]?$/.test(normalized))return "";
 return note;
}
// Progresso (25/11): dashboard of square widgets; each metric opens its own page beside it,
// like Peso em jejum. The trend chart (cut points, colours, labels) is buildAssessmentTrend, unchanged.
const PROGRESS_MUSCLE_KEYS=["muscle_index","arm_muscle","thigh_muscle","calf_muscle"];
const PROGRESS_REPORT_AVERAGE={sum_8:"avg_skinfolds",weight:"avg_weight",body_fat:"avg_body_fat"};
function progressLongDate(isoDate){
 const d=new Date(isoDate+"T12:00:00"),locale=playerDateLocale();
 return d.getDate()+" "+d.toLocaleDateString(locale,{month:"long"})+" "+d.getFullYear();
}
function progressReadings(key){return assessmentRecords.filter(r=>Number.isFinite(r.measurements?.[key])).map(r=>({date:r.assessed_on,value:Number(r.measurements[key])}));}
function progressDelta(current,prior){
 const delta=Math.round((current-prior)*1000)/1000;
 return (delta>0?"+":delta<0?"−":"±")+assessNumber(Math.abs(delta));
}
function progressAxisStep(group,unit){return group==="pregas"&&unit==="mm"?2:group==="resumo"&&unit==="mm"?5:undefined;}
// Small neutral trend line: a summary only; colours stay in the full chart.
function progressSpark(values){
 const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg"),W=140,H=34;
 svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("preserveAspectRatio","none");svg.setAttribute("aria-hidden","true");svg.setAttribute("class","progress-spark");
 if(values.length<2)return svg;
 const lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1;
 const pts=values.map((v,i)=>[i*W/(values.length-1),H-4-(v-lo)/span*(H-8)]);
 const line=document.createElementNS(ns,"polyline");line.setAttribute("points",pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" "));line.setAttribute("class","progress-spark-line");
 svg.append(line);return svg;
}
function progressChevron(){
 const span=document.createElement("span");span.className="progress-tile-chevron";span.setAttribute("aria-hidden","true");
 span.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
 return span;
}
function progressTile({label,unit,values,foot,wide,onOpen}){
 const tile=document.createElement("button");tile.type="button";tile.className="progress-tile"+(wide?" wide":"");
 const head=document.createElement("span");head.className="progress-tile-head";
 const name=document.createElement("span");name.className="progress-tile-label";name.textContent=label;head.append(name,progressChevron());
 const body=document.createElement("span");body.className="progress-tile-body";
 const value=document.createElement("strong");value.className="progress-tile-value";
 value.textContent=values.length?assessNumber(values[values.length-1]):"—";
 if(unit&&values.length){const u=document.createElement("span");u.textContent=" "+unit;value.append(u);}
 const small=document.createElement("small");small.className="progress-tile-foot";small.textContent=foot;
 body.append(value,progressSpark(values),small);tile.append(head,body);
 if(onOpen)tile.onclick=onOpen;else tile.disabled=true;
 return tile;
}
function progressMetricTile(key,label,unit,wide){
 const readings=progressReadings(key),values=readings.map(r=>r.value);
 const foot=values.length>1?progressDelta(values[values.length-1],values[values.length-2])+(unit?" "+unit:"")+playerText(" vs. anterior"," vs. previous")
  :values.length?playerText("Primeira medição","First reading"):playerText("Sem dados","No data");
 return progressTile({label:playerAssessmentLabel(key,label),unit,values,foot,wide,onOpen:values.length?()=>openProgressPage({key,label,unit}):null});
}
// Peso em jejum replaces the assessment body weight on Resumo: daily entries, compared with the previous entry.
function progressFastingTile(){
 const today=iso(new Date());
 const tile=progressTile({label:playerText("Peso em jejum","Fasting weight"),unit:"kg",values:[],foot:playerText("A carregar…","Loading…"),onOpen:()=>{
  progressReturnY=window.scrollY;openWeightDetail(today,null,$("plans-assessments")).catch(error);
 }});
 tile.classList.add("progress-fasting");
 api("/api/v2/player/weight-history?end="+today+"&days=7&local_date="+today).then(data=>{
  if(!tile.isConnected)return;
  const entries=data.entries||[],values=entries.map(x=>Number(x.weight_kg));
  const fresh=progressTile({label:playerText("Peso em jejum","Fasting weight"),unit:"kg",values,foot:"",onOpen:tile.onclick});
  let foot=playerText("Sem registos","No entries");
  if(entries.length>1){
   const last=entries[entries.length-1],prior=entries[entries.length-2];
   const gap=Math.round((new Date(last.weigh_date+"T12:00:00")-new Date(prior.weigh_date+"T12:00:00"))/86400000);
   foot=progressDelta(values[values.length-1],values[values.length-2])+" kg "+(gap===1?playerText("vs. dia anterior","vs. previous day"):playerText("vs. registo anterior","vs. previous entry"));
  }else if(entries.length)foot=entries[0].weigh_date===today?playerText("Registo de hoje","Today's entry"):progressLongDate(entries[0].weigh_date);
  fresh.querySelector(".progress-tile-foot").textContent=foot;fresh.classList.add("progress-fasting");
  tile.replaceWith(fresh);
 }).catch(()=>{if(tile.isConnected)tile.querySelector(".progress-tile-foot").textContent=playerText("Peso indisponível","Weight unavailable");});
 return tile;
}
function progressMuscleTile(fields){
 const present=fields.filter(([key])=>progressReadings(key).length);
 if(!present.length)return null;
 const tile=document.createElement("button");tile.type="button";tile.className="progress-tile wide progress-muscle";
 const head=document.createElement("span");head.className="progress-tile-head";
 const name=document.createElement("span");name.className="progress-tile-label";name.textContent=playerText("Massa muscular","Muscle mass");head.append(name,progressChevron());
 tile.append(head);
 const index=present.find(([key])=>key==="muscle_index");
 if(index){
  const values=progressReadings("muscle_index").map(r=>r.value);
  const row=document.createElement("span");row.className="progress-muscle-index";
  const text=document.createElement("span");text.className="progress-muscle-index-text";
  const label=document.createElement("small");label.className="progress-muscle-label";label.textContent=playerText("Índice","Index");
  const value=document.createElement("strong");value.className="progress-tile-value";value.textContent=assessNumber(values[values.length-1]);
  const foot=document.createElement("small");foot.className="progress-tile-foot";
  foot.textContent=values.length>1?progressDelta(values[values.length-1],values[values.length-2])+playerText(" vs. anterior"," vs. previous"):playerText("Primeira medição","First reading");
  text.append(label,value,foot);row.append(text,progressSpark(values));tile.append(row);
 }
 const parts=present.filter(([key])=>key!=="muscle_index");
 if(parts.length){
  if(index){const rule=document.createElement("span");rule.className="progress-muscle-rule";tile.append(rule);}
  const cols=document.createElement("span");cols.className="progress-muscle-parts";
  const short={arm_muscle:playerText("Braço","Arm"),thigh_muscle:playerText("Coxa","Thigh"),calf_muscle:playerText("Gémeo","Calf")};
  for(const [key,label] of parts){
   const values=progressReadings(key).map(r=>r.value);
   const col=document.createElement("span");col.className="progress-muscle-part";
   const l=document.createElement("small");l.className="progress-muscle-label";l.textContent=short[key]||playerAssessmentLabel(key,label);
   const v=document.createElement("strong");v.textContent=assessNumber(values[values.length-1]);
   const d=document.createElement("small");d.className="progress-tile-foot";d.textContent=values.length>1?progressDelta(values[values.length-1],values[values.length-2]):"";
   col.append(l,v,d);cols.append(col);
  }
  tile.append(cols);
 }
 tile.onclick=()=>openProgressPage({muscle:true,fields:present});
 return tile;
}
// Pregas (26/11, aprovado no canvas): body map (front and back) above a table of the 8 skinfolds.
// Body figures (26/11, canvas «v7»): flat silhouettes in the style of the approved references, one male and one
// female (chosen by the player's sex), in underwear; subtle detail lines; no colours. The dot size follows the latest mm.
// Tapping a dot or a row opens the skinfold page, where a mini body marks the site and ‹ previous · next › (or a
// horizontal swipe) moves between skinfolds. Each figure is drawn from its left half, mirrored around x=80.
const PROGRESS_BODY_FIGURES={
 M:{
  half:"M80 8 C71 8 64.5 15 64.5 26 C64.5 36 68 43 71 46 L71 51 C64 55 52 57 44 59 C38 61 35 66 34 74 C32 84 30 92 29 100 C27 110 26 116 26 120 C25 136 23 152 22.5 164 C21 172 21 182 23 188 C25 193 30 193 32 190 C33 186 33 176 33 170 C34 164 35 160 36 156 C38 140 40 128 42 118 C44 108 46 96 48 87 L50 86 C51 104 53 120 52.6 134 C52 146 50 154 50 162 C50 180 51 196 52 208 C53 222 55 234 56 244 C55 252 53 260 53 268 C53 284 56 296 58.5 308 C57 314 52 320 53 324 C55 328 66 328 70 325 C71 318 70 312 69.6 308 C70 296 74 280 75 268 C75 258 73 250 73 242 C74 222 77 196 80 180",
  extra:'<ellipse cx="64.5" cy="28" rx="2.6" ry="5"/><ellipse cx="95.5" cy="28" rx="2.6" ry="5"/>',hair:"",
  front:"M63 59 Q70 56 77 59 M57 98 Q63 101 69 98 M33 116 L40 118",navel:[80,146],
  back:"M61 74 Q56 90 63 99 M33 116 L40 118",spine:"M80 98 L80 142",
  frontWear:"M50 155 Q80 151 110 155 L109.5 192 L84 196 L80 184 L76 196 L50.5 192 Z",
  backWear:"M50 155 Q80 151 110 155 L109.5 192 Q96 198 80 194 Q64 198 50.5 192 Z",straps:"",
  sites:{biceps:[39,100],abdominal_skin:[91,145],suprailiac:[55,138],supraspinal:[63,151],thigh_skin:[65,215],calf_skin:[72,268],triceps:[311,100],back:[284,108]},
  tapes:{arm_right_relaxed:[29,48,102],chest:[49,111,92],waist:[53,107,125],abdominal_perimeter:[51,109,146],thigh_right:[52,79,205],thigh_left:[81,108,205],calf_right:[53,75,268],calf_left:[85,107,268]}
 },
 F:{
  half:"M80 12 C72 12 67 19 67 30 C67 40 70 46 73 50 L71 56 C66 60 56 62 48 64 C43 66 41 70 40 76 C39 84 38 90 37 97 C36 108 35.5 118 35.3 126 C34.5 140 34 154 33.5 166 C32 174 32 182 34 188 C36 192 41 192 42 189 C43 184 43 176 42 170 C43 165 45 162 46 159 C48 146 49 134 50 124 C51 108 52 94 53.6 84 L55 82 C56 98 57 112 56 122 C55 134 50 146 48 158 C47 172 49 186 51 199 C53 214 56 226 57 236 C56 246 55 256 56.6 265 C57.5 280 61 292 62.8 302 C61 310 56 318 56 322 C57 326 68 327 72 324 C73 316 72 308 72.7 302 C74 290 77 276 76.7 265 C76.5 254 75 244 75.6 236 C76 216 78 192 80 174",
  extra:"",hair:"M80 6 C66 6 58 15 58 30 C58 42 56 50 52 55 C57 58 64 58 70 55 L80 55 Z",
  front:"M66 63 Q70 62 74 64 M63 236 Q67 241 72 237",navel:[80,146],
  back:"M63 238 Q67 235 72 238",spine:"M80 108 L80 150",
  frontWear:"M56 84 Q80 80 104 84 L104.5 104 Q92 109 80 103 Q68 109 55.5 104 Z M49 158 Q80 155 111 158 L111 174 Q96 178 84 188 L76 188 Q64 178 49 174 Z",
  backWear:"M56 92 L104 92 L104 104 L56 104 Z M49 158 Q80 155 111 158 L111 180 Q96 188 80 186 Q64 188 49 180 Z",straps:"M64 66 L64 92 M96 66 L96 92",
  sites:{biceps:[44.5,100],abdominal_skin:[91,145],suprailiac:[53,136],supraspinal:[61,150],thigh_skin:[64,210],calf_skin:[72,265],triceps:[305.5,100],back:[284,114]},
  tapes:{arm_right_relaxed:[37,53.6,102],chest:[54,106,92],waist:[56,104,122],abdominal_perimeter:[50,110,146],thigh_right:[51,79,200],thigh_left:[81,109,200],calf_right:[56.6,76.7,265],calf_left:[83.3,103.4,265]}
 }
};
const PROGRESS_SKINFOLD_SITES=PROGRESS_BODY_FIGURES.M.sites;
// Perímetros (26/11, aprovado no canvas): front view only, each circumference as a white tape line with its value in cm.
const PROGRESS_PERIMETER_TAPES=PROGRESS_BODY_FIGURES.M.tapes;
const PROGRESS_PERIMETER_LEFT_LABELS=["arm_right_relaxed","thigh_right","calf_right"],PROGRESS_PERIMETER_TRUNK=["chest","waist","abdominal_perimeter"];
function progressMapSites(group){return group==="perimetros"?PROGRESS_PERIMETER_TAPES:PROGRESS_SKINFOLD_SITES;}
function progressBodyFigure(){return PROGRESS_BODY_FIGURES[String(me?.sex||"").trim().toUpperCase()==="F"?"F":"M"];}
function progressBodyShape(figure,offset,back){
 const mirror=inner=>inner+'<g transform="matrix(-1 0 0 1 160 0)">'+inner+'</g>';
 const [nx,ny]=figure.navel;
 return '<g transform="translate('+offset+',0)">'
  +'<g class="progress-body-fill">'+mirror('<path fill-rule="evenodd" d="'+figure.half+' Z"/>')+(figure.hair?mirror('<path d="'+figure.hair+'"/>'):"")+figure.extra+'</g>'
  +'<g class="progress-body-detail">'+mirror('<path d="'+(back?figure.back:figure.front)+'"/>')+(back?'<path d="'+figure.spine+'"/>':'<ellipse cx="'+nx+'" cy="'+ny+'" rx="1.4" ry="1.9"/>')+'</g>'
  +'<path class="progress-body-wear" d="'+(back?figure.backWear:figure.frontWear)+'"/>'
  +(back&&figure.straps?'<path class="progress-body-straps" d="'+figure.straps+'"/>':"")
  +'</g>';
}
function progressSkinfoldEntries(group="pregas"){
 const sites=progressMapSites(group);
 return (assessmentFields[group]||[]).filter(([key])=>sites[key]&&progressReadings(key).length).map(([key,label,unit])=>({key,label,unit}));
}
function progressTapePath(x1,x2,y){return "M"+x1+" "+y+" Q"+((x1+x2)/2)+" "+(y+3.5)+" "+x2+" "+y;}
function progressPerimeterMap({selected=null,mini=false,onPick=null}={}){
 const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg"),figure=progressBodyFigure();
 svg.setAttribute("viewBox",mini?"0 0 160 332":"0 0 360 335");svg.setAttribute("class",mini?"progress-body-map progress-perimeter-map mini":"progress-body-map progress-perimeter-map");
 svg.setAttribute("role","img");svg.setAttribute("aria-label",playerText("Localização dos perímetros","Circumference sites"));
 const shift=mini?0:100,group=document.createElementNS(ns,"g");group.setAttribute("transform","translate("+shift+",0)");
 group.innerHTML=progressBodyShape(figure,0,false);svg.append(group);
 for(const entry of progressSkinfoldEntries("perimetros")){
  const [x1,x2,y]=figure.tapes[entry.key],values=progressReadings(entry.key).map(r=>r.value),on=entry.key===selected;
  if(mini&&!on)continue;
  const g=document.createElementNS(ns,"g");g.setAttribute("class","progress-tape"+(on?" selected":""));
  const line=document.createElementNS(ns,"path");line.setAttribute("d",progressTapePath(x1,x2,y));line.setAttribute("class","progress-tape-line");g.append(line);
  group.append(g);
  if(mini)continue;
  const left=PROGRESS_PERIMETER_LEFT_LABELS.includes(entry.key),trunk=PROGRESS_PERIMETER_TRUNK.includes(entry.key);
  const tx=left?(entry.key==="arm_right_relaxed"?shift+x1-6:shift+Math.min(x1,52)-8):(trunk?shift+138:shift+x2+8);
  if(trunk){const lead=document.createElementNS(ns,"path");lead.setAttribute("d","M"+(shift+x2+2)+" "+y+" L"+(tx-4)+" "+y);lead.setAttribute("class","progress-tape-lead");svg.append(lead);}
  const label=document.createElementNS(ns,"text");label.setAttribute("x",tx);label.setAttribute("y",y+4);label.setAttribute("text-anchor",left?"end":"start");
  label.setAttribute("class","progress-tape-value");label.textContent=assessNumber(values[values.length-1]);svg.append(label);
  if(onPick){
   const name=playerAssessmentLabel(entry.key,entry.label)+" "+assessNumber(values[values.length-1])+" "+entry.unit;
   const hit=document.createElementNS(ns,"rect");
   {
    hit.setAttribute("x",shift+x1-4);hit.setAttribute("y",y-8);hit.setAttribute("width",x2-x1+8);hit.setAttribute("height",16);hit.setAttribute("class","progress-body-hit");
    hit.setAttribute("role","button");hit.setAttribute("tabindex","0");hit.setAttribute("aria-label",name);
    hit.addEventListener("click",()=>onPick(entry));hit.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onPick(entry);}});
    svg.append(hit);
   }
   label.classList.add("progress-tape-pick");label.addEventListener("click",()=>onPick(entry));
  }
 }
 return svg;
}
function progressBodyMap({selected=null,mini=false,onPick=null}={}){
 const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg"),figure=progressBodyFigure();
 svg.setAttribute("viewBox",mini?"0 0 360 332":"0 0 360 350");svg.setAttribute("class",mini?"progress-body-map mini":"progress-body-map");
 svg.setAttribute("role","img");svg.setAttribute("aria-label",playerText("Localização das pregas","Skinfold sites"));
 svg.innerHTML=progressBodyShape(figure,0,false)+progressBodyShape(figure,190,true)+(mini?"":'<text x="80" y="346" text-anchor="middle" class="progress-body-caption">'+playerText("Frente","Front")+'</text><text x="270" y="346" text-anchor="middle" class="progress-body-caption">'+playerText("Costas","Back")+'</text>');
 for(const entry of progressSkinfoldEntries()){
  const [x,y]=figure.sites[entry.key],values=progressReadings(entry.key).map(r=>r.value),on=entry.key===selected;
  if(mini&&!on)continue;
  const r=mini?12:Math.max(3.5,Math.min(9,2.5+values[values.length-1]*0.45));
  const g=document.createElementNS(ns,"g");g.setAttribute("class","progress-body-site"+(on?" selected":""));
  if(on){const ring=document.createElementNS(ns,"circle");ring.setAttribute("cx",x);ring.setAttribute("cy",y);ring.setAttribute("r",r+5);ring.setAttribute("class","progress-body-ring");g.append(ring);}
  const dot=document.createElementNS(ns,"circle");dot.setAttribute("cx",x);dot.setAttribute("cy",y);dot.setAttribute("r",r);dot.setAttribute("class","progress-body-dot");g.append(dot);
  if(onPick&&!mini){
   const hit=document.createElementNS(ns,"circle");hit.setAttribute("cx",x);hit.setAttribute("cy",y);hit.setAttribute("r",Math.max(r,13));hit.setAttribute("class","progress-body-hit");
   hit.setAttribute("role","button");hit.setAttribute("tabindex","0");hit.setAttribute("aria-label",playerAssessmentLabel(entry.key,entry.label)+" "+assessNumber(values[values.length-1])+" "+entry.unit);
   hit.addEventListener("click",()=>onPick(entry));hit.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onPick(entry);}});
   g.append(hit);
  }
  svg.append(g);
 }
 return svg;
}
function progressSkinfoldScreen(target,group="pregas"){
 const open=entry=>openProgressPage(entry);
 const mapCard=document.createElement("div");mapCard.className="progress-body-card";
 mapCard.append(group==="perimetros"?progressPerimeterMap({onPick:open}):progressBodyMap({onPick:open}));
 const table=document.createElement("div");table.className="progress-list progress-skinfold-table";
 for(const entry of progressSkinfoldEntries(group)){
  const values=progressReadings(entry.key).map(r=>r.value);
  const row=document.createElement("button");row.type="button";row.className="progress-list-row progress-skinfold-row";
  const name=document.createElement("span");name.textContent=playerAssessmentLabel(entry.key,entry.label);
  const diff=document.createElement("small");diff.textContent=values.length>1?progressDelta(values[values.length-1],values[values.length-2]):"";
  const value=document.createElement("strong");value.textContent=assessNumber(values[values.length-1]);
  const unit=document.createElement("small");unit.textContent=" "+entry.unit;value.append(unit);
  row.append(name,diff,value,progressChevron());row.onclick=()=>open(entry);table.append(row);
 }
 if(table.children.length)target.append(mapCard,table);
 return table.children.length>0;
}
// Skinfold page extras: ‹ previous · next › with dots, and a horizontal swipe (not from the left edge, not on the chart).
function progressSkinfoldPager(view,key,group="pregas"){
 const entries=progressSkinfoldEntries(group),i=entries.findIndex(e=>e.key===key);
 if(i<0||entries.length<2)return;
 const go=step=>{const next=entries[(i+step+entries.length)%entries.length];openProgressPage(next);};
 const dots=document.createElement("div");dots.className="progress-pager-dots";dots.setAttribute("aria-hidden","true");
 entries.forEach((_,j)=>{const d=document.createElement("span");if(j===i)d.className="on";dots.append(d);});
 const nav=document.createElement("div");nav.className="progress-pager";
 const prev=document.createElement("button");prev.type="button";prev.className="progress-pager-btn";
 const pe=entries[(i-1+entries.length)%entries.length],ne=entries[(i+1)%entries.length];
 prev.textContent="‹ "+playerAssessmentLabel(pe.key,pe.label);prev.onclick=()=>go(-1);
 const next=document.createElement("button");next.type="button";next.className="progress-pager-btn";
 next.textContent=playerAssessmentLabel(ne.key,ne.label)+" ›";next.onclick=()=>go(1);
 nav.append(prev,next);view.append(dots,nav);
 let start=null;
 view.ontouchstart=event=>{
  start=null;if(event.touches.length!==1)return;const t=event.touches[0];
  if(t.clientX<=PLAYER_EDGE_BACK_ZONE||event.target?.closest?.(".assessment-trend-horizontal-scroll,button"))return;
  start={x:t.clientX,y:t.clientY};
 };
 view.ontouchend=event=>{
  if(!start)return;const t=event.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;start=null;
  if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)go(dx<0?1:-1);
 };
}
function renderPlayerAssessments(){
 for(const button of document.querySelectorAll("[data-assessment-tab]"))button.setAttribute("aria-pressed",String(button.dataset.assessmentTab===assessmentGroup));
 const target=$("assessment-measurements"),kicker=$("progress-kicker");target.replaceChildren();kicker.textContent="";
 if(!assessmentRecords.length){
  const empty=document.createElement("p");empty.className="assessment-empty-state";empty.textContent=playerText("Ainda não existem avaliações publicadas.","No assessments published yet.");target.append(empty);return;
 }
 const recent=assessmentRecords[assessmentRecords.length-1];
 kicker.textContent=playerText("Última avaliação · ","Latest assessment · ")+progressLongDate(recent.assessed_on);
 const fields=assessmentFields[assessmentGroup]||[];
 const grid=document.createElement("div");grid.className="progress-grid";
 if(assessmentGroup==="resumo"){
  const muscles=fields.filter(([key])=>PROGRESS_MUSCLE_KEYS.includes(key));
  let fastingPlaced=false;
  for(const [key,label,unit] of fields){
   if(PROGRESS_MUSCLE_KEYS.includes(key))continue;
   if(key==="weight"){grid.append(progressFastingTile());fastingPlaced=true;continue;}
   grid.append(progressMetricTile(key,label,unit,key==="sum_8"));
  }
  if(!fastingPlaced)grid.insertBefore(progressFastingTile(),grid.children[1]||null);
  const muscle=progressMuscleTile(muscles);if(muscle)grid.append(muscle);
 }else if(assessmentGroup==="pregas"){
  if(progressSkinfoldScreen(target))return;
 }else if(assessmentGroup==="perimetros"){
  if(progressSkinfoldScreen(target,"perimetros"))return;
 }else{
  for(const [key,label,unit] of fields)grid.append(progressMetricTile(key,label,unit,false));
 }
 if(grid.children.length)target.append(grid);
 else{const empty=document.createElement("p");empty.className="assessment-empty-state";empty.textContent=playerText("Ainda não existem medições publicadas nesta categoria.","No measurements published in this category.");target.append(empty);}
}
// Metric page: back, value, the existing chart, the report average and the list of assessments.
function progressChartCard(key,unit,group){
 const card=document.createElement("div");card.className="progress-chart-card";
 card.append(buildAssessmentTrend(progressReadings(key),unit,progressAxisStep(group,unit),key==="sum_8"));
 if(key==="body_fat"){
  const source=assessmentRecords.slice().reverse().find(record=>Number.isFinite(record.measurements?.body_fat));
  const formula=playerBodyFatFormulaNote(source?.formula_note);
  if(formula){const note=document.createElement("p");note.className="assessment-formula";note.textContent=playerText("Gordura corporal: ","Body fat: ")+formula;card.append(note);}
 }
 return card;
}
function openProgressPage(page){
 if(!progressPage)progressReturnY=window.scrollY;
 progressPage={...page,group:assessmentGroup};
 const host=$("plans-assessments"),view=$("progress-page");host.classList.add("progress-page-open");view.hidden=false;view.replaceChildren();view.ontouchstart=view.ontouchend=null;
 const back=document.createElement("button");back.type="button";back.className="progress-back";back.setAttribute("aria-label",playerText("Voltar ao Progresso","Back to Progress"));
 const arrow=document.createElement("span");arrow.setAttribute("aria-hidden","true");arrow.textContent="‹";back.append(arrow);back.onclick=closeProgressPage;
 view.append(back);
 const recent=assessmentRecords[assessmentRecords.length-1];
 if(page.muscle){
  const head=document.createElement("header");head.className="progress-page-head";
  const k=document.createElement("p");k.className="progress-kicker";k.textContent=progressLongDate(recent.assessed_on);
  const h=document.createElement("h2");h.className="progress-title";h.textContent=playerText("Massa muscular","Muscle mass");head.append(k,h);view.append(head);
  for(const [key,label,unit] of page.fields){
   const values=progressReadings(key).map(r=>r.value);
   const row=document.createElement("div");row.className="progress-section-head";
   const n=document.createElement("h3");n.textContent=playerAssessmentLabel(key,label);
   const v=document.createElement("strong");v.textContent=assessNumber(values[values.length-1]);
   if(values.length>1){const d=document.createElement("small");d.textContent=" "+progressDelta(values[values.length-1],values[values.length-2]);v.append(d);}
   row.append(n,v);view.append(row,progressChartCard(key,unit,progressPage.group));
  }
 }else{
  const {key,label,unit}=page,readings=progressReadings(key),current=readings[readings.length-1],prior=readings[readings.length-2];
  const head=document.createElement("header");head.className="progress-page-head";
  const k=document.createElement("p");k.className="progress-kicker";k.textContent=playerAssessmentLabel(key,label);
  const value=document.createElement("strong");value.className="progress-page-value";value.textContent=assessNumber(current.value);
  if(unit){const u=document.createElement("span");u.textContent=" "+unit;value.append(u);}
  const sub=document.createElement("p");sub.className="progress-page-sub";
  sub.textContent=(prior?progressDelta(current.value,prior.value)+(unit?" "+unit:"")+playerText(" vs. avaliação anterior · "," vs. previous assessment · "):"")+progressLongDate(current.date);
  head.append(k,value,sub);
  const mapped=progressMapSites(progressPage.group)[key]&&(progressPage.group==="pregas"||progressPage.group==="perimetros");
  if(mapped){
   const top=document.createElement("div");top.className="progress-page-top";
   top.append(head,progressPage.group==="perimetros"?progressPerimeterMap({selected:key,mini:true}):progressBodyMap({selected:key,mini:true}));view.append(top,progressChartCard(key,unit,progressPage.group));
  }else view.append(head,progressChartCard(key,unit,progressPage.group));
  const averageKey=PROGRESS_REPORT_AVERAGE[key],average=averageKey!==undefined?recent.averages?.[averageKey]:undefined;
  if(average!==undefined&&average!==null&&Number.isFinite(Number(average))){
   const row=document.createElement("div");row.className="progress-average";
   const l=document.createElement("span");l.textContent=playerText("Média do relatório","Report average");
   const v=document.createElement("strong");v.textContent=assessNumber(average)+(unit?" "+unit:"");row.append(l,v);view.append(row);
  }
  const heading=document.createElement("h3");heading.className="progress-list-heading";heading.textContent=playerText("Avaliações","Assessments");
  const list=document.createElement("div");list.className="progress-list";
  const rows=readings.slice().reverse(),locale=playerDateLocale();
  rows.forEach((r,i)=>{
   const row=document.createElement("div");row.className="progress-list-row";
   const when=document.createElement("span");const d=new Date(r.date+"T12:00:00");when.textContent=d.getDate()+" "+d.toLocaleDateString(locale,{month:"short"}).replace(".","")+" "+d.getFullYear();
   const diff=document.createElement("small");diff.textContent=rows[i+1]?progressDelta(r.value,rows[i+1].value):"";
   const v=document.createElement("strong");v.textContent=assessNumber(r.value)+(unit?" "+unit:"");
   row.append(when,diff,v);list.append(row);
  });
  view.append(heading,list);
  if(mapped)progressSkinfoldPager(view,key,progressPage.group);
 }
 window.scrollTo({top:0});back.focus({preventScroll:true});
}
function closeProgressPage(restore=true){
 if(!progressPage)return;
 progressPage=null;
 const view=$("progress-page");view.hidden=true;view.replaceChildren();$("plans-assessments").classList.remove("progress-page-open");
 if(restore){const y=progressReturnY;requestAnimationFrame(()=>window.scrollTo({top:y}));}
}
for(const button of document.querySelectorAll("[data-assessment-tab]"))button.onclick=()=>{assessmentGroup=button.dataset.assessmentTab;renderPlayerAssessments();};


/* Swipe back (25/11): on every page with a ‹ back button, a swipe from the left edge to the right
   does the same as the button. The page follows the finger; the button's own handler does the navigation. */
const PLAYER_BACK_SELECTORS=["#progress-page:not([hidden]) .progress-back","#weight-detail:not([hidden]) .weight-detail-back",
 ".plan-page-head .plan-page-back","#overview-back:not([hidden])","#recipe-header-back:not([hidden])",".profile-page-back"];
function visibleBackButton(){
 for(const selector of PLAYER_BACK_SELECTORS){
  for(const button of document.querySelectorAll(selector)){
   if(!button.disabled&&button.getClientRects().length&&!button.closest("[hidden]"))return button;
  }
 }
 return null;
}
(function initEdgeSwipeBack(){
 let start=null,active=false,page=null,button=null;
 const reset=()=>{start=null;active=false;page=null;button=null;};
 const settle=(target,done)=>{
  if(!page){done?.();return;}
  const el=page;el.style.transition="transform 200ms cubic-bezier(.2,.8,.2,1)";el.style.transform="translate3d("+target+"px,0,0)";
  setTimeout(()=>{el.style.transition="";el.style.transform="";done?.();},205);
 };
 document.addEventListener("touchstart",event=>{
  reset();
  if(event.touches.length!==1)return;
  const t=event.touches[0];if(t.clientX>PLAYER_EDGE_BACK_ZONE||document.body.classList.contains("consumption-sheet-open"))return;
  if(event.target?.closest?.("input,select,textarea,[contenteditable],[role=\"slider\"],.consumption-editor"))return;
  button=visibleBackButton();if(!button)return;
  page=document.querySelector("#player-panel > section:not([hidden])");
  start={x:t.clientX,y:t.clientY,at:performance.now()};
 },{passive:true,capture:true});
 document.addEventListener("touchmove",event=>{
  if(!start||event.touches.length!==1)return;
  const t=event.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(!active){
   if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)){reset();return;}
   if(dx<10||dx<Math.abs(dy)*1.2)return;
   active=true;
  }
  if(event.cancelable)event.preventDefault();
  if(page){page.style.transition="none";page.style.transform="translate3d("+Math.max(0,dx)+"px,0,0)";}
 },{passive:false,capture:true});
 document.addEventListener("touchend",event=>{
  if(!start||!active){reset();return;}
  const dx=event.changedTouches[0].clientX-start.x,speed=dx/Math.max(1,performance.now()-start.at);
  const target=button;
  event.stopPropagation();
  if(dx>innerWidth*.28||(dx>40&&speed>.45)){
   settle(innerWidth,()=>{target.click();});
  }else settle(0);
  start=null;active=false;
 },{capture:true});
 document.addEventListener("touchcancel",()=>{if(active)settle(0);reset();},{passive:true,capture:true});
})();

/* Shared App Store-style sliding selection indicator. */
(function initSlidingSegmentedControls(){
 const selectors=['#menus-recipe-switch','#plans-assessments .assessment-tabs','#tabs'];
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 for(const selector of selectors){
  const nav=document.querySelector(selector);
  if(!nav||nav.querySelector('.mile-segment-indicator'))continue;
  const indicator=document.createElement('span');
  indicator.className='mile-segment-indicator';
  indicator.setAttribute('aria-hidden','true');
  nav.prepend(indicator);
  nav.classList.add('mile-segment-animated');
  let initialized=false,lastSelection=null;
  const position=()=>{
   const selected=nav.querySelector('button[aria-pressed="true"]');
   if(!selected)return;
   const container=nav.getBoundingClientRect(),rect=selected.getBoundingClientRect();
   if(!rect.width||!container.width)return;
   if(initialized&&lastSelection!==selected&&!reduce?.matches){
    indicator.classList.remove('mile-segment-bounce');
    void indicator.offsetWidth;
    indicator.classList.add('mile-segment-bounce');
   }
   lastSelection=selected;
   indicator.style.width=rect.width+'px';
   indicator.style.height=rect.height+'px';
   indicator.style.transform='translate3d('+(rect.left-container.left)+'px,'+(rect.top-container.top)+'px,0)';
   if(!initialized){indicator.classList.add('mile-segment-ready');initialized=true;}
  };
  const observer=new MutationObserver(position);
  observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-pressed','hidden','class']});
  nav.addEventListener('click',()=>requestAnimationFrame(position));
  window.addEventListener('resize',position,{passive:true});
  if(window.ResizeObserver){const resize=new ResizeObserver(position);resize.observe(nav);}
  requestAnimationFrame(()=>requestAnimationFrame(position));
 }
})();

// The Mile is one installable app; players and chefs use the same root-scope worker.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", {scope:"/"}).catch(() => {});
  });
}
