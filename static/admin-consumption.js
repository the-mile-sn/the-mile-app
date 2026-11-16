"use strict";
(function(){
 const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia",game:"Jogo"};
 const order=["breakfast","lunch","snack","dinner","supper","game"];
 const keys=[["kcal","Energia","kcal"],["protein_g","Proteína","g"],["carbs_g","Hidratos","g"],["fat_g","Gordura","g"]];
 const panel=document.getElementById("consumption-panel");
 const root=document.getElementById("consumption-results");
 const date=document.getElementById("consumption-date");
 const athlete=document.getElementById("athlete");
 const prev=document.getElementById("consumption-prev");
 const next=document.getElementById("consumption-next");
 const todayButton=document.getElementById("consumption-today");
 const dateLabel=document.getElementById("consumption-date-label");
 const calendarButton=document.getElementById("consumption-date-edit");
 if(!panel||!root||!date||!athlete)return;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const numeric=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
 const num=v=>v===null||v===undefined?"—":Number(v).toLocaleString("pt-PT",{maximumFractionDigits:1});
 const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
 const localDate=s=>new Date(s+"T12:00:00");
 const niceDay=s=>localDate(s).toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
 const today=()=>iso(new Date());
 if(!date.value)date.value=today();
 let requestNumber=0;
 function updateDate(){
  if(dateLabel)dateLabel.textContent=date.value?niceDay(date.value):"Selecionar dia";
 }
 function moveDay(delta){
  const d=localDate(date.value||today());
  d.setDate(d.getDate()+delta);
  date.value=iso(d);updateDate();load();
 }
 if(prev)prev.addEventListener("click",()=>moveDay(-1));
 if(next)next.addEventListener("click",()=>moveDay(1));
 if(todayButton)todayButton.addEventListener("click",()=>{date.value=today();updateDate();load();});
 date.addEventListener("change",()=>{updateDate();load();});
 if(calendarButton)calendarButton.addEventListener("click",()=>{
  if(typeof date.showPicker==="function"){try{date.showPicker();return;}catch(_e){}}
  date.focus();date.click();
 });
 updateDate();
 function values(n){
  if(!n||typeof n!=="object")return null;
  const result={};
  for(const [k] of keys){const v=numeric(n[k]);if(v===null||v<0)return null;result[k]=v;}
  return result;
 }
 function exactPlan(record){
  const p=record?.prescription||{};
  // Only the stored, explicitly chosen option is a defensible per-meal reference.
  return values(p.option?.totals)||values(p.option?.nutrition)||values(p.selected_option?.totals)||values(p.selected_option?.nutrition)||null;
 }
 function foodName(f){return f.display_name||f.library_name||f.name||f.food_name||"";}
 function foodId(f){
  if(f.id!=null)return "id:"+String(f.id);
  if(f.food_id!=null)return "id:"+String(f.food_id);
  const n=foodName(f).trim().toLocaleLowerCase("pt-PT");
  return n?"name:"+n:null;
 }
 function foodGrams(f){const g=Number(f.grams);return f.grams!=null&&Number.isFinite(g)&&g>=0?g:null;}
 function foodMap(items){
  if(!Array.isArray(items))return null;
  const map=new Map();
  for(const f of items){
   if(!f||typeof f!=="object"||f.alternative_to!=null)return null;
   const key=foodId(f),grams=foodGrams(f);
   if(!key||grams===null||map.has(key))return null;
   map.set(key,{food:f,grams});
  }
  return map;
 }
 function changes(record){
  const original=record.prescription?.option?.foods;
  const planned=foodMap(original),consumed=foodMap(record.consumed_foods);
  if(!planned||!consumed)return null;
  const result=[];
  for(const [id,item] of planned){
   const actual=consumed.get(id);
   if(!actual)result.push({name:foodName(item.food),before:item.grams,after:null,type:"removed"});
   else if(Math.abs(item.grams-actual.grams)>.01)result.push({name:foodName(actual.food),before:item.grams,after:actual.grams,type:"edited"});
  }
  for(const [id,item] of consumed)if(!planned.has(id))result.push({name:foodName(item.food),before:null,after:item.grams,type:"added"});
  return result;
 }
 function metric(k,n){return n&&numeric(n[k])!==null?num(n[k]):"—";}
 function summary(records, microcycle){
  const consumed=Object.fromEntries(keys.map(([k])=>[k,0]));
  for(const record of records){
   const n=values(record.nutrition);
   if(n)for(const [k] of keys)consumed[k]+=n[k];
  }
  const planned=microcycle?.state==="complete"?values(microcycle.nutrition):null;
  const changed=records.filter(r=>r.status==="partial"||(r.status==="all"&&changes(r)?.length>0)).length;
  const ringRatio=planned&&planned.kcal>0?Math.max(0,Math.min(100,consumed.kcal/planned.kcal*100)):null;
  const ringStyle=ringRatio===null?"":' style="--tm-record-progress:'+ringRatio.toFixed(2)+'%"';
  return '<section class="tm-record-overview" aria-label="Resumo nutricional dos registos do dia">'+
    '<div class="tm-record-overview-leading"><div class="tm-record-ring"'+ringStyle+'><span>'+(ringRatio===null?'—':Math.round(consumed.kcal/planned.kcal*100)+'%')+'</span></div>'+
    '<div><h3>Resumo nutricional</h3><p>'+records.length+' '+(records.length===1?'refeição registada':'refeições registadas')+'</p>'+
    (changed?'<span class="tm-record-changes-count">'+changed+' com alterações ou consumo parcial</span>':'')+'</div></div>'+
    '<div class="tm-record-metrics">'+keys.map(([k,label,unit])=>'<div class="tm-record-metric"><span>'+label+'</span><strong>'+num(consumed[k])+' <small>/ '+(planned?num(planned[k]):'—')+' '+unit+'</small></strong></div>').join("")+'</div>'+
    '<p class="tm-record-coverage">Consumido registado / planeado em Microciclos para este dia'+(!planned?' · Planeamento nutricional completo indisponível.':'.')+' O planeamento pode incluir médias de opções equivalentes. Refeições sem registo não são consideradas não consumidas.</p>'+
   '</section>';
 }
 function foodDetails(r){
  const foods=Array.isArray(r.consumed_foods)?r.consumed_foods:[];
  const diffs=changes(r);
  const rows=[];
  // Always show foods actually consumed in partial / edited meals.
  for(const food of foods){
   const matching=diffs?.find(x=>x.name===foodName(food)&&x.type!=="removed");
   const grams=foodGrams(food);
   const quantity=matching?.type==="edited"?num(matching.before)+" g → "+num(matching.after)+" g":
     grams!==null?num(grams)+" g":"—";
   const badge=matching?'<span class="tm-record-change" data-kind="'+matching.type+'">'+(matching.type==="added"?"Adicionado":"Quantidade alterada")+'</span>':"";
   rows.push('<li><span>'+esc(foodName(food)||"Alimento sem nome disponível")+'</span><span>'+esc(quantity)+'</span>'+badge+'</li>');
  }
  // Removed items are not part of the eaten list, but remain visible for review.
  for(const ch of diffs||[]){
   if(ch.type!=="removed")continue;
   rows.push('<li class="tm-record-change-row"><span>'+esc(ch.name)+'</span><span>'+num(ch.before)+' g</span><span class="tm-record-change" data-kind="removed">Removido</span></li>');
  }
  if(!rows.length)return '<p class="tm-record-detail-note">Não existem alimentos detalhados neste registo.</p>';
  return '<div class="tm-record-food-heading">Alimentos consumidos e alterações</div><ul class="tm-record-food-list">'+rows.join("")+'</ul>';
 }
 function card(r){
  const status={all:"Consumido",partial:"Parcial",none:"Não consumido"}[r.status]||"Registado";
  const diff=changes(r),changed=diff&&diff.length>0;
  const showDetails=r.status!=="all"||changed;
  const option=r.prescription?.option||{};
  const taken=values(r.nutrition);
  const reference=exactPlan(r);
  const badges='<span class="tm-consumption-status" data-state="'+esc(r.status)+'">'+status+'</span>'+(changed?'<span class="tm-record-edited">Alterações</span>':'');
  const headline='<div class="tm-record-meal-title"><strong>'+esc(names[r.meal_key]||r.meal_key||"Refeição")+'</strong><span>'+esc(option.title||"")+'</span></div>';
  const mini='<span class="tm-record-mini"> '+(taken?num(taken.kcal)+" kcal":"—")+(reference?" / "+num(reference.kcal)+" kcal planeadas":"")+'</span>';
  if(!showDetails)return '<article class="tm-consumption-card tm-record-compact"><div class="tm-consumption-head">'+headline+'<div class="tm-record-head-right">'+badges+mini+'</div></div></article>';
  return '<details class="tm-consumption-card tm-record-expandable"><summary class="tm-record-card-summary">'+headline+'<div class="tm-record-head-right">'+badges+mini+'<span class="tm-record-chevron" aria-hidden="true">⌄</span></div></summary>'+
    '<div class="tm-record-card-body"><div class="tm-record-meal-metrics">'+keys.map(([k,label,unit])=>'<div><small>'+label+'</small><strong>'+metric(k,taken)+' '+unit+'</strong></div>').join("")+'</div>'+
    (diff===null?'<p class="tm-record-detail-note">As diferenças exatas não podem ser identificadas com segurança neste registo.</p>':'')+
    foodDetails(r)+'</div></details>';
 }
 async function load(){
  const seq=++requestNumber;
  if(panel.hidden||!athlete.value){root.replaceChildren();return;}
  const day=date.value;
  if(!day){root.textContent="Seleciona uma data.";return;}
  root.innerHTML='<p class="tm-record-loading">A carregar registos…</p>';
  try{
   const url="/api/v2/athletes/"+encodeURIComponent(athlete.value)+"/consumption-records?start="+encodeURIComponent(day)+"&end="+encodeURIComponent(day);
   const plannedUrl="/api/v2/athletes/"+encodeURIComponent(athlete.value)+"/calendar?start="+encodeURIComponent(day)+"&end="+encodeURIComponent(day)+"&include_food_plans=1";
   const [response,plannedResponse]=await Promise.all([
    fetch(url,{credentials:"same-origin"}),
    fetch(plannedUrl,{credentials:"same-origin"})
   ]);
   const data=await response.json();
   const plannedData=plannedResponse.ok?await plannedResponse.json():null;
   if(seq!==requestNumber||panel.hidden||!athlete.value||date.value!==day)return;
   if(!response.ok)throw Error(data.error||"Não foi possível consultar os registos.");
   const records=(data.records||[]).filter(r=>r.meal_date===day).sort((a,b)=>order.indexOf(a.meal_key)-order.indexOf(b.meal_key));
   if(!records.length){root.innerHTML='<p class="tm-consumption-empty">Sem registos</p>';return;}
   root.innerHTML=summary(records,plannedData?.live_food_plans?.days?.[day])+'<section class="tm-record-meals" aria-label="Refeições registadas"><h3>Refeições</h3>'+records.map(card).join("")+'</section>';
  }catch(e){if(seq===requestNumber)root.textContent="Erro ao consultar os registos: "+e.message;}
 }
 window.tmLoadConsumption=load;
 athlete.addEventListener("change",()=>{requestNumber++;if(!panel.hidden)load();});
})();