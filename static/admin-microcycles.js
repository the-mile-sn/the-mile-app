"use strict";
const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"};
const colors={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"VP · Verde preparação"};
const $=id=>document.getElementById(id);
let csrf="",athletes=[],model=null,calendarMonth=new Date(),selectedCalendarDay=null,validatedPlansByColor={},mealOptionsByColor={};
calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
function status(msg,cls=""){const el=$("status");el.textContent=msg;el.className="status "+cls;}
async function request(path,opts={}){const headers={"Accept":"application/json"};if(opts.body){headers["Content-Type"]="application/json";}if(opts.method&&opts.method!=="GET"){headers["X-CSRF-Token"]=csrf;}const r=await fetch(path,{credentials:"same-origin",...opts,headers});let out;try{out=await r.json();}catch{out={error:"Resposta inválida do servidor"};}if(!r.ok)throw Error(out.error||"Pedido falhou");return out;}
async function start(){try{const me=await request("/api/me");if(!me.user||me.user.role!=="admin"){status("É necessário iniciar sessão como administrador na aplicação de testes.","warn");return;}csrf=me.csrf;await loadAthletes();status("Ambiente de testes pronto.");}catch(e){status("Não foi possível ligar: "+e.message,"warn");}}
async function loadAthletes(prefer){const data=await request("/api/v2/athletes");athletes=data.athletes;const list=$("athlete");list.replaceChildren();for(const a of athletes){const o=document.createElement("option");o.value=a.id;o.textContent=a.name;list.appendChild(o);}if(!athletes.length){model=null;$("matrix").hidden=true;$("calendar-section").hidden=true;status("Cria o primeiro jogador de teste.");return;}list.value=prefer||list.value||athletes[0].id;await loadModel();}
async function loadModel(){if(!$("athlete").value)return;selectedCalendarDay=null;selectedNutritionWeek=null;model=await request("/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/microcycles");profileEditing=false;render();renderProfileSummary();await loadPlanDrafts();await loadCalendar();showBackofficeView(backofficeView);}
function render(){const root=$("matrix");root.replaceChildren();const tbl=document.createElement("table");const header=document.createElement("tr");for(const label of ["Classificação","Pequeno-almoço","Almoço","Lanche","Jantar","Ceia"]){const th=document.createElement("th");th.textContent=label;header.appendChild(th);}tbl.appendChild(header);for(const row of model.classifications){const tr=document.createElement("tr"),title=document.createElement("td");title.textContent=(row.configured?"● ":"○ ")+row.name;tr.appendChild(title);for(const meal of model.meals){const td=document.createElement("td"),sel=document.createElement("select");sel.setAttribute("aria-label",row.name+" "+names[meal]);for(const [value,label] of [["","— Sem refeição"],...model.colors.map(c=>[c,colors[c]||c])]){const o=document.createElement("option");o.value=value;o.textContent=label;sel.appendChild(o);}sel.value=row.meals[meal]||"";sel.addEventListener("change",async()=>{const prior=row.meals[meal];const next=sel.value||null;sel.disabled=true;status("A guardar "+row.name+" · "+names[meal]+"…");try{await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/microcycles/"+encodeURIComponent(row.name),{method:"PUT",body:JSON.stringify({meal,color:next})});row.meals[meal]=next;row.configured=true;title.textContent="● "+row.name;status("Guardado: "+row.name+" · "+names[meal]+".","success");}catch(e){sel.value=prior||"";status("Não foi possível guardar: "+e.message,"warn");}finally{sel.disabled=false;}});td.appendChild(sel);tr.appendChild(td);}tbl.appendChild(tr);}root.appendChild(tbl);root.hidden=false;}
$("filipe-activate").addEventListener("click",async()=>{
  const button=$("filipe-activate"),feedback=$("admin-access-feedback");
  button.disabled=true;feedback.textContent="A verificar a conta do Filipe...";
  $("admin-activation-result").hidden=true;
  try{
    const data=await request("/api/admins");
    const account=(data.admins||[]).find(a=>a.email.toLowerCase()==="filipesousa@themile.pt"&&a.active);
    if(!account)throw Error("A conta do Filipe não está disponível neste ambiente.");
    const result=await request("/api/admins/"+encodeURIComponent(account.id)+"/activation",{method:"POST",body:JSON.stringify({})});
    $("admin-activation-url").value=result.activation_url;
    $("admin-activation-result").hidden=false;
    feedback.textContent="Ligação gerada. Copia e envia em privado ao Filipe. Válida durante 24 horas.";
  }catch(e){feedback.textContent="Não foi possível gerar a ligação: "+e.message;}
  finally{button.disabled=false;}
});
$("copy-admin-activation").addEventListener("click",async()=>{
  const input=$("admin-activation-url");
  try{await navigator.clipboard.writeText(input.value);$("admin-access-feedback").textContent="Ligação copiada. Envia-a em privado ao Filipe.";}
  catch(e){input.focus();input.select();$("admin-access-feedback").textContent="Seleciona e copia a ligação para a partilhares em privado.";}
});
let profileEditing=false;
function renderProfileSummary(){
  if(!model)return;
  const athlete=model.athlete,root=$("profile-summary");root.replaceChildren();
  root.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;margin:18px 0";
  const fields=[
    ["Nome","name",athlete.name,"text"],
    ["Peso atual","weight_kg",athlete.weight_kg,"number"],
    ["Altura","height_cm",athlete.height_cm,"number"],
    ["Notas internas","profile_notes",athlete.profile_notes,"textarea"]
  ];
  for(const [label,key,value,type] of fields){
    const card=document.createElement("div");card.className="profile-info-card";
    card.style.cssText="display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid #36363c;border-radius:12px;min-width:0;background:#19191d";
    const caption=document.createElement("small");caption.textContent=label;caption.style.color="#a9a9b2";
    let field;
    if(profileEditing){
      field=type==="textarea"?document.createElement("textarea"):document.createElement("input");
      if(type!=="textarea"){field.type=type;if(type==="number"){field.step=".1";field.min=key==="weight_kg"?"20":"100";field.max=key==="weight_kg"?"250":"230";}}
      field.value=value??"";field.dataset.profileField=key;field.setAttribute("aria-label",label);
      field.style.cssText="width:100%;box-sizing:border-box;min-width:0";
      if(type==="textarea")field.rows=3;
    }else{
      field=document.createElement("strong");
      field.textContent=value==null||value===""?(key==="profile_notes"?"Sem notas":"Por preencher"):String(value)+(key==="weight_kg"?" kg":key==="height_cm"?" cm":"");
      field.style.cssText="font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere";
    }
    card.append(caption,field);root.appendChild(card);
  }
  $("edit-athlete-profile").hidden=profileEditing;
  $("profile-inline-actions").hidden=!profileEditing;
}
$("edit-athlete-profile").addEventListener("click",()=>{profileEditing=true;renderProfileSummary();});
$("cancel-athlete-profile").addEventListener("click",()=>{profileEditing=false;renderProfileSummary();});
$("save-athlete-profile").addEventListener("click",async()=>{
  if(!model)return;
  const button=$("save-athlete-profile");button.disabled=true;
  try{
    const get=key=>document.querySelector('[data-profile-field="'+key+'"]').value;
    const raw=get("weight_kg"),height=get("height_cm");
    const result=await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/profile",{method:"PUT",body:JSON.stringify({
      name:get("name").trim(),weight_kg:raw===""?null:Number(raw),height_cm:height===""?null:Number(height),profile_notes:get("profile_notes")
    })});
    model.athlete=result.athlete;profileEditing=false;renderProfileSummary();
    const active=$("athlete").selectedOptions[0];if(active)active.textContent=result.athlete.name;
    await loadCalendar();status("Perfil do jogador atualizado.","success");
  }catch(e){status("Erro ao guardar perfil: "+e.message,"warn");}
  finally{button.disabled=false;}
});
let selectedNutritionWeek=null,periByDay={},dayColorOverrides={};
let backofficeView="calendar",menuWeek=new Date(),menuLookup={},dishLibrary=[];
function weekStart(date){const d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;}
async function loadMenus(){
  if(!model)return;
  const start=weekStart(menuWeek),finish=new Date(start);finish.setDate(start.getDate()+6);
  const begin=isoDay(start),end=isoDay(finish);
  $("menu-week").textContent=begin+" — "+end;
  const data=await request(matchBase()+"/menus?start="+begin+"&end="+end);
  dishLibrary=(await request("/api/v2/dishes")).dishes;
  renderDishEditor();refreshDishCategories();
  const calendar=(await request(matchBase()+"/calendar?start="+begin+"&end="+end)).days;
  const root=$("menu-grid");root.replaceChildren();
  const pending=new Map();
  const saveWeek=$("save-menu-week");
  const feedback=$("menu-save-feedback");
  saveWeek.disabled=true;feedback.textContent="";
  const mark=(key,entry)=>{pending.set(key,entry);saveWeek.disabled=false;feedback.textContent=pending.size+" refeição(ões) por guardar";};
  saveWeek.onclick=async()=>{
    saveWeek.disabled=true;feedback.textContent="A guardar a semana…";
    try{await request(matchBase()+"/menus/batch",{method:"PUT",body:JSON.stringify({items:[...pending.values()]})});
      feedback.textContent="Semana guardada com sucesso.";await loadMenus();
      feedback.textContent="Semana guardada com sucesso.";status("Menus da semana guardados.","success");
    }catch(e){feedback.textContent="Erro ao guardar: "+e.message;saveWeek.disabled=false;}
  };
  for(let i=0;i<7;i++){
    const day=new Date(start);day.setDate(start.getDate()+i);const date=isoDay(day);
    const section=document.createElement("section");section.className="menu-day-card";
    const calendarDay=calendar.find(item=>item.date===date);
    const modelRow=model.classifications.find(item=>item.name===calendarDay?.classification);
    const title=document.createElement("h3");title.textContent=day.toLocaleDateString("pt-PT",{weekday:"long",day:"2-digit",month:"short"})+(calendarDay?.classification?" · "+calendarDay.classification:"");section.appendChild(title);
    for(const meal of ["lunch","dinner"]){
      const existing=data.menus.find(x=>x.menu_date===date&&x.meal===meal);
      const line=document.createElement("div");line.className="menu-meal-card";
      const heading=document.createElement("div");heading.className="menu-meal-heading";
      const assignedColor=modelRow?.meals?.[meal];
      const color=document.createElement("span");color.className="menu-color-label"+(assignedColor?" meal-"+assignedColor:"");color.textContent=assignedColor?(colors[assignedColor]||assignedColor):"Sem cor";
      const label=document.createElement("strong");label.textContent=names[meal];heading.append(label,color);line.appendChild(heading);
      const kind=document.createElement("select");
      for(const [value,name] of [["category","Categoria"],["dish","Prato completo"]]){const opt=document.createElement("option");opt.value=value;opt.textContent=name;kind.appendChild(opt);}
      kind.value=existing?.kind||"category";kind.className="menu-kind";line.appendChild(kind);
      const category=document.createElement("select");
      const categoryNames=["Carne branca","Carne vermelha","Peixe magro","Peixe gordo","Livre","Pós-jogo","Mix"];
      const previousCategory=existing?.kind==="category"?existing.value:"";
      const categories=previousCategory&&!categoryNames.includes(previousCategory)?[previousCategory,...categoryNames]:categoryNames;
      for(const name of categories){const option=document.createElement("option");option.value=name;option.textContent=name;category.appendChild(option);}
      category.value=previousCategory||categoryNames[0];category.className="menu-choice";line.appendChild(category);
      const dish=document.createElement("input");dish.type="text";dish.maxLength=200;dish.placeholder="Nome do prato (base de menus em preparação)";dish.value=existing?.kind==="dish"?existing.value:"";line.appendChild(dish);
      const selectedDish=dishLibrary.find(x=>x.name_pt===existing?.value);
      const dishFilter=document.createElement("select");dishFilter.className="menu-choice";dishFilter.setAttribute("aria-label","Filtrar pratos por categoria");
      const all=document.createElement("option");all.value="";all.textContent="Todas as categorias";dishFilter.appendChild(all);
      const libraryCategories=[...new Set(dishLibrary.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));
      for(const name of libraryCategories){const opt=document.createElement("option");opt.value=name;opt.textContent=name;dishFilter.appendChild(opt);}
      dishFilter.value=selectedDish?.category||"";line.appendChild(dishFilter);
      const picker=document.createElement("div");picker.className="menu-combobox";line.appendChild(picker);
      const dishSearch=document.createElement("input");dishSearch.type="search";dishSearch.className="menu-choice";dishSearch.placeholder="Pesquisar e selecionar prato…";dishSearch.autocomplete="off";dishSearch.setAttribute("role","combobox");dishSearch.setAttribute("aria-autocomplete","list");dishSearch.setAttribute("aria-expanded","false");picker.appendChild(dishSearch);
      const suggestions=document.createElement("div");suggestions.className="menu-suggestions";suggestions.setAttribute("role","listbox");suggestions.hidden=true;picker.appendChild(suggestions);
      let chosenDishId=selectedDish?.id||"";
      dishSearch.value=selectedDish?.name_pt||"";
      const candidates=()=>dishLibrary.filter(x=>(x.active||x.id===selectedDish?.id)&&(!dishFilter.value||x.category===dishFilter.value)&&(!dishSearch.value.trim()||x.name_pt.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").includes(dishSearch.value.trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")))).slice(0,30);
      const closeSuggestions=()=>{suggestions.hidden=true;dishSearch.setAttribute("aria-expanded","false");};
      const updatePreview=()=>{const item=dishLibrary.find(x=>x.id===chosenDishId);preview.hidden=!item;if(item)preview.src="/api/v2/dishes/image/"+encodeURIComponent(item.id);};
      const pickDish=item=>{chosenDishId=item.id;dishSearch.value=item.name_pt;closeSuggestions();updatePreview();queue();};
      const showSuggestions=()=>{
        suggestions.replaceChildren();
        const items=candidates();
        if(!items.length){const empty=document.createElement("div");empty.className="menu-suggestion-empty";empty.textContent="Nenhum prato encontrado";suggestions.appendChild(empty);}
        for(const item of items){
          const option=document.createElement("button");option.type="button";option.className="menu-suggestion";option.setAttribute("role","option");option.textContent=item.name_pt;
          option.addEventListener("mousedown",event=>event.preventDefault());
          option.addEventListener("click",()=>pickDish(item));suggestions.appendChild(option);
        }
        suggestions.hidden=false;dishSearch.setAttribute("aria-expanded","true");
      };
      dishSearch.addEventListener("focus",showSuggestions);
      dishSearch.addEventListener("input",()=>{chosenDishId="";updatePreview();showSuggestions();});
      dishSearch.addEventListener("keydown",e=>{
        if(e.key==="Escape"){closeSuggestions();dishSearch.blur();}
        if(e.key==="Enter"&&!suggestions.hidden){e.preventDefault();const item=candidates()[0];if(item)pickDish(item);}
      });
      dishSearch.addEventListener("blur",()=>{setTimeout(closeSuggestions,120);});
      dishFilter.addEventListener("change",()=>{chosenDishId="";dishSearch.value="";updatePreview();closeSuggestions();});
      const preview=document.createElement("img");preview.alt="Fotografia do prato";preview.className="menu-dish-image";line.appendChild(preview);
      updatePreview();
      const toggle=()=>{category.hidden=kind.value!=="category";dishSearch.hidden=kind.value!=="dish";picker.hidden=kind.value!=="dish";dishFilter.hidden=kind.value!=="dish";preview.hidden=kind.value!=="dish"||!chosenDishId;dish.hidden=true;closeSuggestions();};
      kind.addEventListener("change",toggle);toggle();
      const queue=()=>{
        const selectedDish=dishLibrary.find(x=>x.id===chosenDishId);
        const selected=kind.value==="category"?category.value:(selectedDish?.name_pt||"");
        mark(date+"|"+meal,{menu_date:date,meal,kind:kind.value,value:selected});
      };
      kind.addEventListener("change",queue);category.addEventListener("change",queue);
      section.appendChild(line);
    }
    root.appendChild(section);
  }
}
$("menu-prev").addEventListener("click",()=>{menuWeek=weekStart(menuWeek);menuWeek.setDate(menuWeek.getDate()-7);loadMenus().catch(e=>status(e.message,"warn"));});
$("menu-next").addEventListener("click",()=>{menuWeek=weekStart(menuWeek);menuWeek.setDate(menuWeek.getDate()+7);loadMenus().catch(e=>status(e.message,"warn"));});

