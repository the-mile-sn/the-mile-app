"use strict";
const $=id=>document.getElementById(id),names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"},colorNames={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"Verde preparação"};
let me=null,plans={},model=[],meals=[],day=new Date(),menuWeek=new Date(),selectedColor=null,tab="overview",dishIndex=[];
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
function monday(d){const x=new Date(d);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;}
function revokePlayerView(){
 me=null;plans={};model=[];meals=[];selectedColor=null;
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
function optionEl(o,i){const details=document.createElement("details"),s=document.createElement("summary"),line=document.createElement("div");line.className="option";const label=document.createElement("span");label.textContent="Opção "+(o.number||i+1)+(o.title?" · "+o.title:"");line.append(label);if(o.totals){const value=nutrition(o.totals);value.classList.add("expanded-option-macros");line.append(value);}s.append(line);details.append(s);for(const food of o.items||[]){const p=document.createElement("div");p.className="foods";p.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";details.append(p);}return details;}
async function session(){const r=await api("/api/v2/player/me");me=r.player;$("player-name").textContent=me.name;const p=await api("/api/v2/player/plans");plans=p.options_by_color;$("login-panel").hidden=true;$("player-panel").hidden=false;$("logout").hidden=false;await show(tab);}
async function show(t){tab=t;for(const key of ["overview","plans","menus"])$(key).hidden=key!==t;for(const b of document.querySelectorAll("[data-tab]"))b.setAttribute("aria-pressed",String(b.dataset.tab===t));if(t==="overview")await overview();if(t==="plans")renderPlans();if(t==="menus")await menusView();}
async function overview(){
 const d=iso(day),r=await api("/api/v2/player/calendar?start="+d+"&end="+d);
 model=r.classifications;meals=r.meals;
 const menus=await api("/api/v2/player/menus?start="+d+"&end="+d);
 $("date-title").textContent=day.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
 const strip=$("week-strip");strip.replaceChildren();const mon=monday(day);
 for(let i=0;i<7;i++){const dt=new Date(mon);dt.setDate(mon.getDate()+i);const button=document.createElement("button");button.textContent=dt.toLocaleDateString("pt-PT",{weekday:"short"})+" "+dt.getDate();button.className=iso(dt)===d?"selected":"";button.onclick=()=>{day=dt;overview().catch(error);};strip.append(button);}
 const root=$("day-details");root.replaceChildren();
 const entry=r.days[0];if(!entry?.classification){root.textContent="Sem programação definida para este dia.";return;}
 const cls=model.find(c=>c.name===entry.classification);const heading=document.createElement("h2");heading.textContent=entry.classification;root.append(heading);
 const stripColors=document.createElement("div");stripColors.className="daily-color-strip";stripColors.setAttribute("aria-label","Cores das refeições do dia");
 for(const meal of meals){const box=document.createElement("div");box.className="daily-color-cell";const caption=document.createElement("small");caption.textContent=names[meal];box.append(caption);const bar=document.createElement("div");bar.className="daily-color-bar"+(cls?.meals?.[meal]?" "+cls.meals[meal]:"");box.append(bar);stripColors.append(box);}
 root.append(stripColors);
 const total={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let complete=true,assigned=0;
 for(const meal of meals){const color=cls?.meals?.[meal];if(!color)continue;assigned++;const avg=average(plans[color]?.[meal]||[]);if(!avg){complete=false;continue;}for(const key in total)total[key]+=avg[key];}
 if(assigned){const summary=document.createElement("section");summary.className="daily-nutrition";const title=document.createElement("h3");title.textContent="Resumo nutricional do dia";summary.append(title);if(complete){const grid=document.createElement("div");grid.className="daily-nutrition-grid";for(const [key,label,unit,digits,css] of [["kcal","Energia","kcal",0,"kcal"],["protein_g","Proteína","g",0,"protein"],["carbs_g","Hidratos","g",0,"carbs"],["fat_g","Gordura","g",0,"fat"]]){const card=document.createElement("div");card.className="daily-nutrition-card";const name=document.createElement("small");name.textContent=label;const value=document.createElement("strong");value.className=css;value.textContent=fmt(total[key],digits)+" "+unit;card.append(name,value);const weight=Number(me?.weight_kg);if(Number.isFinite(weight)&&weight>0){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(total[key]/weight,1)+(key==="kcal"?" kcal/kg":" g/kg");card.append(ratio);}grid.append(card);}summary.append(grid);}else{const note=document.createElement("p");note.className="hint";note.textContent="Resumo incompleto: existem refeições sem plano publicado.";summary.append(note);}root.append(summary);}
 for(const meal of meals){
  const color=cls?.meals?.[meal],menu=(meal==="lunch"||meal==="dinner")?menus.menus.find(x=>x.meal===meal):null;
  if(!color&&!menu)continue;
  const section=document.createElement("details");section.className="meal daily-meal";
  const head=document.createElement("summary");head.className="daily-meal-head";const title=document.createElement("strong");title.textContent=names[meal];head.append(title);
  if(color){const indicator=document.createElement("span");indicator.className="daily-meal-indicator "+color;indicator.setAttribute("aria-label",colorNames[color]||color);head.append(indicator);}
  section.append(head);
  if(color||menu){if(menu){const p=document.createElement("div");p.className="menu-line";p.textContent=menu.value;section.append(p);}
   const options=plans[color]?.[meal]||[];if(color&&!options.length){const p=document.createElement("p");p.className="hint";p.textContent="Plano ainda não publicado.";section.append(p);}
   const avg=average(options);if(avg){const p=document.createElement("p");p.className="meal-average";p.append(nutrition(avg));section.append(p);}
   options.forEach((o,i)=>section.append(optionEl(o,i)));
  }
  root.append(section);
 }
}
function renderPlans(){const root=$("plan-colors"),detail=$("plan-detail");root.replaceChildren();detail.replaceChildren();const available=Object.keys(plans).filter(c=>Object.values(plans[c]).some(a=>a.length));for(const color of available){const b=document.createElement("button");const dot=document.createElement("span");dot.className="color-dot "+color;b.append(dot,document.createTextNode(colorNames[color]));b.className=selectedColor===color?"selected":"";b.onclick=()=>{selectedColor=selectedColor===color?null:color;renderPlans();};root.append(b);}if(!selectedColor||!plans[selectedColor])return;for(const meal of ["breakfast","lunch","snack","dinner","supper"]){const opts=plans[selectedColor][meal]||[];if(!opts.length)continue;const section=document.createElement("section");section.className="meal";const header=document.createElement("div");header.className="option";const h=document.createElement("h3");h.textContent=names[meal];header.append(h);const avg=average(opts);if(avg)header.append(nutrition(avg));section.append(header);opts.forEach((o,i)=>section.append(optionEl(o,i)));detail.append(section);}}
async function menusView(){const start=monday(menuWeek),end=new Date(start);end.setDate(end.getDate()+6);$("menu-week").textContent=iso(start)+" — "+iso(end);const [m,c,dishResponse]=await Promise.all([api("/api/v2/player/menus?start="+iso(start)+"&end="+iso(end)),api("/api/v2/player/calendar?start="+iso(start)+"&end="+iso(end)),api("/api/v2/player/dishes")]);const dishMap=new Map(dishResponse.dishes.map(x=>[x.name_pt,x.id]));const root=$("menu-days");root.replaceChildren();for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=iso(d),dayClass=c.days.find(x=>x.date===key);const section=document.createElement("section");section.className="day-menu";const h=document.createElement("h3");h.textContent=d.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"short"})+(dayClass?.classification?" · "+dayClass.classification:"");section.append(h);for(const meal of ["lunch","dinner"]){const menu=m.menus.find(x=>x.menu_date===key&&x.meal===meal);if(!menu)continue;const div=document.createElement("div");div.className="row menu-entry";
 const label=document.createElement("strong");label.textContent=names[meal];
 const rowClass=c.classifications.find(x=>x.name===dayClass?.classification),color=rowClass?.meals?.[meal];
 const title=document.createElement("div");title.className="menu-entry-heading";
 if(color){const dot=document.createElement("span");dot.className="color-dot "+color;title.append(dot);}
 title.append(label);
 const body=document.createElement("div");body.className="menu-entry-body";
 const name=document.createElement("span");name.className="value";name.textContent=menu.value;body.append(name);
 if(menu.kind==="dish"&&dishMap.has(menu.value)){
  const photo=document.createElement("img");photo.className="dish-img";photo.alt=menu.value;photo.loading="lazy";photo.src="/api/v2/player/dish-photo/"+encodeURIComponent(dishMap.get(menu.value));body.append(photo);
 }
 div.append(title,body);section.append(div);}root.append(section);}}
function error(e){if(e.status===401||e.status===403)return;$("status").textContent=e.message||String(e);}
$("login-form").onsubmit=async e=>{e.preventDefault();$("login-error").textContent="";try{await api("/api/login",{method:"POST",body:JSON.stringify({identifier:$("username").value.trim().toLowerCase(),password:$("password").value})});$("password").value="";await session();}catch(err){$("login-error").textContent="Não foi possível entrar. Verifica as credenciais e tenta novamente.";}};$("logout").onclick=async()=>{await api("/api/logout",{method:"POST",body:"{}"}).catch(()=>{});location.reload();};for(const b of document.querySelectorAll("[data-tab]"))b.onclick=()=>show(b.dataset.tab).catch(error);for(const [id,n] of [["day-prev",-1],["day-next",1]])$(id).onclick=()=>{day.setDate(day.getDate()+n);overview().catch(error);};for(const [id,n] of [["menu-prev",-7],["menu-next",7]])$(id).onclick=()=>{menuWeek.setDate(menuWeek.getDate()+n);menusView().catch(error);};session().catch(()=>{$("login-panel").hidden=false;});
