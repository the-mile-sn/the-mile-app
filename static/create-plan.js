"use strict";(()=>{
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),fmt=v=>Number(v||0).toLocaleString("pt-PT",{maximumFractionDigits:1});
let foods=[],plan={id:"",name:"Novo plano alimentar",meals:[]},active=-1,option=0;
const nutrients=["kcal","protein_g","carbs_g","fat_g"];
const sum=items=>nutrients.map(k=>items.reduce((s,f)=>{const ref=foods.find(x=>x.id===f.id);return s+(ref?Number(ref[k])*Number(f.grams)/100*(ref.variant==="gross"?Number(ref.edible_fraction):1):0)},0));
const average=meal=>nutrients.map((_,i)=>meal.options.reduce((s,o)=>s+sum(o.foods)[i],0)/meal.options.length);
const totals=()=>nutrients.map((_,i)=>plan.meals.reduce((s,m)=>s+average(m)[i],0));
const label=t=>t.map((n,i)=>fmt(n)+(i===0?" kcal":i===1?" g P":i===2?" g HC":" g G")).join(" · ");
const status=s=>$("status").textContent=s;
const macro=(values)=>'<div class="macro-values">'+values.map((v,i)=>'<span class="macro m'+i+'"><b>'+fmt(v)+'</b><small>'+["kcal","P (g)","HC (g)","G (g)"][i]+'</small></span>').join("")+'</div>';
function draw(){
  $("plan-name").value=plan.name;
  const t=totals();["total-kcal","total-p","total-hc","total-g"].forEach((id,i)=>$(id).textContent=fmt(t[i]));
  $("meals").innerHTML=plan.meals.map((m,mi)=>{
    const open=mi===active,o=m.options[option]||m.options[0];
    const rows=(o?.foods||[]).map((f,fi)=>{const ref=foods.find(x=>x.id===f.id);return '<div class="nutrition-row food-row"><div class="food-identity"><strong>'+esc(ref?.display_name||"Alimento indisponível")+'</strong><span>'+fmt(f.grams)+' g</span></div>'+macro(sum([f]))+'<button class="remove-row" data-remove="'+fi+'" aria-label="Remover alimento">×</button></div>'}).join("");
    const notes=(o?.notes||[]).map((n,ni)=>'<div class="nutrition-row note-row"><textarea data-note="'+ni+'" rows="2" maxlength="4000" placeholder="Escreve uma indicação livre…">'+esc(n)+'</textarea><span class="note-label">Nota · sem valor nutricional</span><button class="remove-row" data-remove-note="'+ni+'" aria-label="Remover nota">×</button></div>').join("");
    return '<section class="meal"><div class="meal-header"><input aria-label="Nome da refeição" data-meal-name="'+mi+'" maxlength="120" value="'+esc(m.name)+'"><div class="meal-header-macros"><span class="summary-caption">Média da refeição</span>'+macro(average(m))+'</div><button data-toggle="'+mi+'">'+(open?"Fechar":"Editar")+'</button></div>'+
    (open?'<div class="option-toolbar"><div class="option-tabs">'+m.options.map((_,oi)=>'<button class="'+(oi===option?"current":"")+'" data-option="'+oi+'">Opção '+(oi+1)+'</button>').join("")+'</div><button id="add-option">+ Adicionar opção</button></div>'+
    '<div class="option-summary"><div class="option-heading"><strong>Opção '+(option+1)+'</strong><input class="option-title" data-option-title maxlength="160" placeholder="Título da opção · Ex.: Ovos com pão" value="'+esc(o.title||'')+'"></div>'+macro(sum(o.foods))+'</div>'+
    '<div class="nutrition-list">'+notes+rows+'</div>'+
    '<div class="food-add"><div class="food-search"><input id="food-search-input" type="search" autocomplete="off" placeholder="Pesquisar alimento (ex.: carne)" aria-label="Pesquisar alimento da biblioteca"><div id="food-results" class="food-results" role="listbox" hidden></div></div>'<input id="food-grams" type="number" min="0.1" max="100000" step="any" value="100" aria-label="Quantidade em gramas"><span class="unit">g</span><button id="add-food">+ Adicionar alimento</button></div>'+
    '<div class="meal-controls"><button id="add-note">+ Adicionar nota</button><button id="add-meal-inline">+ Adicionar refeição</button></div>'+
    '<div class="meal-average"><strong>Média da refeição</strong>'+macro(average(m))+'</div>':'')+'</section>';
  }).join("");
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.toggle);active=active===i?-1:i;option=0;draw()});
  document.querySelectorAll("[data-meal-name]").forEach(el=>el.onchange=()=>{plan.meals[Number(el.dataset.mealName)].name=el.value.trim()||"Refeição";draw()});
  document.querySelectorAll("[data-option]").forEach(b=>b.onclick=()=>{option=Number(b.dataset.option);draw()});
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{plan.meals[active].options[option].foods.splice(Number(b.dataset.remove),1);draw()});
  if(document.querySelector("[data-option-title]"))document.querySelector("[data-option-title]").oninput=e=>{plan.meals[active].options[option].title=e.target.value};
  document.querySelectorAll("[data-note]").forEach(el=>el.oninput=()=>{plan.meals[active].options[option].notes[Number(el.dataset.note)]=el.value});
  document.querySelectorAll("[data-remove-note]").forEach(b=>b.onclick=()=>{plan.meals[active].options[option].notes.splice(Number(b.dataset.removeNote),1);draw()});
  let selectedFoodId="";const search=$("food-search-input"),results=$("food-results");
  if(search&&results){
    const norm=v=>String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();
    const renderMatches=()=>{
      const q=norm(search.value.trim());selectedFoodId="";
      if(!q){results.hidden=true;results.innerHTML="";return}
      const matches=foods.filter(f=>norm(f.display_name).includes(q)).slice(0,60);
      results.innerHTML=matches.length?matches.map(f=>'<button type="button" class="food-result" data-food-id="'+esc(f.id)+'">'+esc(f.display_name)+'</button>').join(""):'<div class="food-no-results">Sem resultados</div>';
      results.hidden=false;
      results.querySelectorAll("[data-food-id]").forEach(b=>b.onclick=()=>{selectedFoodId=b.dataset.foodId;search.value=foods.find(f=>f.id===selectedFoodId)?.display_name||"";results.hidden=true});
    };
    search.oninput=renderMatches;
    search.onfocus=()=>{if(search.value&&!selectedFoodId)renderMatches()};
    search.onkeydown=e=>{if(e.key==="Escape")results.hidden=true;if(e.key==="Enter"){const first=results.querySelector("[data-food-id]");if(first&&!results.hidden){e.preventDefault();first.click()}}};
  }
  if($("add-food"))$("add-food").onclick=()=>{const id=selectedFoodId,grams=Number($("food-grams").value);if(!id||!Number.isFinite(grams)||grams<=0||grams>100000){status("Seleciona um alimento e uma quantidade válida.");return}plan.meals[active].options[option].foods.push({id,grams});draw()};
  if($("add-option"))$("add-option").onclick=()=>{plan.meals[active].options.push({title:"",foods:[],notes:[]});option=plan.meals[active].options.length-1;draw()};
  if($("add-note"))$("add-note").onclick=()=>{const o=plan.meals[active].options[option];o.notes=o.notes||[];o.notes.push("");draw();const fields=document.querySelectorAll("[data-note]");fields[fields.length-1]?.focus()};
  if($("add-meal-inline"))$("add-meal-inline").onclick=addMeal;
}
function addMeal(){plan.meals.push({name:"Refeição "+(plan.meals.length+1),options:[{title:"",foods:[],notes:[]}]});active=plan.meals.length-1;option=0;draw()}
function newPlan(){plan={id:"",name:"Novo plano alimentar",meals:[]};active=-1;option=0;draw();status("Novo plano iniciado.")}
async function request(url,opts){const r=await fetch(url,{credentials:"same-origin",...opts});if(!r.ok)throw Error("HTTP "+r.status);return r.json()}
async function loadDrafts(){const data=await request("/api/v2/food-plan-drafts");$("draft-list").innerHTML='<option value="">Selecionar plano guardado</option>'+data.drafts.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");$("draft-list").value=plan.id||""}
$("add-meal").onclick=addMeal;$("new-plan").onclick=newPlan;
$("plan-name").onchange=e=>{plan.name=e.target.value.trim();draw()};
$("draft-list").onchange=async e=>{if(!e.target.value)return;try{const data=await request("/api/v2/food-plan-drafts/"+encodeURIComponent(e.target.value));plan=data.draft;plan.meals.forEach(m=>m.options.forEach(o=>o.notes=o.notes||[]));active=plan.meals.length?0:-1;option=0;draw();status("Rascunho carregado.")}catch(err){status("Não foi possível abrir o plano: "+err.message)}};
$("save-plan").onclick=async()=>{plan.name=$("plan-name").value.trim();if(!plan.name){status("Indica o nome do plano.");return}if(plan.meals.some(m=>m.options.some(o=>o.foods.length===0&&!(o.notes||[]).some(n=>n.trim())))){status("Preenche todas as opções antes de guardar.");return}try{const csrf=(await request("/api/me")).csrf||"";const r=await request("/api/v2/food-plan-drafts",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify(plan)});plan.id=r.id;await loadDrafts();status("Rascunho guardado. Não foi publicado.")}catch(err){status("Não foi possível guardar: "+err.message)}};
(async()=>{try{const data=await request("/api/v2/food-library");foods=data.foods||[];await loadDrafts();addMeal();status("Biblioteca carregada: "+foods.length+" alimentos.")}catch(err){status("Não foi possível carregar os dados. Inicia sessão no Backoffice. "+err.message)}})();
})();