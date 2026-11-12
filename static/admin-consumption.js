"use strict";
(function(){
 const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"};
 const root=document.getElementById("consumption-results"), date=document.getElementById("consumption-date"),refresh=document.getElementById("consumption-refresh"),athlete=document.getElementById("athlete");
 if(!root||!date||!athlete)return;
 const today=new Date();date.value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const num=v=>Number(v||0).toLocaleString("pt-PT",{maximumFractionDigits:1});
 async function load(){
  if(document.getElementById("consumption-panel").hidden)return;
  if(!athlete.value){root.textContent="Seleciona o Jorge Fernandes no campo de jogador acima.";return;}
  root.textContent="A carregar registos…";
  const day=date.value;if(!day){root.textContent="Seleciona uma data.";return;} const startDate=new Date(day+"T12:00:00");startDate.setDate(startDate.getDate()-14);const start=[startDate.getFullYear(),String(startDate.getMonth()+1).padStart(2,"0"),String(startDate.getDate()).padStart(2,"0")].join("-");
  try{
   const response=await fetch("/api/v2/athletes/"+encodeURIComponent(athlete.value)+"/consumption-records?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(day),{credentials:"same-origin"});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Não foi possível consultar os registos.");
   const records=(data.records||[]).slice().reverse();
   if(!records.length){root.innerHTML="<p>Sem registos de consumo entre "+esc(start)+" e "+esc(day)+".</p><p>Confirma que o Jorge guardou um consumo nesta data. Se já guardou, precisamos de validar a ligação entre a app e a base de dados do backoffice.</p>";return;}
   const grouped=Object.groupBy?Object.groupBy(records,r=>r.meal_date):records.reduce((acc,r)=>{(acc[r.meal_date]??=[]).push(r);return acc;},{});
   const mealOrder=["breakfast","lunch","snack","dinner","supper"];
   root.innerHTML=Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([day,items])=>{
    const label=new Date(day+"T12:00:00").toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"});
    const cards=items.sort((a,b)=>mealOrder.indexOf(a.meal_key)-mealOrder.indexOf(b.meal_key)).map(r=>{
     const nutrition=r.nutrition||{},food=r.consumed_foods||[];
     const state={all:"Consumido",partial:"Parcial",none:"Não consumido"}[r.status]||"Registado";
     const option=r.prescription?.option||{};
     const foods=food.map(f=>'<li><span>'+esc(f.display_name||f.name||f.food_name||"Alimento")+'</span>'+(f.grams!=null?'<span>'+num(f.grams)+' g</span>':'')+'</li>').join("");
     const metrics=[["Energia","kcal","kcal"],["Proteína","protein_g","g"],["Hidratos","carbs_g","g"],["Gordura","fat_g","g"]];
     return '<article class="tm-consumption-card"><div class="tm-consumption-head"><div class="tm-consumption-meal"><strong>'+esc(names[r.meal_key]||r.meal_key)+'</strong><span class="tm-consumption-option">'+esc(option.title||"Opção 1")+'</span></div><span class="tm-consumption-status" data-state="'+esc(r.status)+'">'+state+'</span></div><div class="tm-consumption-macros">'+metrics.map(([label,key,unit])=>'<div><small>'+label+'</small><strong>'+num(nutrition[key])+' <span>'+unit+'</span></strong></div>').join("")+'</div>'+(foods?'<details class="tm-consumption-foods"><summary>Ver alimentos consumidos <span aria-hidden="true">⌄</span></summary><ul>'+foods+'</ul></details>':'')+'</article>';
    }).join("");
    return '<section class="tm-consumption-day"><h3>'+esc(label)+'</h3><div class="tm-consumption-day-cards">'+cards+'</div></section>';
   }).join("");
  }catch(e){root.textContent="Erro ao consultar os registos: "+e.message;}
 }
 window.tmLoadConsumption=load;refresh.addEventListener("click",load);date.addEventListener("change",load);athlete.addEventListener("change",()=>{if(!document.getElementById("consumption-panel").hidden)setTimeout(load,0);});
})();