let simulationDay=new Date(),publishedSimulation={};
let playerView="overview",playerSelectedPlan=null,playerMenuWeek=new Date();
function playerFormattedNutrition(values){
 const root=document.createElement("span");root.className="nutrient-colors player-formatted-nutrition";
 for(const [key,prefix,cls,digits] of [["kcal","","nutrient-kcal",0],["protein_g","P ","nutrient-protein",1],["carbs_g","HC ","nutrient-carbs",1],["fat_g","G ","nutrient-fat",1]]){
  const item=document.createElement("span");item.className=cls;const raw=values?.[key];const n=typeof raw==="number"?raw:Number(String(raw??"").trim().replace(",","."));item.textContent=prefix+(raw===null||raw===undefined||String(raw).trim()===""||!Number.isFinite(n)?"—":formatNutrition(n,digits))+(key==="kcal"?" kcal":" g");root.appendChild(item);
 }
 return root;
}
function playerOption(option,index){
 const details=document.createElement("details");details.className="import-option";
 const summary=document.createElement("summary");summary.className="plan-option-summary";
 const label=document.createElement("span");label.textContent="Opção "+(option.number||index+1)+(option.title?" · "+option.title:"");summary.appendChild(label);
 if(option.totals){const values=playerFormattedNutrition(option.totals);values.classList.add("player-option-expanded-values");summary.appendChild(values);}
 details.appendChild(summary);
 for(const item of option.items||[]){const line=document.createElement("p");line.className="player-plan-food";line.textContent=item.kind==="food"?((item.quantity||"")+" · "+(item.name||"")):(item.text||"");details.appendChild(line);}
 return details;
}
async function playerShowPlans(){
 const data=await request(matchBase()+"/plan-imports/published-preview"),root=$("player-plan-list"),detail=$("player-plan-detail");
 root.replaceChildren();detail.replaceChildren();
 const available=Object.entries(data.options_by_color).filter(([,meals])=>Object.values(meals).some(options=>options.length));
 for(const [color] of available){
  const button=document.createElement("button");button.className="player-plan-button"+(playerSelectedPlan===color?" active":"");
  const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+color;button.append(dot,document.createTextNode(colors[color]||color));root.appendChild(button);
  button.onclick=()=>{playerSelectedPlan=playerSelectedPlan===color?null:color;playerShowPlans().catch(e=>status(e.message,"warn"));};
 }
 if(!available.length){root.textContent="Ainda não há planos publicados.";return;}
 if(!playerSelectedPlan||!data.options_by_color[playerSelectedPlan])return;
 const meals=data.options_by_color[playerSelectedPlan];
 for(const meal of model.meals){if(!meals[meal]?.length)continue;const section=document.createElement("section");section.className="player-sim-meal";const header=document.createElement("div");header.className="player-meal-header";const title=document.createElement("h3");title.textContent=names[meal];header.appendChild(title);const average=averageMealNutrition(meals[meal]);if(average)header.appendChild(playerFormattedNutrition(average));section.appendChild(header);meals[meal].forEach((option,i)=>section.appendChild(playerOption(option,i)));detail.appendChild(section);}
}
async function playerShowMenus(){
 const monday=weekStart(playerMenuWeek),last=new Date(monday);last.setDate(monday.getDate()+6);
 const begin=isoDay(monday),end=isoDay(last);$("player-menu-week").textContent=begin+" — "+end;
 const [menus,calendar,dishes]=await Promise.all([request(matchBase()+"/menus?start="+begin+"&end="+end),request(matchBase()+"/calendar?start="+begin+"&end="+end),request("/api/v2/dishes")]);
 const root=$("player-menu-days");root.replaceChildren();
 for(let i=0;i<7;i++){
  const date=new Date(monday);date.setDate(monday.getDate()+i);const key=isoDay(date),day=calendar.days.find(item=>item.date===key);
  const section=document.createElement("section");section.className="player-menu-day";
  const title=document.createElement("h3");title.textContent=date.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"short"})+(day?.classification?" · "+day.classification:"");section.appendChild(title);
  for(const meal of ["lunch","dinner"]){
   const menu=menus.menus.find(item=>item.menu_date===key&&item.meal===meal);if(!menu)continue;
   const line=document.createElement("div");line.className="player-menu-entry";
   const name=document.createElement("strong");name.textContent=names[meal];line.appendChild(name);
   const row=model.classifications.find(c=>c.name===day?.classification),baseline=row?.meals?.[meal];
   const exception=(calendar.meal_color_overrides||[]).find(x=>x.meal_date===key&&x.meal===meal)?.color;
   const color=exception||baseline;
   if(color){const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+color;line.appendChild(dot);}
   const value=document.createElement("span");value.textContent=menu.value;line.appendChild(value);
   if(menu.kind==="dish"){const dish=dishes.dishes.find(item=>item.name_pt===menu.value);if(dish){const img=document.createElement("img");img.className="player-menu-photo";img.src="/api/v2/dishes/image/"+encodeURIComponent(dish.id);img.alt=menu.value;line.appendChild(img);}}
   section.appendChild(line);
  }
  root.appendChild(section);
 }
}
async function showPlayerView(view){
 playerView=view;for(const [key,id] of [["overview","player-overview"],["plans","player-full-plans"],["menus","player-full-menus"]])$(id).hidden=key!==view;
 for(const button of document.querySelectorAll("[data-player-view]"))button.setAttribute("aria-pressed",button.dataset.playerView===view?"true":"false");
 if(view==="overview")await loadPlayerSimulation();if(view==="plans")await playerShowPlans();if(view==="menus")await playerShowMenus();
}
for(const button of document.querySelectorAll("[data-player-view]"))button.addEventListener("click",()=>showPlayerView(button.dataset.playerView).catch(e=>status(e.message,"warn")));
for(const [id,delta] of [["player-menu-prev",-7],["player-menu-next",7]])$(id).addEventListener("click",()=>{playerMenuWeek.setDate(playerMenuWeek.getDate()+delta);playerShowMenus().catch(e=>status(e.message,"warn"));});
async function loadPlayerSimulation(){
  if(!model)return;
  const d=isoDay(simulationDay);
  $("player-preview-date").textContent=simulationDay.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const [plans,calendar,menus]=await Promise.all([
    request(matchBase()+"/plan-imports/published-preview"),
    request(matchBase()+"/calendar?start="+d+"&end="+d),
    request(matchBase()+"/menus?start="+d+"&end="+d)
  ]);
  publishedSimulation=plans.options_by_color;
  dayColorOverrides=colorOverrideLookup(calendar.meal_color_overrides);
  const strip=$("player-week-strip");strip.replaceChildren();
  const monday=weekStart(simulationDay);
  for(let i=0;i<7;i++){
    const date=new Date(monday);date.setDate(monday.getDate()+i);
    const btn=document.createElement("button");btn.type="button";btn.className="player-day-pill"+(isoDay(date)===d?" active":"");
    const short=date.toLocaleDateString("pt-PT",{weekday:"short"});
    btn.textContent=short+" "+date.getDate();
    btn.onclick=()=>{simulationDay=date;loadPlayerSimulation().catch(e=>status(e.message,"warn"));};
    strip.appendChild(btn);
  }
  const summary=$("player-day-summary");summary.replaceChildren();
  const host=$("player-preview-meals");host.replaceChildren();
  const day=calendar.days[0];
  if(!day||(!day.classification&&!model.meals.some(meal=>colorForDay(day,meal)))){host.textContent="Sem prescrição para este dia.";return;}
  const heading=document.createElement("h3");heading.textContent=day.classification;host.appendChild(heading);
  const publishedTotals={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
  let hasValues=false,complete=true;
  for(const entry of mealColorsForDay(day)){
    if(!entry.color)continue;
    const options=publishedSimulation[entry.color]?.[entry.meal]||[];
    const average=averageMealNutrition(options);
    if(!average){complete=false;continue;}
    hasValues=true;for(const key of Object.keys(publishedTotals))publishedTotals[key]+=average[key];
  }
  if(hasValues){
    const caption=document.createElement("small");caption.textContent=complete?"Resumo nutricional do dia":"Resumo parcial · faltam planos publicados";summary.appendChild(caption);
    nutritionCards(summary,publishedTotals);
  }

  for(const entry of mealColorsForDay(day)){
    const menu=(entry.meal==="lunch"||entry.meal==="dinner")?menus.menus.find(item=>item.menu_date===d&&item.meal===entry.meal):null;
    if(!entry.color&&!menu)continue;
    const section=document.createElement("section");section.className="player-sim-meal";
    const title=document.createElement("h3");title.textContent=names[entry.meal];section.appendChild(title);
    if(entry.color){const bar=document.createElement("div");bar.className="meal-"+entry.color;bar.style.cssText="height:9px;border-radius:8px;margin:8px 0 15px";section.appendChild(bar);}
    if(menu){const menuLine=document.createElement("div");menuLine.className="player-sim-menu";const label=document.createElement("small");label.textContent=menu.kind==="dish"?"Prato do dia":"Categoria do menu";const value=document.createElement("strong");value.textContent=menu.value;menuLine.append(label,value);section.appendChild(menuLine);}
    const options=entry.color?(publishedSimulation[entry.color]?.[entry.meal]||[]):[];
    if(entry.color&&!options.length){const missing=document.createElement("p");missing.className="hint";missing.textContent="Plano ainda não publicado para esta refeição.";section.appendChild(missing);}
    for(const [index,option] of options.entries()){
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.textContent="Opção "+(option.number||index+1)+(option.title?" · "+option.title:"");details.appendChild(summary);
      if(option.totals){const p=document.createElement("p");p.appendChild(coloredNutrition(option.totals));details.appendChild(p);}
      for(const item of option.items||[]){const line=document.createElement("p");line.className="player-plan-food";line.textContent=item.kind==="food"?((item.quantity||"")+" · "+(item.name||"")):(item.text||"");details.appendChild(line);}
      section.appendChild(details);
    }
    host.appendChild(section);
  }
}
for(const [id,delta] of [["player-preview-prev",-1],["player-preview-next",1]]){
  $(id).addEventListener("click",()=>{simulationDay.setDate(simulationDay.getDate()+delta);loadPlayerSimulation().catch(e=>status(e.message,"warn"));});
}
let v2Access=null;
async function loadV2Access(){
 if(!model)return;
 const data=await request(matchBase()+"/access");v2Access=data.access;
 $("v2-access-create").hidden=!!v2Access;$("v2-access-manage").hidden=!v2Access;
 $("v2-access-state").textContent=v2Access?"Username: "+v2Access.username+" · "+(v2Access.active?"Acesso ativo":"Acesso bloqueado"):"Ainda não existe uma conta associada.";
 if(v2Access)$("v2-access-toggle").textContent=v2Access.active?"Bloquear acesso":"Reativar acesso";
}
$("v2-access-create-btn").onclick=async()=>{
 const username=$("v2-access-username").value.trim().toLowerCase(),password=$("v2-access-password").value;
 if(!confirm("Criar conta de testes para "+model.athlete.name+" com username "+username+"?"))return;
 try{await request(matchBase()+"/access",{method:"POST",body:JSON.stringify({username,password})});$("v2-access-password").value="";$("v2-access-feedback").textContent="Acesso criado. Guarda a palavra-passe num local seguro.";await loadV2Access();}
 catch(e){$("v2-access-feedback").textContent="Erro: "+e.message;}
};
$("v2-access-toggle").onclick=async()=>{
 const active=!v2Access.active;
 if(!confirm((active?"Reativar":"Bloquear")+" o acesso de "+model.athlete.name+"?"))return;
 try{await request(matchBase()+"/access",{method:"PUT",body:JSON.stringify({active})});$("v2-access-feedback").textContent=active?"Acesso reativado.":"Acesso bloqueado; sessões terminadas.";await loadV2Access();}
 catch(e){$("v2-access-feedback").textContent="Erro: "+e.message;}
};
function showBackofficeView(view){
  backofficeView=view;
  const sections={profile:["athlete-weight-panel"],calendar:["calendar-section"],plans:["plan-import-panel"],peri:["peri-panel"],matrix:["matrix"],menus:["menus-panel"],"player-preview":["player-preview-panel"]};
  for(const [key,ids] of Object.entries(sections))for(const id of ids){
    const el=$(id);if(el)el.hidden=key!==view||!model;
  }
  for(const button of document.querySelectorAll("#backoffice-nav [data-view]")){
    button.setAttribute("aria-pressed",button.dataset.view===view?"true":"false");
  }
  $("admin-access-panel").hidden=view!=="profile";
  if(view==="profile"&&model)loadV2Access().catch(e=>status(e.message,"warn"));
  if(view==="calendar"){loadCalendar().catch(e=>status(e.message,"warn"));}
  if(view==="player-preview"){showPlayerView(playerView).catch(e=>status(e.message,"warn"));}
  if(view==="menus"&&model)loadMenus().catch(e=>status(e.message,"warn"));
}
for(const button of document.querySelectorAll("#backoffice-nav [data-view]")){
  button.addEventListener("click",()=>showBackofficeView(button.dataset.view));
}
$("athlete").addEventListener("change",()=>loadModel().catch(e=>status(e.message,"warn")));
$("create").addEventListener("click",async()=>{const name=$("new-name").value.trim();if(!name)return status("Escreve o nome do jogador.","warn");$("create").disabled=true;try{const r=await request("/api/v2/athletes",{method:"POST",body:JSON.stringify({name})});$("new-name").value="";await loadAthletes(r.athlete.id);status("Jogador de teste criado.","success");}catch(e){status(e.message,"warn");}finally{$("create").disabled=false;}});
start();

function isoDay(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function matchBase(){return "/api/v2/athletes/"+encodeURIComponent(model.athlete.id);}

// An explicit per-day exception takes precedence over the microcycle model.
function colorForDay(day,meal,overrides=dayColorOverrides){
  const row=model&&model.classifications.find(r=>r.name===day.classification);
  const fallback=row?.meals?.[meal]||null;
  const selected=overrides[day.date+"|"+meal];
  return selected==="none"?null:(selected||fallback);
}
function mealColorsForDay(day,overrides=dayColorOverrides){
  return model.meals.map(meal=>({meal,color:colorForDay(day,meal,overrides)}));
}
function colorOverrideLookup(rows){
 return Object.fromEntries((rows||[]).map(r=>[r.meal_date+"|"+r.meal,r.color]));
}
function averageMealNutrition(options){
  const keys=["kcal","protein_g","carbs_g","fat_g"];
  if(!options.length)return null;
  const sums=Object.fromEntries(keys.map(key=>[key,0]));
  for(const option of options){
    if(!option.totals)return null;
    for(const key of keys){
      const raw=option.totals[key];
      if(raw===undefined||raw===null||String(raw).trim()==="")return null;
      const value=Number(String(raw).replace(",","."));
      if(!Number.isFinite(value)||value<0)return null;
      sums[key]+=value;
    }
  }
  return Object.fromEntries(keys.map(key=>[key,sums[key]/options.length]));
}
function formatNutrition(value,digits=1){return value.toLocaleString("pt-PT",{maximumFractionDigits:digits,minimumFractionDigits:digits});}
function nutritionSummary(average){
  return formatNutrition(average.kcal,0)+" kcal · P "+formatNutrition(average.protein_g)+" g · HC "+formatNutrition(average.carbs_g)+" g · G "+formatNutrition(average.fat_g)+" g";
}
function plannedDayTotals(day,periLookup=periByDay,colorLookup=dayColorOverrides){
  if((!day.classification||day.needs_review)&&!(periLookup[day.date]||[]).length&&!Object.keys(colorLookup).some(key=>key.startsWith(day.date+"|")))return {state:"unclassified",count:0,missing:[],total:null};
  const totals={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
  const missing=[];let count=0;
  for(const entry of mealColorsForDay(day,colorLookup)){
    if(!entry.color)continue;
    const average=averageMealNutrition(mealOptionsByColor[entry.color]?.[entry.meal]||[]);
    if(!average){missing.push(names[entry.meal]+" ("+(colors[entry.color]||entry.color)+")");continue;}
    for(const key of Object.keys(totals))totals[key]+=average[key];
    count++;
  }
  for(const peri of periLookup[day.date]||[]){
    const average=averageMealNutrition(peri.options||[]);
    if(!average){missing.push(peri.title);continue;}
    for(const key of Object.keys(totals))totals[key]+=average[key];
    count++;
  }
  return {state:missing.length?"partial":"complete",count,missing,total:count?totals:null};
}
function nutritionCards(host,totals){
  const grid=document.createElement("div");grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px;margin:12px 0";
  for(const [key,label,unit,digits] of [["kcal","Energia","kcal",0],["protein_g","Proteína","g",1],["carbs_g","Hidratos","g",1],["fat_g","Gordura","g",1]]){
    const card=document.createElement("div");card.style.cssText="border:1px solid #414148;border-radius:12px;padding:14px";
    const caption=document.createElement("small");caption.textContent=label;card.appendChild(caption);
    const value=document.createElement("strong");value.style.cssText="display:block;font-size:1.35em;margin-top:6px";
    value.textContent=formatNutrition(totals[key],digits)+" "+unit;card.appendChild(value);
    const weight=Number(model?.athlete?.weight_kg);
    if(Number.isFinite(weight)&&weight>0){const relative=document.createElement("small");relative.style.cssText="display:block;margin-top:6px";relative.textContent=formatNutrition(totals[key]/weight,key==="kcal"?1:2)+(key==="kcal"?" kcal/kg":" g/kg");card.appendChild(relative);}
    grid.appendChild(card);
  }
  host.appendChild(grid);
}
function renderNutritionTotals(host,label,result){
  const block=document.createElement("section");block.className="import-validation-progress";
  const heading=document.createElement("h3");heading.textContent=label;block.appendChild(heading);
  const description=document.createElement("p");
  description.textContent=result.state==="unclassified"?"Sem classificação nutricional definida.":result.state==="complete"?"Total planeado · Todas as refeições atribuídas têm valores disponíveis.":result.total?"Subtotal incompleto · Existem refeições atribuídas sem valores disponíveis.":"Ainda não existem valores nutricionais calculáveis.";
  block.appendChild(description);
  if(result.total)nutritionCards(block,result.total);
  if(result.missing.length){const note=document.createElement("p");note.textContent="Em falta: "+result.missing.join("; ");block.appendChild(note);}
  host.appendChild(block);
}

function renderDayPreview(day,host){
  host.replaceChildren();
  window.currentNutritionDay=day;

  const heading=document.createElement("h3");
  heading.textContent="Refeições · "+day.date+" · "+(day.classification||"Sem classificação");
  host.appendChild(heading);
  const grid=document.createElement("div");grid.className="day-meals";
  const detail=document.createElement("section");detail.className="meal-options-detail";
  for(const entry of mealColorsForDay(day)){
    const cell=document.createElement("div");cell.className="day-meal";
    const label=document.createElement("span");label.textContent=names[entry.meal];
    const value=document.createElement("strong");
    value.textContent=entry.color?" ":"";
    if(entry.color)value.className="meal-"+entry.color;
    cell.append(label,value);
    const modelRow=model.classifications.find(r=>r.name===day.classification);
    const baseline=modelRow?.meals?.[entry.meal]||null;
    const isOverride=Object.hasOwn(dayColorOverrides,day.date+"|"+entry.meal);
    const choose=document.createElement("select");
    choose.className="day-color-select";choose.setAttribute("aria-label","Alterar cor de "+names[entry.meal]+" apenas em "+day.date);
    const inherit=document.createElement("option");inherit.value="";inherit.textContent="Modelo"+(baseline?" · "+(colors[baseline]||baseline):" · sem cor");choose.append(inherit);
    const noMeal=document.createElement("option");noMeal.value="none";noMeal.textContent="Nenhuma · remover refeição";choose.append(noMeal);
    for(const [colorName,labelText] of Object.entries(colors)){
      const option=document.createElement("option");option.value=colorName;option.textContent=labelText;choose.append(option);
    }
    choose.value=isOverride?dayColorOverrides[day.date+"|"+entry.meal]:"";
    choose.addEventListener("change",async()=>{
      choose.disabled=true;
      try{
        await request(matchBase()+"/calendar/meal-color",{method:"PUT",body:JSON.stringify({date:day.date,meal:entry.meal,color:choose.value||null})});
        selectedCalendarDay=day.date;
        status((choose.value==="none"?"Refeição removida":choose.value?"Cor atualizada":"Reposta a cor do Modelo")+" apenas para "+names[entry.meal]+" em "+day.date+".","success");
        await loadCalendar();
      }catch(e){status("Não foi possível atualizar a cor: "+e.message,"warn");choose.disabled=false;}
    });
    cell.append(choose);
    if(isOverride){const hint=document.createElement("small");hint.className="day-color-exception";hint.textContent="Exceção deste dia";cell.append(hint);}
    if(entry.meal==="lunch"||entry.meal==="dinner"){const menu=menuLookup[day.date+"|"+entry.meal];if(menu){const note=document.createElement("small");note.textContent="Menu: "+menu.value;cell.appendChild(note);}}
    if(entry.color){
      const options=mealOptionsByColor[entry.color]?.[entry.meal]||[];
      const available=Boolean(validatedPlansByColor[entry.color]);
      const availability=document.createElement("small");
      availability.textContent=!available?"Plano "+(colors[entry.color]||entry.color)+" em falta":options.length?options.length+" opções disponíveis":"Refeição não encontrada no plano";
      cell.appendChild(availability);
      if(available&&options.length){
        const average=averageMealNutrition(options);
        const avg=document.createElement("small");
        avg.textContent=average?"Média planeada: "+nutritionSummary(average):"Média indisponível: verificar totais das opções";
        cell.appendChild(avg);
      }
      if(available&&options.length){
        const view=document.createElement("button");view.type="button";view.textContent="Ver opções";
        view.addEventListener("click",()=>{
          detail.replaceChildren();
          const title=document.createElement("h3");title.textContent=names[entry.meal]+" · "+(colors[entry.color]||entry.color)+" · "+day.date;detail.appendChild(title);
          const average=averageMealNutrition(options);
          const avgLine=document.createElement("p");
          avgLine.textContent=average?"Média planeada das "+options.length+" opções: "+nutritionSummary(average):"Não é possível calcular a média: uma ou mais opções têm valores em falta.";
          detail.appendChild(avgLine);
          for(const option of options){
            const box=document.createElement("details");box.className="import-option";
            const caption=document.createElement("summary");
            caption.textContent="Opção "+option.number+(option.title?" · "+option.title:"");
            box.appendChild(caption);
            if(option.totals){
              const totals=document.createElement("p");
              totals.textContent=option.totals.kcal+" kcal · P "+option.totals.protein_g+" g · HC "+option.totals.carbs_g+" g · G "+option.totals.fat_g+" g";
              box.appendChild(totals);
            }
            for(const item of option.items||[]){
              const line=document.createElement("div");line.className="import-structured-line";
              line.textContent=item.kind==="food"?(item.quantity||"")+" · "+(item.name||""):"Nota: "+(item.text||"");
              box.appendChild(line);
            }
            detail.appendChild(box);
          }
        });
        cell.appendChild(view);
      }
    }
    grid.appendChild(cell);
  }
  host.appendChild(grid);
  if((periByDay[day.date]||[]).length){
    const area=document.createElement("div");area.className="import-validation-progress";
    const head=document.createElement("h3");head.textContent="Refeições peri-treino e peri-jogo";area.append(head);
    for(const item of periByDay[day.date]){
      const avg=averageMealNutrition(item.options||[]);const p=document.createElement("p");
      p.textContent=item.title+" · "+(item.session==="morning"?"Manhã":"Tarde")+(avg?" · "+nutritionSummary(avg):" · Valores indisponíveis");
      area.append(p);
    }
    host.append(area);
  }
  renderNutritionTotals(host,"Resumo nutricional do dia",plannedDayTotals(day));
  host.appendChild(detail);
  const hint=document.createElement("p");hint.textContent="Pré-visualização administrativa. Os planos ainda não estão publicados aos jogadores.";host.appendChild(hint);
}

async function loadCalendar(){
  if(!model)return;
  const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
  const last=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0);
  const data=await request(matchBase()+"/calendar?start="+isoDay(first)+"&end="+isoDay(last));
  dayColorOverrides=colorOverrideLookup(data.meal_color_overrides);
  periByDay=Object.fromEntries(data.days.map(d=>[d.date,(data.peri_meals||[]).filter(p=>p.event_date===d.date)]));
  const menuData=await request(matchBase()+"/menus?start="+isoDay(first)+"&end="+isoDay(last));
  menuLookup=Object.fromEntries(menuData.menus.map(m=>[m.menu_date+"|"+m.meal,m]));
  if(!selectedNutritionWeek){
    const today=new Date();
    const anchor=today.getFullYear()===first.getFullYear()&&today.getMonth()===first.getMonth()?today:first;
    selectedNutritionWeek=isoDay(weekStart(anchor));
  }
  let weekly=$("nutrition-weekly-summary");
  if(!weekly){weekly=document.createElement("section");weekly.id="nutrition-weekly-summary";weekly.className="import-validation-progress";$("calendar-matches").insertAdjacentElement("afterend",weekly);}
  weekly.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="Média nutricional diária da semana";weekly.appendChild(heading);
  const navigation=document.createElement("div");navigation.className="calendar-navigation";
  const previous=document.createElement("button");previous.type="button";previous.textContent="← Semana anterior";
  const next=document.createElement("button");next.type="button";next.textContent="Semana seguinte →";
  const range=document.createElement("strong");navigation.append(previous,range,next);weekly.appendChild(navigation);
  const monday=new Date(selectedNutritionWeek+"T12:00:00");
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  range.textContent=monday.toLocaleDateString("pt-PT",{day:"2-digit",month:"short"})+" – "+sunday.toLocaleDateString("pt-PT",{day:"2-digit",month:"short",year:"numeric"});
  const step=delta=>{const date=new Date(monday);date.setDate(date.getDate()+delta);selectedNutritionWeek=isoDay(date);loadCalendar().catch(e=>status(e.message,"warn"));};
  previous.addEventListener("click",()=>step(-7));next.addEventListener("click",()=>step(7));
  const weeklyData=await request(matchBase()+"/calendar?start="+isoDay(monday)+"&end="+isoDay(sunday));
  const weeklyPeri=Object.fromEntries(weeklyData.days.map(d=>[d.date,(weeklyData.peri_meals||[]).filter(x=>x.event_date===d.date)]));
  const weeklyColors=colorOverrideLookup(weeklyData.meal_color_overrides);
  const results=weeklyData.days.map(d=>plannedDayTotals(d,weeklyPeri,weeklyColors));
  const covered=results.filter(item=>item.total).length;
  const complete=weeklyData.days.length===7&&results.every((item)=>item.state==="complete"&&item.total);
  const progress=document.createElement("p");
  progress.textContent=covered+"/7 dias com valores nutricionais disponíveis";
  weekly.appendChild(progress);
  if(complete){
    const sums={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
    for(const result of results)for(const key of Object.keys(sums))sums[key]+=result.total[key];
    const average=Object.fromEntries(Object.entries(sums).map(([key,value])=>[key,value/7]));
    nutritionCards(weekly,average);
  }else{
    const warning=document.createElement("p");
    warning.textContent="Média diária semanal indisponível: faltam prescrições ou valores nutricionais para completar os sete dias.";
    weekly.appendChild(warning);
  }
  const days=$("calendar-days");days.replaceChildren();
  $("calendar-title").textContent=first.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});
  for(let i=0;i<(first.getDay()+6)%7;i++){const empty=document.createElement("div");empty.className="calendar-empty";days.appendChild(empty);}
  for(const day of data.days){
    const el=document.createElement("div");el.className="calendar-day"+(day.needs_review?" calendar-review":"");
    const date=document.createElement("strong");date.textContent=Number(day.date.slice(-2));el.appendChild(date);
    const type=document.createElement("span");type.textContent=day.needs_review?"Rever":day.classification||"—";el.appendChild(type);
    if(day.needs_review){el.title=day.candidates.map(x=>x.match_date+": "+x.classification).join(" | ");}
    if(data.matches.some(m=>m.match_date===day.date)){el.classList.add("calendar-match");}
    const dayEvents=(data.events||[]).filter(e=>e.event_date===day.date);
    if(dayEvents.length){
      const chip=document.createElement("span");chip.className="calendar-event-mark";
      chip.textContent=dayEvents.map(e=>CALENDAR_EVENT_NAMES[e.kind]||e.title).join(" · ");
      chip.title=chip.textContent;el.append(chip);
    }
    const strip=document.createElement("div");strip.className="day-color-strip";
    for(const entry of mealColorsForDay(day)){
      const dot=document.createElement("i");
      dot.className="day-color-dot"+(entry.color?" meal-"+entry.color:"");
      dot.title=names[entry.meal]+": "+(entry.color?(colors[entry.color]||entry.color):"Sem cor atribuída");
      strip.appendChild(dot);
    }
    el.appendChild(strip);
    el.setAttribute("role","button");el.tabIndex=0;
    el.setAttribute("aria-label","Ver cores das refeições de "+day.date);
    const selectDay=()=>{
      const wasSelected=selectedCalendarDay===day.date;
      selectedCalendarDay=wasSelected?null:day.date;
      const chosenWeek=isoDay(weekStart(new Date(day.date+"T12:00:00")));
      if(!wasSelected&&selectedNutritionWeek!==chosenWeek){selectedNutritionWeek=chosenWeek;loadCalendar().catch(e=>status(e.message,"warn"));return;}
      for(const item of days.querySelectorAll(".calendar-day"))item.classList.remove("calendar-selected");
      if(wasSelected){preview.hidden=true;preview.replaceChildren();}else{el.classList.add("calendar-selected");preview.hidden=false;renderDayPreview(day,preview);}
    };
    el.addEventListener("click",selectDay);
    el.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectDay();}});
    if(selectedCalendarDay===day.date)el.classList.add("calendar-selected");
    days.appendChild(el);
  }
  let preview=$("day-preview");
  if(!preview){
    preview=document.createElement("div");preview.id="day-preview";
    preview.className="day-preview";
    days.insertAdjacentElement("afterend",preview);
  }
  const focused=data.days.find(d=>d.date===selectedCalendarDay);
  preview.hidden=!focused;
  if(focused){renderDayPreview(focused,preview);}
  const list=$("calendar-matches");list.replaceChildren();
  const combined=[
    ...(data.matches||[]).map(m=>({
      id:m.id,kind:"match",event_date:m.match_date,session:!m.match_time||m.match_time<"15:00"?"morning":"afternoon",
      title:"Jogo",match_time:m.match_time||"",
      pre_override:(data.match_peri_overrides||[]).find(x=>x.match_id===m.id&&x.phase==="pre")?.state||"auto",
      post_override:(data.match_peri_overrides||[]).find(x=>x.match_id===m.id&&x.phase==="post")?.state||"auto"
    })),
    ...(data.events||[])
  ].sort((a,b)=>a.event_date.localeCompare(b.event_date)||(a.session===b.session?0:a.session==="morning"?-1:1));
  if(!combined.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem eventos neste mês.";list.append(p);}
  for(const ev of combined)list.append(renderUnifiedEvent(ev));
  $("calendar-section").hidden=false;
}
$("calendar-prev").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);loadCalendar().catch(e=>status(e.message,"warn"));});
$("calendar-next").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);loadCalendar().catch(e=>status(e.message,"warn"));});

