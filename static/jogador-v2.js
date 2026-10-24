"use strict";
const $=id=>document.getElementById(id),names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"},colorNames={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"Verde preparação"};
let playerCsrf='',me=null,plans={},model=[],meals=[],calendarEvents=[],periMeals=[],dayColorOverrides={},weeklyContext=null,day=new Date(),menuWeek=new Date(),selectedColor=null,tab="overview",dishIndex=[],overviewMode="day",weeklySelection=null;
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
function monday(d){const x=new Date(d);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;}
function revokePlayerView(){
 me=null;playerCsrf='';plans={};model=[];meals=[];calendarEvents=[];periMeals=[];dayColorOverrides={};selectedColor=null;
 for(const id of ["day-details","week-strip","plan-colors","plan-detail","menu-days"])$(id).replaceChildren();
 $("player-name").textContent="";$("player-panel").hidden=true;$("login-panel").hidden=false;$("logout").hidden=true;
 $("password").value="";$("status").textContent="Sessão terminada. Inicia sessão novamente.";
}
async function api(path,opts={}){
 const r=await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},...opts});
 const data=await r.json().catch(()=>({}));
 if(!r.ok){
  if((r.status===401||r.status===403)&&path!=="/api/login"&&path!=="/api/logout")revokePlayerView();
  const err=new Error(data.error||data.code||"Pedido indisponível");err.status=r.status;throw err;
 }
 return data;
}
function fmt(v,d=1){return Number(v).toLocaleString("pt-PT",{minimumFractionDigits:d,maximumFractionDigits:d});}
function nutrition(values){const el=document.createElement("span");el.className="macro";for(const [key,prefix,cls,d] of [["kcal","","kcal",0],["protein_g","P ","protein",0],["carbs_g","HC ","carbs",0],["fat_g","G ","fat",0]]){const n=Number(String(values[key]??"").replace(",","."));const span=document.createElement("span");span.className=cls;if(key!=="kcal"){const dot=document.createElement("i");dot.className="macro-dot";dot.setAttribute("aria-hidden","true");span.append(dot);span.setAttribute("aria-label",prefix.trim()+" "+(Number.isFinite(n)?fmt(n,d):"—")+" g");}span.append(document.createTextNode((Number.isFinite(n)?fmt(n,d):"—")+(key==="kcal"?" kcal":" g")));el.append(span);}return el;}
function average(options){if(!options.length)return null;const out={kcal:0,protein_g:0,carbs_g:0,fat_g:0};for(const o of options){if(!o.totals)return null;for(const k in out){const n=Number(String(o.totals[k]??"").replace(",","."));if(!Number.isFinite(n))return null;out[k]+=n/options.length;}}return out;}
function optionEl(o,i,planView=false){
 const details=document.createElement("details"),summary=document.createElement("summary"),line=document.createElement("div");
 line.className="option"+(planView?"":" day-option");
 const label=document.createElement("span");label.className="plan-option-label";
 const number=document.createElement("small");number.textContent="Opção "+(o.number||i+1);label.append(number);
 if(o.title){const name=document.createElement("strong");name.textContent=o.title;label.append(name);}
 line.append(label);summary.append(line);details.append(summary);
 if(o.totals){const value=document.createElement("div");value.className="option-expanded-macros";value.append(nutrition(o.totals));details.append(value);}
 for(const food of o.items||[]){const p=document.createElement("div");p.className="foods";p.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";details.append(p);}
 return details;
}

async function session(){const sessionData=await api("/api/me");playerCsrf=sessionData.csrf||"";const r=await api("/api/v2/player/me");me=r.player;$("player-name").textContent=me.name;const p=await api("/api/v2/player/plans");plans=p.options_by_color;$("login-panel").hidden=true;$("player-panel").hidden=false;$("logout").hidden=false;await show(tab);}
async function show(t){tab=t;for(const key of ["overview","plans","menus"])$(key).hidden=key!==t;for(const b of document.querySelectorAll("[data-tab]"))b.setAttribute("aria-pressed",String(b.dataset.tab===t));if(t==="overview")await overview();if(t==="plans")renderPlans();if(t==="menus")await menusView();}

function assignedColor(date,meal,classification){
 const own=dayColorOverrides[date+"|"+meal];
 if(own)return own;
 return model.find(c=>c.name===classification)?.meals?.[meal]||null;
}
function weeklyDayTotal(entry){
 const cls=model.find(x=>x.name===entry?.classification);
 const total={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let count=0;
 for(const meal of meals){const color=assignedColor(entry?.date,meal,entry?.classification);if(!color)continue;count++;
  const avg=average(plans[color]?.[meal]||[]);if(!avg)return null;
  for(const k in total)total[k]+=avg[k];
 }
 for(const item of periMeals.filter(x=>x.event_date===entry?.date)){const avg=average(item.options||[]);if(!avg)return null;count++;for(const k in total)total[k]+=avg[k];}
 return count?total:null;
}
function weeklySummary(data){
 const summary=document.createElement("section");summary.className="daily-nutrition";const grid=document.createElement("div");grid.className="daily-nutrition-grid";
 for(const [k,label,unit,cls] of [["kcal","Energia","kcal","kcal"],["protein_g","Proteína","g","protein"],["carbs_g","Hidratos","g","carbs"],["fat_g","Gordura","g","fat"]]){
  const card=document.createElement("div");card.className="daily-nutrition-card";
  const name=document.createElement("small");name.textContent=label;const n=document.createElement("strong");n.className=cls;n.textContent=fmt(data[k],0)+" "+unit;card.append(name,n);
  const w=Number(me?.weight_kg);if(w>0&&Number.isFinite(w)){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(data[k]/w,1)+(k==="kcal"?" kcal/kg":" g/kg");card.append(ratio);}
  grid.append(card);
 }
 summary.append(grid);return summary;
}
function renderWeekly(mon,r,weekMenus=[]){
 weeklyContext={mon,r,weekMenus};
 const root=$("weekly-view");root.replaceChildren();
 const nav=document.createElement("div");nav.className="weekly-date-nav";
 const prev=document.createElement("button");prev.type="button";prev.textContent="‹";prev.setAttribute("aria-label","Semana anterior");

 const next=document.createElement("button");next.type="button";next.textContent="›";next.setAttribute("aria-label","Semana seguinte");
 prev.onclick=()=>{day.setDate(day.getDate()-7);weeklySelection=null;overview().catch(error);};
 next.onclick=()=>{day.setDate(day.getDate()+7);weeklySelection=null;overview().catch(error);};
 nav.append(prev,next);root.append(nav);
 const grid=document.createElement("div");grid.className="weekly-calendar-grid";root.append(grid);
 const dates=[],classes=[],totals=[];
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);const key=iso(dt),entry=r.days.find(x=>x.date===key);
  dates.push(key);classes.push(model.find(c=>c.name===entry?.classification));totals.push(weeklyDayTotal(entry));
  const header=document.createElement("button");header.type="button";header.className="weekly-day-header";header.setAttribute("aria-label","Abrir vista diária: "+dt.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"}));
  for(const [cls,val] of [["weekday",dt.toLocaleDateString("pt-PT",{weekday:"short"}).replace(".","")],["number",String(dt.getDate())],["classification",entry?.classification||"—"]]){
   const span=document.createElement("span");span.className=cls;span.textContent=val;header.append(span);
  }
  header.onclick=()=>{day=dt;overviewMode="day";weeklySelection=null;overview().catch(error);};if(key===iso(new Date()))header.classList.add("today");grid.append(header);
 }
 for(const meal of meals){
  if(meal==="lunch")appendWeeklyEvents(grid,dates,"morning");
  if(meal==="dinner")appendWeeklyEvents(grid,dates,"afternoon");
  for(let i=0;i<7;i++){
   const color=assignedColor(dates[i],meal,r.days.find(e=>e.date===dates[i])?.classification),avg=color?average(plans[color]?.[meal]||[]):null;
   if(!color){const empty=document.createElement("div");empty.className="weekly-empty";grid.append(empty);continue;}
   const active=weeklySelection?.date===dates[i]&&weeklySelection?.meal===meal;
   const b=document.createElement("button");b.type="button";b.className="weekly-meal tone-"+color+(active?" is-active":"");
   const label=document.createElement("span");label.className="weekly-meal-name";label.textContent=meal==="breakfast"?"PA":names[meal]||meal;b.append(label);
   if(avg){const value=document.createElement("span");value.className="weekly-meal-kcal";value.textContent=fmt(avg.kcal,0);b.append(value);}
   b.setAttribute("aria-label",(names[meal]||meal)+" "+dates[i]+" — abrir opções");b.setAttribute("aria-pressed",String(active));
   b.onclick=()=>{weeklySelection=active?null:{date:dates[i],meal,color};renderWeekly(mon,r,weekMenus);};grid.append(b);
  }
 }
 for(let i=0;i<7;i++){
  const box=document.createElement("div");box.className="weekly-day-total";const total=totals[i];
  if(!total){box.textContent="—";grid.append(box);continue;}
  const energy=document.createElement("div");energy.className="weekly-total-kcal";energy.textContent=fmt(total.kcal,0);box.append(energy);
  const line=document.createElement("div");line.className="weekly-total-macros";
  for(const k of ["protein_g","carbs_g","fat_g"]){const v=document.createElement("span");v.className=k==="protein_g"?"protein":k==="carbs_g"?"carbs":"fat";v.textContent=fmt(total[k],0);line.append(v);}
  box.append(line);grid.append(box);
 }
 const detail=document.createElement("div");detail.id="weekly-selection-detail";root.append(detail);
 if(weeklySelection&&!weeklySelection.periEventId&&dates.includes(weeklySelection.date)){
  const {date,meal,color}=weeklySelection;
  const section=document.createElement("section");section.className="weekly-detail tone-"+color;
  const dayData=r.days.find(x=>x.date===date);
  const top=document.createElement("div");top.className="weekly-detail-heading";
  const caption=document.createElement("small");caption.textContent=new Date(date+"T12:00:00").toLocaleDateString("pt-PT",{weekday:"short",day:"2-digit",month:"2-digit"}).replace(".","")+" · "+(dayData?.classification||"—");
  const title=document.createElement("strong");title.textContent=names[meal]||meal;
  const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","Fechar refeição");close.onclick=()=>{weeklySelection=null;renderWeekly(mon,r,weekMenus);};
  const titleGroup=document.createElement("div");titleGroup.className="weekly-detail-titles";titleGroup.append(caption,title);top.append(titleGroup,close);section.append(top);
  const options=plans[color]?.[meal]||[],avg=average(options);
  if(avg){const line=document.createElement("div");line.className="weekly-meal-average";line.append(nutrition(avg));section.append(line);}
  if(meal==="lunch"||meal==="dinner"){
   const menu=weekMenus.find(x=>x.menu_date===date&&x.meal===meal);
   if(menu){const line=document.createElement("div");line.className="weekly-menu-line";line.textContent=menu.value;section.append(line);}
  }
  if(!options.length){const note=document.createElement("p");note.className="hint";note.textContent="Plano ainda não publicado.";section.append(note);}
  else if(options.length===1){
   for(const food of options[0].items||[]){const p=document.createElement("div");p.className="foods";p.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";section.append(p);}
  }else options.forEach((o,i)=>{const item=optionEl(o,i,true);item.classList.add("weekly-option-card");section.append(item);});
  detail.append(section);
 }
 if(weeklySelection?.periEventId&&dates.includes(weeklySelection.date)){
   const item=periMeals.find(x=>x.event_id===weeklySelection.periEventId&&x.phase===weeklySelection.phase&&x.event_date===weeklySelection.date);
   if(item){
    const section=document.createElement("section");section.className="weekly-detail peri-weekly-detail";
    const top=document.createElement("div");top.className="weekly-detail-heading";
    const caption=document.createElement("small");caption.textContent=new Date(item.event_date+"T12:00:00").toLocaleDateString("pt-PT",{weekday:"short",day:"2-digit",month:"2-digit"});
    const title=document.createElement("strong");title.textContent=item.title;
    const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","Fechar refeição");close.onclick=()=>{weeklySelection=null;renderWeekly(mon,r,weekMenus);};
    const group=document.createElement("div");group.className="weekly-detail-titles";group.append(caption,title);top.append(group,close);section.append(top);
    const opts=item.options||[],avg=average(opts);
    if(avg){const line=document.createElement("div");line.className="weekly-meal-average";line.append(nutrition(avg));section.append(line);}
    if(opts.length===1){for(const food of opts[0].items||[]){const line=document.createElement("div");line.className="foods";line.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";section.append(line);}}
    else opts.forEach((option,index)=>{const card=optionEl(option,index,true);card.classList.add("weekly-option-card");section.append(card);});
    detail.append(section);
   }
  }
  const heading=document.createElement("div");heading.className="weekly-summary-heading";const h=document.createElement("h2");h.textContent="Resumo semanal";const sub=document.createElement("small");sub.textContent="Média diária";heading.append(h,sub);root.append(heading);
 const valid=totals.filter(Boolean);
 if(!valid.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem dados publicados para calcular a média desta semana.";root.append(p);}
 else{const avg={kcal:0,protein_g:0,carbs_g:0,fat_g:0};for(const t of valid)for(const k in avg)avg[k]+=t[k]/valid.length;root.append(weeklySummary(avg));}
}


function makePeriCard(item,compact=false){
 const opts=item.options||[],avg=average(opts);
 const section=document.createElement(compact?"button":"details");section.className=compact?"weekly-peri-card":"meal daily-meal peri-meal";
 if(compact){
  section.type="button";
  const active=weeklySelection?.periEventId===item.event_id&&weeklySelection?.phase===item.phase&&weeklySelection?.date===item.event_date;
  section.setAttribute("aria-pressed",String(active));
  section.onclick=()=>{
    weeklySelection=active?null:{date:item.event_date,periEventId:item.event_id,phase:item.phase};
    if(weeklyContext)renderWeekly(weeklyContext.mon,weeklyContext.r,weeklyContext.weekMenus);
  };
  const title=document.createElement("span");title.textContent=item.title;
  section.append(title);
  if(avg){const kcal=document.createElement("span");kcal.textContent=fmt(avg.kcal,0)+" kcal";section.append(kcal);}
  return section;
 }
 const head=document.createElement("summary");head.className="daily-meal-head";
 const title=document.createElement("strong");title.textContent=item.title;head.append(title);
 if(avg){const nutritionSummary=document.createElement("span");nutritionSummary.className="meal-average meal-average-inline";nutritionSummary.append(nutrition(avg));head.append(nutritionSummary);}
 section.append(head);
 if(opts.length===1){for(const food of opts[0].items||[]){const p=document.createElement("div");p.className="foods";p.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";section.append(p);}}
 else opts.forEach((option,index)=>section.append(optionEl(option,index)));
 return section;
}
function eventCard(event,compact=false){
 const section=document.createElement("div");section.className=compact?"weekly-event-card":"daily-event-card";
 const label=document.createElement("span");label.textContent=event.title;section.append(label);
 if(!compact&&event.kind!=="match"&&event.event_date>=iso(new Date())){
   const toggle=document.createElement("button");toggle.type="button";toggle.textContent="Alterar";toggle.className="daily-event-edit";
   const editor=document.createElement("div");editor.hidden=true;editor.className="daily-event-editor";
   const date=document.createElement("input");date.type="date";date.value=event.event_date;date.setAttribute("aria-label","Data");
   const session=document.createElement("select");session.setAttribute("aria-label","Período");
   for(const [val,text] of [["morning","Manhã"],["afternoon","Tarde"]]){
     const option=document.createElement("option");option.value=val;option.textContent=text;session.append(option);
   }session.value=event.session;
   const save=document.createElement("button");save.type="button";save.textContent="Guardar";
   const warning=document.createElement("small");
   toggle.onclick=()=>{editor.hidden=!editor.hidden;};
   save.onclick=async()=>{
     save.disabled=true;warning.textContent="";
     try{
       await api("/api/v2/player/events/"+encodeURIComponent(event.id),{method:"PUT",
         headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},
         body:JSON.stringify({event_date:date.value,session:session.value})});
       await overview();
     }catch(e){warning.textContent=e.message;save.disabled=false;}
   };
   editor.append(date,session,save,warning);
   section.append(toggle,editor);
 }
 return section;
}
function appendDailyEvents(host,date,session){
 for(const event of calendarEvents.filter(e=>e.event_date===date&&e.session===session)){
  const associated=periMeals.filter(p=>p.event_id===event.id&&p.event_date===date);
  for(const item of associated.filter(p=>p.phase==="pre"))host.append(makePeriCard(item));
  host.append(eventCard(event));
  for(const item of associated.filter(p=>p.phase==="post"))host.append(makePeriCard(item));
 }
}
function appendWeeklyEvents(host,dates,session){
 if(!calendarEvents.some(e=>dates.includes(e.event_date)&&e.session===session))return;
 for(const date of dates){
  const slot=document.createElement("div");slot.className="weekly-event-slot";
  for(const event of calendarEvents.filter(e=>e.event_date===date&&e.session===session)){
   const associated=periMeals.filter(p=>p.event_id===event.id&&p.event_date===date);
   for(const item of associated.filter(p=>p.phase==="pre"))slot.append(makePeriCard(item,true));
   slot.append(eventCard(event,true));
   for(const item of associated.filter(p=>p.phase==="post"))slot.append(makePeriCard(item,true));
  }
  host.append(slot);
 }
}

async function overview(){
 const d=iso(day),mon=monday(day),end=new Date(mon);end.setDate(mon.getDate()+6);
 const r=await api("/api/v2/player/calendar?start="+iso(mon)+"&end="+iso(end));
 model=r.classifications;meals=r.meals;dayColorOverrides=Object.fromEntries((r.meal_color_overrides||[]).map(e=>[e.meal_date+"|"+e.meal,e.color]));periMeals=r.peri_meals||[];calendarEvents=(r.events||[]).concat((r.matches||[]).map(m=>({id:m.id,event_date:m.match_date,kind:"match",session:!m.match_time||m.match_time<"15:00"?"morning":"afternoon",title:"Jogo"})));
 const isWeek=overviewMode==="week";
 for(const b of document.querySelectorAll("#overview-mode button"))b.setAttribute("aria-pressed",String(b.dataset.view===overviewMode));
 $("week-strip").hidden=isWeek;$("date-title").hidden=isWeek;$("day-details").hidden=isWeek;$("weekly-view").hidden=!isWeek;
 if(isWeek){const weekMenus=await api("/api/v2/player/menus?start="+iso(mon)+"&end="+iso(end));renderWeekly(mon,r,weekMenus.menus||[]);return;}
 const menus=await api("/api/v2/player/menus?start="+d+"&end="+d);
 $("date-title").textContent=day.toLocaleDateString("pt-PT",{weekday:"short",day:"numeric",month:"numeric",year:"numeric"});
 const strip=$("week-strip");strip.replaceChildren();
 const prev=document.createElement("button");prev.type="button";prev.className="week-arrow";prev.textContent="‹";prev.setAttribute("aria-label","Dia anterior");prev.onclick=()=>{day.setDate(day.getDate()-1);overview().catch(error);};strip.append(prev);
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);
  const dayInfo=r.days.find(x=>x.date===iso(dt));
  const button=document.createElement("button");button.type="button";button.className="week-day"+(iso(dt)===d?" selected":"")+(iso(dt)===iso(new Date())?" today":"");
  button.setAttribute("aria-pressed",String(iso(dt)===d));
  button.setAttribute("aria-label",dt.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"})+(dayInfo?.classification?" · "+dayInfo.classification:""));
  for(const [cls,text] of [["weekday",dt.toLocaleDateString("pt-PT",{weekday:"short"}).replace(".","")],["day-number",String(dt.getDate())],["day-classification",dayInfo?.classification||"—"]]){
   const span=document.createElement("span");span.className=cls;span.textContent=text;button.append(span);
  }
  button.onclick=()=>{day=dt;overview().catch(error);};strip.append(button);
 }
 const next=document.createElement("button");next.type="button";next.className="week-arrow";next.textContent="›";next.setAttribute("aria-label","Dia seguinte");next.onclick=()=>{day.setDate(day.getDate()+1);overview().catch(error);};strip.append(next);
 const root=$("day-details");root.replaceChildren();
 const entry=r.days.find(x=>x.date===d);
 if(!entry?.classification&&!calendarEvents.some(e=>e.event_date===d)){root.textContent="Sem programação definida para este dia.";return;}
 const cls=model.find(c=>c.name===entry?.classification);const heading=document.createElement("h2");heading.textContent=entry?.classification||"Atividades";root.append(heading);
 const total={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let complete=true,assigned=0;
 for(const meal of meals){const color=assignedColor(d,meal,entry?.classification);if(!color)continue;assigned++;const avg=average(plans[color]?.[meal]||[]);if(!avg){complete=false;continue;}for(const key in total)total[key]+=avg[key];}
 for(const item of periMeals.filter(x=>x.event_date===d)){assigned++;const avg=average(item.options||[]);if(!avg){complete=false;continue;}for(const key in total)total[key]+=avg[key];}
 if(assigned){const summary=document.createElement("section");summary.className="daily-nutrition";if(complete){const grid=document.createElement("div");grid.className="daily-nutrition-grid";for(const [key,label,unit,digits,css] of [["kcal","Energia","kcal",0,"kcal"],["protein_g","Proteína","g",0,"protein"],["carbs_g","Hidratos","g",0,"carbs"],["fat_g","Gordura","g",0,"fat"]]){const card=document.createElement("div");card.className="daily-nutrition-card";const name=document.createElement("small");name.textContent=label;const value=document.createElement("strong");value.className=css;value.textContent=fmt(total[key],digits)+" "+unit;card.append(name,value);const weight=Number(me?.weight_kg);if(Number.isFinite(weight)&&weight>0){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(total[key]/weight,1)+(key==="kcal"?" kcal/kg":" g/kg");card.append(ratio);}grid.append(card);}summary.append(grid);}else{const note=document.createElement("p");note.className="hint";note.textContent="Resumo incompleto: existem refeições sem plano publicado.";summary.append(note);}root.append(summary);}
 for(const meal of meals){
  if(meal==="lunch")appendDailyEvents(root,d,"morning");
  if(meal==="dinner")appendDailyEvents(root,d,"afternoon");
  const color=assignedColor(d,meal,entry?.classification),menu=(meal==="lunch"||meal==="dinner")?menus.menus.find(x=>x.meal===meal):null;
  if(!color&&!menu)continue;
  const section=document.createElement("details");section.className="meal daily-meal"+(color?" tone-"+color:"");
  const head=document.createElement("summary");head.className="daily-meal-head";const title=document.createElement("strong");title.textContent=names[meal];head.append(title);
  if(color){const indicator=document.createElement("span");indicator.className="daily-meal-indicator "+color;indicator.setAttribute("aria-label",colorNames[color]||color);head.append(indicator);}
  section.append(head);
  if(color||menu){
   const options=plans[color]?.[meal]||[];
   const avg=average(options);
   if(avg){const p=document.createElement("span");p.className="meal-average meal-average-inline";p.append(nutrition(avg));head.append(p);}
   if(menu){const p=document.createElement("div");p.className="menu-line meal-menu-card";p.textContent=menu.value;section.append(p);}
   if(color&&!options.length){const p=document.createElement("p");p.className="hint";p.textContent="Plano ainda não publicado.";section.append(p);}
   if(options.length===1){
    const single=options[0],body=document.createElement("div");body.className="single-meal-option";
    for(const food of single.items||[]){const p=document.createElement("div");p.className="foods";p.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";body.append(p);}
    section.append(body);
   }else options.forEach((o,i)=>section.append(optionEl(o,i)));
  }
  root.append(section);
 }
}
function renderPlans(){const root=$("plan-colors"),detail=$("plan-detail");root.replaceChildren();detail.replaceChildren();const available=Object.keys(plans).filter(c=>Object.values(plans[c]).some(a=>a.length));for(const color of available){const b=document.createElement("button");const dot=document.createElement("span");dot.className="color-dot "+color;b.append(dot,document.createTextNode(colorNames[color]));b.className=selectedColor===color?"selected":"";b.onclick=()=>{selectedColor=selectedColor===color?null:color;renderPlans();};root.append(b);}if(!selectedColor||!plans[selectedColor])return;for(const meal of ["breakfast","lunch","snack","dinner","supper"]){const opts=plans[selectedColor][meal]||[];if(!opts.length)continue;const section=document.createElement("section");section.className="meal plan-meal";const header=document.createElement("div");header.className="option";const h=document.createElement("h3");h.textContent=names[meal];header.append(h);const avg=average(opts);if(avg)header.append(nutrition(avg));section.append(header);opts.forEach((o,i)=>{const item=optionEl(o,i,true);item.classList.add("plan-option-card");section.append(item);});detail.append(section);}}
async function menusView(){const start=monday(menuWeek),end=new Date(start);end.setDate(end.getDate()+6);$("menu-week").textContent=String(start.getDate()).padStart(2,"0")+"/"+String(start.getMonth()+1).padStart(2,"0")+" - "+String(end.getDate()).padStart(2,"0")+"/"+String(end.getMonth()+1).padStart(2,"0");const [m,c,dishResponse]=await Promise.all([api("/api/v2/player/menus?start="+iso(start)+"&end="+iso(end)),api("/api/v2/player/calendar?start="+iso(start)+"&end="+iso(end)),api("/api/v2/player/dishes")]);const dishMap=new Map(dishResponse.dishes.map(x=>[x.name_pt,x.id]));const root=$("menu-days");root.replaceChildren();for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=iso(d),dayClass=c.days.find(x=>x.date===key);const section=document.createElement("section");section.className="day-menu";const h=document.createElement("div");h.className="menu-day-heading";const title=document.createElement("h3");title.textContent=d.toLocaleDateString("pt-PT",{weekday:"long"});title.textContent=title.textContent.charAt(0).toUpperCase()+title.textContent.slice(1);const sub=document.createElement("span");sub.className="menu-day-subtitle";sub.textContent=String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+(dayClass?.classification?" · "+dayClass.classification:"");h.append(title,sub);section.append(h);for(const meal of ["lunch","dinner"]){const menu=m.menus.find(x=>x.menu_date===key&&x.meal===meal);if(!menu)continue;const div=document.createElement("div");div.className="row menu-entry";
 const label=document.createElement("strong");label.textContent=names[meal];
 const rowClass=c.classifications.find(x=>x.name===dayClass?.classification),color=rowClass?.meals?.[meal];
 div.classList.add(color?"tone-"+color:"tone-neutral");const title=document.createElement("div");title.className="menu-entry-heading";
 if(color){const dot=document.createElement("span");dot.className="color-dot "+color;title.append(dot);}
 title.append(label);
 const body=document.createElement("div");body.className="menu-entry-body";
 const name=document.createElement("span");name.className="value";name.textContent=menu.value;body.append(name);
 if(menu.kind==="dish"&&dishMap.has(menu.value)){
  const photo=document.createElement("img");photo.className="dish-img";photo.alt=menu.value;photo.loading="lazy";photo.src="/api/v2/player/dish-photo/"+encodeURIComponent(dishMap.get(menu.value));body.append(photo);
 }
 div.append(title,body);section.append(div);}root.append(section);}}
function error(e){if(e.status===401||e.status===403)return;$("status").textContent=e.message||String(e);}
$("login-form").onsubmit=async e=>{e.preventDefault();$("login-error").textContent="";try{await api("/api/login",{method:"POST",body:JSON.stringify({identifier:$("username").value.trim().toLowerCase(),password:$("password").value})});$("password").value="";await session();}catch(err){$("login-error").textContent="Não foi possível entrar. Verifica as credenciais e tenta novamente.";}};$("logout").onclick=async()=>{await api("/api/logout",{method:"POST",body:"{}"}).catch(()=>{});location.reload();};for(const b of document.querySelectorAll("[data-tab]"))b.onclick=()=>show(b.dataset.tab).catch(error);for(const [id,n] of [["menu-prev",-7],["menu-next",7]])$(id).onclick=()=>{menuWeek.setDate(menuWeek.getDate()+n);menusView().catch(error);};for(const b of document.querySelectorAll("#overview-mode button"))b.onclick=()=>{overviewMode=b.dataset.view;weeklySelection=null;overview().catch(error);};session().catch(()=>{$("login-panel").hidden=false;});
