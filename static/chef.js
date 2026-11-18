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
let chefViewMode="day",chefWeekSelection=null;
const validColors=["orange","yellow","blue","green","vp"];
function mealTone(day,meal){const color=colorFor(day,meal);return validColors.includes(color)?color:"neutral";}
function iconForMeal(meal){const icon=node("i","mile-icon icon-"+chefIcons[meal]);icon.setAttribute("aria-hidden","true");return icon;}
function dateDescription(value,options={weekday:"long",day:"numeric",month:"long",year:"numeric"}){return format(value,options).replace(/^./,c=>c.toLocaleUpperCase(locale(lang)));}
function classificationFor(key){const found=days.find(x=>x.date===key);return found?.classification||"";}
function mealAvailable(date,meal){return !!colorFor(date,meal)||!!plannedMenu(date,meal);}
function prescriptionDetails(date,meal){
 const color=colorFor(date,meal);if(!color)return null;
 const options=prescriptions[color]?.[meal]||[];
 const details=node("details","chef-prescription");
 const sum=node("summary","chef-prescription-summary",lang==="pt"?"Prescrição":"Prescription");details.append(sum);
 if(!options.length){details.append(node("p","chef-no-prescription",txt().noPlan));return details;}
 options.forEach((option,index)=>{
   const group=node("div","chef-prescription-option");
   group.append(node("strong","",(option.title?asText(option.title)+" · ":"")+txt().option+" "+(option.number||index+1)));
   for(const food of option.items||[]){
     const line=[food.quantity,food.name||food.text].filter(Boolean).join(" ");
     if(line)group.append(node("div","chef-prescription-food",line));
   }
   details.append(group);
 });
 return details;
}
function appendMenuDetails(host,date,meal){
 const item=plannedMenu(date,meal);
 if(meal==="lunch"||meal==="dinner"){
   const dish=node("div","chef-meal-dish");
   const description=node("div",item?"chef-dish-name":"chef-dish-pending",item?asText(item.value):txt().pending);
   dish.append(description);
   const photo=mealPhoto(item);if(photo){photo.classList.add("chef-dish-photo");dish.append(photo);}
   host.append(dish);
 }
 const prescription=prescriptionDetails(date,meal);if(prescription)host.append(prescription);
 if(meal==="lunch"||meal==="dinner")executionForm(date,meal,host);
}
function renderChefMeal(date,meal,expanded=false){
 const color=mealTone(date,meal);
 const card=node("details","chef-meal-card tone-"+color);
 if(expanded)card.open=true;
 const head=node("summary","chef-meal-head");
 const symbol=node("span","chef-meal-icon");symbol.append(iconForMeal(meal));
 head.append(symbol,node("strong","",mealNames[lang][meal]));
 const arrow=node("span","chef-chevron","⌄");arrow.setAttribute("aria-hidden","true");head.append(arrow);
 card.append(head);
 const body=node("div","chef-meal-body");appendMenuDetails(body,date,meal);card.append(body);
 return card;
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
   cell.append(iconForMeal(meal),node("span","",mealAbbrev[meal]));
   cell.append(node("span","chef-day-bar"));
   strip.append(cell);
 }
 summary.append(strip);root.append(summary);
 for(const meal of mealOrder){
   if(!mealAvailable(date,meal))continue;
   root.append(renderChefMeal(date,meal,meal==="lunch"||meal==="dinner"));
 }
}
function renderChefWeekly(root){
 const start=monday(selectedDay),keys=Array.from({length:7},(_,i)=>dateKey(shift(start,i)));
 const grid=node("div","chef-week-grid");
 for(let i=0;i<7;i++){
   const date=shift(start,i),key=keys[i],dayHead=node("button","chef-week-day"+(dateKey(selectedDay)===key?" selected":""));
   dayHead.type="button";dayHead.setAttribute("aria-label",dateDescription(date));dayHead.setAttribute("aria-pressed",String(dateKey(selectedDay)===key));
   const dayName=format(date,{weekday:"short"}).replace(".","").replace(/^./,c=>c.toUpperCase());
   dayHead.append(node("small","",dayName),node("strong","",String(date.getDate())),node("span","",classificationFor(key)));
   dayHead.onclick=async()=>{selectedDay=date;chefWeekSelection=null;render();};
   grid.append(dayHead);
 }
 const visible=mealOrder.filter(meal=>keys.some(key=>mealAvailable(key,meal)));
 for(const meal of visible){
   for(const key of keys){
     const color=mealTone(key,meal),available=mealAvailable(key,meal);
     const cell=node("button","chef-week-cell tone-"+color+(available?"":" unavailable")+(chefWeekSelection?.date===key&&chefWeekSelection?.meal===meal?" selected":""));
     cell.type="button";cell.disabled=!available;
     cell.append(iconForMeal(meal),node("span","",mealAbbrev[meal]));
     cell.setAttribute("aria-label",mealNames[lang][meal]+", "+key+"; "+(available?"abrir detalhes":"não prevista"));
     if(available)cell.onclick=()=>{
       const same=chefWeekSelection?.date===key&&chefWeekSelection?.meal===meal;
       chefWeekSelection=same?null:{date:key,meal};
       render();
     };
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
   const mealCard=renderChefMeal(date,meal,true);panel.append(mealCard);root.append(panel);
 }
}
function sectionTitle(title,extra){
 const head=node("div","section-head");head.append(node("h2","",title));
 if(extra)head.append(node("span","",extra));return head;
}
function renderHome(root){if(chefViewMode==="week")renderChefWeekly(root);else renderChefDaily(root);}
function renderPlan(root){
  const date=dateKey(selectedDay);
  root.append(sectionTitle(txt().plans,format(selectedDay,{weekday:"long",day:"numeric",month:"long"})));
  for(const meal of mealOrder){
    const color=colorFor(date,meal);
    if(!color)continue;
    const panel=node("section","panel");
    const head=node("div","meal-top");
    head.append(node("strong","",mealNames[lang][meal]),colorChip(color));
    panel.append(head);
    const options=prescriptions[color]?.[meal]||[];
    if(!options.length){panel.append(node("p","muted",txt().noPlan));}
    else for(const [index,option] of options.entries()){
      const block=node("div","plan-option");
      block.append(node("strong","",(option.title?asText(option.title)+" · ":"")+txt().option+" "+(option.number||index+1)));
      for(const food of option.items||[]){
        const line=[food.quantity,food.name||food.text].filter(Boolean).join(" ");
        if(line)block.append(node("span","food-line",line));
      }
      panel.append(block);
    }
    root.append(panel);
  }
  if(!root.querySelector(".panel"))root.append(node("p","muted",txt().noData));
}
function renderMenus(root){
  root.append(sectionTitle(txt().weekMenu,txt().readOnly));
  const list=node("div","menu-list");
  const begin=monday(selectedDay);
  for(let offset=0;offset<7;offset++){
    const date=shift(begin,offset),key=dateKey(date);
    const card=node("section","menu-day");
    card.append(node("h3","menu-day-name",
      format(date,{weekday:"long",day:"numeric",month:"short"})));
    for(const meal of ["lunch","dinner"]){
      const item=plannedMenu(key,meal),color=colorFor(key,meal);
      const slot=node("div","menu-slot"),head=node("div","menu-slot-head");
      head.append(node("span","",mealNames[lang][meal]),colorChip(color));
      slot.append(head,node("div","menu-slot-name",item?asText(item.value):txt().pending));
      if(key>=dateKey(new Date())){
        const edit=miniButton(lang==="pt"?"Editar planeamento":"Edit planning",()=>{
          const existing=slot.querySelector(".chef-menu-editor");
          if(existing){existing.remove();return;}
          editMenuForm(key,meal,item,slot);
        });
        slot.append(edit);
      }
      card.append(slot);
    }
    list.append(card);
  }
  root.append(list,node("p","info-note",lang==='pt'?'Os novos pratos precisam de validação da The Mile.':'New dishes must be validated by The Mile.'));
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
  el("day-controls").hidden=activeTab==="home"||activeTab==="profile";
  picker.hidden=activeTab==="home"||activeTab==="profile";
  for(const button of el("chef-view-mode").querySelectorAll("[data-view]"))button.setAttribute("aria-pressed",String(button.dataset.view===chefViewMode));
  const screen=el("screen");screen.replaceChildren();
  if(activeTab==="home")renderHome(screen);
  if(activeTab==="plans")renderPlan(screen);
  if(activeTab==="menus")renderMenus(screen);
  if(activeTab==="profile")renderProfile(screen);
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