let selectedPlanId=null,selectedPlanMode="consult";
async function loadPlanDrafts(){
  if(!model)return;
  const data=await request(matchBase()+"/plan-imports");
  const readiness=await request(matchBase()+"/plan-imports/publication-status");
  validatedPlansByColor=Object.fromEntries(readiness.colors.map(entry=>[entry.color,entry.validated_count>0]));
  const mealData=await request(matchBase()+"/plan-imports/meal-options");
  mealOptionsByColor=mealData.options_by_color;
  const historyData=await request(matchBase()+"/plan-imports/publication-history");
  const panel=$("publication-readiness");panel.replaceChildren();
  const title=document.createElement("h3");title.textContent="Planos alimentares";panel.appendChild(title);
  const list=$("import-list");list.replaceChildren();
  const drafts=data.drafts||[];
  for(const entry of readiness.colors){
    const latest=drafts.filter(d=>d.color===entry.color).sort((a,b)=>(b.created_at||0)-(a.created_at||0))[0];
    const row=document.createElement("div");row.className="plan-simple-row";
    const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+entry.color;row.appendChild(dot);
    const info=document.createElement("div");info.className="plan-simple-info";
    const name=document.createElement("strong");name.textContent=colors[entry.color]||entry.color;
    const state=document.createElement("small");
    state.textContent=entry.publication?"Publicado":latest?(latest.status==="validated"?"Validado":"Rascunho"):"Sem plano";
    info.append(name,state);row.appendChild(info);
    if(latest){
      row.classList.add("plan-selectable");row.tabIndex=0;row.setAttribute("role","button");
      row.setAttribute("aria-expanded",selectedPlanId===latest.id?"true":"false");
      const toggle=async()=>{
        if(selectedPlanId===latest.id){selectedPlanId=null;selectedPlanMode="consult";$("import-review").replaceChildren();await loadPlanDrafts();return;}
        try{
          const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(latest.id));
          selectedPlanId=latest.id;selectedPlanMode="consult";showImportedDraft(result.draft);await loadPlanDrafts();
        }catch(e){$("import-feedback").textContent="Erro ao abrir plano: "+e.message;}
      };
      row.addEventListener("click",toggle);
      row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}});
      const chevron=document.createElement("span");chevron.className="plan-row-chevron";chevron.textContent=selectedPlanId===latest.id?"⌄":"›";row.appendChild(chevron);
    }
    const assigned=[...new Set(model.classifications.flatMap(cls=>model.meals.filter(meal=>cls.meals[meal]===entry.color)))];
    const missing=entry.validated_count?assigned.filter(meal=>!averageMealNutrition(mealOptionsByColor[entry.color]?.[meal]||[])):[];
    if(missing.length){
      const warning=document.createElement("p");warning.className="plan-simple-warning";
      warning.textContent="Rever opções de: "+missing.map(meal=>names[meal]).join(", ");row.appendChild(warning);
    }
    if(selectedPlanId===latest?.id){row.classList.add("plan-active-row");row.classList.add("plan-active-"+entry.color);}
    panel.appendChild(row);
  }
  let history=$("plan-publication-history");
  if(!history){history=document.createElement("details");history.id="plan-publication-history";history.className="import-validation-progress";$("publication-readiness").insertAdjacentElement("afterend",history);}
  history.replaceChildren();
  const heading=document.createElement("summary");heading.textContent="Histórico de publicações ("+historyData.history.length+")";history.appendChild(heading);
  for(const item of historyData.history){
    const line=document.createElement("p");line.textContent=(colors[item.color]||item.color)+" · "+new Date(item.published_at*1000).toLocaleString("pt-PT")+" · "+(item.replaced_at?"Substituído":"Ativo");history.appendChild(line);
  }
  list.hidden=true;
  const current=$("import-review");
  if(!drafts.length)current.replaceChildren();

}
let planPendingSaves=[];
function coloredNutrition(values){
  const out=document.createElement("span");out.className="nutrient-colors";
  for(const [key,prefix,klass] of [["kcal","","nutrient-kcal"],["protein_g","P ","nutrient-protein"],["carbs_g","HC ","nutrient-carbs"],["fat_g","G ","nutrient-fat"]]){
    const span=document.createElement("span");span.className=klass;
    span.textContent=prefix+(values?.[key]??"—")+(key==="kcal"?" kcal":" g");out.appendChild(span);
  }
  return out;
}
function renderPlayerPlanPreview(draft,host){
  host.replaceChildren();
  const intro=document.createElement("p");intro.className="hint";intro.textContent="Simulação administrativa da consulta pelo jogador · Não publicado";host.appendChild(intro);
  const byMeal=new Map();
  for(const group of draft.extracted.groups)for(const meal of group.meals||[]){
    if(!byMeal.has(meal))byMeal.set(meal,[]);
    byMeal.get(meal).push(...group.options);
  }
  for(const meal of model.meals){
    const options=byMeal.get(meal)||[];
    if(!options.length)continue;
    const section=document.createElement("section");section.className="player-plan-meal";
    const title=document.createElement("h4");title.textContent=names[meal];section.appendChild(title);
    for(const [index,option] of options.entries()){
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.textContent="Opção "+(option.number||index+1)+(option.title?" · "+option.title:"");details.appendChild(summary);
      for(const item of option.items||[]){
        if(item.kind==="title")continue;
        const line=document.createElement("p");line.className="player-plan-food";
        line.textContent=item.kind==="food"?(item.quantity+" · "+item.name):(item.text||"");details.appendChild(line);
      }
      section.appendChild(details);
    }
    host.appendChild(section);
  }
}
function showImportedDraft(draft){
  const root=$("import-review");root.replaceChildren();
  const header=document.createElement("div");header.className="plan-detail-header";
  const h=document.createElement("h3");const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+draft.color;h.append(dot,document.createTextNode(colors[draft.color]||draft.color));header.appendChild(h);
  root.appendChild(header);
  const edit=document.createElement("button");edit.type="button";edit.textContent=selectedPlanMode==="edit"?"Validar":"Editar";
  edit.addEventListener("click",async()=>{
    edit.disabled=true;
    try{
      if(selectedPlanMode==="consult"){
        if(draft.status==="validated"){
          const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/review-status",{method:"POST",body:JSON.stringify({action:"reopen"})});
          draft.status=result.status;
        }
        selectedPlanMode="edit";
      }else{
        await Promise.all(planPendingSaves);
        const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/review-status",{method:"POST",body:JSON.stringify({action:"approve"})});
        draft.status=result.status;selectedPlanMode="consult";
        await loadPlanDrafts();
      }
      showImportedDraft(draft);await loadPlanDrafts();
    }catch(e){status("Não foi possível concluir: "+e.message,"warn");}finally{edit.disabled=false;}
  });
  header.appendChild(edit);
  if(selectedPlanMode==="consult"&&draft.status==="validated"){
    const publish=document.createElement("button");publish.type="button";publish.textContent="Publicar";header.appendChild(publish);
    publish.onclick=async()=>{
      if(!window.confirm("Publicar o plano "+(colors[draft.color]||draft.color)+" apenas para "+model.athlete.name+"? Esta ação cria uma versão publicada e substitui a anterior desta cor."))return;
      publish.disabled=true;
      try{
        await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/publish",{method:"POST",body:JSON.stringify({confirmation:"PUBLICAR",athlete_id:model.athlete.id})});
        status("Plano publicado no ambiente de testes. Não existe ainda acesso v2 dos jogadores.","success");
        await loadPlanDrafts();
      }catch(e){status("Erro ao publicar: "+e.message,"warn");}finally{publish.disabled=false;}
    };
  }
  if(selectedPlanMode==="edit"){
    const indicator=document.createElement("small");indicator.textContent="Alterações guardadas automaticamente · validação pendente";header.appendChild(indicator);
  }
  draft.extracted.groups.forEach((group,groupIndex)=>{
    const groupTitle=document.createElement("div");groupTitle.className="plan-group-title";
    const heading=document.createElement("h3");heading.textContent=group.heading||"Refeição";groupTitle.appendChild(heading);
    if(selectedPlanMode==="edit"){
      const mapping=document.createElement("div");mapping.className="plan-meal-mapping";
      for(const meal of model.meals){
        const label=document.createElement("label");const check=document.createElement("input");check.type="checkbox";check.checked=group.meals.includes(meal);label.append(check,document.createTextNode(" "+names[meal]));mapping.appendChild(label);
        check.addEventListener("change",async()=>{
          const choices=[...mapping.querySelectorAll("label")].filter(l=>l.querySelector("input").checked).map(l=>model.meals[[...mapping.children].indexOf(l)]);
          try{await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/group-meals",{method:"PUT",body:JSON.stringify({group_index:groupIndex,meals:choices})});group.meals=choices;status("Correspondência das refeições atualizada.","success");}
          catch(e){check.checked=!check.checked;status("Erro na correspondência: "+e.message,"warn");}
        });
      }
      groupTitle.appendChild(mapping);
    }else{const mapping=document.createElement("small");mapping.textContent=group.meals.map(m=>names[m]).join(" / ");groupTitle.appendChild(mapping);}
    root.appendChild(groupTitle);
    group.options.forEach((option,optionIndex)=>{
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.className="plan-option-summary";
      const name=document.createElement("span");name.className="plan-option-name";name.textContent="Opção "+option.number+(option.title?" · "+option.title:"");
      const nutrients=document.createElement("span");nutrients.className="plan-option-nutrition";
      if(option.totals)nutrients.appendChild(coloredNutrition(option.totals));else nutrients.textContent="Valores por confirmar";
      summary.append(name,nutrients);details.appendChild(summary);

      for(const item of option.items||[]){
        if(item.kind==="title")continue;
        const line=document.createElement("div");line.className="import-structured-line";
        const name=document.createElement("span");
        name.textContent=item.kind==="food"?item.quantity+" · "+item.name:item.text;
        if(item.kind==="instruction"||item.kind==="note")name.textContent="Nota: "+item.text;
        line.appendChild(name);
        if(item.nutrients){
          const nutrient=document.createElement("span");nutrient.className="import-nutrients";
          nutrient.appendChild(coloredNutrition(item.nutrients));
          line.appendChild(nutrient);
        }
        if(item.needs_review){const note=document.createElement("small");note.textContent="Verificar";line.appendChild(note);}
        details.appendChild(line);
      }
      if(selectedPlanMode==="edit")details.addEventListener("toggle",()=>{if(details.open&&!details.querySelector(".option-editor"))showOptionEditor(draft,groupIndex,optionIndex,details);});
      root.appendChild(details);
    });
  });
}

function showOptionEditor(draft,groupIndex,optionIndex,details){
  const option=draft.extracted.groups[groupIndex].options[optionIndex];
  const existing=details.querySelector(".option-editor");if(existing){existing.remove();return;}
  const form=document.createElement("div");form.className="option-editor";
  const field=(label,value,parent=form)=>{
    const wrap=document.createElement("label");wrap.textContent=label;
    const input=document.createElement("input");input.value=value||"";wrap.appendChild(input);parent.appendChild(wrap);return input;
  };
  const title=field("Título / descrição",option.title||((option.items||[]).find(i=>i.kind==="title")||{}).text||"");
  const totals={};
  for(const [key,label] of [["kcal","kcal"],["protein_g","Proteína (g)"],["carbs_g","HC (g)"],["fat_g","Gordura (g)"]]){
    totals[key]=field("Total · "+label,option.totals?.[key]||"");
  }
  const edits=[];
  (option.items||[]).filter(item=>item.kind!=="title").forEach((item,index)=>{
    const box=document.createElement("fieldset");const legend=document.createElement("legend");legend.textContent="Linha "+(index+1);box.appendChild(legend);
    const type=document.createElement("select");
    for(const [value,label] of [["food","Alimento"],["note","Nota"]]){
      const el=document.createElement("option");el.value=value;el.textContent=label;type.appendChild(el);
    }
    type.value=item.kind==="food"?"food":"note";box.appendChild(type);
    const name=field("Alimento / texto",item.kind==="food"?item.name:item.text,box);
    const quantity=field("Quantidade",item.quantity||"",box);
    const nutrients={};
    for(const [key,label] of [["kcal","kcal"],["protein_g","P (g)"],["carbs_g","HC (g)"],["fat_g","G (g)"]]){
      nutrients[key]=field(label,item.nutrients?.[key]||"",box);
    }
    form.appendChild(box);edits.push({type,name,quantity,nutrients});
  });
  const feedback=document.createElement("p");feedback.className="hint";feedback.textContent="As alterações são guardadas automaticamente ao sair de cada campo.";form.appendChild(feedback);
  let saveChain=Promise.resolve();
  const persist=()=>{
    const entries=edits.map(edit=>{
      const kind=edit.type.value;
      const nutrients=Object.fromEntries(Object.entries(edit.nutrients).map(([key,input])=>[key,input.value.trim()]));
      return {kind,text:edit.name.value.trim(),name:kind==="food"?edit.name.value.trim():"",quantity:kind==="food"?edit.quantity.value.trim():"",nutrients:kind==="food"&&Object.values(nutrients).some(Boolean)?nutrients:null};
    });
    const totalValues=Object.fromEntries(Object.entries(totals).map(([key,input])=>[key,input.value.trim()]));
    const payload={group_index:groupIndex,option_index:optionIndex,option:{title:title.value.trim(),totals:Object.values(totalValues).some(Boolean)?totalValues:null,items:entries,reviewed:Boolean(option.reviewed)}};
    feedback.textContent="A guardar alterações…";
    saveChain=saveChain.catch(()=>{}).then(async()=>{
      const response=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id),{method:"PUT",body:JSON.stringify(payload)});
      option.items=response.option.items;option.title=response.option.title;option.totals=response.option.totals;option.reviewed=response.option.reviewed;
      feedback.textContent="Alterações guardadas automaticamente.";
    }).catch(e=>{feedback.textContent="Erro ao guardar: "+e.message;throw e;});
    planPendingSaves.push(saveChain);
    saveChain.finally(()=>{planPendingSaves=planPendingSaves.filter(p=>p!==saveChain);}).catch(()=>{});
  };
  for(const control of form.querySelectorAll("input,select"))control.addEventListener("change",persist);
  details.appendChild(form);
}
$("import-submit").addEventListener("click",async()=>{
  if(!model)return;
  const file=$("import-pdf").files[0];
  if(!file||!file.name.toLowerCase().endsWith(".pdf")||file.size>3*1024*1024){$("import-feedback").textContent="Seleciona um PDF válido até 3 MB.";return;}
  const button=$("import-submit");button.disabled=true;$("import-feedback").textContent="A analisar o PDF…";
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const result=await request(matchBase()+"/plan-imports",{method:"POST",body:JSON.stringify({color:$("import-color").value,filename:file.name,pdf_base64:btoa(binary)})});
    $("import-feedback").textContent="Rascunho guardado. Rever a extração antes de qualquer futura publicação.";
    showImportedDraft(result.draft);await loadPlanDrafts();
  }catch(e){$("import-feedback").textContent="Erro na importação: "+e.message;}
  finally{button.disabled=false;}
});

