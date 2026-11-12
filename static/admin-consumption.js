"use strict";
(function(){
 const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"};
 const root=document.getElementById("consumption-results"), date=document.getElementById("consumption-date"),refresh=document.getElementById("consumption-refresh"),athlete=document.getElementById("athlete");
 if(!root||!date||!athlete)return;
 date.value=new Date().toLocaleDateString("en-CA");
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const num=v=>Number(v||0).toLocaleString("pt-PT",{maximumFractionDigits:1});
 async function load(){
  if(document.getElementById("consumption-panel").hidden)return;
  if(!athlete.value){root.textContent="Seleciona um jogador.";return;}
  root.textContent="A carregar registos…";
  const day=date.value;if(!day){root.textContent="Seleciona uma data.";return;}
  try{
   const response=await fetch("/api/v2/athletes/"+encodeURIComponent(athlete.value)+"/consumption-records?start="+encodeURIComponent(day)+"&end="+encodeURIComponent(day),{credentials:"same-origin"});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Não foi possível consultar os registos.");
   const records=data.records||[];
   if(!records.length){root.textContent="Sem registos de consumo nesta data.";return;}
   root.innerHTML=records.map(r=>{
    const nutrition=r.nutrition||{},food=r.consumed_foods||[];
    const state={all:"Consumido",partial:"Parcialmente",none:"Não consumido"}[r.status]||"Registado";
    const option=r.prescription?.option||{};
    const foods=food.map(f=>'<li>'+esc(f.display_name||f.name||f.food_name||"Alimento")+(f.grams!=null?" · "+num(f.grams)+" g":"")+'</li>').join("");
    return '<article class="tm-consumption-card"><div class="tm-consumption-head"><strong>'+esc(names[r.meal_key]||r.meal_key)+'</strong><span class="tm-consumption-status" data-state="'+esc(r.status)+'">'+state+'</span></div><p class="tm-consumption-option">'+esc(option.title||"Opção registada")+'</p><div class="tm-consumption-macros">'+[['Energia','kcal','kcal'],['Proteína','protein_g','g'],['Hidratos','carbs_g','g'],['Gordura','fat_g','g']].map(([label,key,unit])=>'<div><small>'+label+'</small><strong>'+num(nutrition[key])+' '+unit+'</strong></div>').join("")+'</div>'+(foods?'<details><summary>Alimentos consumidos</summary><ul>'+foods+'</ul></details>':'')+'</article>';
   }).join("");
  }catch(e){root.textContent="Erro ao consultar os registos: "+e.message;}
 }
 window.tmLoadConsumption=load;refresh.addEventListener("click",load);date.addEventListener("change",load);athlete.addEventListener("change",()=>{if(!document.getElementById("consumption-panel").hidden)setTimeout(load,0);});
})();