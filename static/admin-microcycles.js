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
async function loadModel(){if(!$("athlete").value)return;selectedCalendarDay=null;model=await request("/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/microcycles");profileEditing=false;render();renderProfileSummary();await loadPlanDrafts();await loadCalendar();showBackofficeView(backofficeView);}
function render(){const root=$("matrix");root.replaceChildren();const tbl=document.createElement("table");const header=document.createElement("tr");for(const label of ["Classificação","Pequeno-almoço","Almoço","Lanche","Jantar","Ceia"]){const th=document.createElement("th");th.textContent=label;header.appendChild(th);}tbl.appendChild(header);for(const row of model.classifications){const tr=document.createElement("tr"),title=document.createElement("td");title.textContent=(row.configured?"● ":"○ ")+row.name;tr.appendChild(title);for(const meal of model.meals){const td=document.createElement("td"),sel=document.createElement("select");sel.setAttribute("aria-label",row.name+" "+names[meal]);for(const [value,label] of [["","— Sem refeição"],...model.colors.map(c=>[c,colors[c]||c])]){const o=document.createElement("option");o.value=value;o.textContent=label;sel.appendChild(o);}sel.value=row.meals[meal]||"";sel.addEventListener("change",async()=>{const prior=row.meals[meal];const next=sel.value||null;sel.disabled=true;status("A guardar "+row.name+" · "+names[meal]+"…");try{await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/microcycles/"+encodeURIComponent(row.name),{method:"PUT",body:JSON.stringify({meal,color:next})});row.meals[meal]=next;row.configured=true;title.textContent="● "+row.name;await loadCalendar();status("Guardado: "+row.name+" · "+names[meal]+".","success");}catch(e){sel.value=prior||"";status("Não foi possível guardar: "+e.message,"warn");}finally{sel.disabled=false;}});td.appendChild(sel);tr.appendChild(td);}tbl.appendChild(tr);}root.appendChild(tbl);root.hidden=false;}
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

function showBackofficeView(view){
  backofficeView=view;
  const sections={profile:["athlete-weight-panel"],calendar:["calendar-section","nutrition-dashboard"],plans:["plan-import-panel"],matrix:["matrix"],menus:["menus-panel"]};
  for(const [key,ids] of Object.entries(sections))for(const id of ids){
    const el=$(id);if(el)el.hidden=key!==view||!model;
  }
  for(const button of document.querySelectorAll("#backoffice-nav [data-view]")){
    button.setAttribute("aria-pressed",button.dataset.view===view?"true":"false");
  }
  $("admin-access-panel").hidden=view!=="profile";
  if(view==="calendar")refreshBackofficeDashboard();
  if(view==="menus"&&model)loadMenus().catch(e=>status(e.message,"warn"));
}
function refreshBackofficeDashboard(){
  const panel=$("nutrition-dashboard");
  if(!model)return;
  const holder=$("dashboard-day");holder.replaceChildren();
  const day=window.currentNutritionDay;
  if(!day){holder.textContent="Seleciona um dia no calendário para consultar o resumo.";return;}
  const title=document.createElement("h3");title.textContent="Resumo de "+day.date+" · "+(day.classification||"Sem classificação");holder.appendChild(title);
  renderNutritionTotals(holder,"Valores nutricionais planeados",plannedDayTotals(day));
}
for(const button of document.querySelectorAll("#backoffice-nav [data-view]")){
  button.addEventListener("click",()=>showBackofficeView(button.dataset.view));
}
$("athlete").addEventListener("change",()=>loadModel().catch(e=>status(e.message,"warn")));
$("create").addEventListener("click",async()=>{const name=$("new-name").value.trim();if(!name)return status("Escreve o nome do jogador.","warn");$("create").disabled=true;try{const r=await request("/api/v2/athletes",{method:"POST",body:JSON.stringify({name})});$("new-name").value="";await loadAthletes(r.athlete.id);status("Jogador de teste criado.","success");}catch(e){status(e.message,"warn");}finally{$("create").disabled=false;}});
start();

function isoDay(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function matchBase(){return "/api/v2/athletes/"+encodeURIComponent(model.athlete.id);}

// Read-only daily meal color preview based on the selected athlete's matrix.
function mealColorsForDay(day){
  const row=model&&model.classifications.find(r=>r.name===day.classification);
  return model.meals.map(meal=>({meal,color:row&&row.meals[meal]||null}));
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
function plannedDayTotals(day){
  if(!day.classification||day.needs_review)return {state:"unclassified",count:0,missing:[],total:null};
  const totals={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
  const missing=[];let count=0;
  for(const entry of mealColorsForDay(day)){
    if(!entry.color)continue;
    const average=averageMealNutrition(mealOptionsByColor[entry.color]?.[entry.meal]||[]);
    if(!average){missing.push(names[entry.meal]+" ("+(colors[entry.color]||entry.color)+")");continue;}
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
  if(backofficeView==="calendar")refreshBackofficeDashboard();
  const heading=document.createElement("h3");
  heading.textContent="Refeições · "+day.date+" · "+(day.classification||"Sem classificação");
  host.appendChild(heading);
  const grid=document.createElement("div");grid.className="day-meals";
  const detail=document.createElement("section");detail.className="meal-options-detail";
  for(const entry of mealColorsForDay(day)){
    const cell=document.createElement("div");cell.className="day-meal";
    const label=document.createElement("span");label.textContent=names[entry.meal];
    const value=document.createElement("strong");
    value.textContent=entry.color?(colors[entry.color]||entry.color):"— Sem cor atribuída";
    if(entry.color)value.className="meal-"+entry.color;
    cell.append(label,value);
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
  renderNutritionTotals(host,"Resumo nutricional do dia",plannedDayTotals(day));
  host.appendChild(detail);
  const hint=document.createElement("p");hint.textContent="Pré-visualização administrativa. Os planos ainda não estão publicados aos jogadores.";host.appendChild(hint);
}

async function loadCalendar(){
  if(!model)return;
  const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
  const last=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0);
  const data=await request(matchBase()+"/calendar?start="+isoDay(first)+"&end="+isoDay(last));
  const menuData=await request(matchBase()+"/menus?start="+isoDay(first)+"&end="+isoDay(last));
  menuLookup=Object.fromEntries(menuData.menus.map(m=>[m.menu_date+"|"+m.meal,m]));
  const fullStart=new Date(first);fullStart.setDate(first.getDate()-(first.getDay()+6)%7);
  const fullEnd=new Date(last);fullEnd.setDate(last.getDate()+(7-last.getDay())%7);
  const weeklyData=await request(matchBase()+"/calendar?start="+isoDay(fullStart)+"&end="+isoDay(fullEnd));
  let weekly=$("nutrition-weekly-summary");
  if(!weekly){weekly=document.createElement("section");weekly.id="nutrition-weekly-summary";weekly.className="import-validation-progress";$("calendar-matches").insertAdjacentElement("afterend",weekly);}
  weekly.replaceChildren();
  const weekHeading=document.createElement("h3");weekHeading.textContent="Resumo nutricional semanal · Semanas de segunda a domingo";weekly.appendChild(weekHeading);
  const weeks=new Map();
  for(const day of weeklyData.days){
    const dt=new Date(day.date+"T12:00:00Z");
    const weekday=(dt.getUTCDay()+6)%7;
    dt.setUTCDate(dt.getUTCDate()-weekday);
    const monday=dt.toISOString().slice(0,10);
    if(!weeks.has(monday))weeks.set(monday,[]);
    weeks.get(monday).push(day);
  }
  for(const [monday,weekDays] of weeks){
    const eligible=weekDays.filter(d=>d.classification&&!d.needs_review);
    if(!eligible.length)continue;
    const daily=eligible.map(plannedDayTotals);
    const subtotal={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
    let covered=0;
    for(const result of daily){if(result.total){covered++;for(const key of Object.keys(subtotal))subtotal[key]+=result.total[key];}}
    const complete=weekDays.length===7&&daily.length===7&&daily.every(r=>r.state==="complete");
    const row=document.createElement("p");
    row.textContent="Semana de "+monday+" · "+(complete?"Média diária planeada":"Média diária parcial · faltam dados")+" · "+covered+"/7 dias com valores";
    weekly.appendChild(row);
    if(complete){const average=Object.fromEntries(Object.entries(subtotal).map(([key,value])=>[key,value/7]));nutritionCards(weekly,average);}
    else {const warning=document.createElement("p");warning.textContent="Média semanal indisponível até existirem dados completos dos sete dias.";weekly.appendChild(warning);}
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
      selectedCalendarDay=day.date;
      for(const item of days.querySelectorAll(".calendar-day"))item.classList.remove("calendar-selected");
      el.classList.add("calendar-selected");
      renderDayPreview(day,preview);
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
  const focused=data.days.find(d=>d.date===selectedCalendarDay)||data.days.find(d=>d.classification)||data.days[0];
  if(focused){selectedCalendarDay=focused.date;renderDayPreview(focused,preview);
    for(const el of days.querySelectorAll(".calendar-day")){
      if(el.getAttribute("aria-label")==="Ver cores das refeições de "+focused.date)el.classList.add("calendar-selected");
    }
  }
  const list=$("calendar-matches");list.replaceChildren();
  for(const match of data.matches){
    const item=document.createElement("div");item.className="calendar-match-item";
    const date=document.createElement("span");date.textContent="Jogo · "+match.match_date+(match.match_time?" · "+match.match_time:"");item.appendChild(date);
    const edit=document.createElement("button");edit.type="button";edit.textContent="✎ Editar";edit.setAttribute("aria-label","Editar jogo de "+match.match_date);
    edit.addEventListener("click",()=>{
      const controls=document.createElement("div");controls.className="calendar-match-edit";
      const day=document.createElement("input");day.type="date";day.value=match.match_date;
      const hour=document.createElement("input");hour.type="time";hour.value=match.match_time||"";
      const save=document.createElement("button");save.type="button";save.textContent="Guardar jogo";
      const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancelar";
      save.addEventListener("click",async()=>{save.disabled=true;try{await request(matchBase()+"/matches/"+encodeURIComponent(match.id),{method:"PUT",body:JSON.stringify({match_date:day.value,match_time:hour.value||null})});const parts=day.value.split("-").map(Number);calendarMonth=new Date(parts[0],parts[1]-1,1);await loadCalendar();status("Jogo atualizado.","success");}catch(e){status("Erro ao editar jogo: "+e.message,"warn");save.disabled=false;}});
      cancel.addEventListener("click",()=>controls.remove());controls.append(day,hour,save,cancel);item.appendChild(controls);
    });item.appendChild(edit);
    const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";remove.setAttribute("aria-label","Remover jogo de "+match.match_date);
    remove.addEventListener("click",async()=>{
      if(!confirm("Remover o jogo de "+match.match_date+"?"))return;
      remove.disabled=true;
      try{await request(matchBase()+"/matches/"+encodeURIComponent(match.id),{method:"DELETE"});await loadCalendar();status("Jogo removido.","success");}
      catch(e){status("Erro ao remover jogo: "+e.message,"warn");remove.disabled=false;}
    });
    item.appendChild(remove);list.appendChild(item);
  }
  $("calendar-section").hidden=false;
}
$("add-match").addEventListener("click",async()=>{
  if(!model)return;
  const day=$("match-date").value;
  if(!day)return status("Seleciona a data do jogo.","warn");
  const btn=$("add-match");btn.disabled=true;
  try{await request(matchBase()+"/matches",{method:"POST",body:JSON.stringify({match_date:day,match_time:$("match-time").value||null})});
    const parts=day.split("-").map(Number);calendarMonth=new Date(parts[0],parts[1]-1,1);
    $("match-date").value="";$("match-time").value="";await loadCalendar();status("Jogo guardado e calendário atualizado.","success");
  }catch(e){status("Não foi possível guardar o jogo: "+e.message,"warn");}finally{btn.disabled=false;}
});
$("calendar-prev").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);loadCalendar().catch(e=>status(e.message,"warn"));});
$("calendar-next").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);loadCalendar().catch(e=>status(e.message,"warn"));});

async function loadPlanDrafts(){
  if(!model)return;
  $("plan-import-panel").hidden=false;
  const data=await request(matchBase()+"/plan-imports");
  const readiness=await request(matchBase()+"/plan-imports/publication-status");
  validatedPlansByColor=Object.fromEntries(readiness.colors.map(entry=>[entry.color,entry.validated_count>0]));
  const mealData=await request(matchBase()+"/plan-imports/meal-options");
  mealOptionsByColor=mealData.options_by_color;
  const panel=$("publication-readiness");panel.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="Preparação para publicação · Ainda não disponível aos jogadores";panel.appendChild(heading);
  for(const entry of readiness.colors){
    const line=document.createElement("p");
    const latest=entry.plans.find(p=>p.status==="validated");
    line.textContent=(colors[entry.color]||entry.color)+": "+(entry.publication?"Publicado":latest?"Plano validado · pronto para futura publicação":"Sem plano validado")+" · "+entry.plans.length+" importação(ões)";
    panel.appendChild(line);
  }
  const list=$("import-list");list.replaceChildren();
  if(!data.drafts.length){list.textContent="Ainda não existem rascunhos deste jogador.";return;}
  for(const d of data.drafts){
    const btn=document.createElement("button");btn.type="button";
    btn.textContent=(colors[d.color]||d.color)+" · "+d.filename+" · "+(d.status==="validated"?"Validado":"Rascunho");
    btn.addEventListener("click",async()=>{
      try{const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(d.id));showImportedDraft(result.draft);}
      catch(e){$("import-feedback").textContent=e.message;}
    });
    list.appendChild(btn);
  }
}
function showImportedDraft(draft){
  const root=$("import-review");root.replaceChildren();
  const h=document.createElement("h3");h.textContent="Revisão · "+draft.filename+" · "+(colors[draft.color]||draft.color);root.appendChild(h);
  const totalCount=draft.extracted.groups.reduce((sum,group)=>sum+group.options.length,0);
  const overview=document.createElement("section");overview.className="import-validation-progress";
  const state=document.createElement("strong");
  state.textContent=draft.status==="validated"?"Plano validado":"Plano em revisão";
  overview.appendChild(state);
  const approval=document.createElement("button");approval.type="button";
  const approved=draft.status==="validated";
  approval.textContent=approved?"Reabrir para edição":"Validar plano completo";
  approval.disabled=!approved&&totalCount===0;
  approval.addEventListener("click",async()=>{
    approval.disabled=true;
    try{
      const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/review-status",{
        method:"POST",body:JSON.stringify({action:approved?"reopen":"approve"})
      });
      draft.status=result.status;
      showImportedDraft(draft);
      await loadPlanDrafts();
      await loadCalendar();
    }catch(e){approval.disabled=false;const p=document.createElement("p");p.textContent="Erro na validação: "+e.message;overview.appendChild(p);}
  });
  overview.appendChild(approval);
  const note=document.createElement("p");
  note.textContent=approved?"Plano aprovado internamente. Não foi publicado a nenhum jogador. Reabre para editar.":"Confirma a revisão do plano completo numa única ação. Não publica o plano.";
  overview.appendChild(note);
  root.appendChild(overview);
  for(const warning of draft.extracted.warnings){const p=document.createElement("p");p.textContent="Atenção: "+warning;root.appendChild(p);}
  draft.extracted.groups.forEach((group,groupIndex)=>{
    const groupTitle=document.createElement("h3");groupTitle.textContent=group.heading+" → "+group.meals.map(m=>names[m]).join(" / ");root.appendChild(groupTitle);
    group.options.forEach((option,optionIndex)=>{
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.textContent="Opção "+option.number+" · "+(option.totals?option.totals.kcal+" kcal":"Totais por confirmar");details.appendChild(summary);
      if(option.totals){const p=document.createElement("p");p.textContent="Proteína "+option.totals.protein_g+" g · HC "+option.totals.carbs_g+" g · Gordura "+option.totals.fat_g+" g";details.appendChild(p);}
      if(option.title){const heading=document.createElement("div");heading.className="import-structured-line";heading.textContent="Descrição: "+option.title;details.appendChild(heading);}
      for(const item of option.items||[]){
        if(item.kind==="title")continue;
        const line=document.createElement("div");line.className="import-structured-line";
        const name=document.createElement("span");
        name.textContent=item.kind==="food"?item.quantity+" · "+item.name:item.text;
        if(item.kind==="instruction"||item.kind==="note")name.textContent="Nota: "+item.text;
        line.appendChild(name);
        if(item.nutrients){
          const nutrient=document.createElement("span");nutrient.className="import-nutrients";
          nutrient.textContent=item.nutrients.kcal+" kcal · P "+item.nutrients.protein_g+" g · HC "+item.nutrients.carbs_g+" g · G "+item.nutrients.fat_g+" g";
          line.appendChild(nutrient);
        }
        if(item.needs_review){const note=document.createElement("small");note.textContent="Verificar";line.appendChild(note);}
        details.appendChild(line);
      }
      const actions=document.createElement("div");actions.className="import-option-actions";
      const edit=document.createElement("button");edit.type="button";edit.textContent="Editar opção";edit.disabled=approved;
      edit.addEventListener("click",()=>showOptionEditor(draft,groupIndex,optionIndex,details));
      actions.append(edit);details.appendChild(actions);root.appendChild(details);
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
  const save=document.createElement("button");save.type="button";save.textContent="Guardar correções";form.appendChild(save);
  const feedback=document.createElement("p");form.appendChild(feedback);
  save.addEventListener("click",async()=>{
    save.disabled=true;
    const entries=edits.map(edit=>{
      const kind=edit.type.value;
      const nutrients=Object.fromEntries(Object.entries(edit.nutrients).map(([key,input])=>[key,input.value.trim()]));
      return {kind,text:edit.name.value.trim(),name:kind==="food"?edit.name.value.trim():"",quantity:kind==="food"?edit.quantity.value.trim():"",nutrients:kind==="food"&&Object.values(nutrients).some(Boolean)?nutrients:null};
    });
    const totalValues=Object.fromEntries(Object.entries(totals).map(([key,input])=>[key,input.value.trim()]));
    try{
      const response=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id),{method:"PUT",
        body:JSON.stringify({group_index:groupIndex,option_index:optionIndex,option:{title:title.value.trim(),totals:Object.values(totalValues).some(Boolean)?totalValues:null,items:entries,reviewed:Boolean(option.reviewed)}})});
      option.items=response.option.items;option.title=response.option.title;option.totals=response.option.totals;option.reviewed=response.option.reviewed;
      feedback.textContent="Correções guardadas no rascunho, sem publicação.";
      showImportedDraft(draft);
    }catch(e){feedback.textContent="Erro: "+e.message;}finally{save.disabled=false;}
  });
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