async function photoAsWebp(file){
  if(!file||file.size>12000000)throw Error("Seleciona uma fotografia PNG, JPG ou WebP até 12 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function refreshDishCategories(){
  const select=$("new-dish-category");const previous=select.value;
  select.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent="Selecionar categoria";select.appendChild(empty);
  for(const name of [...new Set(dishLibrary.map(d=>d.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"))){
    const option=document.createElement("option");option.value=name;option.textContent=name;select.appendChild(option);
  }
  select.value=previous;
}
async function uploadDishPhoto(file,fields){
  const image=await photoAsWebp(file);
  return request("/api/v2/dishes/photo",{method:"POST",body:JSON.stringify({...fields,image})});
}
$("create-dish").addEventListener("click",async()=>{
  const button=$("create-dish"),feedback=$("dish-new-feedback");
  const name_pt=$("new-dish-pt").value.trim(),name_en=$("new-dish-en").value.trim(),category=$("new-dish-category").value.trim(),photo=$("new-dish-photo").files[0];
  if(!name_pt||!category||!photo){feedback.textContent="Indica nome português, categoria e fotografia.";return;}
  button.disabled=true;feedback.textContent="A guardar prato…";
  try{await uploadDishPhoto(photo,{name_pt,name_en,category});
    feedback.textContent="Prato adicionado à biblioteca universal.";
    $("new-dish-pt").value="";$("new-dish-en").value="";$("new-dish-category").value="";$("new-dish-photo").value="";
    dishLibrary=(await request("/api/v2/dishes")).dishes;renderDishEditor();refreshDishCategories();
  }catch(e){feedback.textContent="Erro: "+e.message;}finally{button.disabled=false;}
});
function renderDishEditor(){
  const host=$("dish-editor-list");if(!host)return;host.replaceChildren();
  const query=($("dish-search").value||"").trim().toLocaleLowerCase("pt-PT");
  if(!query){host.textContent="Pesquisa pelo nome ou categoria para editar um prato.";return;}
  const matches=dishLibrary.filter(d=>(d.name_pt+" "+d.category).toLocaleLowerCase("pt-PT").includes(query)).slice(0,25);
  for(const dish of matches){
    const card=document.createElement("div");card.className="dish-edit-card";
    const photo=document.createElement("img");photo.src="/api/v2/dishes/image/"+encodeURIComponent(dish.id);photo.alt=dish.name_pt;photo.loading="lazy";card.appendChild(photo);
    const fields=document.createElement("div");fields.className="dish-edit-fields";
    const photoLabel=document.createElement("label");photoLabel.textContent="Substituir fotografia";
    const photoInput=document.createElement("input");photoInput.type="file";photoInput.accept="image/*";photoLabel.appendChild(photoInput);fields.appendChild(photoLabel);
    const photoButton=document.createElement("button");photoButton.type="button";photoButton.textContent="Atualizar fotografia";
    photoButton.onclick=async()=>{if(!photoInput.files[0])return;photoButton.disabled=true;
      try{await uploadDishPhoto(photoInput.files[0],{id:dish.id});photo.src="/api/v2/dishes/image/"+encodeURIComponent(dish.id)+"?v="+Date.now();status("Fotografia atualizada.","success");}
      catch(e){status("Erro: "+e.message,"warn");}finally{photoButton.disabled=false;}
    };fields.appendChild(photoButton);
    const inputs=[];
    for(const [key,label] of [["name_pt","Nome português"],["name_en","Nome inglês"],["category","Categoria"]]){
      const wrap=document.createElement("label");wrap.textContent=label;const input=document.createElement("input");input.value=dish[key]||"";input.maxLength=200;wrap.appendChild(input);fields.appendChild(wrap);inputs.push(input);
    }
    const active=document.createElement("label");const box=document.createElement("input");box.type="checkbox";box.checked=!!dish.active;active.append(box,document.createTextNode(" Disponível para novos menus"));fields.appendChild(active);
    const save=document.createElement("button");save.type="button";save.textContent="Guardar alterações";
    save.onclick=async()=>{save.disabled=true;try{
      await request("/api/v2/dishes/edit",{method:"PUT",body:JSON.stringify({id:dish.id,name_pt:inputs[0].value,name_en:inputs[1].value,category:inputs[2].value,active:box.checked})});
      dish.name_pt=inputs[0].value;dish.name_en=inputs[1].value;dish.category=inputs[2].value;dish.active=box.checked?1:0;
      status("Prato atualizado na biblioteca universal.","success");
    }catch(e){status("Erro: "+e.message,"warn");}finally{save.disabled=false;}};
    fields.appendChild(save);card.appendChild(fields);host.appendChild(card);
  }
  if(!matches.length)host.textContent="Nenhum prato encontrado.";
}
$("dish-search").addEventListener("input",renderDishEditor);
$("dish-catalog-import").addEventListener("click",async()=>{
  const input=$("dish-catalog-file"),feedback=$("dish-catalog-feedback"),file=input.files?.[0];
  if(!file){feedback.textContent="Seleciona o pacote ZIP da biblioteca.";return;}
  const button=$("dish-catalog-import");button.disabled=true;feedback.textContent="A importar biblioteca…";
  try{
    const response=await fetch("/api/v2/dishes/import",{method:"POST",credentials:"same-origin",headers:{"X-CSRF-Token":csrf},body:file});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Erro na importação");
    feedback.textContent=data.imported+" pratos importados com fotografias.";
    await loadMenus();
  }catch(e){feedback.textContent="Erro: "+e.message;}finally{button.disabled=false;}
});

const CALENDAR_EVENT_NAMES={training:"Treino",match:"Jogo",travel:"Viagem"};
function calendarEventEndpoint(){return matchBase()+"/events";}
function dayPartSelect(value,label){
 const field=document.createElement("label");field.textContent=label;
 const select=document.createElement("select");
 for(const [code,title] of [["morning","Manhã"],["afternoon","Tarde"]]){
  const option=document.createElement("option");option.value=code;option.textContent=title;select.append(option);
 }
 select.value=value;field.append(select);return {field,select};
}
function periToggle(phase,kind,initial){
 const field=document.createElement("label");field.className="calendar-peri-check";
 const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=initial!=="off";
 const name=document.createElement("span");name.textContent=(phase==="pre"?"Pré-":"Pós-")+(kind==="match"?"jogo":"treino");
 field.append(checkbox,name);
 return {field,checkbox};
}
function renderUnifiedEvent(ev){
 const card=document.createElement("section");card.className="calendar-unified-event";
 const heading=document.createElement("div");heading.className="calendar-unified-heading";
 const title=document.createElement("strong");title.textContent=CALENDAR_EVENT_NAMES[ev.kind]||ev.title;
 const dateLabel=document.createElement("span");dateLabel.textContent=ev.event_date+" · "+(ev.kind==="match"&&ev.match_time?ev.match_time:ev.session==="morning"?"Manhã":"Tarde");
 heading.append(title,dateLabel);
 const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";heading.append(edit);card.append(heading);
 const controls=document.createElement("form");controls.className="calendar-inline-editor";controls.hidden=true;
 const dateWrap=document.createElement("label");dateWrap.textContent="Data";
 const date=document.createElement("input");date.type="date";date.required=true;date.value=ev.event_date;dateWrap.append(date);controls.append(dateWrap);
 const period=dayPartSelect(ev.session,"Período");
 const timeWrap=document.createElement("label");timeWrap.textContent="Hora do jogo";
 const time=document.createElement("input");time.type="time";time.value=ev.match_time||"";timeWrap.append(time);
 if(ev.kind==="match")controls.append(timeWrap);else controls.append(period.field);
 if(ev.kind==="travel"){
  const label=document.createElement("label");label.textContent="Descrição";
  const text=document.createElement("input");text.value=ev.title;text.maxLength=100;text.required=true;label.append(text);controls.append(label);
 }
 let pre=null,post=null;
 if(ev.kind==="match"||ev.kind==="training"){
  pre=periToggle("pre",ev.kind,ev.pre_override);
  post=periToggle("post",ev.kind,ev.post_override);
  controls.append(pre.field,post.field);
 }
 const save=document.createElement("button");save.type="submit";save.textContent="Guardar";
 const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";remove.className="calendar-remove";
 controls.append(save,remove);
 edit.onclick=()=>{controls.hidden=!controls.hidden;edit.textContent=controls.hidden?"Editar":"Fechar";};
 const feedback=$("calendar-event-feedback");
 controls.onsubmit=async e=>{
  e.preventDefault();save.disabled=true;
  try{
   if(ev.kind==="match"){
    await request(matchBase()+"/matches/"+encodeURIComponent(ev.id),{method:"PUT",body:JSON.stringify({match_date:date.value,match_time:time.value||null})});
    await saveMatchPeri(ev.id,pre.checkbox.checked,post.checkbox.checked);
   }else{
    await request(calendarEventEndpoint()+"/"+encodeURIComponent(ev.id),{method:"PUT",body:JSON.stringify({
      event_date:date.value,session:period.select.value,title:ev.kind==="travel"?controls.querySelector('input[maxlength="100"]').value:ev.title,
      ...(pre?{pre_override:pre.checkbox.checked?"auto":"off",post_override:post.checkbox.checked?"auto":"off"}:{})
    })});
   }
   feedback.textContent="Evento atualizado.";
   const [year,month]=date.value.split("-").map(Number);calendarMonth=new Date(year,month-1,1);
   await loadCalendar();
  }catch(err){feedback.textContent="Erro ao guardar: "+err.message;}finally{save.disabled=false;}
 };
 remove.onclick=async()=>{
  if(!confirm("Remover "+(CALENDAR_EVENT_NAMES[ev.kind]||"evento")+" de "+ev.event_date+"?"))return;
  remove.disabled=true;
  try{
   const url=ev.kind==="match"?matchBase()+"/matches/"+encodeURIComponent(ev.id):calendarEventEndpoint()+"/"+encodeURIComponent(ev.id);
   await request(url,{method:"DELETE"});feedback.textContent="Evento removido.";await loadCalendar();
  }catch(err){feedback.textContent="Erro ao remover: "+err.message;}finally{remove.disabled=false;}
 };
 card.append(controls);return card;
}
async function saveMatchPeri(matchId,pre,post){
 for(const [phase,enabled] of [["pre",pre],["post",post]]){
  await request(matchBase()+"/match-peri/"+encodeURIComponent(matchId)+"/"+phase,{method:"PUT",body:JSON.stringify({state:enabled?"auto":"off"})});
 }
}
function syncCalendarEventForm(){
 const kind=$("calendar-new-kind").value,game=kind==="match",training=kind==="training";
 $("calendar-new-session").closest("div").hidden=game;
 $("calendar-new-time-wrap").hidden=!game;
 $("calendar-new-title-wrap").hidden=kind!=="travel";
 $("calendar-pre-wrap").hidden=!(game||training);
 $("calendar-post-wrap").hidden=!(game||training);
 $("calendar-pre-label").textContent=game?"Intra-jogo":"Pré-treino";
 $("calendar-post-label").textContent=game?"Pós-jogo":"Pós-treino";
}
$("calendar-new-kind").addEventListener("change",syncCalendarEventForm);
$("calendar-new-date").value=isoDay(new Date());
syncCalendarEventForm();
$("calendar-event-form").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!model)return;
 const kind=$("calendar-new-kind").value,date=$("calendar-new-date").value;
 const button=$("calendar-add-event"),feedback=$("calendar-event-feedback");button.disabled=true;
 try{
  if(kind==="match"){
   const response=await request(matchBase()+"/matches",{method:"POST",
     body:JSON.stringify({match_date:date,match_time:$("calendar-new-time").value||null})});
   await saveMatchPeri(response.match.id,$("calendar-new-pre").checked,$("calendar-new-post").checked);
  }else{
   await request(calendarEventEndpoint(),{method:"POST",body:JSON.stringify({
    event_date:date,kind,session:$("calendar-new-session").value,
    title:kind==="training"?"Treino":$("calendar-new-title").value.trim()||"Viagem",
    ...(kind==="training"?{pre_override:$("calendar-new-pre").checked?"auto":"off",
      post_override:$("calendar-new-post").checked?"auto":"off"}:{})
   })});
  }
  feedback.textContent="Evento adicionado ao calendário.";
  const [year,month]=date.split("-").map(Number);calendarMonth=new Date(year,month-1,1);
  await loadCalendar();
 }catch(err){feedback.textContent="Não foi possível adicionar: "+err.message;}
 finally{button.disabled=false;}
});

function periEndpoint(){return "/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/peri-imports";}
function periMessage(value){$("peri-feedback").textContent=value;}
async function loadPeriImports(){
 if(!model)return;
 const result=await request(periEndpoint());
 const live=$("peri-current");live.replaceChildren();
 for(const [kind,label] of [["training","Peri-treino"],["match","Peri-jogo"]]){
  const p=document.createElement("p");const date=result.active?.[kind]?.published_at;
  p.textContent=label+": "+(date?("Publicado em "+new Date(date*1000).toLocaleDateString("pt-PT")):"Sem plano publicado");live.append(p);
 }
 const list=$("peri-list");list.replaceChildren();
 for(const draft of result.imports){
  const row=document.createElement("div");row.className="event-admin-row";
  const label=document.createElement("span");label.textContent=(draft.kind==="training"?"Peri-treino":"Peri-jogo")+" · "+draft.filename+" · "+(draft.status==="draft"?"Em revisão":"Publicado");
  const button=document.createElement("button");button.type="button";button.textContent="Consultar"+(draft.status==="draft"?" / editar":"");
  button.onclick=async()=>{try{const result=await request(periEndpoint()+"/"+encodeURIComponent(draft.id));renderPeriDraft(result.draft);}catch(e){periMessage(e.message);}};
  row.append(label,button);list.append(row);
 }
}
function renderPeriDraft(draft){
 const root=$("peri-review");root.replaceChildren();
 const heading=document.createElement("h3");heading.textContent=draft.filename+" · "+(draft.kind==="training"?"Peri-treino":"Peri-jogo");root.append(heading);
 for(const warning of draft.extracted.warnings||[]){const p=document.createElement("p");p.className="hint";p.textContent=warning;root.append(p);}
 draft.extracted.groups.forEach((group,gi)=>{
  const title=document.createElement("h3");title.textContent=group.heading;root.append(title);
  group.options.forEach((option,oi)=>{
   const card=document.createElement("section");card.className="peri-editor-option";
   const title=document.createElement("strong");title.textContent="Opção "+option.number;card.append(title);
   const form=document.createElement("div");form.className="peri-option-grid";
   const fields={};
   for(const [key,label] of [["kcal","Energia (kcal)"],["protein_g","Proteína (g)"],["carbs_g","Hidratos (g)"],["fat_g","Gordura (g)"]]){
    const wrapper=document.createElement("label");wrapper.textContent=label;const input=document.createElement("input");input.type="text";input.inputMode="decimal";input.value=option.totals?.[key]??"";fields[key]=input;wrapper.append(input);form.append(wrapper);
   }
   card.append(form);
   const dishName=document.createElement("label");dishName.textContent="Título da opção";const titleInput=document.createElement("input");titleInput.value=option.title||"";dishName.append(titleInput);card.append(dishName);
   const foodsLabel=document.createElement("label");foodsLabel.textContent="Alimentos e instruções (uma linha por item)";
   const textarea=document.createElement("textarea");textarea.rows=5;textarea.value=(option.lines||[]).join("\n");foodsLabel.append(textarea);card.append(foodsLabel);
   const review=document.createElement("label");review.className="peri-review-check";const check=document.createElement("input");check.type="checkbox";check.checked=option.reviewed===true;review.append(check,document.createTextNode("Valores e alimentos revistos pela equipa"));card.append(review);
   const save=document.createElement("button");save.type="button";save.textContent="Guardar esta opção";save.disabled=draft.status!=="draft";
   save.onclick=async()=>{
    save.disabled=true;
    const payload={group_index:gi,option_index:oi,option:{
      totals:Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value.trim()])),
      title:titleInput.value.trim(),lines:textarea.value.split(/\r?\n/),reviewed:check.checked
    }};
    try{
      await request(periEndpoint()+"/"+encodeURIComponent(draft.id)+"/option",{method:"PUT",body:JSON.stringify(payload)});
      periMessage("Opção guardada. Revê todas as opções antes da publicação.");
    }catch(e){periMessage(e.message);}finally{save.disabled=draft.status!=="draft";}
   };card.append(save);root.append(card);
  });
 });
 if(draft.status==="draft"){
  const pub=document.createElement("button");pub.type="button";pub.textContent="Publicar plano peri";
  pub.onclick=async()=>{
    if(!confirm("Confirmas a publicação? As refeições serão aplicadas aos eventos futuros, respeitando as remoções manuais."))return;
    pub.disabled=true;try{
      await request(periEndpoint()+"/"+encodeURIComponent(draft.id)+"/publish",{method:"POST",body:JSON.stringify({confirmation:"PUBLICAR",athlete_id:$("athlete").value})});
      periMessage("Plano publicado. As refeições passam a ser consideradas nos eventos futuros.");
      await loadPeriImports();const refreshed=await request(periEndpoint()+"/"+encodeURIComponent(draft.id));renderPeriDraft(refreshed.draft);
    }catch(e){periMessage("Publicação bloqueada: "+e.message);}finally{pub.disabled=false;}
  };root.append(pub);
 }
}
$("peri-import").addEventListener("click",async()=>{
 if(!model)return;
 const file=$("peri-pdf").files?.[0];
 if(!file||file.size>3*1024*1024||!file.name.toLowerCase().endsWith(".pdf")){periMessage("Seleciona um PDF até 3 MB.");return;}
 const button=$("peri-import");button.disabled=true;periMessage("A interpretar o PDF...");
 try{
  const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const result=await request(periEndpoint(),{method:"POST",body:JSON.stringify({kind:$("peri-kind").value,filename:file.name,pdf_base64:btoa(binary)})});
  periMessage("Rascunho importado. Confirma os alimentos e os valores nutricionais antes de publicar.");
  await loadPeriImports();renderPeriDraft(result.draft);
 }catch(e){periMessage("Erro ao importar: "+e.message);}finally{button.disabled=false;}
});
