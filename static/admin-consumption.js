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
 // Backoffice is online-only. Remove any previous player-origin Service Worker
 // registered under this admin hostname so older cached bundles cannot reappear.
 if("serviceWorker" in navigator){
  navigator.serviceWorker.getRegistrations().then(registrations=>
   Promise.all(registrations.filter(r=>new URL(r.scope).origin===location.origin).map(r=>r.unregister()))
  ).catch(()=>{});
 }

 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const numeric=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
 const num=v=>v===null||v===undefined?"—":Number(v).toLocaleString("pt-PT",{maximumFractionDigits:1});
 const kcal=v=>v===null||v===undefined?"—":Math.round(Number(v)).toLocaleString("pt-PT",{maximumFractionDigits:0});
 const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
 const localDate=s=>new Date(s+"T12:00:00");
 const niceDay=s=>localDate(s).toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).replace(/-feira\b/g,"").replace(/\s+de\s+/g," ");
 const today=()=>iso(new Date());
 if(!date.value)date.value=today();
 let requestNumber=0;
 let libraryNames=null,libraryTask=null;
 function libraryLookup(){
  if(libraryNames)return Promise.resolve(libraryNames);
  if(!libraryTask)libraryTask=fetch("/api/v2/food-library",{credentials:"same-origin"}).then(r=>{if(!r.ok)throw Error("biblioteca indisponível");return r.json();}).then(data=>{
   libraryNames=new Map((data.foods||[]).map(f=>[String(f.id),f.display_name||f.name_pt||f.name||""]).filter(x=>x[1]));return libraryNames;
  }).catch(()=>{libraryTask=null;return null;});
  return libraryTask;
 }
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
 // In-page calendar: unlike the native picker, this always closes on toggle, outside click or Escape.
 const picker=document.createElement("div");picker.className="tm-record-date-popover";picker.hidden=true;
 picker.setAttribute("role","dialog");picker.setAttribute("aria-label","Escolher dia");panel.appendChild(picker);
 let shownMonth=null;
 function closeCalendar(){picker.hidden=true;if(calendarButton)calendarButton.setAttribute("aria-expanded","false");}
 function drawCalendar(){
  const d=shownMonth||localDate(date.value||today());shownMonth=new Date(d.getFullYear(),d.getMonth(),1);
  const year=d.getFullYear(),month=d.getMonth(),start=(new Date(year,month,1).getDay()+6)%7;
  const days=new Date(year,month+1,0).getDate();
  const title=d.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});
  picker.innerHTML='<div class="tm-record-picker-top"><button type="button" data-move="-1" aria-label="Mês anterior">‹</button><strong>'+esc(title)+'</strong><button type="button" data-move="1" aria-label="Mês seguinte">›</button><button type="button" data-close="1" aria-label="Fechar calendário">×</button></div><div class="tm-record-picker-grid">'+
   ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=>'<span class="tm-record-weekday">'+x+'</span>').join("")+
   Array.from({length:start},()=>'<span></span>').join("")+
   Array.from({length:days},(_,i)=>{const n=i+1;const v=year+"-"+String(month+1).padStart(2,"0")+"-"+String(n).padStart(2,"0");return '<button type="button" data-day="'+v+'"'+(v===date.value?' class="is-selected" aria-current="date"':'')+'>'+n+'</button>';}).join("")+
   '</div>';
  const rect=calendarButton.getBoundingClientRect();
  const width=Math.min(310,window.innerWidth-24);
  picker.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+"px";
  picker.style.top=Math.min(rect.bottom+7,window.innerHeight-310)+"px";
 }
 if(calendarButton){
  calendarButton.setAttribute("aria-expanded","false");
  calendarButton.setAttribute("aria-haspopup","dialog");
  calendarButton.addEventListener("click",()=>{if(!picker.hidden){closeCalendar();return;}shownMonth=localDate(date.value||today());drawCalendar();picker.hidden=false;calendarButton.setAttribute("aria-expanded","true");});
 }
 picker.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.close){closeCalendar();return;}
  if(b.dataset.move){shownMonth=new Date(shownMonth.getFullYear(),shownMonth.getMonth()+Number(b.dataset.move),1);drawCalendar();return;}
  if(b.dataset.day){date.value=b.dataset.day;updateDate();closeCalendar();load();}
 });
 document.addEventListener("pointerdown",e=>{if(!picker.hidden&&!picker.contains(e.target)&&!calendarButton.contains(e.target))closeCalendar();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCalendar();});

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
 function foodName(f){return f.display_name||f.library_name||f.name||f.food_name||f.name_pt||libraryNames?.get(String(f.id??f.food_id??""))||"";}
 function foodId(f){
  if(f.id!=null)return "id:"+String(f.id);
  if(f.food_id!=null)return "id:"+String(f.food_id);
  const n=foodName(f).trim().toLocaleLowerCase("pt-PT");
  return n?"name:"+n:null;
 }
 function foodGrams(f){const g=Number(f.grams);return f.grams!=null&&Number.isFinite(g)&&g>=0?g:null;}
 function changes(record){
  const original=record.prescription?.option?.foods;
  const consumed=record.consumed_foods;
  if(!Array.isArray(original)||!Array.isArray(consumed))return null;
  // The saved option_index is the reliable link to the published option.
  // Foods with alternative_to belong to one equivalence group: only the
  // selected member should be compared, never every available alternative.
  const groups=new Map(),indexToGroup=new Map();
  for(let i=0;i<original.length;i++){
   const f=original[i];
   if(!f||typeof f!=="object")return null;
   if(f.kind==="supplement")continue;
   const parent=f.alternative_to==null?i:Number(f.alternative_to);
   if(!Number.isInteger(parent)||parent<0||parent>=original.length)return null;
   if(parent!==i&&original[parent]?.alternative_to!=null)return null;
   if(!groups.has(parent))groups.set(parent,[]);
   groups.get(parent).push(i);indexToGroup.set(i,parent);
  }
  const selected=new Map(),extras=[];
  for(const food of consumed){
   if(!food||typeof food!=="object")return null;
   const grams=foodGrams(food);
   if(grams===null)return null;
   const isAdditional=food.additional===true;
   let index=null;
   if(!isAdditional&&food.option_index!=null){
    index=Number(food.option_index);
    if(!Number.isInteger(index)||!indexToGroup.has(index))return null;
   }else if(!isAdditional){
    // Backward compatibility with records saved before option_index.
    const identity=foodId(food);
    const matches=original.map((f,i)=>({f,i})).filter(({f,i})=>indexToGroup.has(i)&&foodId(f)===identity);
    if(matches.length!==1)return null;
    index=matches[0].i;
   }
   if(index===null){extras.push(food);continue;}
   const group=indexToGroup.get(index);
   if(selected.has(group))return null;
   selected.set(group,{index,food,grams});
  }
  const result=[];
  for(const [group,members] of groups){
   const base=original[members[0]];
   const actual=selected.get(group);
   if(!actual){
    const grams=foodGrams(base);
    if(grams===null)return null;
    result.push({name:foodName(base),before:grams,after:null,type:"removed",group});
    continue;
   }
   const planned=original[actual.index];
   const before=foodGrams(planned);
   if(before===null)return null;
   if(actual.index!==members[0]){
    result.push({name:foodName(actual.food)||foodName(planned),before:null,after:actual.grams,type:"substituted",index:actual.index,group});
   }
   if(Math.abs(before-actual.grams)>.01){
    result.push({name:foodName(actual.food)||foodName(planned),before,after:actual.grams,type:"edited",index:actual.index,group});
   }
  }
  for(const food of extras)result.push({name:foodName(food),before:null,after:foodGrams(food),type:"added",id:foodId(food)});
  return result;
 }
 function displayStatus(record,diffs){
  if(record.status==="none")return "none";
  if(record.status==="all")return "all";
  if(record.status!=="partial"||diffs===null)return record.status;
  // A positive portion change (or a substitution/addition) is not partial
  // consumption. A missing food or a smaller consumed portion is partial.
  return diffs.some(change=>change.type==="removed"||
   (change.type==="edited"&&change.after<change.before-.01))?"partial":"all";
 }
 function metric(k,n){return n&&numeric(n[k])!==null?(k==="kcal"?kcal(n[k]):num(n[k])):"—";}
 function progressCircle(key,consumed,planned,index){
  const palette=["#65dfae","#47b7f5","#ff9872","#eed072"];
  const ratio=planned&&planned[key]>0?Math.max(0,Math.min(1,consumed[key]/planned[key])):0;
  const radius=72-index*15;
  const circumference=2*Math.PI*radius;
  return '<circle class="tm-record-arc-track" cx="94" cy="94" r="'+radius+'"/>'+
    '<circle class="tm-record-arc-fill" cx="94" cy="94" r="'+radius+'" stroke="'+palette[index]+'" stroke-dasharray="'+circumference.toFixed(2)+'" stroke-dashoffset="'+(circumference*(1-ratio)).toFixed(2)+'"/>';
 }
 function summary(records,microcycle){
  const consumed=Object.fromEntries(keys.map(([k])=>[k,0]));
  for(const record of records){
   const n=values(record.nutrition);
   if(n)for(const [k] of keys)consumed[k]+=n[k];
  }
  // Preserve the existing Microciclos goal and its option-average policy unchanged.
  const planned=microcycle?.state==="complete"?values(microcycle.nutrition):null;
  const changed=records.filter(r=>{const diff=changes(r);return displayStatus(r,diff)==="partial"||(diff?.length>0);}).length;
  const rings='<svg viewBox="0 0 188 188" role="img" aria-label="Progresso de energia, proteína, hidratos e gordura" class="tm-record-four-rings">'+
   keys.map(([key],i)=>progressCircle(key,consumed,planned,i)).join("")+'</svg>';
  const kcalTotal=planned?kcal(planned.kcal):"—";
  const metric=(key,label,color)=>{
   const value=kcal(consumed[key]),goal=planned?kcal(planned[key]):"—";
   return '<div class="tm-record-macro-row" data-nutrient="'+key+'"><span>'+label+'</span><strong><span class="tm-record-macro-consumed" style="color:'+color+'">'+value+'</span> <span class="tm-record-goal">/ '+goal+' g</span></strong></div>';
  };
  return '<section class="tm-record-overview" aria-label="Resumo nutricional dos registos do dia">'+
   '<div class="tm-record-rings">'+rings+'</div>'+
   '<div class="tm-record-overview-content">'+
    '<div class="tm-record-kcal-group">'+
    '<div class="tm-record-overview-top"><h3>Resumo nutricional</h3><span class="tm-record-consumed-tag">Consumido</span></div>'+
    '<div class="tm-record-kcal-caption">kcal</div>'+
    '<div class="tm-record-kcal-value"><strong>'+kcal(consumed.kcal)+'</strong><span> / '+kcalTotal+'</span></div>'+
    '<div class="tm-record-counts"><span>'+records.length+' '+(records.length===1?'refeição registada':'refeições registadas')+'</span>'+
    (changed?'<span>'+changed+' com alterações ou consumo parcial</span>':'')+'</div>'+
    '</div>'+
    '<div class="tm-record-macros">'+
     metric("protein_g","Proteína","#47b7f5")+
     metric("carbs_g","Hidratos","#ff9872")+
     metric("fat_g","Gordura","#d9b751")+
    '</div>'+
   '</div>'+
  '</section>';
 }
 function optionLabel(r,microcycle){
  const option=r.prescription?.option||{};
  const name=String(option.title||"").trim();
  const savedIndex=[r.option_index,r.prescription?.option_index,r.prescription?.selected_option_index,option.option_index,option.number].find(v=>Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=30&&v!=null);
  let index=savedIndex==null?null:Number(savedIndex);
  const choices=r.event_id?(microcycle?.peri_events||[]).find(e=>e.event_id===r.event_id&&e.phase===r.meal_key)?.options:microcycle?.meals?.[r.meal_key]?.options;
  if(Array.isArray(choices)&&choices.length){
   const ref=String(r.option_ref||r.prescription?.option_ref||option.option_ref||"");
   const match=ref?choices.findIndex(o=>o.option_ref===ref):-1;
   if(match>=0)index=match+1;
   else if(index==null&&name){
    const matches=choices.map((o,i)=>({i,title:String(o.title||"").trim()})).filter(o=>o.title&&o.title===name);
    if(matches.length===1)index=matches[0].i+1;
   }
  }
  const prefix=name.match(/^Op(?:ç|c)(?:ã|a)o\s+(\d+)\b/i);
  if(index==null&&prefix)index=Number(prefix[1]);
  if(index==null)return name;
  const start="Opção "+index;
  const cleanTitle=name.replace(/^Op(?:ç|c)(?:ã|a)o\s+\d+\s*[-–—:]?\s*/i,"").trim();
  return cleanTitle?start+" - "+cleanTitle:start;
 }
 function foodDetails(r){
  const foods=Array.isArray(r.consumed_foods)?r.consumed_foods:[];
  const diffs=changes(r);
  const rows=[];
  // Always show foods actually consumed in partial / edited meals.
  for(const food of foods){
   const matching=diffs?.find(x=>x.type==="edited"&&x.index===Number(food.option_index))||
    diffs?.find(x=>x.type==="added"&&x.id===foodId(food))||
    diffs?.find(x=>x.type==="substituted"&&x.index===Number(food.option_index));
   const grams=foodGrams(food);
   const quantity=matching?.type==="edited"?num(matching.before)+" g → "+num(matching.after)+" g":
     grams!==null?num(grams)+" g":"—";
   const badge=matching?'<span class="tm-record-change" data-kind="'+matching.type+'">'+(matching.type==="added"?"Adicionado":matching.type==="substituted"?"Alternativa escolhida":"Quantidade alterada")+'</span>':'<span class="tm-record-change" data-kind="consumed">Consumido</span>';
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
 function card(r,microcycle){
  const diff=changes(r),shownStatus=displayStatus(r,diff);
  const status={all:"Consumido",partial:"Parcial",none:"Não consumido"}[shownStatus]||"Registado";
  const changed=diff&&diff.length>0;
  const showDetails=shownStatus!=="all"||changed;
  const option=r.prescription?.option||{};
  const taken=values(r.nutrition);
  const reference=exactPlan(r);
  const badges='<span class="tm-consumption-status" data-state="'+esc(shownStatus)+'">'+status+'</span>'+(changed?'<span class="tm-record-edited">Alterações</span>':'');
  const headline='<div class="tm-record-meal-title"><strong>'+esc(names[r.meal_key]||r.meal_key||"Refeição")+'</strong><span>'+esc(optionLabel(r,microcycle))+'</span></div>';
  const mini='<span class="tm-record-mini"> '+(taken?kcal(taken.kcal)+" kcal":"—")+(reference?" / "+kcal(reference.kcal)+" kcal planeadas":"")+'</span>';
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
   if(records.some(r=>(r.consumed_foods||[]).some(f=>!foodName(f))))await libraryLookup();
   if(seq!==requestNumber||panel.hidden||!athlete.value||date.value!==day)return;
   if(!records.length){root.innerHTML='<p class="tm-consumption-empty">Sem registos</p>';return;}
   root.innerHTML=summary(records,plannedData?.live_food_plans?.days?.[day])+'<section class="tm-record-meals" aria-label="Refeições registadas"><h3>Refeições</h3>'+records.map(r=>card(r,plannedData?.live_food_plans?.days?.[day])).join("")+'</section>';
  }catch(e){if(seq===requestNumber)root.textContent="Erro ao consultar os registos: "+e.message;}
 }
 window.tmLoadConsumption=load;
 athlete.addEventListener("change",()=>{requestNumber++;if(!panel.hidden)load();});
})();