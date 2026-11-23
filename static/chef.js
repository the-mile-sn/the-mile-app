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
    pending:"Menu por atribuir", readOnly:"Consulta do planeamento nutricional",
    week:"Semana de planeamento", weekMenu:"Planeamento da semana",
    day:"Resumo do dia", selectColor:"Cor nutricional", noColor:"Sem cor atribuída",
    noPlan:"Não existe uma prescrição publicada para esta refeição e cor.",
    option:"Opção", planned:"Menu planeado", username:"Username",
    language:"Idioma", chef:"Conta Chef", noData:"Sem informação disponível",
    fail:"Não foi possível carregar a informação.", invalid:"Confirma as credenciais e tenta novamente.",
    viewOnly:"O registo de execução e a edição de menus serão disponibilizados na próxima etapa.",
    notifications:"Notificações", notificationsEmpty:"As notificações para chefs ainda não estão disponíveis.",
    changePassword:"Alterar palavra-passe", currentPassword:"Palavra-passe atual",
    newPassword:"Nova palavra-passe", confirmPassword:"Confirmar nova palavra-passe",
    savePassword:"Guardar nova palavra-passe", backProfile:"Voltar ao Perfil",
    passwordMismatch:"As novas palavras-passe não coincidem.",
    passwordShort:"Utiliza pelo menos 8 caracteres.",
    passwordFailed:"Não foi possível alterar a palavra-passe. Confirma a palavra-passe atual e tenta novamente."
  },
  en: {
    login:"Chef area", loginHint:"Access your assigned player's meal planning.",
    password:"Password", enter:"Sign in", player:"Assigned player",
    home:"Home", plans:"Meal plan", menus:"Menus", profile:"Profile",
    logout:"Sign out", mealLunch:"Lunch", mealDinner:"Dinner",
    pending:"Menu not assigned", readOnly:"Nutrition planning overview",
    week:"Planning week", weekMenu:"Weekly meal planning",
    day:"Day overview", selectColor:"Nutrition colour", noColor:"No colour assigned",
    noPlan:"No published prescription is available for this meal and colour.",
    option:"Option", planned:"Planned menu", username:"Username",
    language:"Language", chef:"Chef account", noData:"No information available",
    fail:"Unable to load information.", invalid:"Please check your credentials and try again.",
    viewOnly:"Meal execution and menu editing will be available in the next stage.",
    notifications:"Notifications", notificationsEmpty:"Chef notifications are not yet available.",
    changePassword:"Change password", currentPassword:"Current password",
    newPassword:"New password", confirmPassword:"Confirm new password",
    savePassword:"Save new password", backProfile:"Back to Profile",
    passwordMismatch:"The new passwords do not match.",
    passwordShort:"Use at least 8 characters.",
    passwordFailed:"Could not change the password. Check your current password and try again."
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
let previewReadOnly = false;
let menus = [], days = [], colors = {}, prescriptions = {}, executions = [];
let chefWeekRequestId=0,chefSkeletonTimer=null,chefSkeletonVisible=false;
let chefSwipeEntryDirection=0,chefSwipeEntryAnimation=null;
let chefProfileSubpage=null;
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
  if(previewReadOnly&&method!=="GET"&&path!=="/api/logout")throw new Error("admin_preview_read_only");
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
  // The prototype never appears before Chef authentication.
  el("chef-chat-trigger").hidden=view!=="chef";
  if(view!=="chef")window.themileChefChatDemo?.close();
}
function showError(message){const screen=el("screen");screen.replaceChildren(node("p","error",message));}
async function init(){
  try{
    const response=await request("/api/me");
    csrf=response.csrf||"";
    sessionUser=response.user;
    previewReadOnly=!!response.admin_preview;
    if(!sessionUser || sessionUser.role!=="chef"){location.replace("/");return;}
    const me=await request("/api/v2/chef/me");
    chef=me.chef;player=me.player;
    lang=chef.language==="en"?"en":"pt";
    prescriptions=(await request("/api/v2/chef/plans")).options_by_color||{};
    show("chef");
    await loadWeek();
  }catch(err){
    if(err.status===401){location.replace("/");}
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
/* Chef skeletons follow the real home structure; loading is deferred 240ms
   like Player Dia, never forced for a quick request or a same-week day tap. */
function chefSkeletonShape(extra=""){return node("span","chef-skeleton-shape"+(extra?" "+extra:""));}
function renderChefHomeSkeleton(){
 if(activeTab!=="home"||el("chef-view").hidden)return;
 const root=el("screen");
 root.replaceChildren();
 root.className="chef-screen-home chef-screen-loading";
 root.setAttribute("aria-busy","true");
 const accessible=node("span","chef-skeleton-a11y",lang==="pt"
   ?"A carregar o planeamento":"Loading the meal plan");
 root.append(accessible);
 if(chefViewMode==="week"){
  const grid=node("div","chef-skeleton-week-grid");
  for(let i=0;i<7;i++){
   const header=node("div","chef-skeleton-week-heading");
   header.append(chefSkeletonShape("chef-skeleton-week-label"),
     chefSkeletonShape("chef-skeleton-week-date"),
     chefSkeletonShape("chef-skeleton-week-label"));
   grid.append(header);
  }
  // Neutral cells only: no invented meal names, nutritional colours or data.
  for(let row=0;row<4;row++)
   for(let day=0;day<7;day++)
    grid.append(chefSkeletonShape("chef-skeleton-week-cell"));
  root.append(grid);
 }else{
  const summary=node("div","chef-skeleton-summary");
  const heading=node("div","chef-skeleton-heading");
  heading.append(chefSkeletonShape("chef-skeleton-date"),
    chefSkeletonShape("chef-skeleton-class"));
  summary.append(heading);
  const strip=node("div","chef-skeleton-colors");
  for(let i=0;i<4;i++){
   const cell=node("div","chef-skeleton-color");
   cell.append(chefSkeletonShape("chef-skeleton-symbol"),
     chefSkeletonShape("chef-skeleton-bar"));
   strip.append(cell);
  }
  summary.append(strip);root.append(summary);
  for(let i=0;i<4;i++){
   const card=node("div","chef-skeleton-meal");
   card.append(chefSkeletonShape("chef-skeleton-meal-icon"),
     chefSkeletonShape("chef-skeleton-meal-title"),
     chefSkeletonShape("chef-skeleton-meal-arrow"));
   root.append(card);
  }
 }
 chefSkeletonVisible=true;
}
function clearChefSkeleton(){
 clearTimeout(chefSkeletonTimer);chefSkeletonTimer=null;chefSkeletonVisible=false;
 el("screen").removeAttribute("aria-busy");
}
async function loadWeek(){
 const id=++chefWeekRequestId;
 clearTimeout(chefSkeletonTimer);
 chefSkeletonVisible=false;
 const start=monday(selectedDay),end=shift(start,6);
 const weekKey=dateKey(start);
 const q="?start="+weekKey+"&end="+dateKey(end);
 if(activeTab==="home"&&!el("chef-view").hidden){
  chefSkeletonTimer=setTimeout(()=>{
   if(id===chefWeekRequestId&&dateKey(monday(selectedDay))===weekKey)
    renderChefHomeSkeleton();
  },240);
 }
 try{
  const [calendar,menuResponse,executionResponse]=await Promise.all([
   request("/api/v2/chef/calendar"+q),
   request("/api/v2/chef/menus"+q),
   request("/api/v2/chef/menu-executions"+q)
  ]);
  if(id!==chefWeekRequestId||dateKey(monday(selectedDay))!==weekKey)return;
  days=calendar.days||[];colors=calendar.effective_colors||{};
  menus=menuResponse.menus||[];executions=executionResponse.executions||[];
  clearChefSkeleton();
  render();
 }catch(err){
  if(id!==chefWeekRequestId)return;
  clearChefSkeleton();
  throw err;
 }
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

const chefExecutionConfirmIcon=[
  ["path", { d: "M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z", stroke: "currentColor", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M8 12.5L10.5 15L16 9", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
function executionForm(date,meal,card){
  // Two distinct actions: confirm the planned dish directly, or edit exceptions.
  // Execution remains limited to lunch/dinner; the backend keeps an immutable history.
  if(previewReadOnly||(meal!=="lunch"&&meal!=="dinner"))return;
  const now=executions.find(e=>e.menu_date===date&&e.meal===meal);
  const pt=lang==="pt";
  const names=pt
    ?{served_planned:"Servido conforme planeado",served_changed:"Servido com alterações",ate_out:"Jogador comeu fora",chef_off:"Chef de folga"}
    :{served_planned:"Served as planned",served_changed:"Served with changes",ate_out:"Player ate out",chef_off:"Chef off duty"};
  const root=node("div","chef-execution");
  const actions=node("div","chef-execution-quick-actions");
  const edit=node("button","chef-execution-quick-edit",pt?"Editar":"Edit");
  edit.type="button";
  edit.setAttribute("aria-expanded","false");
  const confirm=node("button","chef-execution-quick-confirm");
  confirm.type="button";
  const icon=node("span","chef-execution-check");
  icon.setAttribute("aria-hidden","true");
  icon.append(iconToSvg(chefExecutionConfirmIcon));
  confirm.append(icon,node("span","",pt?"Confirmar":"Confirm"));
  confirm.setAttribute("aria-label",pt?"Confirmar que o menu foi servido conforme planeado":"Confirm the planned meal was served");
  confirm.setAttribute("aria-pressed",String(now?.state==="served_planned"));
  actions.append(edit,confirm);
  root.append(actions);
  const feedback=node("p","chef-execution-feedback");
  feedback.setAttribute("role","status");
  feedback.setAttribute("aria-live","polite");
  root.append(feedback);
  const form=node("form","chef-editor chef-execution-form");
  form.hidden=true;
  // No duplicate title or close icon: the existing Cancelar button closes the form.
  const toggleEditor=expanded=>{
    form.hidden=!expanded;
    edit.setAttribute("aria-expanded",String(expanded));
    if(!expanded)feedback.textContent="";
  };
  const changeField=node("label","chef-execution-field");
  changeField.append(node("span","",pt?"Registar alterações":"Record changes"));
  const description=makeInput("textarea",pt?"Descreve o que foi servido de diferente":"Describe what was served differently",500);
  description.value=now?.state==="served_changed"?(now.served_description||""):"";
  changeField.append(description);
  form.append(changeField);
  const reasonGroup=node("fieldset","chef-execution-choice");
  reasonGroup.append(node("legend","",pt?"Ou assinala uma situação":"Or select a situation"));
  const reasons=node("div","chef-execution-states");
  const reasonButtons=[];
  let selectedReason=now?.state==="ate_out"||now?.state==="chef_off"?now.state:null;
  for(const key of ["ate_out","chef_off"]){
    const b=node("button","chef-execution-state",names[key]);
    b.type="button";
    b.setAttribute("aria-pressed",String(key===selectedReason));
    b.onclick=()=>{
      selectedReason=selectedReason===key?null:key;
      syncReason();
    };
    reasonButtons.push({key,button:b});
    reasons.append(b);
  }
  reasonGroup.append(reasons);
  form.append(reasonGroup);
  const syncReason=()=>{
    for(const {key,button} of reasonButtons)button.setAttribute("aria-pressed",String(key===selectedReason));
    changeField.hidden=!!selectedReason;
    description.disabled=!!selectedReason;
  };
  syncReason();
  description.addEventListener("input",()=>{
    if(selectedReason){selectedReason=null;syncReason();}
  });
  const notesField=node("label","chef-execution-field");
  // Keep only the placeholder in the optional notes field, with an accessible label.
  const notes=makeInput("textarea",pt?"Adicionar observações":"Add notes",500);
  notes.setAttribute("aria-label",pt?"Adicionar observações (opcional)":"Add notes (optional)");
  notes.value=now?.note||"";
  notesField.append(notes);
  form.append(notesField);
  const footer=node("div","chef-execution-actions");
  const cancel=node("button","chef-execution-cancel",pt?"Cancelar":"Cancel");
  cancel.type="button";cancel.onclick=()=>toggleEditor(false);
  const save=node("button","primary chef-save",pt?"Guardar":"Save");
  save.type="submit";
  footer.append(cancel,save);
  form.append(footer);
  const formFeedback=node("p","chef-feedback");
  formFeedback.setAttribute("role","status");
  formFeedback.setAttribute("aria-live","polite");
  form.append(formFeedback);
  // Do not focus the textarea on opening: iPhone must not raise the keyboard.
  edit.onclick=()=>toggleEditor(form.hidden);
  form.onsubmit=async event=>{
    event.preventDefault();
    const text=description.value.trim();
    const state=selectedReason||"served_changed";
    if(!selectedReason&&text.length<2){
      formFeedback.textContent=pt?"Descreve as alterações ou seleciona um dos motivos.":"Describe changes or select a reason.";
      description.focus();
      return;
    }
    save.disabled=true;edit.disabled=true;confirm.disabled=true;
    formFeedback.textContent="";
    try{
      await request("/api/v2/chef/menu-executions","POST",{
        menu_date:date,meal,state,
        served_description:state==="served_changed"?text:"",
        note:notes.value.trim()
      });
      await loadWeek();
    }catch(err){
      formFeedback.textContent=txt().fail;
    }finally{
      save.disabled=false;edit.disabled=false;confirm.disabled=false;
    }
  };
  confirm.onclick=async()=>{
    if(now?.state==="served_planned"){
      feedback.textContent=pt?"Esta refeição já está confirmada.":"This meal is already confirmed.";
      return;
    }
    if(!plannedMenu(date,meal)){
      feedback.textContent=pt?"Não existe um menu planeado para confirmar.":"There is no planned menu to confirm.";
      return;
    }
    if(now&&!window.confirm(pt
      ?"Já existe um registo para esta refeição. Queres confirmar que foi servido conforme planeado?"
      :"An execution record already exists. Confirm it was served as planned?"))return;
    confirm.disabled=true;edit.disabled=true;
    feedback.textContent=pt?"A guardar…":"Saving…";
    try{
      await request("/api/v2/chef/menu-executions","POST",{
        menu_date:date,meal,state:"served_planned",served_description:"",note:""
      });
      await loadWeek();
    }catch(err){
      feedback.textContent=txt().fail;
    }finally{
      confirm.disabled=false;edit.disabled=false;
    }
  };
  root.append(form);
  card.append(root);
}
function editMenuForm(date,meal,item,slot){
 if(previewReadOnly||date<dateKey(new Date()))return;
 const pt=lang==="pt";
 const holder=node("div","chef-menu-editor");
 const heading=node("h3","chef-menu-editor-title",pt
   ?(item?"Alterar prato":"Definir prato")
   :(item?"Change dish":"Set dish"));
 holder.append(heading);
 holder.append(node("p","chef-menu-form-label",pt?"Como queres definir o menu?":"How would you like to set the menu?"));
 const modes=node("div","chef-menu-mode-choices");
 const modesList=[
  ["dish",pt?"Prato aprovado":"Approved dish"],
  ["proposal",pt?"Sugerir prato":"Suggest dish"]
 ];
 let mode="dish";
 let selectedDish=item?.kind==="dish"&&item.dish_id
   ?{id:item.dish_id,name:asText(item.value)}:null;
 const modeButtons=new Map();
 const dishArea=node("div","chef-menu-form-section");
 const dishField=node("label","chef-menu-form-field");
 dishField.append(node("span","",pt?"Pesquisar prato aprovado":"Search approved dish"));
 const search=makeInput("input",pt?"Escreve o nome de um prato":"Enter a dish name",90);
 search.type="search";search.autocomplete="off";
 dishField.append(search);
 const selected=node("p","chef-menu-selected-dish");
 selected.setAttribute("role","status");
 const results=node("div","chef-menu-dish-results");
 results.hidden=true;results.setAttribute("aria-label",pt?"Pratos aprovados":"Approved dishes");
 dishArea.append(dishField,selected,results);
 const proposalArea=node("div","chef-menu-form-section");
 const proposalLabel=node("label","chef-menu-form-field");
 proposalLabel.append(node("span","",pt?"Nome do prato a propor":"Dish name to suggest"));
 const proposal=makeInput("input",pt?"Escreve o nome do prato":"Enter dish name",200);
 proposalLabel.append(proposal);
 const noteLabel=node("label","chef-menu-form-field");
 noteLabel.append(node("span","",pt?"Observações (opcional)":"Notes (optional)"));
 const note=makeInput("textarea",pt?"Informação para a equipa":"Information for the team",500);
 noteLabel.append(note);
 proposalArea.append(proposalLabel,noteLabel,node("p","chef-menu-proposal-hint",
  pt?"A sugestão é enviada para validação e não altera o menu planeado."
    :"Suggestions are sent for review and do not change the planned menu."));
 holder.append(modes,dishArea,proposalArea);
 const feedback=node("p","chef-feedback");feedback.setAttribute("role","status");
 feedback.setAttribute("aria-live","polite");
 const actions=node("div","chef-edit-actions");
 const cancel=node("button","chef-menu-cancel",pt?"Cancelar":"Cancel");cancel.type="button";
 cancel.onclick=()=>holder.remove();
 const save=node("button","chef-menu-save",pt?"Guardar":"Save");save.type="button";
 actions.append(cancel,save);holder.append(actions,feedback);
 const showSelected=()=>{
  selected.textContent=selectedDish?(pt?"Selecionado: ":"Selected: ")+selectedDish.name:"";
  selected.hidden=!selectedDish;
 };
 const showMode=()=>{
  for(const [key,button]of modeButtons)button.setAttribute("aria-pressed",String(mode===key));
  dishArea.hidden=mode!=="dish";proposalArea.hidden=mode!=="proposal";
  results.hidden=true;
  feedback.textContent="";
 };
 for(const [key,caption] of modesList){
  const button=node("button","chef-menu-mode-choice",caption);button.type="button";
  button.onclick=()=>{mode=key;showMode();};
  modeButtons.set(key,button);modes.append(button);
 }
 showSelected();showMode();
 let debounce,requestSeq=0;
 const findDishes=async()=>{
  const seq=++requestSeq;results.hidden=false;
  results.replaceChildren(node("p","chef-menu-dish-status",pt?"A pesquisar…":"Searching…"));
  try{
   const data=await request("/api/v2/chef/dishes?q="+encodeURIComponent(search.value.trim()));
   if(seq!==requestSeq||!holder.isConnected||mode!=="dish")return;
   results.replaceChildren();
   for(const dish of data.dishes||[]){
    const button=node("button","chef-menu-dish-result");button.type="button";
    button.append(node("span","",dish.name_pt));
    if(dish.category)button.append(node("small","",dish.category));
    button.onclick=()=>{
     selectedDish={id:dish.id,name:dish.name_pt};
     search.value=dish.name_pt;showSelected();results.hidden=true;
     feedback.textContent="";
    };
    results.append(button);
   }
   if(!results.childElementCount)results.append(node("p","chef-menu-dish-status",
     pt?"Nenhum prato encontrado. Podes sugerir um novo.":"No dishes found. You can suggest a new one."));
  }catch(err){
   if(seq===requestSeq&&holder.isConnected)results.replaceChildren(
    node("p","chef-menu-dish-status",txt().fail));
  }
 };
 search.addEventListener("focus",()=>{if(mode==="dish"&&results.hidden)findDishes();});
 search.addEventListener("input",()=>{
  selectedDish=null;showSelected();feedback.textContent="";
  clearTimeout(debounce);debounce=setTimeout(findDishes,220);
 });
 search.addEventListener("keydown",event=>{if(event.key==="Escape")results.hidden=true;});
 save.onclick=async()=>{
  if(mode==="dish"&&!selectedDish){
   feedback.textContent=pt?"Seleciona um prato aprovado na lista.":"Choose an approved dish from the list.";
   return;
  }
  if(mode==="proposal"&&proposal.value.trim().length<2){
   feedback.textContent=pt?"Indica o nome do prato que pretendes sugerir.":"Enter the name of the dish to suggest.";
   return;
  }
  save.disabled=cancel.disabled=true;feedback.textContent="";
  try{
   if(mode==="proposal"){
    await request("/api/v2/chef/menu-proposals","POST",{
     menu_date:date,meal,name:proposal.value.trim(),note:note.value.trim(),
     local_date:dateKey(new Date())
    });
    feedback.textContent=pt?"Proposta enviada para validação. O menu atual mantém-se.":"Suggestion sent for review. The current menu is unchanged.";
    return;
   }
   await request("/api/v2/chef/menus","PUT",{
    menu_date:date,meal,kind:"dish",
    value:selectedDish.name,
    dish_id:selectedDish.id,
    local_date:dateKey(new Date())
   });
   await loadWeek();
  }catch(err){feedback.textContent=txt().fail;}
  finally{save.disabled=cancel.disabled=false;}
 };
 slot.append(holder);
}

const chefIcons={breakfast:"coffee-03",lunch:"restaurant-02",snack:"vegetarian-food",dinner:"restaurant-02",supper:"moon-02"};
const chefSvgPaths={"coffee-03":"<path d=\"M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Zm12 1h1a3 3 0 0 1 0 6h-2M4 22h16M8 3v3m4-3v3m4-3v3\"/>","vegetarian-food":"<path d=\"M4 12c2-4 6-4 8 0 2-4 6-4 8 0l-2 7H6l-2-7ZM12 10V4M8 7 5 5m11 2 3-2M6 22h12\"/>","restaurant-02":"<path d=\"M4 3v8m3-8v8M4 7h3M5.5 11v10M13 3v18M13 12c7 0 8-8 3-9v9M20 3v18\"/>","moon-02":"<path d=\"M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z\"/>","football":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m12 7 4 3-1.5 5h-5L8 10l4-3Zm-4 3-4-1m12 1 4-1m-5.5 6 2 5m-7-5-2 5M12 7V3\"/>","football-pitch":"<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"1\"/><path d=\"M12 4v16m0-12a4 4 0 0 0 0 8M2.5 9h4v6h-4m19-6h-4v6h4\"/>","soft-drink-01":"<path d=\"M5 5h14l-2 16H7L5 5ZM4 3h16M12 5l4-4M8 11h8m-6 4h4\"/>","home-09":"<path d=\"m3 11 9-8 9 8v9H3v-9Zm6 9v-7h6v7\"/>","files-01":"<path d=\"M7 3h10l4 4v14H7V3Zm10 0v5h4M3 7v14h14\"/>","add-circle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v10m-5-5h10\"/>","menu-restaurant":"<path d=\"M4 4v7m3-7v7M4 7h3m-1.5 4v9M13 4v16m0-8c7 0 8-7 3-8v8M3 22h18\"/>","user-03":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>"};;

/* The same official Hugeicons geometry used in jogador-v2.js. */
const chefOfficialIconData={"Coffee03Icon":[
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
"Home09Icon":[
  ["path", { d: "M13 13.5032H11C10.1716 13.5032 9.5 14.1748 9.5 15.0032V20.5012C9.5 21.0539 9.05114 21.5032 8.49854 21.4977C6.17337 21.4744 4.88133 21.3333 4.02513 20.4771C3 19.452 3 17.8021 3 14.5023V11.9918C3 10.3106 3 9.46999 3.3559 8.74231C3.71179 8.01463 4.37533 7.49854 5.70241 6.46637L7.70242 4.91081C9.76689 3.30511 10.7991 2.50226 12 2.50226C13.2009 2.50226 14.2331 3.30511 16.2976 4.91081L18.2976 6.46636C19.6247 7.49854 20.2882 8.01463 20.6441 8.74231C21 9.46999 21 10.3106 21 11.9918V14.5023C21 17.8021 21 19.452 19.9749 20.4771C19.1187 21.3333 17.8266 21.4744 15.5015 21.4977C14.9489 21.5032 14.5 21.0539 14.5 20.5012V15.0032C14.5 14.1748 13.8284 13.5032 13 13.5032Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]
],
"Files01Icon":[
  ["path", { d: "M14.4998 19H12.4998C9.67139 19 8.25718 19 7.3785 18.1213C6.49982 17.2426 6.49982 15.8284 6.49982 13V8C6.49982 5.17157 6.49982 3.75736 7.3785 2.87868C8.25718 2 9.67139 2 12.4998 2H13.843C14.6605 2 15.0692 2 15.4368 2.15224C15.8043 2.30448 16.0933 2.59351 16.6714 3.17157L19.3282 5.82843C19.9063 6.40648 20.1953 6.69552 20.3476 7.06306C20.4998 7.4306 20.4998 7.83935 20.4998 8.65685V13C20.4998 15.8284 20.4998 17.2426 19.6211 18.1213C18.7425 19 17.3282 19 14.4998 19Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M14.9998 2.5V3.5C14.9998 5.38562 14.9998 6.32843 15.5856 6.91421C16.1714 7.5 17.1142 7.5 18.9998 7.5H19.9998", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M6.49945 5C4.8426 5 3.49945 6.34315 3.49945 8V16C3.49945 18.8285 3.49945 20.2427 4.37813 21.1213C5.25681 22 6.67102 22 9.49945 22H14.4998C16.1566 22 17.4998 20.6568 17.4998 19", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M10 11H14M10 15H17", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
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
]};
const chefOfficialIconNames={"coffee-03":"Coffee03Icon","vegetarian-food":"VegetarianFoodIcon","restaurant-02":"Restaurant02Icon","moon-02":"Moon02Icon","home-09":"Home09Icon","files-01":"Files01Icon","menu-restaurant":"MenuRestaurantIcon","user-03":"User03Icon","key-01":"Key01Icon","door-01":"Door01Icon","mail-01":"Mail01Icon"};
chefOfficialIconData["Key01Icon"]=[
  ["path", { d: "M15.5 14.5C18.8137 14.5 21.5 11.8137 21.5 8.5C21.5 5.18629 18.8137 2.5 15.5 2.5C12.1863 2.5 9.5 5.18629 9.5 8.5C9.5 9.38041 9.68962 10.2165 10.0303 10.9697L2.5 18.5V21.5H5.5V19.5H7.5V17.5H9.5L13.0303 13.9697C13.7835 14.3104 14.6196 14.5 15.5 14.5Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M17.5 6.5L16.5 7.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
chefOfficialIconData["Door01Icon"]=[
  ["path", { d: "M18 20C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M4 6.84771V17.1523C4 18.7454 4 19.542 4.4645 20.0976C4.92899 20.6531 5.71415 20.7956 7.28446 21.0806L10.2845 21.6251C12.4701 22.0217 13.563 22.2201 14.2815 21.6215C15 21.023 15 19.9142 15 17.6968V6.30325C15 4.08578 15 2.97704 14.2815 2.37849C13.563 1.77994 12.4701 1.97827 10.2845 2.37495L7.28446 2.91941C5.71415 3.2044 4.92899 3.34689 4.4645 3.90244C4 4.45799 4 5.25457 4 6.84771Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M11.625 12H11.5M11.75 12C11.75 12.1381 11.6381 12.25 11.5 12.25C11.3619 12.25 11.25 12.1381 11.25 12C11.25 11.8619 11.3619 11.75 11.5 11.75C11.6381 11.75 11.75 11.8619 11.75 12Z", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "2" }]
];
/* Hugeicons Mail01Icon, source hugeicons/hugeicons icons/mail-01.svg (MIT). */
chefOfficialIconData["Mail01Icon"]=[
 ["path",{d:"M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6",stroke:"currentColor",strokeLinejoin:"round",strokeWidth:"1.5",key:"0"}],
 ["path",{d:"M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z",stroke:"currentColor",strokeLinejoin:"round",strokeWidth:"1.5",key:"1"}]
];
function iconToSvg(nodes){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","100%");svg.setAttribute("height","100%");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.5");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
 const append=(items,parent)=>{for(const node of items||[]){if(!Array.isArray(node))continue;const [tag,props,children]=node;if(typeof tag!=="string"||!["path","circle","rect","line","polyline","polygon","ellipse","g"].includes(tag))continue;const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(props||{})){if(k==="key"||k==="ref"||typeof v==="object")continue;el.setAttribute(k.replace(/[A-Z]/g,c=>"-"+c.toLowerCase()),String(v));}parent.append(el);if(Array.isArray(children))append(children,el);}};
 append(nodes,svg);return svg;
}
function createChefIconSvg(name){const official=chefOfficialIconData[chefOfficialIconNames[name]];if(official)return iconToSvg(official);const span=document.createElement('span');span.innerHTML=svgMarkup(name);return span.firstChild;}
const svgMarkup=name=>'<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+(chefSvgPaths[name]||"")+"</svg>";
function paintChefIcons(){
 document.querySelectorAll(".mile-icon").forEach(item=>{
  if(item.dataset.chefSvg)return;
  const name=Array.from(item.classList).find(cls=>cls.startsWith("icon-"))?.slice(5);
  if(!name||(!chefSvgPaths[name]&&!chefOfficialIconNames[name]))return;
  item.replaceChildren(createChefIconSvg(name));
  item.dataset.chefSvg="true";
 });
}
function iconForMeal(meal){
 const icon=node("span","mile-icon icon-"+chefIcons[meal]);
 icon.setAttribute("aria-hidden","true");
 icon.replaceChildren(createChefIconSvg(chefIcons[meal]));
 icon.dataset.chefSvg="true";
 return icon;
}
let chefViewMode="day",chefWeekSelection=null,chefPlanCategory="todos",chefPlanSelectedColor=null;
const validColors=["orange","yellow","blue","green","vp"];
function mealTone(day,meal){const color=colorFor(day,meal);return validColors.includes(color)?color:"neutral";}
/* Week range and day headers are one concise, localized Menus family. */
function chefMenuWeekRange(start,end){
 const startMonth=format(start,{month:"long"}),endMonth=format(end,{month:"long"});
 const startYear=start.getFullYear(),endYear=end.getFullYear();
 if(startYear===endYear&&start.getMonth()===end.getMonth())
  return start.getDate()+"–"+end.getDate()+" "+endMonth+" "+endYear;
 if(startYear===endYear)
  return start.getDate()+" "+startMonth+"–"+end.getDate()+" "+endMonth+" "+endYear;
 return start.getDate()+" "+startMonth+" "+startYear+"–"+end.getDate()+" "+endMonth+" "+endYear;
}
function chefMenuWeekday(date){
 const weekday=format(date,{weekday:"long"});
 const concise=lang==="pt"?weekday.replace(/-feira$/i,""):weekday;
 return concise.replace(/^./u,letter=>letter.toLocaleUpperCase(locale(lang)));
}
function dateDescription(value,options={weekday:"long",day:"numeric",month:"long",year:"numeric"}){
 return format(value,options).replace(/^./,letter=>letter.toLocaleUpperCase(locale(lang)));
}
function chefCompactDate(date){
 // The home card follows the compact date used by the player Menus page.
 return format(date,{weekday:"long",day:"numeric",month:"long"})
   .replace(/-feira/gi,"").replace(/\s+de\s+/gi," ").replace(/\s+/g," ").trim();
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
function chefOptionCards(date,meal,colorOverride=null,inPlan=false){
 const color=colorOverride||colorFor(date,meal),options=color?prescriptions[color]?.[meal]||[]:[];
 const list=node("div","chef-option-list");
 if(!options.length){
  if(color)list.append(node("p","chef-option-empty",txt().noPlan));
  return list;
 }
 if(options.length===1){
  // As in the player daily view: one prescription appears directly in the meal,
  // without another expandable option card or a redundant "Opção 1" label.
  const option=options[0];
  const inline=node("div","chef-single-option");
  if(option.title)inline.append(node("strong","chef-single-title",asText(option.title)));
  const nutrition=chefNutrition(option.totals);
  if(nutrition&&!inPlan)inline.append(nutrition);
  appendChefFoodItems(inline,option.items);
  list.append(inline);
  return list;
 }
 options.forEach((option,index)=>{
  const card=node("details","chef-option-card player-meal-option-subcard");
  // Match player interaction: options stay collapsed until explicitly selected.
  card.open=false;
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
 const frame=node("span","chef-dish-photo-frame chef-photo-pending");
 photo.className="chef-dish-photo";
 // Match Player recipe-image loading only while the actual photo is pending.
 photo.addEventListener("load",()=>frame.classList.remove("chef-photo-pending"),{once:true});
 frame.append(photo);
 if(photo.complete&&photo.naturalWidth>0)frame.classList.remove("chef-photo-pending");
 const zoom=node("span","chef-photo-zoom");
 zoom.setAttribute("aria-hidden","true");
 zoom.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
 frame.append(zoom);
 photo.onerror=()=>frame.remove();
 frame.setAttribute("role","button");frame.tabIndex=0;
 frame.setAttribute("aria-label",lang==="pt"?"Ampliar fotografia do prato":"Enlarge dish photo");
 const open=()=>{
  const overlay=node("div","chef-photo-overlay");
  const close=node("button","chef-photo-close","×");close.type="button";
  close.setAttribute("aria-label",lang==="pt"?"Fechar fotografia":"Close photo");
  const large=node("img","chef-photo-large");large.src=photo.src;large.alt=photo.alt;
  const dismiss=()=>{document.removeEventListener("keydown",onKey);overlay.remove();};
  const onKey=event=>{if(event.key==="Escape")dismiss();};
  close.onclick=dismiss;overlay.onclick=event=>{if(event.target===overlay)dismiss();};
  overlay.append(close,large);document.body.append(overlay);document.addEventListener("keydown",onKey);close.focus();
 };
 frame.onclick=event=>{event.preventDefault();event.stopPropagation();open();};
 frame.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();open();}};
 return frame;
}
function appendChefMenuDish(host,item,emptyLabel){
 const wrap=node("div","chef-meal-dish");
 wrap.append(node("div",item?"chef-dish-name":"chef-dish-pending",item?asText(item.value):emptyLabel));
 const photo=chefMenuPhoto(item);if(photo)wrap.append(photo);
 host.append(wrap);
}
function renderChefMeal(date,meal,expanded=false,onlyPrescription=false,colorOverride=null){
 const effectiveTone=validColors.includes(colorOverride)?colorOverride:mealTone(date,meal);
 const card=node("details","chef-meal-card tone-"+effectiveTone);
 card.open=expanded;
 const head=node("summary","chef-meal-head");
 const heading=node("span","chef-meal-heading");
 const symbol=node("span","chef-meal-icon");symbol.append(iconForMeal(meal));

 const title=node("strong","",mealNames[lang][meal]);
 if(!onlyPrescription&&(meal==="lunch"||meal==="dinner")){
  const latest=executions.find(item=>item.menu_date===date&&item.meal===meal);
  if(latest){
   // Neutral registration indicator for all execution states, including meals not served.
   // Match the player's closed-meal badge without claiming every meal was served.
   const label=node("span","chef-meal-registered");
   label.setAttribute("aria-label",lang==="pt"?"Execução registada":"Execution recorded");
   const icon=node("span","chef-meal-registered-icon");
   icon.setAttribute("aria-hidden","true");
   icon.append(iconToSvg(chefExecutionConfirmIcon));
   label.append(icon,node("span","",lang==="pt"?"Registado":"Recorded"));
   title.append(label);
  }
 }
 heading.append(symbol,title);
 // The existing published plan supplies precisely the same averaged kcal/macros
 // as Player Dia and Planos; never add values when this meal has no published totals.
 const options=prescriptions[effectiveTone]?.[meal]||[];
 const totals=options.map(o=>o.totals).filter(t=>t&&
  ["kcal","protein_g","carbs_g","fat_g"].every(k=>Number.isFinite(Number(t[k]))));
 if(totals.length){
  const avg=key=>Math.round(totals.reduce((sum,t)=>sum+Number(t[key]),0)/totals.length);
  const metrics=node("span","chef-meal-metrics");
  metrics.append(node("span","chef-plan-header-kcal",avg("kcal")+" kcal"));
  const macros=node("span","chef-plan-header-macros");
  for(const [key,cls] of [["protein_g","protein"],["carbs_g","carbs"],["fat_g","fat"]])
   macros.append(node("span",cls,avg(key)+" g"));
  metrics.append(macros);
  heading.append(metrics);
 }
 heading.append(node("span","chef-chevron"));
 head.append(heading);
 // A Chef must see the planned dish and its photo even when the meal is closed.
 if(!onlyPrescription&&(meal==="lunch"||meal==="dinner")){
  const preview=node("div","chef-meal-preview");
  appendChefMenuDish(preview,plannedMenu(date,meal),txt().pending);
  head.append(preview);
 }
 card.append(head);
 const body=node("div","chef-meal-body");
 appendChefMealContents(body,date,meal,onlyPrescription,colorOverride);
 card.append(body);
 return card;
}
// A single content path powers the daily expandable card and the weekly inline
// detail; editing, execution and prescription rendering stay identical.
function appendChefMealContents(body,date,meal,onlyPrescription=false,colorOverride=null){
 body.append(chefOptionCards(date,meal,colorOverride,onlyPrescription));
 if(!onlyPrescription&&(meal==="lunch"||meal==="dinner"))executionForm(date,meal,body);
}
function renderChefDaily(root){
 const date=dateKey(selectedDay),classification=classificationFor(date);
 const summary=node("section","chef-daily-summary");
 const header=node("div","chef-summary-header");
 header.append(node("strong","",chefCompactDate(selectedDay)));
 if(classification)header.append(node("span","chef-microcycle",classification));
 summary.append(header);
 const strip=node("div","chef-day-colors");
 for(const meal of mealOrder){
  if(!mealAvailable(date,meal))continue;
  const cell=node("div","chef-day-color tone-"+mealTone(date,meal));
  cell.setAttribute("aria-label",mealNames[lang][meal]);
  cell.append(iconForMeal(meal),node("span","chef-day-bar"));
  strip.append(cell);
 }
 summary.append(strip);root.append(summary);
 for(const meal of mealOrder){
  if(mealAvailable(date,meal))root.append(renderChefMeal(date,meal,false));
 }
}
function chefWeekDetailLabel(date){
 // The player uses three-letter weekday labels (e.g. Qui, 19/11).
 const weekday=format(date,{weekday:"long"}).slice(0,3)
   .replace(/^./,letter=>letter.toLocaleUpperCase(locale(lang)));
 const d=String(date.getDate()).padStart(2,"0");
 const m=String(date.getMonth()+1).padStart(2,"0");
 const datePart=lang==="pt"?d+"/"+m:m+"/"+d;
 const microcycle=classificationFor(dateKey(date));
 return weekday+", "+datePart+(microcycle?" · "+microcycle:"");
}
/* Player's 460ms adjacent-date moving circle, adapted to Chef's
   grid re-render. No animation for long jumps or reduced motion. */
let chefWeekMovingCircle=null;
function selectChefWeekDay(date,selection=null){
 const before=dateKey(selectedDay),after=dateKey(date);
 const from=el("screen").querySelector(".chef-week-day.selected strong")?.getBoundingClientRect();
 const offset=(date.getDay()+6)%7;
 const previousOffset=(selectedDay.getDay()+6)%7;
 selectedDay=date;chefWeekSelection=selection;render();
 chefWeekMovingCircle?.remove();chefWeekMovingCircle=null;
 if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||
   before===after||Math.abs(offset-previousOffset)>1||!from)return;
 const toNode=el("screen").querySelector(".chef-week-day.selected strong");
 const to=toNode?.getBoundingClientRect();
 if(!to?.width||!from.width||Math.abs(from.left-to.left)>innerWidth*1.5)return;
 const ghost=node("span","chef-week-moving-circle");
 ghost.style.width=to.width+"px";ghost.style.height=to.height+"px";
 ghost.style.left=to.left+"px";ghost.style.top=to.top+"px";
 document.body.append(ghost);chefWeekMovingCircle=ghost;
 toNode.classList.add("chef-week-circle-arriving");
 const dx=from.left-to.left,dy=from.top-to.top;
 const animation=ghost.animate([
  {transform:"translate3d("+dx+"px,"+dy+"px,0) scale(.97)",opacity:1},
  {offset:.72,transform:"translate3d("+(-dx*.025)+"px,"+(-dy*.025)+"px,0) scale(1.045)",opacity:1},
  {transform:"translate3d(0,0,0) scale(1)",opacity:1}
 ],{duration:460,easing:"cubic-bezier(.25,.75,.3,1)"});
 const finish=()=>{ghost.remove();toNode.classList.remove("chef-week-circle-arriving");
  if(chefWeekMovingCircle===ghost)chefWeekMovingCircle=null;
 };
 animation.onfinish=finish;animation.oncancel=finish;setTimeout(finish,550);
}
function renderChefWeekly(root){
 const start=monday(selectedDay),keys=Array.from({length:7},(_,i)=>dateKey(shift(start,i)));
 const grid=node("div","chef-week-grid");
 // A single white lane follows the selected date through every meal row.
 // It is decorative and does not change meal colours, availability or layout.
 const selectedIndex=keys.indexOf(dateKey(selectedDay));
 if(selectedIndex>=0){
  const highlight=node("span","chef-week-selected-column");
  highlight.setAttribute("aria-hidden","true");
  highlight.style.setProperty("--chef-week-left",
    "calc("+(100*selectedIndex/7).toFixed(6)+"% + "+(5*selectedIndex/7).toFixed(6)+"px)");
  highlight.style.setProperty("--chef-week-left-small",
    "calc("+(100*selectedIndex/7).toFixed(6)+"% + "+(3*selectedIndex/7).toFixed(6)+"px)");
  grid.append(highlight);
 }
 for(let i=0;i<7;i++){
  const date=shift(start,i),key=keys[i];
  const dayHead=node("button","chef-week-day"+(dateKey(selectedDay)===key?" selected":""));
  dayHead.type="button";dayHead.setAttribute("aria-label",dateDescription(date));
  dayHead.setAttribute("aria-pressed",String(dateKey(selectedDay)===key));
  dayHead.append(node("small","",format(date,{weekday:"short"}).replace(".","").replace(/^./,c=>c.toUpperCase())),
    node("strong","",String(date.getDate())),node("span","",classificationFor(key)));
  dayHead.onclick=()=>selectChefWeekDay(date);
  grid.append(dayHead);
 }
 const visible=mealOrder.filter(meal=>keys.some(key=>mealAvailable(key,meal)));
 for(const meal of visible){
  for(const key of keys){
   const color=mealTone(key,meal),available=mealAvailable(key,meal);
   const active=chefWeekSelection?.date===key&&chefWeekSelection?.meal===meal;
   const cell=node("button","chef-week-cell tone-"+color+(available?"":" unavailable")+(active?" selected":""));
   cell.type="button";cell.disabled=!available;
   cell.append(iconForMeal(meal));
   cell.setAttribute("aria-label",mealNames[lang][meal]+", "+key+"; "+(available?(lang==="pt"?"abrir detalhes":"open details"):(lang==="pt"?"não prevista":"not scheduled")));
   if(available)cell.onclick=()=>{
    selectChefWeekDay(new Date(key+"T12:00:00"),active?null:{date:key,meal});
   };
   grid.append(cell);
  }
 }
 root.append(grid);
 if(chefWeekSelection){
  const {date,meal}=chefWeekSelection,dt=new Date(date+"T12:00:00");
  // One heading only, matching the player: date/microcycle and meal name.
  // Unlike the daily view, the weekly detail needs no nested meal/card header.
  const panel=node("section","chef-week-detail tone-"+mealTone(date,meal));
  const top=node("div","chef-week-detail-head");
  const title=node("div","chef-week-detail-identity");
  title.append(node("span","chef-week-detail-date",chefWeekDetailLabel(dt)));
  title.append(node("h2","chef-week-detail-meal",mealNames[lang][meal]));
  top.append(title);
  const close=node("button","chef-week-close","×");close.type="button";
  close.setAttribute("aria-label",lang==="pt"?"Fechar detalhes":"Close details");
  close.onclick=()=>{chefWeekSelection=null;render();};
  top.append(close);panel.append(top);
  // For lunch/dinner, highlight only the planned dish and photo.
  // The nutritional prescription and Chef execution actions remain underneath.
  if(meal==="lunch"||meal==="dinner"){
   const menu=node("div","chef-meal-preview chef-week-menu-highlight");
   appendChefMenuDish(menu,plannedMenu(date,meal),txt().pending);
   panel.append(menu);
  }
  const body=node("div","chef-meal-body chef-week-meal-body");
  appendChefMealContents(body,date,meal);
  panel.append(body);
  root.append(panel);
 }
}
function sectionTitle(title,extra){
 const head=node("div","section-head");head.append(node("h2","",title));
 if(extra)head.append(node("span","",extra));return head;
}
function renderHome(root){
 if(chefViewMode==="week"){renderChefWeekly(root);return;}
 const dayContent=node("div","chef-day-content");
 root.append(dayContent);
 renderChefDaily(dayContent);
}
/* Prescriptions are published by nutritional colour, not by selected weekday.
   Chef continues in consultation-only mode: no consumption or Plan editing. */
function publishedChefColors(){
 return validColors.filter(color=>mealOrder.some(meal=>
   Array.isArray(prescriptions[color]?.[meal])&&prescriptions[color][meal].length>0));
}
/* Player Planos' Todos/Cores navigation, adapted only to actual Chef
   published prescription data. No new nutritional entities are synthesized. */
function renderPlan(root){
 const available=publishedChefColors();
 const filters=node("nav","plans-filters");
 filters.setAttribute("aria-label",lang==="pt"?"Categorias de planos":"Plan categories");
 for(const [key,label] of [["todos",lang==="pt"?"Todos":"All"],["cores",lang==="pt"?"Cores":"Colours"]]){
  const button=node("button","plans-filter"+(chefPlanCategory===key?" selected":""),label);
  button.type="button";button.setAttribute("aria-pressed",String(chefPlanCategory===key));
  button.onclick=()=>{if(chefPlanCategory!==key){chefPlanCategory=key;chefPlanSelectedColor=null;render();}};
  filters.append(button);
 }
 root.append(filters);
 const sub=node("nav","plans-subfilters");
 sub.setAttribute("aria-label",lang==="pt"?"Selecionar plano":"Select plan");
 const detail=node("div","chef-plan-detail");
 root.append(sub,detail);
 if(!available.length){
  detail.append(node("p","muted",lang==="pt"?"Ainda não existem planos alimentares publicados.":"No meal plans have been published yet."));
  return;
 }
 const renderColor=(color,target)=>{
  for(const meal of mealOrder){
   if(!(prescriptions[color]?.[meal]||[]).length)continue;
   target.append(renderChefMeal(dateKey(selectedDay),meal,false,true,color));
  }
 };
 if(chefPlanCategory==="cores"){
  if(!available.includes(chefPlanSelectedColor))chefPlanSelectedColor=available[0];
  for(const color of available){
   const button=node("button","plans-subfilter"+(chefPlanSelectedColor===color?" selected":""),
     colorText[lang][color]||color);
   button.type="button";button.setAttribute("aria-pressed",String(chefPlanSelectedColor===color));
   button.onclick=()=>{chefPlanSelectedColor=color;render();};
   sub.append(button);
  }
  renderColor(chefPlanSelectedColor,detail);return;
 }
 for(const color of available){
  const group=node("details","plans-all-group");
  const heading=node("summary","",colorText[lang][color]||color);
  const body=node("div","plans-all-body");
  group.append(heading,body);
  group.addEventListener("toggle",()=>{
   if(group.open&&!body.dataset.loaded){
    body.dataset.loaded="true";renderColor(color,body);paintChefIcons();
   }
  });
  detail.append(group);
 }
}
function renderChefMenuWeekNavigation(root){
 const start=monday(selectedDay),end=shift(start,6);
 const nav=node("nav","chef-menu-week-navigation");
 nav.setAttribute("aria-label",lang==="pt"?"Navegar entre semanas dos menus":"Navigate menu weeks");
 const prev=node("button","chef-menu-week-arrow","‹");
 prev.type="button";
 prev.setAttribute("aria-label",lang==="pt"?"Semana anterior":"Previous week");
 const next=node("button","chef-menu-week-arrow","›");
 next.type="button";
 next.setAttribute("aria-label",lang==="pt"?"Semana seguinte":"Next week");
 const period=node("strong","chef-menu-week-range",chefMenuWeekRange(start,end));
 const change=async delta=>{
   prev.disabled=next.disabled=true;
   selectedDay=shift(selectedDay,delta*7);
   try{await loadWeek();}
   catch(err){selectedDay=shift(selectedDay,-delta*7);showError(txt().fail);}
   finally{prev.disabled=next.disabled=false;}
 };
 prev.onclick=()=>change(-1);next.onclick=()=>change(1);
 nav.append(prev,period,next);root.append(nav);
}
function renderChefMenuDay(root,key){
 const date=new Date(key+"T12:00:00");
 const card=node("section","chef-menu-day");
 const head=node("div","chef-menu-day-header");
 const weekday=node("strong","",chefMenuWeekday(date));
 weekday.title=dateDescription(date);
 head.append(weekday);
 const micro=classificationFor(key);if(micro)head.append(node("span","",micro));
 card.append(head);
 for(const meal of ["lunch","dinner"]){
  const item=plannedMenu(key,meal),color=mealTone(key,meal);
  const slot=node("article","chef-menu-entry "+(item?"tone-"+color:"tone-neutral chef-menu-unassigned"));
  slot.append(node("div","chef-menu-meal-label",mealNames[lang][meal]));
  appendChefMenuDish(slot,item,txt().pending);
  if(!previewReadOnly&&key>=dateKey(new Date())){
   const edit=miniButton(lang==="pt"?(item?"Alterar prato":"Definir prato"):(item?"Change dish":"Set dish"),()=>{
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
/* Menus is the only published Chef view. The dish catalogue is still used
   by the approved-dish search inside editMenuForm, never as a separate tab. */
function renderMenus(root){
 renderChefMenuWeekNavigation(root);
 const start=monday(selectedDay);
 for(let offset=0;offset<7;offset++)renderChefMenuDay(root,dateKey(shift(start,offset)));
}
/* Player Profile's approved composition, scoped to Chef identity and permissions. */
function chefProfileInitials(name){
 const words=String(name||"").trim().split(/\s+/).filter(Boolean);
 const initials=words.length>1?words[0][0]+words[words.length-1][0]:(words[0]||"TM").slice(0,2);
 return initials.toLocaleUpperCase(locale(lang));
}
function chefProfileAction(title,iconName,handler,withArrow=false){
 const button=node("button","profile-action");
 button.type="button";
 const icon=node("span","mile-icon icon-"+iconName);
 icon.setAttribute("aria-hidden","true");
 button.append(icon,node("span","",title));
 if(withArrow){
  const arrow=node("span","profile-action-chevron","›");
  arrow.setAttribute("aria-hidden","true");button.append(arrow);
 }
 button.onclick=()=>handler(button);
 return button;
}
function chefProfileOpenSubpage(page){
 chefProfileSubpage=page;render();
 window.scrollTo?.(0,0);
}
function chefProfileHeader(page,title){
 const heading=node("div","profile-subpage-header");
 const back=node("button","profile-page-back");
 back.type="button";back.setAttribute("aria-label",txt().backProfile);
 back.append(node("span","","‹"));
 back.onclick=()=>chefProfileOpenSubpage(null);
 heading.append(back,node("h2","",title));
 page.append(heading);
}
function renderChefNotifications(page){
 const section=node("section","profile-subpage");
 chefProfileHeader(section,txt().notifications);
 const empty=node("div","profile-notifications-empty");
 empty.append(node("p","",txt().notificationsEmpty));
 section.append(empty);page.append(section);
}
function renderChefPassword(page){
 const section=node("section","profile-subpage");
 chefProfileHeader(section,txt().changePassword);
 const form=node("form","profile-password-page-form");
 const fields=[
  ["current",txt().currentPassword,"current-password"],
  ["new",txt().newPassword,"new-password"],
  ["confirm",txt().confirmPassword,"new-password"]
 ];
 const inputs={};
 for(const [key,caption,autocomplete] of fields){
  const label=node("label","mile-floating-field");
  const input=node("input","mile-floating-input");input.type="password";
  input.autocomplete=autocomplete;input.placeholder=" ";input.required=true;
  if(key!=="current")input.minLength=8;
  label.append(input,node("span","mile-floating-label",caption));
  form.append(label);inputs[key]=input;
 }
 const feedback=node("p","profile-password-feedback");
 feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
 const save=node("button","profile-password-save",txt().savePassword);
 save.type="submit";save.disabled=previewReadOnly;
 form.append(feedback,save);
 form.onsubmit=async event=>{
  event.preventDefault();
  if(previewReadOnly)return;
  const current=inputs.current.value,next=inputs.new.value,confirm=inputs.confirm.value;
  if(next!==confirm){feedback.textContent=txt().passwordMismatch;return;}
  if(next.length<8){feedback.textContent=txt().passwordShort;return;}
  save.disabled=true;feedback.textContent="";
  try{
   await request("/api/change-password","POST",{
    identifier:chef.username,current_password:current,new_password:next
   });
   form.reset();
   // Backend invalidates the Chef's sessions on password change.
   location.replace("/");
  }catch(error){feedback.textContent=txt().passwordFailed;}
  finally{save.disabled=previewReadOnly;}
 };
 section.append(form);page.append(section);
}
function renderProfile(root){
 const page=node("div","chef-profile");
 if(chefProfileSubpage==="notifications"){renderChefNotifications(page);root.append(page);return;}
 if(chefProfileSubpage==="password"){renderChefPassword(page);root.append(page);return;}
 const identity=node("div","profile-identity");
 const avatar=node("div","profile-photo-circle",chefProfileInitials(chef?.name));
 avatar.setAttribute("aria-hidden","true");
 identity.append(avatar,node("strong","",chef?.name||txt().chef),
  node("span","",chef?.username?"@"+chef.username:""));
 page.append(identity);

 const segment=node("div","chef-language-selector");
 segment.setAttribute("role","group");segment.setAttribute("aria-label",txt().language);
 const languageFeedback=node("p","profile-language-feedback");
 languageFeedback.setAttribute("role","status");languageFeedback.setAttribute("aria-live","polite");
 for(const code of ["pt","en"]){
  const button=node("button",lang===code?"active":"",code.toUpperCase());
  button.type="button";button.disabled=previewReadOnly;
  button.setAttribute("aria-pressed",String(lang===code));
  button.onclick=async()=>{
   if(previewReadOnly||lang===code)return;
   button.disabled=true;languageFeedback.textContent="";
   try{
    await request("/api/v2/chef/preferences","PUT",{language:code});
    lang=code;chef.language=code;
    // Refresh display-only published Planos after a successful language change.
    // A read failure keeps the current plan visible and does not undo the
    // persisted language preference or interfere with menu/recipe permissions.
    const updated=await request("/api/v2/chef/plans").catch(()=>null);
    if(updated?.options_by_color)prescriptions=updated.options_by_color;
    render();
   }catch(error){button.disabled=false;languageFeedback.textContent=txt().fail;}
  };
  segment.append(button);
 }
 const notifications=node("button","profile-notifications-card");
 notifications.type="button";
 const bell=node("span","profile-notification-icon");
 bell.setAttribute("aria-hidden","true");
 bell.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"/></svg>';
 const arrow=node("span","profile-action-chevron","›");arrow.setAttribute("aria-hidden","true");
 notifications.append(bell,node("span","profile-notification-label",txt().notifications),arrow);
 notifications.onclick=()=>chefProfileOpenSubpage("notifications");
 page.append(notifications);

 // Independent universal-height language card, placed under Notifications.
 const languageCard=node("section","profile-language-card");
 languageCard.setAttribute("aria-label",txt().language);
 languageCard.append(node("span","profile-language-label",txt().language),segment,languageFeedback);
 page.append(languageCard);

 const actions=node("div","profile-actions-card");
 const password=chefProfileAction(txt().changePassword,"key-01",()=>chefProfileOpenSubpage("password"),true);
 password.disabled=previewReadOnly;
 const logout=chefProfileAction(txt().logout,"door-01",chefLogout);
 actions.append(password,logout);
 page.append(actions);
 root.append(page);
}
async function chefLogout(button){
 if(button.disabled)return;
 button.disabled=true;
 try{
  await request("/api/logout","POST",{});
  csrf="";sessionUser=null;chef=null;player=null;
  location.replace("/");
 }catch(error){
  button.disabled=false;
  const container=button.closest(".profile-actions-card");
  let feedback=container.querySelector(".profile-logout-feedback");
  if(!feedback){
   feedback=node("p","profile-logout-feedback");
   feedback.setAttribute("role","alert");container.append(feedback);
  }
  feedback.textContent=txt().fail;
 }
}

// Single reusable selection highlight, aligned with the player's segmented controls.
function syncChefSelection(nav){
 if(!nav||nav.hidden)return;
 const selected=nav.classList.contains("bottom-nav")
  ?nav.querySelector('[data-tab][aria-current="page"]')
  :nav.querySelector('[data-view][aria-pressed="true"]');
 if(!selected)return;
 let indicator=nav.querySelector(":scope > .mile-segment-indicator");
 if(!indicator){
  indicator=node("span","mile-segment-indicator");
  indicator.setAttribute("aria-hidden","true");
  nav.prepend(indicator);
 }
 nav.classList.add("mile-segment-animated");
 requestAnimationFrame(()=>{
  if(!nav.isConnected||nav.hidden||!selected.isConnected)return;
  const bar=nav.getBoundingClientRect(),box=selected.getBoundingClientRect();
  if(!box.width||!bar.width)return;
  indicator.style.width=box.width+"px";
  indicator.style.height=box.height+"px";
  indicator.style.transform="translate3d("+(box.left-bar.left)+"px,"+(box.top-bar.top)+"px,0)";
  indicator.classList.add("mile-segment-ready");
 });
}
function bounceChefSelection(nav){
 const indicator=nav?.querySelector(":scope > .mile-segment-indicator");
 if(!indicator||window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;
 indicator.classList.remove("mile-segment-bounce");
 void indicator.offsetWidth;
 indicator.classList.add("mile-segment-bounce");
 indicator.addEventListener("animationend",()=>indicator.classList.remove("mile-segment-bounce"),{once:true});
}
function render(){
  document.documentElement.lang=lang==="pt"?"pt-PT":"en";
  el("player-label").textContent=txt().player.toUpperCase();
  el("player-name").textContent=player.name;
  el("page-context").textContent=previewReadOnly
    ?(lang==="pt"?"Visualização administrativa · apenas leitura":"Admin preview · read-only")
    :txt().readOnly;
  document.body.classList.toggle("chef-profile-active",activeTab==="profile");
  if(activeTab!=="profile")chefProfileSubpage=null;
  el("chef-profile-tab-initials").textContent=chefProfileInitials(chef?.name);
  const nav=el("chef-nav");
  for(const [tab,caption] of Object.entries({
    home:txt().home,plans:txt().plans,menus:txt().menus,profile:txt().profile
  })){
    const button=nav.querySelector('[data-tab="'+tab+'"]');
    button.querySelector(":scope > span:last-child").textContent=caption;
    button.setAttribute("aria-current",activeTab===tab?"page":"false");
  }
  el("chef-view-mode").hidden=activeTab!=="home";
  for(const button of el("chef-view-mode").querySelectorAll("[data-view]"))button.setAttribute("aria-pressed",String(button.dataset.view===chefViewMode));
  const screen=el("screen");screen.className="chef-screen-"+activeTab;screen.replaceChildren();screen.removeAttribute("aria-busy");
  if(activeTab==="home")renderHome(screen);
  if(activeTab==="plans")renderPlan(screen);
  if(activeTab==="menus")renderMenus(screen);
  if(activeTab==="profile")renderProfile(screen);
  paintChefIcons();
  window.themileChefChatDemo?.setLanguage(lang);
  syncChefSelection(el("chef-view-mode"));
  syncChefSelection(nav);
  animateChefSwipeEntry();
}
/* The Player's 500ms directional page entry, not an unapproved
   horizontal tab gesture. */
const chefTabOrder=["home","plans","menus","profile"];
let chefLastScrollY=0,chefScrollAccum=0,chefScrollDirection=0,chefScrollFrame=0;
function changeChefTab(next){
 if(!chefTabOrder.includes(next)||next===activeTab)return;
 const direction=chefTabOrder.indexOf(activeTab)<chefTabOrder.indexOf(next)?1:-1;
 chefSwipeEntryDirection=0;chefSwipeEntryAnimation?.cancel();chefSwipeEntryAnimation=null;
 clearChefGesture();
 const screen=el("screen");screen.getAnimations?.().forEach(animation=>animation.cancel());
 screen.style.transform="";screen.style.transition="";screen.style.willChange="";
 const nav=el("chef-nav");nav.classList.remove("chef-nav-compact");
 // A pending scroll frame belongs to the old page and must not repaint this tab.
 if(chefScrollFrame){window.cancelAnimationFrame(chefScrollFrame);chefScrollFrame=0;}
 chefScrollAccum=0;chefScrollDirection=0;chefLastScrollY=Math.max(0,window.scrollY||0);
 activeTab=next;render();
 if(!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches&&typeof screen.animate==="function")
  screen.animate([
   {transform:"translateX("+(direction*24)+"px)",opacity:.55},
   {transform:"translateX(0)",opacity:1}
  ],{duration:500,easing:"cubic-bezier(0.2,0.7,0.2,1)"});
 bounceChefSelection(nav);
}
/* Same 28px directional scroll hysteresis as Player's bottom navigation. */
function updateChefAdaptiveNav(){
 chefScrollFrame=0;
 const nav=el("chef-nav");
 if(!nav||nav.hidden)return;
 const y=Math.max(0,window.scrollY||document.documentElement.scrollTop||0);
 const delta=y-chefLastScrollY;chefLastScrollY=y;
 if(y<32){
  if(nav.classList.contains("chef-nav-compact")){
   nav.classList.remove("chef-nav-compact");syncChefSelection(nav);
  }
  chefScrollAccum=0;return;
 }
 if(Math.abs(delta)<1)return;
 const direction=Math.sign(delta);
 if(direction!==chefScrollDirection){chefScrollDirection=direction;chefScrollAccum=0;}
 chefScrollAccum+=Math.abs(delta);
 if(chefScrollAccum>=28){
  // Do not remeasure/repaint the glass indicator every 28px while already
  // compact: Safari can otherwise leave its fixed layer visually behind.
  const compact=direction>0;
  if(nav.classList.contains("chef-nav-compact")!==compact){
   nav.classList.toggle("chef-nav-compact",compact);
   syncChefSelection(nav);
  }
  chefScrollAccum=0;
 }
}
window.addEventListener("scroll",()=>{
 if(!chefScrollFrame)chefScrollFrame=window.requestAnimationFrame(updateChefAdaptiveNav);
},{passive:true});
/* Re-measure the glass selection after the compact nav finishes resizing. */
el("chef-nav").addEventListener("transitionend",event=>{
 if(event.target===el("chef-nav")&&["left","right","padding"].includes(event.propertyName))
  syncChefSelection(el("chef-nav"));
});
window.addEventListener("resize",()=>{
 if(!el("chef-nav").hidden)syncChefSelection(el("chef-nav"));
},{passive:true});

function animateChefSwipeEntry(){
 const direction=chefSwipeEntryDirection;chefSwipeEntryDirection=0;
 if(!direction||activeTab!=="home"||chefViewMode!=="day")return;
 const content=el("screen").querySelector(":scope > .chef-day-content");
 if(!content||typeof content.animate!=="function"||window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;
 chefSwipeEntryAnimation?.cancel();
 // Only daily content moves; the gesture surface and navigation stay still.
 chefSwipeEntryAnimation=content.animate([
  {transform:"translateX("+(direction>0?60:-60)+"px)"},
  {transform:"translateX(0)"}
 ],{duration:320,easing:"cubic-bezier(0.2,0.7,0.2,1)"});
}
async function chefShiftDay(direction,step){
 const previous=new Date(selectedDay),next=shift(previous,direction*step);
 selectedDay=next;chefWeekSelection=null;
 chefSwipeEntryDirection=activeTab==="home"&&chefViewMode==="day"?direction:0;
 if(dateKey(monday(previous))===dateKey(monday(next))){render();return;}
 try{await loadWeek();}
 catch(err){selectedDay=previous;chefSwipeEntryDirection=0;showError(txt().fail);}
}
el("chef-view-mode").querySelectorAll("[data-view]").forEach(button=>{
 button.onclick=()=>{
  if(chefViewMode===button.dataset.view)return;
  chefViewMode=button.dataset.view;chefWeekSelection=null;
  chefSwipeEntryDirection=0;render();bounceChefSelection(el("chef-view-mode"));
 };
});
el("chef-nav").querySelectorAll("[data-tab]").forEach(button=>{
 button.onclick=()=>changeChefTab(button.dataset.tab);
});

/* Player-matched Início → Dia: interactive horizontal drag and 210ms
   exit / 320ms entry. Weekly grid and Menus preserve their week gestures.
   Native vertical scrolling and editable controls are never hijacked. */
/* Only next-day gestures need more diagonal tolerance on iPhone.
   Keep the approved previous-day thresholds and native vertical scroll.
   Once lateral is recognised, the axis stays locked until touchend. */
function chefSwipeIntent(dx,dy){
 const horizontal=Math.abs(dx),vertical=Math.abs(dy);
 if(dx<0){
  // Moving left: lock sooner so Safari does not claim a moderate diagonal as scroll.
  if(horizontal>=7&&horizontal>=vertical*.68)return "horizontal";
  if(vertical>18&&vertical>horizontal*1.5)return "vertical";
 }else{
  // Previous day: preserve the existing, well-performing gesture.
  if(vertical>18&&vertical>horizontal*1.35)return "vertical";
  if(horizontal>=8&&horizontal>=vertical*.8)return "horizontal";
 }
 return "pending";
}
/* Pure decision shared by touchend and its regressions. The reverse gesture
   deliberately retains its already-approved distance and velocity. */
function chefSwipeShouldCommit(dx,elapsed,width,isDay){
 const distance=Math.abs(dx),forwardDay=isDay&&dx<0;
 const minSwipe=isDay?(forwardDay?30:35):55;
 if(distance<minSwipe)return false;
 if(!isDay)return true;
 const speed=distance/Math.max(1,elapsed);
 return forwardDay
  ?distance>width*.30||(distance>30&&speed>.48)
  :distance>width*.38||(distance>35&&speed>.55);
}
let chefTouchStart=null,chefTouchActive=false,chefTouchContent=null,chefTouchTimeout=null;
function clearChefGesture(){
 if(chefTouchTimeout!==null){clearTimeout(chefTouchTimeout);chefTouchTimeout=null;}
 if(chefTouchContent){
  chefTouchContent.style.transform="";chefTouchContent.style.transition="";
  chefTouchContent.style.willChange="";
 }
 chefTouchStart=null;chefTouchActive=false;chefTouchContent=null;
}
function finishChefGesture(dx,done){
 if(!chefTouchContent||window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){
  clearChefGesture();done?.();return;
 }
 chefTouchContent.style.transition="transform 210ms cubic-bezier(.2,.8,.2,1)";
 chefTouchContent.style.transform="translate3d("+dx+"px,0,0)";
 chefTouchTimeout=setTimeout(()=>{clearChefGesture();done?.();},215);
}
const chefSwipeArea=el("screen");
chefSwipeArea.addEventListener("touchstart",event=>{
 clearChefGesture();
 if(activeTab==="home"&&chefViewMode==="day"){
  chefSwipeEntryAnimation?.cancel();chefSwipeEntryAnimation=null;
 }
 if(event.touches.length!==1||!["home","menus"].includes(activeTab)||chefSkeletonVisible)return;
 const target=event.target;
 const homeDay=activeTab==="home"&&chefViewMode==="day";
 if(target.closest?.("input,textarea,select,[contenteditable],[role='slider'],.chef-editor,.chef-menu-editor,.chef-photo-overlay"))return;
 // On the right of daily cards, a dish thumbnail is often the start of a
 // leftward (next-day) swipe. Allow a drag there; a tap still opens the zoom.
 if(!homeDay&&target.closest?.(".chef-dish-photo-frame"))return;
 if(activeTab==="menus"&&!target.closest?.(".chef-menu-week-navigation"))return;
 if(activeTab==="home"&&chefViewMode==="week"&&!target.closest?.(".chef-week-grid"))return;
 for(let current=target;current&&current!==chefSwipeArea;current=current.parentElement){
  if(current.scrollWidth>current.clientWidth+6&&/^(auto|scroll)$/.test(getComputedStyle(current).overflowX))return;
 }
 const t=event.touches[0];
 // Keep iOS' left-back edge protected. The right edge must not block
 // next-day swipes beginning in the meal/photo column.
 if(t.clientX<22||t.clientX>innerWidth-(homeDay?8:22))return;
 // #screen receives touch even in the blank area below the last meal.
 // Movement is applied to the day content only, like the Player architecture.
 const content=homeDay?chefSwipeArea.querySelector(":scope > .chef-day-content"):null;
 if(homeDay&&!content)return;
 chefTouchContent=content;
 chefTouchStart={x:t.clientX,y:t.clientY,at:performance.now(),width:(content||chefSwipeArea).getBoundingClientRect().width};
},{passive:true});
chefSwipeArea.addEventListener("touchmove",event=>{
 if(!chefTouchStart||event.touches.length!==1)return;
 const t=event.touches[0],dx=t.clientX-chefTouchStart.x,dy=t.clientY-chefTouchStart.y;
 if(!chefTouchActive){
  const intent=chefSwipeIntent(dx,dy);
  if(intent==="vertical"){clearChefGesture();return;}
  if(intent!=="horizontal")return;
  chefTouchActive=true;
 }
 if(event.cancelable)event.preventDefault();
 if(chefTouchContent&&!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){
  chefTouchContent.style.transition="none";chefTouchContent.style.willChange="transform";
  chefTouchContent.style.transform="translate3d("+Math.max(-chefTouchStart.width,Math.min(chefTouchStart.width,dx))+"px,0,0)";
 }
},{passive:false});
chefSwipeArea.addEventListener("touchend",event=>{
 if(!chefTouchStart||!chefTouchActive||event.changedTouches.length!==1){clearChefGesture();return;}
 const dx=event.changedTouches[0].clientX-chefTouchStart.x;
 const direction=dx<0?1:-1;
 const isDay=activeTab==="home"&&chefViewMode==="day";
 // Do not reclassify the locked gesture's axis when the finger is released.
 const commit=chefSwipeShouldCommit(
  dx,performance.now()-chefTouchStart.at,chefTouchStart.width,isDay
 );
 const step=activeTab==="menus"||(activeTab==="home"&&chefViewMode==="week")?7:1;
 const navigate=()=>{if(commit)chefShiftDay(direction,step);};
 if(chefTouchContent)finishChefGesture(commit?-direction*chefTouchStart.width:0,navigate);
 else{clearChefGesture();navigate();}
},{passive:true});
chefSwipeArea.addEventListener("touchcancel",()=>{
 if(chefTouchActive)finishChefGesture(0);else clearChefGesture();
},{passive:true});
init();

// The Mile is one installable app; players and chefs use the same root-scope worker.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", {scope:"/"}).catch(() => {});
  });
}
