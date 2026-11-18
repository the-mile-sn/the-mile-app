"use strict";

// The Chef experience shares The Mile's authentication and published nutrition data.
// Athlete scope is resolved exclusively by the server from the current chef session.
const el = id => document.getElementById(id);
const locale = code => code === "en" ? "en-GB" : "pt-PT";
const labels = {
  pt: {
    login:"Área Chef", loginHint:"Acede ao planeamento do jogador associado.",
    password:"Palavra-passe", enter:"Entrar", player:"Jogador associado",
    home:"Início", plans:"Plano alimentar", menus:"Menus", profile:"Perfil",
    logout:"Terminar sessão", mealLunch:"Almoço", mealDinner:"Jantar",
    pending:"A aguardar menu", readOnly:"Consulta do planeamento nutricional",
    week:"Semana de planeamento", weekMenu:"Planeamento da semana",
    day:"Resumo do dia", selectColor:"Cor nutricional", noColor:"Sem cor atribuída",
    noPlan:"Não existe uma prescrição publicada para esta refeição e cor.",
    option:"Opção", planned:"Menu planeado", username:"Username",
    language:"Idioma", chef:"Conta Chef", noData:"Sem informação disponível",
    fail:"Não foi possível carregar a informação.", invalid:"Confirma as credenciais e tenta novamente.",
    viewOnly:"O registo de execução e a edição de menus serão disponibilizados na próxima etapa."
  },
  en: {
    login:"Chef area", loginHint:"Access your assigned player's meal planning.",
    password:"Password", enter:"Sign in", player:"Assigned player",
    home:"Home", plans:"Meal plan", menus:"Menus", profile:"Profile",
    logout:"Sign out", mealLunch:"Lunch", mealDinner:"Dinner",
    pending:"Awaiting menu", readOnly:"Nutrition planning overview",
    week:"Planning week", weekMenu:"Weekly meal planning",
    day:"Day overview", selectColor:"Nutrition colour", noColor:"No colour assigned",
    noPlan:"No published prescription is available for this meal and colour.",
    option:"Option", planned:"Planned menu", username:"Username",
    language:"Language", chef:"Chef account", noData:"No information available",
    fail:"Unable to load information.", invalid:"Please check your credentials and try again.",
    viewOnly:"Meal execution and menu editing will be available in the next stage."
  }
};
const tone = {orange:"#ea8a2b", yellow:"#dec34c", blue:"#6c9ad5", green:"#52ad78", vp:"#2d9768"};
const colorText = {
  pt:{orange:"Laranja", yellow:"Amarelo", blue:"Azul", green:"Verde", vp:"Verde preparação"},
  en:{orange:"Orange", yellow:"Yellow", blue:"Blue", green:"Green", vp:"Preparation green"}
};
const mealOrder = ["breakfast","lunch","snack","dinner","supper"];
const mealNames = {
  pt:{breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"},
  en:{breakfast:"Breakfast",lunch:"Lunch",snack:"Snack",dinner:"Dinner",supper:"Supper"}
};
let csrf = "", sessionUser = null, chef = null, player = null;
let lang = "pt", selectedDay = new Date(), activeTab = "home";
let menus = [], days = [], colors = {}, prescriptions = {}, executions = [];
const txt = () => labels[lang];

function dateKey(date){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),
    String(date.getDate()).padStart(2,"0")].join("-");
}
function monday(date){
  const d = new Date(date.getFullYear(),date.getMonth(),date.getDate());
  d.setDate(d.getDate() - (d.getDay()+6)%7);
  return d;
}
function shift(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d;}
function format(date,options){return new Intl.DateTimeFormat(locale(lang),options).format(date);}
function node(tag,cls,value){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(value!==undefined)n.textContent=value;
  return n;
}
function asText(value){return typeof value==="string"?value:String(value??"");}
async function request(path,method="GET",body=null){
  const res=await fetch(path,{method,credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json",...(method!=="GET"?{"X-CSRF-Token":csrf}:{})},
    ...(body===null?{}:{body:JSON.stringify(body)})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data.error||txt().fail);err.status=res.status;throw err;}
  return data;
}
function show(view){
  el("loading-view").hidden=true;
  el("login-view").hidden=view!=="login";
  el("chef-view").hidden=view!=="chef";
  el("chef-nav").hidden=view!=="chef";
  el("top-logout").hidden=view!=="chef";
}
function showError(message){const screen=el("screen");screen.replaceChildren(node("p","error",message));}
async function init(){
  try{
    const response=await request("/api/me");
    csrf=response.csrf||"";
    sessionUser=response.user;
    if(!sessionUser || sessionUser.role!=="chef"){renderLogin();show("login");return;}
    const me=await request("/api/v2/chef/me");
    chef=me.chef;player=me.player;
    lang=chef.language==="en"?"en":"pt";
    prescriptions=(await request("/api/v2/chef/plans")).options_by_color||{};
    show("chef");
    await loadWeek();
  }catch(err){
    if(err.status===401||err.status===403){renderLogin();show("login");}
    else {el("loading-view").textContent=txt().fail;}
  }
}
function renderLogin(){
  el("login-heading").textContent=txt().login;
  el("login-description").textContent=txt().loginHint;
  el("password-label").textContent=txt().password;
  el("login-button").textContent=txt().enter;
  el("login-form").onsubmit=async event=>{
    event.preventDefault();
    el("login-error").textContent="";
    const button=el("login-button");button.disabled=true;
    try{
      await request("/api/login","POST",{
        identifier:el("username").value.trim(),password:el("password").value
      });
      const session=await request("/api/me");
      csrf=session.csrf||"";
      if(session.user?.role!=="chef")throw Error(txt().invalid);
      await init();
    }catch(err){el("login-error").textContent=txt().invalid;}
    finally{button.disabled=false;}
  };
}
async function loadWeek(){
  const start=monday(selectedDay);
  const end=shift(start,6);
  const q="?start="+dateKey(start)+"&end="+dateKey(end);
  const [calendar, menuResponse, executionResponse]=await Promise.all([
    request("/api/v2/chef/calendar"+q),
    request("/api/v2/chef/menus"+q),
    request("/api/v2/chef/menu-executions"+q)
  ]);
  days=calendar.days||[];colors=calendar.effective_colors||{};
  menus=menuResponse.menus||[];executions=executionResponse.executions||[];
  render();
}
function colorFor(day,meal){
  const c=colors[day]?.[meal]?.color;
  return c && c!=="none" ? c : null;
}
function colorChip(color){
  return node("span","chip"+(color?" "+color:""),
    color?(colorText[lang][color]||color):txt().noColor);
}
function plannedMenu(day,meal){return menus.find(m=>m.menu_date===day&&m.meal===meal);}
function mealPhoto(item){
  if(!item?.dish_id || item.kind!=="dish")return null;
  const photo=node("img","meal-photo");
  photo.src="/api/v2/chef/dish-photo/"+encodeURIComponent(item.dish_id);
  photo.alt=asText(item.value);
  photo.loading="lazy";
  photo.onerror=()=>photo.remove();
  return photo;
}
function miniButton(label,click){
  const b=node("button","chef-secondary",label);b.type="button";b.onclick=click;return b;
}
function makeInput(tag,placeholder,maxLength){
  const field=node(tag,"chef-input");
  field.placeholder=placeholder||"";
  if(maxLength)field.maxLength=maxLength;
  return field;
}
function executionForm(date,meal,card){
  const now=executions.find(e=>e.menu_date===date&&e.meal===meal);
  if(now){
    const translation={pt:{served_planned:"Servido conforme planeado",served_changed:"Servido com alterações",ate_out:"Jogador comeu fora",chef_off:"Chef de folga"},
      en:{served_planned:"Served as planned",served_changed:"Served with changes",ate_out:"Player ate out",chef_off:"Chef off duty"}};
    card.append(node("p","chef-exec-current",translation[lang][now.state]+(now.served_description?" · "+now.served_description:"")));
  }
  const details=node("details","chef-inline-edit");
  const summary=node("summary","",lang==="pt"?"Registar execução":"Record meal execution");details.append(summary);
  const form=node("form","chef-editor");
  const select=node("select","chef-input");
  select.append(node("option","",lang==="pt"?"Selecionar o que aconteceu":"Choose what happened"));
  select.options[0].value="";
  const states=[["served_planned",lang==="pt"?"Servido conforme planeado":"Served as planned"],
    ["served_changed",lang==="pt"?"Servido com alterações":"Served with changes"],
    ["ate_out",lang==="pt"?"Jogador comeu fora":"Player ate out"],
    ["chef_off",lang==="pt"?"Chef de folga":"Chef off duty"]];
  for(const [value,label] of states){
    const option=node("option","",label);option.value=value;select.append(option);
  }
  select.required=true;form.append(select);
  const served=makeInput("textarea",lang==="pt"?"O que foi servido?":"What was served?",500);
  served.hidden=true;select.onchange=()=>{served.hidden=select.value!=="served_changed";};
  form.append(served);
  const notes=makeInput("textarea",lang==="pt"?"Observações (opcional)":"Notes (optional)",500);
  form.append(notes);
  const save=node("button","primary chef-save",lang==="pt"?"Guardar registo":"Save record");
  save.type="submit";form.append(save);
  const feedback=node("p","chef-feedback");form.append(feedback);
  form.onsubmit=async e=>{
    e.preventDefault();if(!select.value)return;
    save.disabled=true;feedback.textContent="";
    try{
      await request("/api/v2/chef/menu-executions","POST",{
        menu_date:date,meal,state:select.value,
        served_description:select.value==="served_changed"?served.value:"",
        note:notes.value
      });
      await loadWeek();
    }catch(err){feedback.textContent=txt().fail;}
    finally{save.disabled=false;}
  };
  details.append(form);card.append(details);
}
function editMenuForm(date,meal,item,slot){
  if(date<dateKey(new Date()))return;
  const holder=node("div","chef-menu-editor");
  const type=node("select","chef-input");
  const options=[
    ["dish",lang==="pt"?"Prato aprovado":"Approved dish"],
    ["category",lang==="pt"?"Categoria":"Category"],
    ["proposal",lang==="pt"?"Propor prato novo":"Suggest new dish"]
  ];
  for(const [val,label] of options){const opt=node("option","",label);opt.value=val;type.append(opt);}
  type.value=item?.kind==="category"?"category":"dish";
  holder.append(type);
  const search=makeInput("input",lang==="pt"?"Pesquisar prato aprovado":"Search approved dish",90);
  const dishSelect=node("select","chef-input");
  const category=node("select","chef-input");
  for(const c of ["Carne branca","Carne vermelha","Peixe magro","Peixe gordo","Livre","Pós-jogo","Mix","CT","Estágio"]){
    const opt=node("option","",c);opt.value=c;category.append(opt);
  }
  if(item?.kind==="category")category.value=item.value;
  const proposal=makeInput("input",lang==="pt"?"Nome do prato sugerido":"Suggested dish name",200);
  const note=makeInput("textarea",lang==="pt"?"Nota para a equipa (opcional)":"Note for the team (optional)",500);
  holder.append(search,dishSelect,category,proposal,note);
  const feedback=node("p","chef-feedback"),actions=node("div","chef-edit-actions");
  const save=miniButton(lang==="pt"?"Guardar":"Save",()=>{});save.classList.add("primary");
  const cancel=miniButton(lang==="pt"?"Cancelar":"Cancel",()=>holder.remove());
  actions.append(save,cancel);holder.append(actions,feedback);
  async function findDishes(){
    try{
      const data=await request("/api/v2/chef/dishes?q="+encodeURIComponent(search.value.trim()));
      dishSelect.replaceChildren();
      for(const dish of data.dishes||[]){
        const option=node("option","",dish.name_pt);option.value=dish.id;dishSelect.append(option);
      }
      if(item?.dish_id&&Array.from(dishSelect.options).some(o=>o.value===item.dish_id))dishSelect.value=item.dish_id;
    }catch(err){feedback.textContent=txt().fail;}
  }
  let debounce;
  search.oninput=()=>{clearTimeout(debounce);debounce=setTimeout(findDishes,220);};
  function showType(){
    search.hidden=dishSelect.hidden=type.value!=="dish";
    category.hidden=type.value!=="category";
    proposal.hidden=note.hidden=type.value!=="proposal";
  }
  type.onchange=showType;showType();findDishes();
  save.onclick=async()=>{
    save.disabled=true;feedback.textContent="";
    try{
      if(type.value==="proposal"){
        await request("/api/v2/chef/menu-proposals","POST",{
          menu_date:date,meal,name:proposal.value,note:note.value
        });
        feedback.textContent=lang==="pt"?"Proposta enviada para validação.":"Suggestion submitted for review.";
        return;
      }
      const selected=dishSelect.selectedOptions[0];
      if(type.value==="dish"&&!selected)throw Error("no_dish");
      await request("/api/v2/chef/menus","PUT",{
        menu_date:date,meal,kind:type.value,
        value:type.value==="dish"?selected.textContent:category.value,
        dish_id:type.value==="dish"?dishSelect.value:null
      });
      await loadWeek();
    }catch(err){feedback.textContent=txt().fail+" "+(err.message||"");}
    finally{save.disabled=false;}
  };
  slot.append(holder);
}


