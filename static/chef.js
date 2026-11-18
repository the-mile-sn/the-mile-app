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
let menus = [], days = [], colors = {}, prescriptions = {};
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
  const [calendar, menuResponse]=await Promise.all([
    request("/api/v2/chef/calendar"+q),
    request("/api/v2/chef/menus"+q)
  ]);
  days=calendar.days||[];colors=calendar.effective_colors||{};
  menus=menuResponse.menus||[];
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
function renderMenuCard(date,meal){
  const item=plannedMenu(date,meal),color=colorFor(date,meal);
  const card=node("article","meal-card");
  card.style.setProperty("--tone",tone[color]||"#dedee1");
  const top=node("div","meal-top");
  top.append(node("strong","",mealNames[lang][meal]),colorChip(color));
  card.append(top,node("p",item?"meal-name":"placeholder-text",
    item?asText(item.value):txt().pending));
  const photo=mealPhoto(item);if(photo)card.append(photo);
  return card;
}
function sectionTitle(title,extra){
  const head=node("div","section-head");
  head.append(node("h2","",title));
  if(extra)head.append(node("span","",extra));
  return head;
}
function renderHome(root){
  const day=dateKey(selectedDay);
  const detail=days.find(d=>d.date===day);
  const dated=format(selectedDay,{weekday:"long",day:"numeric",month:"long"});
  root.append(sectionTitle(txt().day,dated));
  if(detail?.classification)root.append(node("p","muted",detail.classification));
  const grid=node("div","grid-meals");
  grid.append(renderMenuCard(day,"lunch"),renderMenuCard(day,"dinner"));
  root.append(grid,node("p","info-note",txt().readOnly));
}
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
      card.append(slot);
    }
    list.append(card);
  }
  root.append(list,node("p","info-note",txt().viewOnly));
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
      // Local preference until server-side updating is enabled.
      lang=code;render();
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
  el("day-controls").hidden=activeTab==="profile";
  picker.hidden=activeTab==="profile";
  const screen=el("screen");screen.replaceChildren();
  if(activeTab==="home")renderHome(screen);
  if(activeTab==="plans")renderPlan(screen);
  if(activeTab==="menus")renderMenus(screen);
  if(activeTab==="profile")renderProfile(screen);
}
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
