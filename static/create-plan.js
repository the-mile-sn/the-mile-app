"use strict";(()=>{
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),fmt=v=>Number(v||0).toLocaleString("pt-PT",{maximumFractionDigits:1}),fmtKcal=v=>Number(v||0).toLocaleString("pt-PT",{maximumFractionDigits:0});
let alternativeParent=null,draftIndex=[],selectedSearchPlayer="",players=[],editingFood=-1,foods=[],plan={id:"",name:"Novo plano alimentar",player_id:"",athlete_id:"",player_name:"",plan_type:"",meals:[]},active=-1,option=0;
const ensureOrder=o=>{if(!Array.isArray(o.order)||o.order.length!==o.foods.length+(o.notes||[]).length)o.order=[...(o.notes||[]).map((_,index)=>({type:"note",index})),...o.foods.map((_,index)=>({type:"food",index}))];return o.order};
const displayOrder=o=>{const order=ensureOrder(o),alts=new Map(),result=[],seen=new Set();for(const item of order){if(item.type==="food"){const parent=o.foods[item.index]?.alternative_to;if(parent!=null&&parent!==item.index){const a=alts.get(parent)||[];a.push(item);alts.set(parent,a)}}}for(const item of order){if(item.type==="food"&&o.foods[item.index]?.alternative_to!=null)continue;result.push(item);if(item.type==="food"){for(const alt of alts.get(item.index)||[]) {result.push(alt);seen.add(alt.index)}}}for(const item of order)if(item.type==="food"&&o.foods[item.index]?.alternative_to!=null&&!seen.has(item.index))result.push(item);return result};
const nutrients=["kcal","protein_g","carbs_g","fat_g"];
const foodNutrients=f=>nutrients.map(k=>{if(f.kind==="supplement"||f.grams==null)return 0;const ref=foods.find(x=>x.id===f.id);return ref?Number(ref[k]||0)*Number(f.grams)/100*(ref.variant==="gross"?Number(ref.edible_fraction):1):0});
const pendingAlternatives=items=>items.some(f=>f.alternative_to!=null&&f.grams==null);
const sum=items=>{const totals=[0,0,0,0];items.forEach((f,i)=>{if(f.alternative_to!=null)return;const group=[f,...items.filter(a=>a.alternative_to===i)];const complete=group.filter(a=>a.grams!=null);const chosen=complete.length?complete:[f];const values=chosen.map(foodNutrients);nutrients.forEach((_,k)=>totals[k]+=values.reduce((v,a)=>v+a[k],0)/values.length)});return totals};
const average=meal=>nutrients.map((_,i)=>meal.options.reduce((s,o)=>s+sum(o.foods)[i],0)/meal.options.length);
const normalizeMealName=n=>String(n||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]/g," ").trim();
const isPostTraining=m=>/^pos\s+treino$/.test(normalizeMealName(m.name));
const isColorPlan=t=>/^Plano (?:laranja|amarelo|azul|verde(?: prepara[cç][aã]o)?)$/i.test(String(t||""));
const mealSlots=m=>{if(Array.isArray(m.applies_to)&&m.applies_to.length)return m.applies_to;const name=normalizeMealName(m.name);if(/\bintermedia\b/.test(name)||(name.includes("pequeno almoco")&&name.includes("lanche")))return ["Pequeno almoço","Lanche"];if(/\bprincipal\b/.test(name)||(name.includes("almoco")&&name.includes("jantar")))return ["Almoço","Jantar"];return [m.name]};
const dailyMeals=()=>plan.meals.filter(m=>!(isColorPlan(plan.plan_type)&&isPostTraining(m)));
const totals=()=>nutrients.map((_,i)=>dailyMeals().reduce((value,m)=>value+average(m)[i]*mealSlots(m).length,0));
const mealDisplayName=m=>{const slots=mealSlots(m);return slots.length>1?(slots[0]==="Pequeno almoço"?"Pequeno almoço / lanche":"Almoço / jantar"):m.name};
const label=t=>t.map((n,i)=>fmt(n)+(i===0?" kcal":i===1?" g P":i===2?" g HC":" g G")).join(" · ");
const status=s=>$("status").textContent=s;
let savedSignature=null,publicationState={state:"draft",pending_changes:false,published_at:null},saveBusy=false,publishBusy=false,lastSavedAt=null,persistenceError="";
const planSignature=()=>JSON.stringify({athlete_id:plan.athlete_id||"",player_id:plan.player_id||"",plan_type:plan.plan_type||"",meals:plan.meals});
const planIsDirty=()=>!plan.id||savedSignature!==planSignature();
const savedStamp=stamp=>stamp?new Date(Number(stamp)*1000).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
function renderPersistence(){
 const panel=$("plan-save-feedback");if(!panel)return;
 const title=$("plan-save-feedback-title"),desc=$("plan-save-feedback-description"),icon=$("plan-save-feedback-icon"),time=$("plan-save-feedback-time");
 const chip=$("plan-state-chip"),save=$("save-plan"),publish=$("assign-player");
 const dirty=planIsDirty(),state=publicationState?.state||"draft";
 let display="new",caption="Por guardar",message="Novo plano por guardar",detail="Guarda o plano para o poderes publicar no Planeamento.",symbol="○";
 if(!plan.id){display="new";}
 else if(dirty){display="dirty";caption="Alterações por guardar";message="Alterações por guardar";detail="Guarda primeiro o rascunho. O Planeamento mantém a última versão aprovada.";symbol="!";}
 else if(state==="published"&&!publicationState.pending_changes){display="published";caption="Publicado no Planeamento";message="Plano publicado no Planeamento";detail="Versão aprovada e em utilização no Backoffice. A app dos jogadores não foi alterada.";symbol="✓";}
 else if(state==="transitional"&&!publicationState.pending_changes){display="transitional";caption="Em uso no Planeamento";message="Guardado e já ligado ao Planeamento";detail="Plano existente preservado. Clica em Publicar para confirmar esta versão.";symbol="✓";}
 else if(publicationState.pending_changes){display="pending";caption="Alterações por publicar";message="Rascunho guardado · alterações por publicar";detail="O Planeamento continua a utilizar a última versão aprovada.";symbol="✓";}
 else {display="saved";caption="Rascunho guardado";message="Rascunho guardado com sucesso";detail="Ainda não aparece no Planeamento. Publica quando estiver validado.";symbol="✓";}
 if(saveBusy){display="saving";caption="A guardar…";message="A guardar alterações…";detail="A confirmar o registo na base de dados.";symbol="…";}
 if(publishBusy){display="saving";caption="A publicar…";message="A publicar no Planeamento…";detail="A confirmar a versão aprovada.";symbol="…";}
 if(persistenceError){display="error";caption="Ação não concluída";message="Não foi possível concluir a ação";detail=persistenceError;symbol="!";}
 panel.dataset.state=display;chip.dataset.state=display;chip.textContent=caption;
 title.textContent=message;desc.textContent=detail;icon.textContent=symbol;
 time.textContent=!dirty&&plan.id&&lastSavedAt?"Guardado em "+savedStamp(lastSavedAt):"";
 save.classList.toggle("is-confirmed",["saved","pending","published","transitional"].includes(display));
 publish.classList.toggle("is-confirmed",display==="published");
 save.textContent=saveBusy?"A guardar…":!plan.id?"Guardar rascunho":dirty?"Guardar alterações":"✓ Guardado";
 publish.textContent=display==="published"?"✓ Publicado":display==="pending"?"Publicar alterações":"Publicar no Planeamento";
 save.disabled=saveBusy||publishBusy||(!dirty&&!persistenceError);
 publish.disabled=saveBusy||publishBusy||dirty||display==="published";
}
const refreshSelectDisplays=()=>document.querySelectorAll(".tm-two-line-select>select").forEach(el=>el.dispatchEvent(new Event("tm-refresh-select")));