const chefIcons={breakfast:"coffee-03",lunch:"restaurant-02",snack:"vegetarian-food",dinner:"restaurant-02",supper:"moon-02"};
const mealAbbrev={breakfast:"PA",lunch:"AL",snack:"LA",dinner:"JA",supper:"CE"};
const chefSvgPaths={"coffee-03":"<path d=\"M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Zm12 1h1a3 3 0 0 1 0 6h-2M4 22h16M8 3v3m4-3v3m4-3v3\"/>","vegetarian-food":"<path d=\"M4 12c2-4 6-4 8 0 2-4 6-4 8 0l-2 7H6l-2-7ZM12 10V4M8 7 5 5m11 2 3-2M6 22h12\"/>","restaurant-02":"<path d=\"M4 3v8m3-8v8M4 7h3M5.5 11v10M13 3v18M13 12c7 0 8-8 3-9v9M20 3v18\"/>","moon-02":"<path d=\"M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z\"/>","football":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m12 7 4 3-1.5 5h-5L8 10l4-3Zm-4 3-4-1m12 1 4-1m-5.5 6 2 5m-7-5-2 5M12 7V3\"/>","football-pitch":"<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"1\"/><path d=\"M12 4v16m0-12a4 4 0 0 0 0 8M2.5 9h4v6h-4m19-6h-4v6h4\"/>","soft-drink-01":"<path d=\"M5 5h14l-2 16H7L5 5ZM4 3h16M12 5l4-4M8 11h8m-6 4h4\"/>","home-09":"<path d=\"m3 11 9-8 9 8v9H3v-9Zm6 9v-7h6v7\"/>","files-01":"<path d=\"M7 3h10l4 4v14H7V3Zm10 0v5h4M3 7v14h14\"/>","add-circle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v10m-5-5h10\"/>","menu-restaurant":"<path d=\"M4 4v7m3-7v7M4 7h3m-1.5 4v9M13 4v16m0-8c7 0 8-7 3-8v8M3 22h18\"/>","user-03":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>"};;
const svgMarkup=name=>'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+(chefSvgPaths[name]||"")+"</svg>";
function paintChefIcons(){
 document.querySelectorAll(".mile-icon").forEach(item=>{
  if(item.dataset.chefSvg)return;
  const name=Array.from(item.classList).find(cls=>cls.startsWith("icon-"))?.slice(5);
  if(!name||!chefSvgPaths[name])return;
  item.innerHTML=svgMarkup(name);
  item.dataset.chefSvg="true";
 });
}
function iconForMeal(meal){
 const icon=node("span","mile-icon icon-"+chefIcons[meal]);
 icon.setAttribute("aria-hidden","true");
 icon.innerHTML=svgMarkup(chefIcons[meal]);
 icon.dataset.chefSvg="true";
 return icon;
}
let chefViewMode="day",chefWeekSelection=null,chefMenuMode="menus";
const validColors=["orange","yellow","blue","green","vp"];
function mealTone(day,meal){const color=colorFor(day,meal);return validColors.includes(color)?color:"neutral";}
function dateDescription(value,options={weekday:"long",day:"numeric",month:"long",year:"numeric"}){
 return format(value,options).replace(/^./,letter=>letter.toLocaleUpperCase(locale(lang)));
}
function classificationFor(key){return days.find(item=>item.date===key)?.classification||"";}
function mealAvailable(date,meal){return !!colorFor(date,meal)||!!plannedMenu(date,meal);}
function chefNutrition(totals){
 if(!totals||typeof totals!=="object")return null;
 const keys=[["kcal","kcal",""],["protein_g","protein","g"],["carbs_g","carbs","g"],["fat_g","fat","g"]];
 if(!keys.every(([key])=>Number.isFinite(Number(totals[key]))))return null;
 const line=node("div","chef-option-nutrition");
 keys.forEach(([key,cls,unit])=>{
  const value=Math.round(Number(totals[key]));
  line.append(node("span",cls,(unit?value+" "+unit:value+" kcal")));
 });
 return line;
}
function appendChefFoodItems(host,items){
 for(const food of items||[]){
  if(food.kind==="collapsible_note"){
   const note=node("details","chef-option-note");
   note.append(node("summary","",food.title||"Observações"),node("p","",asText(food.text||"")));
   host.append(note);
   continue;
  }
  const text=food.kind==="food"
   ?[food.quantity,food.name].filter(Boolean).join(" · ")
   :[food.quantity,food.name||food.text].filter(Boolean).join(" · ");
  if(text)host.append(node("div","chef-option-food",text));
 }
}
function chefOptionCards(date,meal){
 const color=colorFor(date,meal),options=color?prescriptions[color]?.[meal]||[]:[];
 const list=node("div","chef-option-list");
 if(!options.length){
  if(color)list.append(node("p","chef-option-empty",txt().noPlan));
  return list;
 }
 options.forEach((option,index)=>{
  const card=node("details","chef-option-card player-meal-option-subcard");
  card.open=index===0;
  const head=node("summary","chef-option-head");
  const label=node("span","chef-option-label");
  label.append(node("small","",txt().option+" "+(option.number||index+1)));
  if(option.title)label.append(node("strong","",asText(option.title)));
  head.append(label,node("span","chef-option-arrow","⌄"));
  card.append(head);
  const body=node("div","chef-option-body");
  const nutrition=chefNutrition(option.totals);
  if(nutrition)body.append(nutrition);
  appendChefFoodItems(body,option.items);
  card.append(body);list.append(card);
 });
 return list;
}
function chefMenuPhoto(item){
 const photo=mealPhoto(item);
 if(!photo)return null;
 const frame=node("span","chef-dish-photo-frame");
 photo.className="chef-dish-photo";
 frame.append(photo);
 const zoom=node("span","chef-photo-zoom");
 zoom.setAttribute("aria-hidden","true");
 zoom.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
 frame.append(zoom);
 frame.setAttribute("role","button");frame.tabIndex=0;
 frame.setAttribute("aria-label","Ampliar fotografia do prato");
 const open=()=>{
  const overlay=node("div","chef-photo-overlay");
  const close=node("button","chef-photo-close","×");close.type="button";
  close.setAttribute("aria-label","Fechar fotografia");
  const large=node("img","chef-photo-large");large.src=photo.src;large.alt=photo.alt;
  const dismiss=()=>{document.removeEventListener("keydown",onKey);overlay.remove();};
  const onKey=event=>{if(event.key==="Escape")dismiss();};
  close.onclick=dismiss;overlay.onclick=event=>{if(event.target===overlay)dismiss();};
  overlay.append(close,large);document.body.append(overlay);document.addEventListener("keydown",onKey);close.focus();
 };
 frame.onclick=open;
 frame.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}};
 return frame;
}
function appendChefMenuDish(host,item,emptyLabel){
 const wrap=node("div","chef-meal-dish");
 wrap.append(node("div",item?"chef-dish-name":"chef-dish-pending",item?asText(item.value):emptyLabel));
 const photo=chefMenuPhoto(item);if(photo)wrap.append(photo);
 host.append(wrap);
}
function renderChefMeal(date,meal,expanded=false,onlyPrescription=false){
 const card=node("details","chef-meal-card tone-"+mealTone(date,meal));
 card.open=expanded;
 const head=node("summary","chef-meal-head");
 const symbol=node("span","chef-meal-icon");symbol.append(iconForMeal(meal));
 head.append(symbol,node("strong","",mealNames[lang][meal]));
 head.append(node("span","chef-chevron","⌄"));card.append(head);
 const body=node("div","chef-meal-body");
 if(!onlyPrescription&&(meal==="lunch"||meal==="dinner")){
  appendChefMenuDish(body,plannedMenu(date,meal),txt().pending);
 }
 body.append(chefOptionCards(date,meal));
 if(!onlyPrescription&&(meal==="lunch"||meal==="dinner"))executionForm(date,meal,body);
 card.append(body);return card;
}
function renderChefDaily(root){
 const date=dateKey(selectedDay),classification=classificationFor(date);
 const summary=node("section","chef-daily-summary");
 const header=node("div","chef-summary-header");
 header.append(node("strong","",dateDescription(selectedDay)));
 if(classification)header.append(node("span","chef-microcycle",classification));
 summary.append(header);
 const strip=node("div","chef-day-colors");
 for(const meal of mealOrder){
  if(!mealAvailable(date,meal))continue;
  const cell=node("div","chef-day-color tone-"+mealTone(date,meal));
  cell.append(iconForMeal(meal),node("span","",mealAbbrev[meal]),node("span","chef-day-bar"));
  strip.append(cell);
 }
 summary.append(strip);root.append(summary);
 for(const meal of mealOrder){
  if(mealAvailable(date,meal))root.append(renderChefMeal(date,meal,meal==="lunch"||meal==="dinner"));
 }
}
function renderChefWeekly(root){
 const start=monday(selectedDay),keys=Array.from({length:7},(_,i)=>dateKey(shift(start,i)));
 const grid=node("div","chef-week-grid");
 for(let i=0;i<7;i++){
  const date=shift(start,i),key=keys[i];
  const dayHead=node("button","chef-week-day"+(dateKey(selectedDay)===key?" selected":""));
  dayHead.type="button";dayHead.setAttribute("aria-label",dateDescription(date));
  dayHead.setAttribute("aria-pressed",String(dateKey(selectedDay)===key));
  dayHead.append(node("small","",format(date,{weekday:"short"}).replace(".","").replace(/^./,c=>c.toUpperCase())),
    node("strong","",String(date.getDate())),node("span","",classificationFor(key)));
  dayHead.onclick=()=>{selectedDay=date;chefWeekSelection=null;render();};
  grid.append(dayHead);
 }
 const visible=mealOrder.filter(meal=>keys.some(key=>mealAvailable(key,meal)));
 for(const meal of visible){
  for(const key of keys){
   const color=mealTone(key,meal),available=mealAvailable(key,meal);
   const active=chefWeekSelection?.date===key&&chefWeekSelection?.meal===meal;
   const cell=node("button","chef-week-cell tone-"+color+(available?"":" unavailable")+(active?" selected":""));
   cell.type="button";cell.disabled=!available;
   cell.append(iconForMeal(meal),node("span","",mealAbbrev[meal]));
   cell.setAttribute("aria-label",mealNames[lang][meal]+", "+key+"; "+(available?"abrir detalhes":"não prevista"));
   if(available)cell.onclick=()=>{chefWeekSelection=active?null:{date:key,meal};render();};
   grid.append(cell);
  }
 }
 root.append(grid);
 if(chefWeekSelection){
  const {date,meal}=chefWeekSelection,dt=new Date(date+"T12:00:00");
  const panel=node("section","chef-week-detail");
  const top=node("div","chef-week-detail-head");
  top.append(node("strong","",mealNames[lang][meal]+" · "+dateDescription(dt)));
  const close=node("button","chef-week-close","×");close.type="button";close.setAttribute("aria-label","Fechar detalhes");
  close.onclick=()=>{chefWeekSelection=null;render();};top.append(close);panel.append(top);
  panel.append(renderChefMeal(date,meal,true));root.append(panel);
 }
}
function sectionTitle(title,extra){
 const head=node("div","section-head");head.append(node("h2","",title));
 if(extra)head.append(node("span","",extra));return head;
}
function renderHome(root){if(chefViewMode==="week")renderChefWeekly(root);else renderChefDaily(root);}
function renderPlan(root){
 const date=dateKey(selectedDay);
 root.append(sectionTitle(txt().plans,dateDescription(selectedDay,{weekday:"long",day:"numeric",month:"long"})));
 for(const meal of mealOrder){
  if(!colorFor(date,meal))continue;
  root.append(renderChefMeal(date,meal,false,true));
 }
 if(!root.querySelector(".chef-meal-card"))root.append(node("p","muted",txt().noData));
}

