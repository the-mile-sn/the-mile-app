"use strict";(()=>{
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),fmt=v=>Number(v||0).toLocaleString("pt-PT",{maximumFractionDigits:1});
let foods=[],plan={id:"",name:"Novo plano alimentar",meals:[]},active=-1,option=0;
const nutrients=["kcal","protein_g","carbs_g","fat_g"];
const sum=items=>nutrients.map(k=>items.reduce((s,f)=>{const ref=foods.find(x=>x.id===f.id);return s+(ref?Number(ref[k])*Number(f.grams)/100*(ref.variant==="gross"?Number(ref.edible_fraction):1):0)},0));
const average=meal=>nutrients.map((_,i)=>meal.options.reduce((s,o)=>s+sum(o.foods)[i],0)/meal.options.length);
const totals=()=>nutrients.map((_,i)=>plan.meals.reduce((s,m)=>s+average(m)[i],0));
const label=t=>t.map((n,i)=>fmt(n)+(i===0?" kcal":i===1?" g P":i===2?" g HC":" g G")).join(" · ");
const status=s=>$("status").textContent=s;
function draw(){
  $("plan-name").value=plan.name;
  const t=totals();["total-kcal","total-p","total-hc","total-g"].forEach((id,i)=>$(id).textContent=fmt(t[i]));
  $("meals").innerHTML=plan.meals.map((m,mi)=>{
    const open=mi===active,o=m.options[option]||m.options[0];
    return '<section class="meal"><div class="meal-header"><input aria-label="Nome da refeição" data-meal-name="'+mi+'" maxlength="120" value="'+esc(m.name)+'"><span class="meal-summary">Média · '+esc(label(average(m)))+'</span><button data-toggle="'+mi+'">'+(open?"Fechar":"Editar")+'</button></div>'+
    (open?'<div class="option-tabs">'+m.options.map((_,oi)=>'<button class="'+(oi===option?"current":"")+'" data-option="'+oi+'">Opção '+(oi+1)+'</button>').join("")+'</div>'+
    '<div>'+o.foods.map((f,fi)=>{const ref=foods.find(x=>x.id===f.id);return '<div class="food-row"><div><strong>'+esc(ref?.display_name||"Alimento indisponível")+'</strong><small>'+esc(label(sum([f])))+'</small></div><span>'+fmt(f.grams)+' g</span><button data-remove="'+fi+'" aria-label="Remover alimento">×</button></div>'}).join("")+'</div>'+
    '<div class="food-add"><select id="food-picker" aria-label="Escolher alimento"><option value="">Selecionar alimento da biblioteca</option>'+foods.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.display_name)+'</option>').join("")+'</select><input id="food-grams" type="number" min="0.1" max="100000" step="any" value="100" aria-label="Quantidade em gramas"><button id="add-food">+ Adicionar alimento</button></div>'+
    '<div class="option-total">Total da opção '+(option+1)+' · '+esc(label(sum(o.foods)))+'</div><div class="meal-controls"><button id="add-option">+ Adicionar opção '+(m.options.length+1)+'</button><button id="add-meal-inline">+ Adicionar refeição</button></div><div class="meal-average">Média da refeição · '+esc(label(average(m)))+'</div>':'')+'</section>';
  }).join("");
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.toggle);active=active===i?-1:i;option=0;draw()});
  document.querySelectorAll("[data-meal-name]").forEach(el=>el.onchange=()=>{plan.meals[Number(el.dataset.mealName)].name=el.value.trim()||"Refeição";draw()});
  document.querySelectorAll("[data-option]").forEach(b=>b.onclick=()=>{option=Number(b.dataset.option);draw()});
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{plan.meals[active].options[option].foods.splice(Number(b.dataset.remove),1);draw()});
  if($("add-food"))$("add-food").onclick=()=>{const id=$("food-picker").value,grams=Number($("food-grams").value);if(!id||!Number.isFinite(grams)||grams<=0||grams>100000){status("Seleciona um alimento e uma quantidade válida.");return}plan.meals[active].options[option].foods.push({id,grams});draw()};
  if($("add-option"))$("add-option").onclick=()=>{plan.meals[active].options.push({foods:[]});option=plan.meals[active].options.length-1;draw()};
  if($("add-meal-inline"))$("add-meal-inline").onclick=addMeal;
}
function addMeal(){plan.meals.push({name:"Refeição "+(plan.meals.length+1),options:[{foods:[]}]});active=plan.meals.length-1;option=0;draw()}
function newPlan(){plan={id:"",name:"Novo plano alimentar",meals:[]};active=-1;option=0;draw();status("Novo plano iniciado.")}
async function request(url,opts){const r=await fetch(url,{credentials:"same-origin",...opts});if(!r.ok)throw Error("HTTP "+r.status);return r.json()}
async function loadDrafts(){const data=await request("/api/v2/food-plan-drafts");$("draft-list").innerHTML='<option value="">Selecionar plano guardado</option>'+data.drafts.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");$("draft-list").value=plan.id||""}
$("add-meal").onclick=addMeal;$("new-plan").onclick=newPlan;
$("plan-name").onchange=e=>{plan.name=e.target.value.trim();draw()};
$("draft-list").onchange=async e=>{if(!e.target.value)return;try{const data=await request("/api/v2/food-plan-drafts/"+encodeURIComponent(e.target.value));plan=data.draft;active=plan.meals.length?0:-1;option=0;draw();status("Rascunho carregado.")}catch(err){status("Não foi possível abrir o plano: "+err.message)}};
$("save-plan").onclick=async()=>{plan.name=$("plan-name").value.trim();if(!plan.name){status("Indica o nome do plano.");return}if(plan.meals.some(m=>m.options.some(o=>o.foods.length===0))){status("Preenche todas as opções antes de guardar.");return}try{const csrf=localStorage.getItem("tm_csrf")||sessionStorage.getItem("tm_csrf")||"";const r=await request("/api/v2/food-plan-drafts",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify(plan)});plan.id=r.id;await loadDrafts();status("Rascunho guardado. Não foi publicado.")}catch(err){status("Não foi possível guardar: "+err.message)}};
(async()=>{try{const data=await request("/api/v2/food-library");foods=data.foods||[];await loadDrafts();addMeal();status("Biblioteca carregada: "+foods.length+" alimentos.")}catch(err){status("Não foi possível carregar os dados. Inicia sessão no Backoffice. "+err.message)}})();
})();