const macro=(values,rounded=false)=>'<div class="macro-values">'+values.map((v,i)=>'<span class="macro m'+i+'"><b>'+fmt(v)+'</b><small>'+["kcal","P (g)","HC (g)","G (g)"][i]+'</small></span>').join("")+'</div>';
function draw(){
  $("plan-player").value=players.find(p=>p.athlete_id===plan.athlete_id)?.id||plan.player_id||"";
  $("plan-type").value=plan.plan_type||"";
  refreshSelectDisplays();
  ["plan-player","plan-type","draft-list"].forEach(id=>$(id).classList.toggle("has-selection",!!$(id).value));
  $("delete-plan").disabled=!plan.id;
  if($("move-post-training"))$("move-post-training").hidden=!(plan.id&&isColorPlan(plan.plan_type)&&plan.meals.some(isPostTraining));
  const t=totals();["total-kcal","total-p","total-hc","total-g"].forEach((id,i)=>$(id).textContent=i===0?fmtKcal(t[i]):fmt(t[i]));
  $("meals").innerHTML=plan.meals.map((m,mi)=>{
    const open=mi===active,o=m.options[option]||m.options[0];
    const rows=(o?.foods||[]).map((f,fi)=>{const ref=foods.find(x=>x.id===f.id);return '<div class="nutrition-row food-row'+(f.alternative_to!=null?' alt-row':'')+'" data-row-type="food" data-row-index="'+fi+'"><span class="drag-handle" draggable="true" aria-label="Arrastar alimento para reordenar" title="Arrastar para reordenar">⠿</span><div class="food-identity"><strong>'+(f.alternative_to!=null?'<span class="alternative-or">ou</span> ':'')+(f.grams==null?'<span style="color:#f5b85d;font-weight:800">⚠ Quantidade por definir</span> · ':fmt(f.grams)+'g ') +esc(f.kind==='supplement'?f.label:(ref?.display_name||'Alimento indisponível'))+'</strong>'+(editingFood===fi?'<span class="edit-quantity"><label>Gramas <input type="number" min="0.1" max="100000" step="any" value="'+(f.grams??"")+'" data-edit-grams="'+fi+'" aria-label="Nova quantidade em gramas"></label><label>Quantidade apresentada <input type="text" maxlength="100" value="'+esc(f.display_quantity||"")+'" data-display-quantity="'+fi+'" placeholder="Ex.: 1 Ovo"></label><label>Nome apresentado <input type="text" maxlength="160" value="'+esc(f.display_name||"")+'" data-display-name="'+fi+'" placeholder="Opcional"></label><button type="button" data-suggest-display="'+fi+'">Sugerir</button><button data-save-grams="'+fi+'" aria-label="Guardar alimento">Guardar</button><button data-cancel-grams aria-label="Cancelar edição">Cancelar</button></span>':'')+'</div><span class="food-reference-note">'+esc(ref?.notes||"")+'</span>'+macro(foodNutrients(f))+'<div class="food-actions"><button type="button" data-add-alternative="'+fi+'" class="edit-row" aria-label="Adicionar alternativa" title="Adicionar alternativa" style="width:32px;min-width:32px;padding:4px;display:inline-flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h12l-3-3m3 3-3 3M19 16H7l3-3m-3 3 3 3"/></svg></button><button class="edit-row" data-edit-food="'+fi+'" aria-label="Editar quantidade" title="Editar quantidade"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-hugeicons="PencilEdit01Icon"><path d="M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 5.41226 15.7842 5.05637 16.4211C4.70047 17.058 4.3424 18.5619 4 20C5.43809 19.6576 6.94199 19.2995 7.57889 18.9436C8.21579 18.5877 8.73844 18.0651 9.78375 17.0198L18.0176 8.78591M15.2141 5.98239L18.0176 8.78591"/><path d="M11 20H17"/></svg></button><button class="remove-row" data-remove="'+fi+'" aria-label="Remover alimento" title="Remover alimento">×</button></div></div>'});
    const notes=(o?.notes||[]).map((n,ni)=>'<div class="nutrition-row note-row" data-row-type="note" data-row-index="'+ni+'"><span class="drag-handle" draggable="true" aria-label="Arrastar nota para reordenar" title="Arrastar para reordenar">⠿</span><textarea data-note="'+ni+'" rows="1" maxlength="4000" placeholder="Escreve uma indicação livre…">'+esc(n)+'</textarea><button class="remove-row" data-remove-note="'+ni+'" aria-label="Remover nota">×</button></div>');
    return '<section class="meal"><div class="meal-header"><div class="meal-name"><strong>'+esc(mealDisplayName(m))+'</strong>'+(isColorPlan(plan.plan_type)&&isPostTraining(m)?'<small style="color:#f5b85d">Peri-treino · não somado ao plano de cores</small>':'')+'<button type="button" class="meal-delete-icon" data-delete-meal="'+mi+'" aria-label="Apagar refeição" title="Apagar refeição"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-hugeicons="TrashIcon"><path d="M18.8516 16.3743L19.5 6H4.5L5.14839 16.3743C5.315 19.0401 5.39831 20.373 6.26426 21.1865C7.13021 22 8.46571 22 11.1367 22H12.8633C15.5343 22 16.8698 22 17.7357 21.1865C18.6017 20.373 18.685 19.0401 18.8516 16.3743Z"/><path d="M15.5 6H21M15.5 6L15.3721 4.97683C15.1595 3.2762 13.7139 2 12 2C10.2861 2 8.84047 3.2762 8.6279 4.97683L8.5 6M15.5 6H8.5M3 6H8.5"/><path d="M9.5 11V17M14.5 11V17"/></svg></button><span class="meal-rename-wrap"><button type="button" class="meal-rename-button" data-open-meal-rename="'+mi+'" aria-label="Alterar nome da refeição" title="Alterar nome da refeição" aria-expanded="false"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 4.41226 15.7842 4.05637 16.4211C3.70047 17.058 3.3424 18.5619 3 20C4.43809 19.6576 5.94199 19.2995 6.57889 18.9436C7.21579 18.5877 7.73844 18.0651 8.78375 17.0198L18.0176 8.78591"/></svg></button><div class="meal-rename-menu" data-meal-rename-menu="'+mi+'" hidden>'+[...new Set([m.name,...mealNames])].map(name=>'<button type="button" data-select-meal-name="'+mi+'" data-meal-name="'+esc(name)+'">'+esc(name==='Intermédia'?'Pequeno almoço / lanche':name==='Principal'?'Almoço / jantar':name)+'</button>').join("")+'</div></span></div><div class="meal-header-macros">'+macro(average(m),true)+'</div><button data-toggle="'+mi+'" class="meal-toggle" aria-label="'+(open?"Fechar refeição":"Editar refeição")+'">'+(open?"⌃":"⌄")+'</button></div>'+
    (open?'<div class="option-toolbar"><div class="option-tabs">'+m.options.map((opt,oi)=>'<button class="'+(oi===option?"current":"")+'" data-option="'+oi+'"><span>Opção '+(oi+1)+'</span>'+macro(sum(opt.foods),true)+'</button>').join("")+'</div></div>'+
    '<div class="option-content">'+(pendingAlternatives(o.foods)?'<p style="color:#f5b85d;font-weight:650">⚠ Média provisória: existem alternativas sem quantidade definida.</p>':'')+'<div class="option-summary"><div class="option-heading"><strong>Opção '+(option+1)+'</strong><input class="option-title" data-option-title maxlength="160" placeholder="Título da opção · Ex.: Ovos com pão" value="'+esc(o.title||'')+'"></div>'+macro(sum(o.foods),true)+'</div>'+
    '<div class="nutrition-list">'+displayOrder(o).map(item=>item.type==='note'?notes[item.index]:rows[item.index]).join('')+'</div></div>'+
    '<div class="food-add"><div class="food-search"><input id="food-search-input" type="search" autocomplete="off" placeholder="Pesquisar alimento" aria-label="Pesquisar alimento da biblioteca"><div id="food-results" class="food-results" role="listbox" hidden></div><div id="selected-food-note" class="selected-food-note" hidden></div></div><input id="food-grams" type="number" min="0.1" max="100000" step="any" value="100" aria-label="Quantidade em gramas"><span class="unit">g</span><button id="add-food">+ Adicionar alimento</button></div>'+
    '<div class="meal-controls"><button id="add-option">+ Adicionar opção</button><button id="add-note">+ Adicionar nota</button><button id="add-meal-inline">+ Adicionar refeição</button><button id="delete-option" class="delete-inline" type="button">Apagar opção</button>'+'</div>'+
    '':'')+'</section>';
  }).join("");
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.toggle);active=active===i?-1:i;option=0;editingFood=-1;draw()});
  document.querySelectorAll("[data-open-meal-rename]").forEach(btn=>btn.onclick=e=>{e.stopPropagation();const panel=document.querySelector('[data-meal-rename-menu="'+btn.dataset.openMealRename+'"]');document.querySelectorAll(".meal-rename-menu").forEach(other=>{if(other!==panel)other.hidden=true});panel.hidden=!panel.hidden;btn.setAttribute("aria-expanded",String(!panel.hidden));});
  document.querySelectorAll("[data-select-meal-name]").forEach(btn=>btn.onclick=()=>{const meal=plan.meals[Number(btn.dataset.selectMealName)];meal.name=btn.dataset.mealName;delete meal.applies_to;draw()});

    document.querySelectorAll("[data-option]").forEach(b=>b.onclick=()=>{option=Number(b.dataset.option);editingFood=-1;draw()});
  document.querySelectorAll("[data-add-alternative]").forEach(b=>b.onclick=()=>{alternativeParent=Number(b.dataset.addAlternative);const input=$("food-search-input");input?.scrollIntoView({behavior:"smooth",block:"center"});input?.focus();status("Pesquisa o alimento alternativo, indica a quantidade e clica em Adicionar alimento. A alternativa ficará ligada ao alimento selecionado.")});
  document.querySelectorAll("[data-edit-food]").forEach(b=>b.onclick=()=>{editingFood=Number(b.dataset.editFood);draw();document.querySelector("[data-edit-grams]")?.focus()});
  document.querySelectorAll("[data-cancel-grams]").forEach(b=>b.onclick=()=>{editingFood=-1;draw()});
  document.querySelectorAll("[data-save-grams]").forEach(b=>b.onclick=()=>{const fi=Number(b.dataset.saveGrams),el=document.querySelector('[data-edit-grams="'+fi+'"]'),grams=Number(el?.value);if(!Number.isFinite(grams)||grams<=0||grams>100000){status("Indica uma quantidade válida em gramas.");return}const item=plan.meals[active].options[option].foods[fi];item.grams=grams;item.display_quantity=document.querySelector(`[data-display-quantity="${fi}"]`)?.value.trim()||"";item.display_name=document.querySelector(`[data-display-name="${fi}"]`)?.value.trim()||"";editingFood=-1;draw();status("Quantidade alterada neste editor. Para ficar guardada no plano e refletir no Calendário, clica em Guardar rascunho.");});
  document.querySelectorAll("[data-suggest-display]").forEach(b=>b.onclick=()=>{
    const fi=Number(b.dataset.suggestDisplay);
    const f=plan.meals[active].options[option].foods[fi];
    const ref=foods.find(x=>x.id===f.id),notes=String(ref?.notes||"");
    const unit="(?:fatias?|unidades?|ovos?|colheres?)";
    const gramsFirst=new RegExp("(\\d+(?:[.,]\\d+)?)\\s*g\\s*(?:por|=|[-–])?\\s*("+unit+")","i").exec(notes);
    const unitFirst=new RegExp("("+unit+")\\s*(?:=|:|de)?\\s*(\\d+(?:[.,]\\d+)?)\\s*g","i").exec(notes);
    if(!gramsFirst&&!unitFirst){status("Sem equivalência inequívoca na nota da biblioteca. Introduz manualmente a apresentação.");return}
    const amount=Number((gramsFirst?gramsFirst[1]:unitFirst[2]).replace(",",".")),unitName=(gramsFirst?gramsFirst[2]:unitFirst[1]);
    if(!amount||!f.grams){status("Quantidade insuficiente para sugerir.");return}
    const count=f.grams/amount;
    const display=(Number.isInteger(count)?String(count):"≈ "+count.toLocaleString("pt-PT",{maximumFractionDigits:1}))+" "+unitName;
    document.querySelector('[data-display-quantity="'+fi+'"]').value=display;
    status("Sugestão: "+display+". Confirma a equivalência e guarda.");
  });
  document.querySelectorAll("[data-edit-grams]").forEach(el=>el.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();document.querySelector('[data-save-grams="'+el.dataset.editGrams+'"]')?.click()}if(e.key==="Escape"){editingFood=-1;draw()}});
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{const o=plan.meals[active].options[option],idx=Number(b.dataset.remove);ensureOrder(o);o.foods.splice(idx,1);o.foods.forEach(f=>{if(f.alternative_to===idx)delete f.alternative_to;else if(f.alternative_to>idx)f.alternative_to--});o.order=o.order.filter(x=>!(x.type==="food"&&x.index===idx)).map(x=>x.type==="food"&&x.index>idx?{...x,index:x.index-1}:x);draw()});
  if(document.querySelector("[data-option-title]"))document.querySelector("[data-option-title]").oninput=e=>{plan.meals[active].options[option].title=e.target.value;renderPersistence()};
  document.querySelectorAll("[data-note]").forEach(el=>el.oninput=()=>{plan.meals[active].options[option].notes[Number(el.dataset.note)]=el.value;renderPersistence()});
  document.querySelectorAll("[data-remove-note]").forEach(b=>b.onclick=()=>{const o=plan.meals[active].options[option],idx=Number(b.dataset.removeNote);ensureOrder(o);o.notes.splice(idx,1);o.order=o.order.filter(x=>!(x.type==="note"&&x.index===idx)).map(x=>x.type==="note"&&x.index>idx?{...x,index:x.index-1}:x);draw()});
  document.querySelectorAll("[data-confirm-note]").forEach(b=>b.onclick=()=>{const field=document.querySelector('[data-note="'+b.dataset.confirmNote+'"]');if(field){field.blur();b.classList.add("confirmed");status("Nota confirmada.")}});
  let dragging=null;document.querySelectorAll(".drag-handle").forEach(handle=>{const row=handle.closest("[data-row-type]");handle.ondragstart=e=>{dragging={type:row.dataset.rowType,index:Number(row.dataset.rowIndex)};e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain","reorder")};handle.ondragend=()=>{dragging=null;document.querySelectorAll(".drag-over").forEach(el=>el.classList.remove("drag-over"))}});
  document.querySelectorAll(".nutrition-list [data-row-type]").forEach(row=>{row.ondragover=e=>{if(!dragging)return;e.preventDefault();e.dataTransfer.dropEffect="move";row.classList.add("drag-over")};row.ondragleave=()=>row.classList.remove("drag-over");row.ondrop=e=>{e.preventDefault();row.classList.remove("drag-over");if(!dragging)return;const o=plan.meals[active].options[option],order=ensureOrder(o),from=order.findIndex(x=>x.type===dragging.type&&x.index===dragging.index),to=order.findIndex(x=>x.type===row.dataset.rowType&&x.index===Number(row.dataset.rowIndex));if(from<0||to<0||from===to)return;const [moved]=order.splice(from,1);order.splice(to,0,moved);dragging=null;draw()}});
  let selectedFoodId="";const search=$("food-search-input"),results=$("food-results");
  if(search&&results){
    const preview=$("selected-food-note");
    const showPreview=()=>{const ref=foods.find(f=>f.id===selectedFoodId);if(preview){preview.textContent=ref?(ref.notes?.trim()||"Sem nota de porção na biblioteca."):"";preview.hidden=!ref}};
    const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const renderMatches=()=>{
      const q=norm(search.value.trim());selectedFoodId="";showPreview();
      if(!q){results.hidden=true;results.innerHTML="";return}
      const matches=foods.filter(f=>norm(f.display_name).includes(q)).slice(0,60);
      results.innerHTML=matches.length?matches.map(f=>'<button type="button" class="food-result" data-food-id="'+esc(f.id)+'">'+esc(f.display_name)+'</button>').join(""):'<div class="food-no-results">Sem resultados</div>';
      results.hidden=false;
      results.querySelectorAll("[data-food-id]").forEach(b=>b.onclick=()=>{selectedFoodId=b.dataset.foodId;search.value=foods.find(f=>f.id===selectedFoodId)?.display_name||"";results.hidden=true;showPreview();$("food-grams")?.focus()});
    };
    search.oninput=renderMatches;
    search.onfocus=()=>{if(search.value&&!selectedFoodId)renderMatches()};
    search.onkeydown=e=>{if(e.key==="Escape")results.hidden=true;if(e.key==="Enter"){const first=results.querySelector("[data-food-id]");if(first&&!results.hidden){e.preventDefault();first.click()}}};
  }
  if($("food-grams"))$("food-grams").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("add-food")?.click()}};
  if($("add-food"))$("add-food").onclick=()=>{const id=selectedFoodId,grams=Number($("food-grams").value);if(!id||!Number.isFinite(grams)||grams<=0||grams>100000){status("Seleciona um alimento e uma quantidade válida.");return}const o=plan.meals[active].options[option];ensureOrder(o);const parent=alternativeParent;o.foods.push({...{id,grams},...(parent!=null?{alternative_to:parent}:{})});alternativeParent=null;const index=o.foods.length-1;const pos=parent==null?-1:o.order.findLastIndex(x=>x.type==="food"&&(x.index===parent||o.foods[x.index]?.alternative_to===parent));o.order.splice(pos<0?o.order.length:pos+1,0,{type:"food",index});draw()};
  if($("add-option"))$("add-option").onclick=()=>{plan.meals[active].options.push({title:"",foods:[],notes:[]});option=plan.meals[active].options.length-1;draw()};
  if($("add-note"))$("add-note").onclick=()=>{const o=plan.meals[active].options[option];o.notes=o.notes||[];ensureOrder(o);o.notes.push("");o.order.push({type:"note",index:o.notes.length-1});draw();const fields=document.querySelectorAll("[data-note]");fields[fields.length-1]?.focus()};
  if($("add-meal-inline"))$("add-meal-inline").onclick=showMealPicker;
  if($("delete-option"))$("delete-option").onclick=()=>{const m=plan.meals[active];if(m.options.length===1){status("Esta é a única opção. Para eliminar tudo, utiliza Apagar refeição.");return}if(!confirm("Apagar esta opção e todos os seus alimentos e notas?"))return;m.options.splice(option,1);option=Math.min(option,m.options.length-1);editingFood=-1;draw();status("Opção eliminada.")};
  document.querySelectorAll("[data-delete-meal]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.deleteMeal),m=plan.meals[i];if(!m)return;if(!confirm("Apagar a refeição "+m.name+" e todas as suas opções, alimentos e notas?"))return;plan.meals.splice(i,1);if(active===i)active=-1;else if(active>i)active--;option=0;editingFood=-1;draw();status("Refeição eliminada.")});


  requestAnimationFrame(alignNutritionHeaders);
  renderPersistence();
}
function alignNutritionHeaders(){
  document.querySelectorAll(".meal").forEach(meal=>{
    const rail=meal.querySelector(".option-content .nutrition-row.food-row > .macro-values");
    if(!rail)return;
    const reference=rail.getBoundingClientRect();
    for(const target of [meal.querySelector(".meal-header-macros"),meal.querySelector(".option-content .option-summary > .macro-values")]){
      if(!target||!target.parentElement)continue;
      const parent=target.parentElement.getBoundingClientRect();
      target.style.setProperty("position","absolute","important");
      target.style.setProperty("left",(reference.left-parent.left)+"px","important");
      target.style.setProperty("right","auto","important");
      target.style.setProperty("width",reference.width+"px","important");
      target.style.setProperty("max-width","none","important");
      target.style.setProperty("display",target.classList.contains("macro-values")?"grid":"block","important");
    }
  });
}
window.addEventListener("resize",()=>requestAnimationFrame(alignNutritionHeaders));
function addMeal(name){plan.meals.push({name:name||"Pequeno almoço",options:[{title:"",foods:[],notes:[]}]});active=plan.meals.length-1;option=0;draw()}
const mealNames=["Pequeno almoço","Intermédia","Almoço","Principal","Lanche","Pós treino","Pré treino","Pré jogo","Pós jogo","Intra Jogo","Pré aquecimento","Pós aquecimento","Jantar","Ceia"];
function showMealPicker(){const panel=$("meal-picker");$("meal-choices").innerHTML=mealNames.map((name,i)=>'<button type="button" data-meal-choice="'+i+'">'+esc(name)+'</button>').join("");panel.hidden=false;panel.scrollIntoView({behavior:"smooth",block:"nearest"});panel.querySelectorAll("[data-meal-choice]").forEach(b=>b.onclick=()=>{addMeal(mealNames[Number(b.dataset.mealChoice)]);panel.hidden=true})}
$("cancel-meal").onclick=()=>{$("meal-picker").hidden=true};
// Publicar é uma ação separada e explícita, ligada ao endpoint administrativo mais abaixo.

const movePostButton=document.createElement("button");
movePostButton.id="move-post-training";
movePostButton.type="button";
movePostButton.textContent="Transferir pós-treino para Peri-treino";
movePostButton.title="Cria ou atualiza um rascunho Peri-treino e remove o pós-treino dos rascunhos de cores confirmados.";
document.querySelector("#plan-editor .actions")?.prepend(movePostButton);
movePostButton.onclick=async()=>{
  if(!plan.id||!isColorPlan(plan.plan_type)||!plan.meals.some(isPostTraining)){
    status("Seleciona um plano de cor guardado com Pós treino.");return;
  }
  const current=draftIndex.find(d=>String(d.id)===String(plan.id));
  const baseTime=Number(current?.created_at||0);
  const matches=draftIndex.filter(d=>String(d.player_id)===String(plan.player_id)&&isColorPlan(d.plan_type)&&
    (String(d.id)===String(plan.id)||(baseTime&&Math.abs(Number(d.created_at||0)-baseTime)<=120)));
  const byType=new Map();
  byType.set(plan.plan_type,current||{id:plan.id,plan_type:plan.plan_type});
  matches.sort((a,b)=>Math.abs(Number(a.created_at||0)-baseTime)-Math.abs(Number(b.created_at||0)-baseTime))
    .forEach(d=>{if(!byType.has(d.plan_type))byType.set(d.plan_type,d)});
  const source_ids=[...byType.values()].map(d=>d.id);
  const send=async(dry_run,csrf)=>{
    const response=await fetch("/api/v2/food-plan-drafts/post-training-transfer",{
      method:"POST",credentials:"same-origin",
      headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
      body:JSON.stringify({source_ids,dry_run})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.error||payload.code||"HTTP "+response.status);
    return payload.transfer;
  };
  movePostButton.disabled=true;
  try{
    const csrf=(await request("/api/me")).csrf||"";
    const preview=await send(true,csrf);
    if(!confirm("Transferir o Pós treino destes rascunhos de "+plan.player_name+"?\n\n"+
       preview.source_types.join("\n")+"\n\n"+
       "Destino: Plano Peri-treino ("+
       (preview.peri_status==="create"?"novo rascunho":preview.peri_status==="identical"?"já contém a mesma refeição":"adicionar ao rascunho existente")+
       ").\n\nAs opções e doses serão preservadas. Os planos publicados não serão alterados. Guarda previamente quaisquer edições ainda não gravadas."))return;
    const outcome=await send(false,csrf);
    await loadDrafts();
    await loadExistingPlan(plan.id);
    status("Pós treino transferido de "+outcome.source_types.length+" rascunhos para Peri-treino. Nenhum plano publicado foi alterado.");
  }catch(err){status("Não foi possível transferir o Pós treino: "+err.message+" Os rascunhos permanecem inalterados quando a validação falha.")}
  finally{movePostButton.disabled=false}
};
$("delete-plan").onclick=async()=>{if(!plan.id&&$("draft-list").value)plan.id=$("draft-list").value;if(!plan.id)return;if(publicationState?.state!=="draft"){persistenceError="Este plano está em utilização no Planeamento. Não pode ser apagado sem retirar primeiro a publicação.";renderPersistence();return;}if(!confirm('Apagar definitivamente o plano «'+plan.name+'»? Esta ação não pode ser anulada.'))return;try{const csrf=(await request("/api/me")).csrf||"";await request("/api/v2/food-plan-drafts/"+encodeURIComponent(plan.id),{method:"DELETE",headers:{"X-CSRF-Token":csrf}});newPlan();await loadDrafts();showEntry("entry");status("Plano apagado.")}catch(err){status("Não foi possível apagar o plano: "+err.message)}};
function newPlan(){$("meal-picker").hidden=true;plan={id:"",name:"Novo plano alimentar",player_id:"",athlete_id:"",player_name:"",plan_type:"",meals:[]};savedSignature=null;publicationState={state:"draft",pending_changes:false,published_at:null};lastSavedAt=null;persistenceError="";active=-1;option=0;addMeal("Pequeno almoço");status("Novo plano iniciado.")}
async function request(url,opts){const r=await fetch(url,{credentials:"same-origin",...opts});const data=await r.json().catch(()=>null);if(!r.ok)throw Error(data?.error||data?.code||"HTTP "+r.status);return data||{}}
async function loadDrafts(){const data=await request("/api/v2/food-plan-drafts");draftIndex=(data.drafts||[]).filter(d=>draftOwner(d));$("draft-list").innerHTML='<option value="">Selecionar plano guardado</option>'+draftIndex.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");$("draft-list").value=plan.id||"";$("draft-list").classList.toggle("has-selection",!!$("draft-list").value);if($("library-plan-rows"))populatePlanLibrary()}
const showEntry=mode=>{ $("plan-entry").hidden=mode!=="entry";$("plan-search-selection").hidden=mode!=="search";$("plan-editor").hidden=mode!=="editor";$("plan-preview").hidden=mode!=="preview";};
const normalizeSearch=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const nameSearchRank=(name,q)=>{
  if(!q)return 0;
  const normalized=normalizeSearch(name),words=normalized.split(/\s+/);
  if(normalized.startsWith(q))return 0;
  if(words.some(word=>word.startsWith(q)))return 1;
  if(normalized.includes(q))return 2;
  return Infinity;
};
const draftSearchRank=(x,q)=>{
  if(!q)return 0;
  const nameRank=nameSearchRank(x.owner?.name||x.draft.player_name||"",q);
  if(Number.isFinite(nameRank))return nameRank;
  const planType=normalizeSearch(x.type);
  if(planType.startsWith(q))return 3;
  if(planType.includes(q))return 4;
  return Infinity;
};
const draftOwner=d=>players.find(p=>d.athlete_id?String(p.athlete_id)===String(d.athlete_id):String(p.user_id||"")===String(d.player_id||""))||null;
const plansForPlayer=id=>draftIndex.filter(d=>String(draftOwner(d)?.id)===String(id));
const matchingDraftPlayers=()=>{const ids=new Set(draftIndex.map(d=>draftOwner(d)?.id).filter(Boolean));return players.filter(p=>ids.has(p.id))};
const renderSearchPlayers=(all=false)=>{const q=normalizeSearch($("search-player").value);const found=matchingDraftPlayers().filter(p=>all||!q||Number.isFinite(nameSearchRank(p.name,q))).sort((a,b)=>nameSearchRank(a.name,q)-nameSearchRank(b.name,q)||a.name.localeCompare(b.name,"pt"));$("search-player-results").innerHTML=found.slice(0,60).map(p=>'<button type="button" data-player="'+esc(p.id)+'">'+esc(p.name)+'</button>').join("")||'<span>Sem planos encontrados</span>';$("search-player-results").hidden=false;$("search-player-toggle").setAttribute("aria-expanded","true");$("search-player-results").querySelectorAll("[data-player]").forEach(b=>b.onclick=()=>selectSearchPlayer(b.dataset.player))};
const selectSearchPlayer=id=>{selectedSearchPlayer=id;const player=players.find(p=>p.id===id);if(!player)return;$("search-player").value=player.name;$("search-player-results").hidden=true;$("search-player-toggle").setAttribute("aria-expanded","false");const options=plansForPlayer(id);$("search-plan-type").innerHTML='<option value="">Selecionar tipo de plano</option>'+options.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name.slice(player.name.length+3))+'</option>').join("");$("search-plan-type").value="";$("search-plan-type").disabled=!options.length;refreshSelectDisplays()};
$("entry-create").onclick=()=>{newPlan();syncPlanSelectors();showEntry("editor")};
const planTypeOf=d=>String(d.plan_type||"");
const draftMeta=d=>{
 const stamp=Number(d.created_at||d.updated_at);
 const date=stamp?new Date(stamp*1000).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Data indisponível";
 const origin=d.legacy_migration?"Cópia antiga":d.origin==="json_import"?"Importado · JSON":"Plano guardado";
 const pub=d.publication||{state:"draft",pending_changes:false};
 const state=pub.pending_changes?"pending":pub.state;
 const caption=state==="published"?"Publicado no Planeamento":state==="transitional"?"Em uso no Planeamento":state==="pending"?"Alterações por publicar":"Rascunho · por publicar";
 return '<small style="display:block;opacity:.7;margin-top:6px;font-weight:400">'+esc(origin)+" · Guardado "+esc(date)+'</small>'+
  '<span class="plan-publication-label" data-state="'+esc(state)+'">'+esc(caption)+'</span>';
};
const renderPlanLibrary=()=>{
 const query=normalizeSearch($("library-plan-search").value.trim()),playerId=$("library-player-filter").value,type=$("library-type-filter").value;
 const rows=draftIndex.map(d=>({draft:d,owner:draftOwner(d),type:planTypeOf(d)})).filter(x=>x.owner&&(!playerId||String(x.owner?.id)===String(playerId))&&(!type||x.type===type)&&(!query||Number.isFinite(draftSearchRank(x,query)))).sort((a,b)=>draftSearchRank(a,query)-draftSearchRank(b,query)||(a.owner?.name||a.draft.player_name||"").localeCompare(b.owner?.name||b.draft.player_name||"","pt")||a.type.localeCompare(b.type,"pt")||Number(b.draft.created_at||0)-Number(a.draft.created_at||0));
 $("library-plan-count").textContent=rows.length+" resultado"+(rows.length===1?"":"s");
 $("library-plan-rows").innerHTML=rows.map(x=>'<tr'+(x.draft.legacy_migration?' class="plan-library-legacy-draft"':'')+'><td><strong>'+esc(x.owner?.name||'Jogador não associado')+'</strong></td><td>'+esc(x.type||'Tipo não definido')+draftMeta(x.draft)+'</td><td><div class="plan-library-row-actions"><button type="button" data-view-id="'+esc(x.draft.id)+'" aria-label="Visualizar plano" title="Visualizar">Visualizar</button><button type="button" data-edit-id="'+esc(x.draft.id)+'" aria-label="Editar plano" title="Editar">Editar</button>'+(x.draft.legacy_migration?'<button type="button" data-delete-legacy-id="'+esc(x.draft.id)+'" title="Eliminar cópia antiga">Eliminar cópia antiga</button>':'')+'</div></td></tr>').join("")||'<tr><td colspan="3" class="plan-library-empty">Nenhum plano encontrado.</td></tr>';
 $("library-plan-rows").querySelectorAll("[data-edit-id]").forEach(b=>b.onclick=async()=>{try{await loadExistingPlan(b.dataset.editId)}catch(err){status("Não foi possível abrir o plano: "+err.message)}});
 $("library-plan-rows").querySelectorAll("[data-view-id]").forEach(b=>b.onclick=async()=>{try{await loadExistingPlan(b.dataset.viewId);renderPlanPreview();showEntry("preview")}catch(err){status("Não foi possível visualizar o plano: "+err.message)}});
 $("library-plan-rows").querySelectorAll("[data-delete-legacy-id]").forEach(b=>b.onclick=async()=>{
  const item=draftIndex.find(d=>d.id===b.dataset.deleteLegacyId);
  if(!item?.legacy_migration)return;
  if(!confirm("Eliminar definitivamente esta cópia antiga de "+(item.player_name||"jogador")+" — "+item.plan_type+"?\\n\\nEsta operação elimina apenas o rascunho antigo. Não altera a publicação nem os planos JSON importados."))return;
  b.disabled=true;
  try{const csrf=(await request("/api/me")).csrf||"";await request("/api/v2/food-plan-drafts/"+encodeURIComponent(item.id),{method:"DELETE",headers:{"X-CSRF-Token":csrf}});await loadDrafts();status("Cópia antiga eliminada. Não voltará a ser gerada automaticamente.")}
  catch(err){b.disabled=false;status("Não foi possível eliminar: "+err.message)}
 });

};
const populatePlanLibrary=()=>{
 const playerFilter=$("library-player-filter"),typeFilter=$("library-type-filter"),oldPlayer=playerFilter.value,oldType=typeFilter.value;
 const owners=[...new Map(draftIndex.map(d=>draftOwner(d)).filter(Boolean).map(p=>[p.id,p])).values()].sort((a,b)=>a.name.localeCompare(b.name,"pt"));
 playerFilter.innerHTML='<option value="">Todos os jogadores</option>'+owners.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
 typeFilter.innerHTML='<option value="">Todos os tipos de plano</option>'+[...new Set(draftIndex.map(planTypeOf))].sort((a,b)=>a.localeCompare(b,"pt")).map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join("");
 playerFilter.value=oldPlayer;typeFilter.value=oldType;refreshSelectDisplays();renderPlanLibrary();
};
$("library-plan-search").addEventListener("input",renderPlanLibrary);
$("library-player-filter").addEventListener("change",renderPlanLibrary);
$("library-type-filter").addEventListener("change",renderPlanLibrary);
const syncPlanSelectors=()=>{$("plan-player").value=players.find(p=>p.athlete_id===plan.athlete_id)?.id||plan.player_id||"";$("plan-type").value=plan.plan_type||"";refreshSelectDisplays();$("plan-player").classList.toggle("has-selection",!!plan.athlete_id);$("plan-type").classList.toggle("has-selection",!!plan.plan_type)};
$("back-from-search").onclick=()=>showEntry("entry");
$("back-from-editor").onclick=()=>{if(!confirm("Voltar à entrada? Guarda primeiro as alterações que pretendes manter."))return;showEntry("entry")};
$("new-plan").onclick=()=>{if(!confirm("Criar outro plano? Guarda primeiro as alterações que pretendes manter."))return;newPlan();showEntry("entry")};
const loadExistingPlan=async id=>{const index=draftIndex.find(d=>String(d.id)===String(id));if(!index)throw Error("Plano não encontrado.");const data=await request("/api/v2/food-plan-drafts/"+encodeURIComponent(id));const loaded=data.draft;const owner=draftOwner(index);if(!owner)throw Error("O jogador associado a este plano não existe na base de dados. É necessário rever a associação antes de editar.");if(loaded.athlete_id&&String(loaded.athlete_id)!==String(owner.athlete_id))throw Error("Inconsistência no perfil associado.");if(loaded.player_id&&String(loaded.player_id)!==String(owner.user_id||""))throw Error("Inconsistência no ID do utilizador.");loaded.id=id;loaded.athlete_id=owner.athlete_id;loaded.player_id=owner.user_id||"";loaded.player_name=owner.name;loaded.plan_type=index.plan_type;loaded.name=owner.name+" - "+index.plan_type;loaded.meals.forEach(m=>m.options.forEach(o=>o.notes=o.notes||[]));plan=loaded;publicationState=loaded.publication||index.publication||{state:"draft",pending_changes:false};lastSavedAt=loaded.updated_at||index.updated_at||null;savedSignature=planSignature();persistenceError="";active=plan.meals.length?0:-1;option=0;draw();syncPlanSelectors();showEntry("editor");status("Plano carregado: "+index.name)};
const previewPalette=type=>{
 const key=String(type||"").toLowerCase();
 if(key.includes("amarelo"))return "yellow";
 if(key.includes("laranja"))return "orange";
 if(key.includes("azul"))return "blue";
 if(key.includes("verde"))return "green";
 return "neutral";
};
const previewNutrition=t=>'<span class="preview-kcal">'+fmtKcal(t[0])+' kcal</span><span class="preview-protein">'+fmt(t[1])+' g</span><span class="preview-carbs">'+fmt(t[2])+' g</span><span class="preview-fat">'+fmt(t[3])+' g</span>';
const renderPlanPreview=()=>{
 const body=$("plan-preview-content"),total=totals(),palette=previewPalette(plan.plan_type);
 body.innerHTML='<div class="plan-preview-heading"><div class="plan-preview-eyebrow">'+esc(plan.player_name)+'</div><h2>'+esc(plan.plan_type)+'</h2><div class="plan-preview-macros">'+total.map((v,i)=>'<div><strong>'+esc(i===0?fmtKcal(v):fmt(v))+'</strong><small>'+["kcal","Proteína (g)","Hidratos (g)","Gordura (g)"][i]+'</small></div>').join("")+'</div></div><div class="plan-preview-group" data-palette="'+palette+'"><h3 class="plan-preview-group-title">'+esc(plan.plan_type.replace(/^Plano\s+/i,""))+'</h3>'+plan.meals.map((meal,mi)=>{
 const mealTotals=average(meal);
 return '<details class="plan-preview-meal" '+(mi===0?'open':'')+'><summary class="plan-preview-meal-heading"><span class="plan-preview-meal-name">'+esc(mealDisplayName(meal))+'</span><span class="plan-preview-meal-macros">'+previewNutrition(mealTotals)+'</span><span class="plan-preview-caret">⌄</span></summary><div class="plan-preview-options">'+meal.options.map((opt,oi)=>{
 const entries=displayOrder(opt).map(item=>item.type==="food"?(()=>{const f=opt.foods[item.index];if(!f)return "";const ref=foods.find(x=>x.id===f.id);return '<div class="plan-preview-food'+(f.alternative_to!=null?' plan-preview-alternative':'')+'">'+(f.alternative_to!=null?'<span class="alternative-or">ou</span> ':'')+esc(f.display_quantity||(f.grams==null?'⚠ Quantidade por definir':fmt(f.grams)+' g'))+' '+esc(f.display_name||(f.kind==='supplement'?f.label:(ref?.display_name||'Alimento indisponível')))+'</div>'})():(()=>{const note=opt.notes?.[item.index];return note?'<div class="plan-preview-note">'+esc(note)+'</div>':""})()).join("");
 return '<details class="plan-preview-option"><summary class="plan-preview-option-heading"><span><small>Opção '+(oi+1)+'</small><strong>'+esc(opt.title||"Opção "+(oi+1))+'</strong></span><span class="plan-preview-caret">⌄</span></summary><div class="plan-preview-option-body"><div class="plan-preview-option-macros">'+previewNutrition(sum(opt.foods))+'</div>'+entries+'</div></details>'
 }).join("")+'</div></details>'
 }).join("")+'</div>';
};
$("preview-back").onclick=()=>showEntry("entry");
$("preview-edit").onclick=()=>showEntry("editor");
const switchExistingPlan=async(playerId,type)=>{const owner=players.find(p=>p.id===playerId);if(!owner){status("Seleciona um jogador válido.");draw();return}const match=plansForPlayer(playerId).find(d=>d.plan_type===type);if(match){try{await loadExistingPlan(match.id)}catch(err){status("Não foi possível mudar de plano: "+err.message)}return}
 if(!confirm("Ainda não existe "+type+" para "+owner.name+". Criar um novo rascunho separado, sem alterar o plano atual?")){draw();return}
 const initialMeal=type==="Plano Peri-treino"?"Pré treino":type==="Plano Peri-jogo"?"Pré jogo":"Pequeno almoço";
 plan={id:"",name:owner.name+" - "+type,player_id:owner.user_id||"",athlete_id:owner.athlete_id,player_name:owner.name,plan_type:type,meals:[]};savedSignature=null;publicationState={state:"draft",pending_changes:false};lastSavedAt=null;persistenceError="";active=-1;option=0;addMeal(initialMeal);syncPlanSelectors();status("Novo rascunho "+type+" criado no editor. Guarda-o para ficar disponível na biblioteca.");};
$("plan-type").onchange=async e=>{const type=e.target.value;if(plan.id){await switchExistingPlan(players.find(p=>p.athlete_id===plan.athlete_id)?.id||plan.player_id,type);return}plan.plan_type=type;plan.name=plan.player_name&&plan.plan_type?plan.player_name+" - "+plan.plan_type:"Novo plano alimentar";renderPersistence()};
$("plan-player").onchange=async e=>{const id=e.target.value;if(plan.id){const matches=plansForPlayer(id);if(!matches.length){status("Este jogador não tem planos guardados. Usa Pesquisar plano ou Criar novo.");draw();return}const target=matches.find(d=>d.plan_type===plan.plan_type)||matches[0];try{await loadExistingPlan(target.id)}catch(err){status("Não foi possível mudar de jogador: "+err.message)}return}const owner=players.find(p=>p.id===id);plan.player_id=owner?.user_id||"";plan.athlete_id=owner?.athlete_id||"";plan.player_name=owner?.name||"";plan.name=plan.player_name&&plan.plan_type?plan.player_name+" - "+plan.plan_type:"Novo plano alimentar";renderPersistence()};
$("draft-list").onchange=async e=>{if(!e.target.value)return;try{await loadExistingPlan(e.target.value)}catch(err){status("Não foi possível abrir o plano: "+err.message)}};
async function saveCurrentDraft(){
 if(!plan.athlete_id||!plan.plan_type){
  persistenceError="Seleciona primeiro o jogador e o tipo de plano.";renderPersistence();return false;
 }
 if(plan.meals.some(m=>m.options.some(o=>o.foods.length===0&&!(o.notes||[]).some(n=>n.trim())))){
  persistenceError="Preenche as opções alimentares antes de guardar.";renderPersistence();return false;
 }
 if(!planIsDirty())return true;
 plan.name=plan.player_name+" - "+plan.plan_type;
 persistenceError="";saveBusy=true;renderPersistence();
 try{
  const csrf=(await request("/api/me")).csrf||"";
  const result=await request("/api/v2/food-plan-drafts",{
   method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
   body:JSON.stringify(plan)
  });
  plan.id=result.id;plan.updated_at=result.updated_at;
  publicationState=result.publication||{state:"draft",pending_changes:false};
  lastSavedAt=result.updated_at||Math.floor(Date.now()/1000);
  savedSignature=planSignature();persistenceError="";saveBusy=false;
  renderPersistence();
  await loadDrafts().catch(()=>status("Rascunho guardado. A lista não foi atualizada."));
  status("Rascunho guardado na base de dados.");return true;
 }catch(err){
  saveBusy=false;persistenceError="Não foi possível guardar o rascunho: "+err.message;
  renderPersistence();status(persistenceError);return false;
 }
}
$("save-plan").onclick=()=>saveCurrentDraft();
$("assign-player").onclick=async()=>{
 if(!plan.id||planIsDirty()){
  persistenceError="Guarda primeiro todas as alterações com «Guardar rascunho».";
  renderPersistence();return;
 }
 if(publicationState?.state==="published"&&!publicationState.pending_changes)return;
 if(!confirm("Publicar «"+plan.name+"» apenas no Planeamento do Backoffice?\n\n"+
  "Esta ação aprova os alimentos, quantidades e valores nutricionais guardados.\n"+
  "A app dos jogadores NÃO será alterada."))return;
 persistenceError="";publishBusy=true;renderPersistence();
 try{
  const csrf=(await request("/api/me")).csrf||"";
  const result=await request("/api/v2/food-plan-drafts/"+encodeURIComponent(plan.id)+"/publish",{
   method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
   body:JSON.stringify({updated_at:plan.updated_at})
  });
  publicationState=result.publication;publishBusy=false;persistenceError="";
  renderPersistence();
  await loadDrafts().catch(()=>status("Plano publicado. A lista não foi atualizada."));
  status("Plano publicado no Planeamento. Não foi enviado à app dos jogadores.");
 }catch(err){
  publishBusy=false;
  const errors={
   stale_draft:"O rascunho foi alterado noutro local. Reabre-o antes de publicar.",
   missing_quantity:"Existe uma quantidade por preencher. Corrige e guarda o rascunho.",
   missing_food:"Existe um alimento sem referência ativa na biblioteca.",
   another_plan_active:"Já existe um plano ativo deste tipo para o jogador. Revê a associação.",
   empty_plan:"O plano ainda não tem refeições.",
   empty_option:"Existe uma opção vazia."
  };
  persistenceError=errors[err.message]||"Publicação não concluída: "+err.message;
  renderPersistence();status(persistenceError);
 }
};
(async()=>{try{const data=await request("/api/v2/food-library");foods=data.foods||[];const roster=await request("/api/v2/athletes");players=(roster.athletes||[]).map(a=>({id:String(a.user_id||a.id),user_id:a.user_id||"",athlete_id:String(a.id),name:a.name}));$("plan-player").innerHTML='<option value="">Selecionar jogador</option>'+players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");await loadDrafts();addMeal("Pequeno almoço");showEntry("entry");status("Biblioteca carregada: "+foods.length+" alimentos.")}catch(err){status("Não foi possível carregar os dados. Inicia sessão no Backoffice. "+err.message)}})();
})();

/* Shared two-line native dropdown presentation: native controls remain authoritative. */
(()=>{
 const skip=el=>el.hidden||el.getAttribute("aria-hidden")==="true"||el.tabIndex===-1||el.classList.contains("tm-planning-native-select")||el.classList.contains("tm-clinical-native-select")||["draft-list","supp-lib-select"].includes(el.id);
 const getTitle=el=>{const lbl=el.closest("label");let raw="";if(lbl){raw=[...lbl.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(" ").trim();if(!raw){const span=lbl.querySelector(":scope > span");if(span&&!span.classList.contains("sr-only"))raw=span.textContent.trim()}}return (raw||el.getAttribute("aria-label")||el.getAttribute("name")||el.id.replace(/[-_]/g," ")).replace(/\*/g,"").replace(/^(Filtrar |Selecionar )/i,"").trim()||"Selecionar"};
 const update=el=>{const w=el.parentElement;if(!w?.classList.contains("tm-two-line-select"))return;const selected=el.selectedOptions?.[0];const first=[...el.options].find(o=>o.value&&!o.disabled);const isAll=/^(todas?|todos?\s+as?|all)(\s|$)/i.test((selected?.textContent||"").trim());const text=selected?.value||isAll?selected?.textContent:(selected?.textContent||first?.textContent||"Selecionar");w.querySelector(".tm-select-value").textContent=text.trim();w.classList.toggle("tm-select-disabled",el.disabled)};
 const setup=el=>{if(skip(el)||el.hasAttribute("hidden")||el.closest(".tm-two-line-select"))return;const parentLabel=el.closest("label");if(parentLabel&&parentLabel.querySelectorAll("select").length===1&&parentLabel.querySelectorAll("input,textarea").length===0)parentLabel.classList.add("tm-select-label-container");const w=document.createElement("span");w.className="tm-two-line-select";const caption=document.createElement("span");caption.className="tm-select-caption";caption.textContent=getTitle(el);const value=document.createElement("span");value.className="tm-select-value";const arrow=document.createElement("span");arrow.className="tm-select-arrow";arrow.setAttribute("aria-hidden","true");arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';el.parentNode.insertBefore(w,el);w.append(caption,value,arrow,el);el.addEventListener("change",()=>update(el));el.addEventListener("input",()=>update(el));el.addEventListener("tm-refresh-select",()=>update(el));new MutationObserver(()=>update(el)).observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled","selected"]});update(el)};
 const scan=()=>document.querySelectorAll("select").forEach(setup);scan();new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.("select")||n.querySelector?.("select")))))scan()}).observe(document.documentElement,{childList:true,subtree:true});
})();