function renderChefMenuDateStrip(root){
 const wrap=node("nav","chef-menu-week-strip");wrap.setAttribute("aria-label","Semana do menu");
 const start=monday(selectedDay);
 for(let offset=0;offset<7;offset++){
  const date=shift(start,offset),key=dateKey(date);
  const cell=node("button","chef-menu-week-day"+(key===dateKey(selectedDay)?" selected":""));
  cell.type="button";
  cell.append(node("small","",format(date,{weekday:"short"}).replace(".","").replace(/^./,c=>c.toUpperCase())),
    node("strong","",String(date.getDate())),node("span","",classificationFor(key)));
  cell.setAttribute("aria-label",dateDescription(date));
  cell.setAttribute("aria-pressed",String(key===dateKey(selectedDay)));
  cell.onclick=()=>{selectedDay=date;loadWeek().catch(err=>showError(txt().fail));};
  wrap.append(cell);
 }
 root.append(wrap);
}
function renderChefMenuDay(root,key){
 const date=new Date(key+"T12:00:00");
 const card=node("section","chef-menu-day");
 const head=node("div","chef-menu-day-header");
 head.append(node("strong","",dateDescription(date)));
 const micro=classificationFor(key);if(micro)head.append(node("span","",micro));
 card.append(head);
 for(const meal of ["lunch","dinner"]){
  const item=plannedMenu(key,meal),color=mealTone(key,meal);
  const slot=node("article","chef-menu-entry tone-"+color);
  slot.append(node("div","chef-menu-meal-label",mealNames[lang][meal]));
  appendChefMenuDish(slot,item,txt().pending);
  if(key>=dateKey(new Date())){
   const edit=miniButton(lang==="pt"?"Editar menu":"Edit menu",()=>{
    const existing=slot.querySelector(".chef-menu-editor");
    if(existing){existing.remove();return;}
    editMenuForm(key,meal,item,slot);
   });
   edit.classList.add("chef-menu-edit-button");
   slot.append(edit);
  }
  card.append(slot);
 }
 root.append(card);
}
function renderChefRecipes(root){
 const description=node("p","chef-recipes-caption",
  lang==="pt"?"Consulta dos pratos aprovados disponíveis para os menus.":"Approved dishes available for menus.");
 const search=node("input","chef-recipes-search");
 search.type="search";search.placeholder=lang==="pt"?"Pesquisar pratos aprovados":"Search approved dishes";
 search.setAttribute("aria-label",search.placeholder);
 const list=node("div","chef-recipes-list");
 root.append(description,search,list);
 let requestNumber=0;
 const find=async()=>{
  const seq=++requestNumber;list.replaceChildren(node("p","chef-recipes-status",lang==="pt"?"A pesquisar…":"Searching…"));
  try{
   const result=await request("/api/v2/chef/dishes?q="+encodeURIComponent(search.value.trim()));
   if(seq!==requestNumber||!list.isConnected)return;
   list.replaceChildren();
   for(const dish of result.dishes||[]){
    const item=node("article","chef-recipe-row");
    item.append(node("strong","",dish.name_pt));
    item.append(node("span","",dish.category||""));
    list.append(item);
   }
   if(!list.childElementCount)list.append(node("p","chef-recipes-status",txt().noData));
  }catch(err){if(seq===requestNumber&&list.isConnected)list.replaceChildren(node("p","error",txt().fail));}
 };
 let debounce;search.oninput=()=>{clearTimeout(debounce);debounce=setTimeout(find,220);};
 find();
}
function renderMenus(root){
 const switcher=node("nav","chef-menu-switch");switcher.setAttribute("aria-label","Menus e receitas");
 for(const [key,caption] of [["menus",txt().menus],["recipes",lang==="pt"?"Receitas":"Recipes"]]){
  const button=node("button","",caption);button.type="button";button.dataset.mode=key;
  button.setAttribute("aria-pressed",String(chefMenuMode===key));
  button.onclick=()=>{chefMenuMode=key;render();};switcher.append(button);
 }
 root.append(switcher);
 if(chefMenuMode==="recipes"){renderChefRecipes(root);return;}
 renderChefMenuDateStrip(root);
 const start=monday(selectedDay);
 for(let offset=0;offset<7;offset++)renderChefMenuDay(root,dateKey(shift(start,offset)));
}
function renderProfile(root){
  root.append(sectionTitle(txt().profile));
  const panel=node("section","panel");
  panel.append(node("h3","",txt().chef));
  for(const [label,value]of [[txt().username,chef?.username||""],
    [txt().player,player?.name||""]]){
    const row=node("div","profile-row");row.append(node("span","",label),node("strong","",value));panel.append(row);
  }
  const row=node("div","profile-row");
  row.append(node("span","",txt().language));
  const segment=node("div","segment");
  for(const code of ["pt","en"]){
    const button=node("button",lang===code?"active":"",code.toUpperCase());
    button.type="button";button.onclick=async()=>{
      button.disabled=true;
      try{
        await request("/api/v2/chef/preferences","PUT",{language:code});
        lang=code;chef.language=code;render();
      }catch(err){showError(txt().fail);}
      finally{button.disabled=false;}
    };
    segment.append(button);
  }
  row.append(segment);panel.append(row);
  root.append(panel);
}
function render(){
  document.documentElement.lang=lang==="pt"?"pt-PT":"en";
  el("top-name").textContent=chef.name;
  el("top-logout").textContent=txt().logout;
  el("player-label").textContent=txt().player.toUpperCase();
  el("player-name").textContent=player.name;
  el("page-context").textContent=txt().readOnly;
  const start=monday(selectedDay),end=shift(start,6);
  el("week-range").textContent=format(start,{day:"numeric",month:"short"})+" – "+
    format(end,{day:"numeric",month:"short",year:"numeric"});
  el("week-caption").textContent=txt().week;
  const picker=el("day-picker");picker.replaceChildren();
  for(let i=0;i<7;i++){
    const date=shift(start,i);
    const button=node("button",dateKey(date)===dateKey(selectedDay)?"active":"");
    button.type="button";
    button.append(node("small","",format(date,{weekday:"short"})),node("span","",String(date.getDate())));
    button.setAttribute("aria-pressed",dateKey(date)===dateKey(selectedDay)?"true":"false");
    button.onclick=()=>{selectedDay=date;render();};
    picker.append(button);
  }
  const nav=el("chef-nav");
  for(const [tab,caption] of Object.entries({
    home:txt().home,plans:txt().plans,menus:txt().menus,profile:txt().profile
  })){
    const button=nav.querySelector('[data-tab="'+tab+'"]');
    button.querySelector("span").textContent=caption;
    button.setAttribute("aria-current",activeTab===tab?"page":"false");
  }
  el("chef-view-mode").hidden=activeTab!=="home";
  el("day-controls").hidden=activeTab==="home"||activeTab==="menus"||activeTab==="profile";
  picker.hidden=activeTab==="home"||activeTab==="menus"||activeTab==="profile";
  for(const button of el("chef-view-mode").querySelectorAll("[data-view]"))button.setAttribute("aria-pressed",String(button.dataset.view===chefViewMode));
  const screen=el("screen");screen.replaceChildren();
  if(activeTab==="home")renderHome(screen);
  if(activeTab==="plans")renderPlan(screen);
  if(activeTab==="menus")renderMenus(screen);
  if(activeTab==="profile")renderProfile(screen);
  el("top-logout").hidden=activeTab!=="profile";
  paintChefIcons();
}
el("chef-view-mode").querySelectorAll("[data-view]").forEach(button=>{button.onclick=()=>{chefViewMode=button.dataset.view;chefWeekSelection=null;render();};});
el("prev-week").onclick=async()=>{selectedDay=shift(selectedDay,-7);try{await loadWeek();}catch(err){showError(txt().fail);}};
el("next-week").onclick=async()=>{selectedDay=shift(selectedDay,7);try{await loadWeek();}catch(err){showError(txt().fail);}};
el("chef-nav").querySelectorAll("[data-tab]").forEach(button=>{
  button.onclick=()=>{activeTab=button.dataset.tab;render();};
});
el("top-logout").onclick=async()=>{
  try{await request("/api/logout","POST",{});}catch(e){}
  csrf="";sessionUser=null;chef=null;player=null;location.replace("/chef");
};
init();
