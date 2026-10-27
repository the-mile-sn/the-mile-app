"use strict";
const $=id=>document.getElementById(id),names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"},colorNames={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"Verde preparação"};
let playerCsrf='',me=null,plans={},periPlans={},model=[],meals=[],calendarEvents=[],periMeals=[],dayColorOverrides={},weeklyContext=null,day=new Date(),menuWeek=new Date(),selectedColor=null,tab="overview",dishIndex=[],overviewMode="day",weeklySelection=null;
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
function monday(d){const x=new Date(d);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;}
function revokePlayerView(){for(const value of dishPhotoCache.values())value.then(url=>{if(url)URL.revokeObjectURL(url);});dishPhotoCache.clear();menuRenderToken++;document.body.classList.remove("profile-active");
 me=null;playerCsrf='';plans={};periPlans={};model=[];meals=[];calendarEvents=[];periMeals=[];dayColorOverrides={};selectedColor=null;
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
const periTimingLabels={pre_warmup:"Pré-aquecimento",pre_match:"Pré-jogo",post_warmup:"Pós-aquecimento",first_half:"Durante a 1.ª parte",half_time:"Intervalo",second_half:"Durante a 2.ª parte",post_match:"Pós-jogo",throughout:"Ao longo do jogo"};
function periItemBlock(food){
 const box=document.createElement("div");box.className="peri-timed-item";box.style.cssText="";
 const label=periTimingLabels[food.timing];
 if(label){const head=document.createElement("div");head.textContent=label;head.style.cssText="font-weight:600;margin-bottom:7px;color:inherit";box.append(head);}
 const line=document.createElement("div");line.textContent=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" ").trim():food.text||"";line.style.cssText="color:inherit;opacity:.82";box.append(line);
 return box;
}
function periFoodText(food){const content=food.kind==="food"?[food.quantity,food.name].filter(Boolean).join(" · "):food.text||"";return (periTimingLabels[food.timing]?periTimingLabels[food.timing]+" — ":"")+content;}
function mealNoteCard(food){
 const note=document.createElement("details");note.className="meal-collapsible-note";
 const head=document.createElement("summary");head.textContent=food.title?.trim()||"Nota";note.append(head);
 const body=document.createElement("div");body.className="meal-note-body";body.textContent=food.text||"";note.append(body);
 return note;
}
function appendMealItems(host,items){
 for(const food of items||[]){if(food.kind==="collapsible_note")continue;const p=document.createElement("div");p.className="foods";p.textContent=periFoodText(food);host.append(p);}
 for(const food of items||[]){if(food.kind==="collapsible_note")host.append(mealNoteCard(food));}
}
function optionEl(o,i,planView=false){
 const details=document.createElement("details"),summary=document.createElement("summary"),line=document.createElement("div");
 line.className="option"+(planView?"":" day-option");
 const label=document.createElement("span");label.className="plan-option-label";
 const number=document.createElement("small");number.textContent="Opção "+(o.number||i+1);label.append(number);
 if(o.title){const name=document.createElement("strong");name.textContent=o.title;label.append(name);}
 line.append(label);summary.append(line);details.append(summary);
 if(o.totals){const value=document.createElement("div");value.className="option-expanded-macros";value.append(nutrition(o.totals));details.append(value);}
 appendMealItems(details,o.items);
 return details;
}


// Hugeicons free stroke names are used through their published SVG collection.
const mealIconMap={breakfast:"coffee-03",snack:"vegetarian-food",lunch:"restaurant-02",dinner:"restaurant-02",supper:"moon-02",supplements:"pill"};
const mileSvgPaths={"coffee-03":"<path d=\"M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Zm12 1h1a3 3 0 0 1 0 6h-2M4 22h16M8 3v3m4-3v3m4-3v3\"/>","vegetarian-food":"<path d=\"M4 12c2-4 6-4 8 0 2-4 6-4 8 0l-2 7H6l-2-7ZM12 10V4M8 7 5 5m11 2 3-2M6 22h12\"/>","restaurant-02":"<path d=\"M4 3v8m3-8v8M4 7h3M5.5 11v10M13 3v18M13 12c7 0 8-8 3-9v9M20 3v18\"/>","moon-02":"<path d=\"M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z\"/>","football":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m12 7 4 3-1.5 5h-5L8 10l4-3Zm-4 3-4-1m12 1 4-1m-5.5 6 2 5m-7-5-2 5M12 7V3\"/>","football-pitch":"<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"1\"/><path d=\"M12 4v16m0-12a4 4 0 0 0 0 8M2.5 9h4v6h-4m19-6h-4v6h4\"/>","soft-drink-01":"<path d=\"M5 5h14l-2 16H7L5 5ZM4 3h16M12 5l4-4M8 11h8m-6 4h4\"/>","home-09":"<path d=\"m3 11 9-8 9 8v9H3v-9Zm6 9v-7h6v7\"/>","files-01":"<path d=\"M7 3h10l4 4v14H7V3Zm10 0v5h4M3 7v14h14\"/>","add-circle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v10m-5-5h10\"/>","menu-restaurant":"<path d=\"M4 4v7m3-7v7M4 7h3m-1.5 4v9M13 4v16m0-8c7 0 8-7 3-8v8M3 22h18\"/>","user-03":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>"};
function mealIcon(name){const el=document.createElement("span");el.className="mile-icon icon-"+name;el.setAttribute("aria-hidden","true");el.innerHTML='<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(mileSvgPaths[name]||"")+'</svg>';if(hugeiconsOfficial){const raw=hugeiconsOfficial[hugeiconsNames[name]];if(Array.isArray(raw)){el.replaceChildren(iconToSvg(raw));el.dataset.official="true";}}return el;}
const hugeiconsNames={"coffee-03":"Coffee03Icon","vegetarian-food":"VegetarianFoodIcon","restaurant-02":"Restaurant02Icon","moon-02":"Moon02Icon","football":"FootballIcon","football-pitch":"FootballPitchIcon","soft-drink-01":"SoftDrink01Icon","pill":"PillIcon","home-09":"Home09Icon","files-01":"Files01Icon","add-circle":"AddCircleIcon","menu-restaurant":"MenuRestaurantIcon","user-03":"User03Icon","key-01":"Key01Icon","door-01":"Door01Icon","chart-03":"Chart03Icon"};
const hugeiconsOfficial={
"Coffee03Icon":[
  ["path", { d: "M17 11H18C18.9319 11 19.3978 11 19.7654 11.1522C20.2554 11.3552 20.6448 11.7446 20.8478 12.2346C21 12.6022 21 13.0681 21 14C21 14.9319 21 15.3978 20.8478 15.7654C20.6448 16.2554 20.2554 16.6448 19.7654 16.8478C19.3978 17 18.9319 17 18 17H17", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M15 9H5C4.05719 9 3.58579 9 3.29289 9.29289C3 9.58579 3 10.0572 3 11V14C3 16.8089 3 18.2134 3.67412 19.2223C3.96596 19.659 4.34096 20.034 4.77772 20.3259C5.78661 21 7.19108 21 10 21C12.8089 21 14.2134 21 15.2223 20.3259C15.659 20.034 16.034 19.659 16.3259 19.2223C17 18.2134 17 16.8089 17 14V11C17 10.0572 17 9.58579 16.7071 9.29289C16.4142 9 15.9428 9 15 9Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M10 3V5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M14 3V5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M6 3V5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "4" }]
],
"VegetarianFoodIcon":[
  ["path", { d: "M17 13.2308C17 13.2308 16.0909 12.7693 15.1818 12.7693C13.8182 12.7693 12 14.6154 12 17.3846C12 20.1537 14.4896 22 17 22C19.5104 22 22 20.1537 22 17.3846C22 14.6154 20.1818 12.7693 18.8182 12.7693C17.9091 12.7693 17 13.2308 17 13.2308ZM17 13.2308C17 11.8462 17.9091 10 19.7273 10", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M10.655 5C11.5512 5 12.2778 4.32843 12.2778 3.5C12.2778 2.67157 11.5512 2 10.655 2H5.24561C4.34936 2 3.6228 2.67157 3.6228 3.5C3.6228 4.32843 4.34936 5 5.24561 5M11.1693 4.92311C12.1247 6.68943 12.9095 8.28337 13.3888 10C13.4279 10.1401 13.465 10.281 13.5 10.4229M10.428 22H6.32748C2.74721 22 2 21.3093 2 18V13.7771C2 10.3773 3.09757 7.88562 4.70467 4.91465", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
],
"Restaurant02Icon":[
  ["path", { d: "M4 21.001L7.00071 18", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M15 10.001L14 11.001", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M17.9999 3.00098L14.9999 6.00098C14.4547 6.54623 14.1821 6.81885 14.0363 7.11295C13.759 7.6725 13.759 8.32945 14.0363 8.88901C14.1821 9.1831 14.4547 9.45573 14.9999 10.001C15.5452 10.5462 15.8178 10.8189 16.1119 10.9646C16.6715 11.2419 17.3284 11.2419 17.888 10.9646C18.1821 10.8189 18.4547 10.5462 18.9999 10.001L21.9999 7.00098", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M20 5L17 8", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M20 21L12 13M12 13L2 3C2 6.84174 3.52612 10.5261 6.24264 13.2426L9 16L12 13Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "4" }]
],
"Moon02Icon":[
  ["path", { d: "M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]
],
"FootballIcon":[
  ["path", { d: "M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z", stroke: "currentColor", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M11.7077 9.34893C11.882 9.21702 12.118 9.21702 12.2923 9.34893L14.545 11.054C14.7193 11.1859 14.7922 11.4197 14.7256 11.6332L13.8652 14.3921C13.7986 14.6055 13.6077 14.75 13.3923 14.75H10.6077C10.3923 14.75 10.2014 14.6055 10.1348 14.3921L9.27437 11.6332C9.20781 11.4197 9.28073 11.1859 9.45499 11.054L11.7077 9.34893Z", stroke: "currentColor", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M12 9V5M15 11L19 9.5M14 15L16 18M10 14.5L8 17M9 11.5L5 10.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M9 2.5L12.0165 4.62241L15 2.5M2 12.7998L5.19655 10.4388L3.55548 6.72045M19.4703 18.8531L15.6158 18.1555L14.2655 22M20.0298 6.19586L18.8035 9.38978L22 11.7507M8.00992 21.4059L8.05142 17.1665L4.00331 17.21", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
],
"FootballPitchIcon":[
  ["path", { d: "M2 8.57143C2 6.41644 2 5.33894 2.58579 4.66947C3.17157 4 4.11438 4 6 4H18C19.8856 4 20.8284 4 21.4142 4.66947C22 5.33894 22 6.41644 22 8.57143V15.4286C22 17.5836 22 18.6611 21.4142 19.3305C20.8284 20 19.8856 20 18 20H6C4.11438 20 3.17157 20 2.58579 19.3305C2 18.6611 2 17.5836 2 15.4286V8.57143Z", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["circle", { cx: "12", cy: "12", r: "2", stroke: "currentColor", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M12 10V5M12 14V19", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M22 9H19.5C18.9477 9 18.5 9.44772 18.5 10V14C18.5 14.5523 18.9477 15 19.5 15H22", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M2 9H4.5C5.05228 9 5.5 9.44772 5.5 10V14C5.5 14.5523 5.05228 15 4.5 15H2", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "4" }]
],
"SoftDrink01Icon":[
  ["path", { d: "M12 7V4.34832C12 2.1606 12.3737 1.6318 14.4968 2.22769L18 3.21095", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M6 7L7.1398 18.1606C7.31099 19.8368 7.39658 20.6749 7.96796 21.1813C9.1458 22.225 14.7472 22.3198 16.032 21.1813C16.6034 20.6749 16.689 19.8368 16.8602 18.1606L18 7", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M5 7H19", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M7 12H17", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "3" }],
  ["path", { d: "M7 16H17", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "4" }]
],
"PillIcon":[
  ["path", { d: "M11.4497 19.5503L19.5503 11.4497C20.4785 10.5215 21 9.2625 21 7.94975C21 5.21608 18.7839 3 16.0503 3C14.7375 3 13.4785 3.52149 12.5503 4.44975L4.44975 12.5503C3.52149 13.4785 3 14.7375 3 16.0503C3 18.7839 5.21608 21 7.94975 21C9.2625 21 10.5215 20.4785 11.4497 19.5503Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M8.5 8.5L15.5 15.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
],
"Home09Icon":[
  ["path", { d: "M13 13.5032H11C10.1716 13.5032 9.5 14.1748 9.5 15.0032V20.5012C9.5 21.0539 9.05114 21.5032 8.49854 21.4977C6.17337 21.4744 4.88133 21.3333 4.02513 20.4771C3 19.452 3 17.8021 3 14.5023V11.9918C3 10.3106 3 9.46999 3.3559 8.74231C3.71179 8.01463 4.37533 7.49854 5.70241 6.46637L7.70242 4.91081C9.76689 3.30511 10.7991 2.50226 12 2.50226C13.2009 2.50226 14.2331 3.30511 16.2976 4.91081L18.2976 6.46636C19.6247 7.49854 20.2882 8.01463 20.6441 8.74231C21 9.46999 21 10.3106 21 11.9918V14.5023C21 17.8021 21 19.452 19.9749 20.4771C19.1187 21.3333 17.8266 21.4744 15.5015 21.4977C14.9489 21.5032 14.5 21.0539 14.5 20.5012V15.0032C14.5 14.1748 13.8284 13.5032 13 13.5032Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]
],
"Files01Icon":[
  ["path", { d: "M14.4998 19H12.4998C9.67139 19 8.25718 19 7.3785 18.1213C6.49982 17.2426 6.49982 15.8284 6.49982 13V8C6.49982 5.17157 6.49982 3.75736 7.3785 2.87868C8.25718 2 9.67139 2 12.4998 2H13.843C14.6605 2 15.0692 2 15.4368 2.15224C15.8043 2.30448 16.0933 2.59351 16.6714 3.17157L19.3282 5.82843C19.9063 6.40648 20.1953 6.69552 20.3476 7.06306C20.4998 7.4306 20.4998 7.83935 20.4998 8.65685V13C20.4998 15.8284 20.4998 17.2426 19.6211 18.1213C18.7425 19 17.3282 19 14.4998 19Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M14.9998 2.5V3.5C14.9998 5.38562 14.9998 6.32843 15.5856 6.91421C16.1714 7.5 17.1142 7.5 18.9998 7.5H19.9998", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M6.49945 5C4.8426 5 3.49945 6.34315 3.49945 8V16C3.49945 18.8285 3.49945 20.2427 4.37813 21.1213C5.25681 22 6.67102 22 9.49945 22H14.4998C16.1566 22 17.4998 20.6568 17.4998 19", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M10 11H14M10 15H17", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
],
"AddCircleIcon":[
  ["path", { d: "M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M12 8V16M16 12H8", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
],
"MenuRestaurantIcon":[
  ["path", { d: "M20 17.9998V9.99976C20 8.11414 20 7.17133 19.4142 6.58554C18.8284 5.99976 17.8856 5.99976 16 5.99976H4V17.9998C4 19.8854 4 20.8282 4.58579 21.414C5.17157 21.9998 6.11438 21.9998 8 21.9998H16C17.8856 21.9998 18.8284 21.9998 19.4142 21.414C20 20.8282 20 19.8854 20 17.9998Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M12 10.9998C13.6569 10.9998 15 12.3429 15 13.9998M12 10.9998C10.3431 10.9998 9 12.3429 9 13.9998M12 10.9998V9.99976M15 13.9998H9M15 13.9998H16M9 13.9998H8", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M8 17.9998H16", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "2" }],
  ["path", { d: "M4 5.99976L11.3846 2.90562C13.0337 2.21467 13.8582 1.8692 14.5149 2.04518C14.9408 2.1593 15.3173 2.41168 15.5859 2.76312C16 3.30508 16 4.2033 16 5.99976", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "3" }]
],
"User03Icon":[
  ["path", { d: "M20 21C20 18.7328 20 17.5992 19.5929 16.7097C19.1649 15.7746 18.4287 15.0144 17.5071 14.5558C16.6305 14.1196 15.5 14 13.2263 14.0051L10.7728 14C8.49999 14 7.39496 14.1069 6.52924 14.528C5.57859 14.9904 4.82688 15.7651 4.39412 16.7284C4.00001 17.6057 4.00001 18.7371 4 21", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
]
};
hugeiconsOfficial["Key01Icon"]=[
  ["path", { d: "M15.5 14.5C18.8137 14.5 21.5 11.8137 21.5 8.5C21.5 5.18629 18.8137 2.5 15.5 2.5C12.1863 2.5 9.5 5.18629 9.5 8.5C9.5 9.38041 9.68962 10.2165 10.0303 10.9697L2.5 18.5V21.5H5.5V19.5H7.5V17.5H9.5L13.0303 13.9697C13.7835 14.3104 14.6196 14.5 15.5 14.5Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M17.5 6.5L16.5 7.5", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
hugeiconsOfficial["Door01Icon"]=[
  ["path", { d: "M18 20C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M4 6.84771V17.1523C4 18.7454 4 19.542 4.4645 20.0976C4.92899 20.6531 5.71415 20.7956 7.28446 21.0806L10.2845 21.6251C12.4701 22.0217 13.563 22.2201 14.2815 21.6215C15 21.023 15 19.9142 15 17.6968V6.30325C15 4.08578 15 2.97704 14.2815 2.37849C13.563 1.77994 12.4701 1.97827 10.2845 2.37495L7.28446 2.91941C5.71415 3.2044 4.92899 3.34689 4.4645 3.90244C4 4.45799 4 5.25457 4 6.84771Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }],
  ["path", { d: "M11.625 12H11.5M11.75 12C11.75 12.1381 11.6381 12.25 11.5 12.25C11.3619 12.25 11.25 12.1381 11.25 12C11.25 11.8619 11.3619 11.75 11.5 11.75C11.6381 11.75 11.75 11.8619 11.75 12Z", stroke: "currentColor", strokeLinecap: "round", strokeWidth: "1.5", key: "2" }]
];
hugeiconsOfficial["Chart03Icon"]=[
  ["path", { d: "M3 4V14C3 16.8284 3 18.2426 3.87868 19.1213C4.75736 20 6.17157 20 9 20H21", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }],
  ["path", { d: "M6 14L9.25 10.75C9.89405 10.1059 10.2161 9.78392 10.5927 9.67766C10.8591 9.60254 11.1409 9.60254 11.4073 9.67766C11.7839 9.78392 12.1059 10.1059 12.75 10.75C13.3941 11.3941 13.7161 11.7161 14.0927 11.8223C14.3591 11.8975 14.6409 11.8975 14.9073 11.8223C15.2839 11.7161 15.6059 11.3941 16.25 10.75L20 7", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "1" }]
];
function iconToSvg(nodes){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","100%");svg.setAttribute("height","100%");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.5");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
 const append=(items,parent)=>{for(const node of items||[]){if(!Array.isArray(node))continue;const [tag,props,children]=node;if(typeof tag!=="string"||!["path","circle","rect","line","polyline","polygon","ellipse","g"].includes(tag))continue;const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(props||{})){if(k==="key"||k==="ref"||typeof v==="object")continue;el.setAttribute(k.replace(/[A-Z]/g,c=>"-"+c.toLowerCase()),String(v));}parent.append(el);if(Array.isArray(children))append(children,el);}};
 append(nodes,svg);return svg;
}
function updateOfficialIcons(){
 if(!hugeiconsOfficial)return;
 for(const icon of document.querySelectorAll(".mile-icon")){const name=[...icon.classList].find(x=>x.startsWith("icon-"))?.slice(5);const raw=hugeiconsOfficial[hugeiconsNames[name]];if(raw&&Array.isArray(raw)){icon.replaceChildren(iconToSvg(raw));icon.dataset.official="true";}}
}
function loadOfficialHugeicons(){updateOfficialIcons();}
function decorateLabel(el,key){
 if(!el||el.querySelector(".meal-leading-icon"))return;
 const iconName=mealIconMap[key]||(/p[oó]s/i.test(key)? "soft-drink-01":/jogo/i.test(key)?"football":/treino/i.test(key)?"football-pitch":null);
 if(!iconName)return;
 const item=document.createElement("span");item.className="meal-leading-icon";item.append(mealIcon(iconName));el.prepend(item);updateOfficialIcons();
}

let profileUsername="";
async function session(){const sessionData=await api("/api/me");profileUsername=sessionData.user?.username||"";const plan=String(sessionData.user?.plan_name||"").trim();$("profile-plan-value").textContent=/^(elite|pro)$/i.test(plan)?plan.charAt(0).toUpperCase()+plan.slice(1).toLowerCase():"Por definir";playerCsrf=sessionData.csrf||"";const r=await api("/api/v2/player/me");me=r.player;$("player-name").textContent=me.name;const initials=String(me.name||"TM").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();$("avatar-initials").textContent=initials;$("profile-photo-initials").textContent=initials;$("profile-display-name").textContent=me.name;$("profile-display-username").textContent=profileUsername?"@"+profileUsername:"";const profilePhoto=$("profile-photo");profilePhoto.hidden=true;profilePhoto.onerror=()=>{profilePhoto.hidden=true;$("profile-photo-initials").hidden=false;};if(sessionData.user?.has_photo){profilePhoto.onload=()=>{profilePhoto.hidden=false;$("profile-photo-initials").hidden=true;};profilePhoto.src="/api/v2/player/profile-photo";}else{$("profile-photo-initials").hidden=false;}const p=await api("/api/v2/player/plans");plans=p.options_by_color;periPlans=p.peri_plans||{};$("login-panel").hidden=true;$("player-panel").hidden=false;$("logout").hidden=false;await show(tab);}
async function show(t){tab=t;document.body.classList.toggle("profile-active",t==="profile");for(const key of ["overview","plans","menus","new","profile"])$(key).hidden=key!==t;for(const b of document.querySelectorAll("[data-tab]"))b.setAttribute("aria-pressed",String(b.dataset.tab===t));document.querySelector(".welcome").hidden=true;if(t==="overview")await overview();if(t==="plans")openPlansSection("landing");if(t==="menus")await menusView();}

async function renderSupplementPlan(){
 const data=await api("/api/v2/player/supplements"),root=$("plan-detail");root.replaceChildren();
 if(!data.plan.length){root.textContent="Ainda não existe plano de suplementação publicado.";return;}
 const labels={daily:"Todos os dias",training:"Dias de treino",match:"MD","md-1":"MD-1","md+1":"MD+1"};
 for(const item of data.plan){
  const box=document.createElement("div");box.className="supplement-entry";
  if(item.library_id){const img=document.createElement("img");img.className="supplement-product-image";img.src="/api/v2/supplement-library/"+encodeURIComponent(item.library_id)+"/image";img.alt=item.name;img.loading="lazy";img.onerror=()=>img.remove();box.append(img);}
  const title=document.createElement("strong");title.textContent=item.name+" · "+item.dose;
  const meta=document.createElement("small");meta.textContent=(labels[item.rule]||item.rule)+" · "+(item.timing_text||({"breakfast":"Pequeno-almoço","lunch":"Almoço","snack":"Lanche","dinner":"Jantar","supper":"Ceia","training":"Treino","match":"Jogo","lunch_or_dinner":"Almoço ou jantar"})[item.moment]||"Sem associação");
  box.append(title,meta);if(item.note){const note=document.createElement("small");note.textContent=item.note;box.append(note);}root.append(box);
 }
}
function assignedColor(date,meal,classification){
 const own=dayColorOverrides[date+"|"+meal];
 if(own==="none")return null;
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
 const section=document.createElement("section");section.className="weekly-average-summary";
 const weight=Number(me?.weight_kg||me?.weight||me?.body_weight_kg),hasWeight=Number.isFinite(weight)&&weight>0;
 for(const [key,label,cls] of [["kcal","kcal","kcal"],["protein_g","Proteína","protein"],["carbs_g","Hidratos","carbs"],["fat_g","Gordura","fat"]]){
  const item=document.createElement("div");item.className="weekly-average-metric "+cls;
  const title=document.createElement("small");title.textContent=label;
  const value=document.createElement("strong");value.textContent=fmt(data[key],0)+(key==="kcal"?"":" g");
  item.append(title,value);
  if(hasWeight){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(data[key]/weight,1)+(key==="kcal"?" kcal/kg":" g/kg");item.append(ratio);}
  section.append(item);
 }
 return section;
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
 const selectedWeeklyDate=weeklySelection?.date||null;
 if(selectedWeeklyDate){const selectedIndex=Math.round((new Date(selectedWeeklyDate+"T12:00:00")-new Date(iso(mon)+"T12:00:00"))/86400000);if(selectedIndex>=0&&selectedIndex<7){grid.classList.add("has-weekly-selection");grid.style.setProperty("--selected-column-left",`calc(${selectedIndex} * (100% - 24px) / 7 + ${selectedIndex*4}px)`);grid.style.setProperty("--selected-column-left-mobile",`calc(${selectedIndex} * (100% - 18px) / 7 + ${selectedIndex*3}px)`);}}
 const markWeeklyColumn=(el,date)=>{if(date===selectedWeeklyDate)el.classList.add("weekly-selected-column");};
 const dates=[],classes=[],totals=[];
 for(let i=0;i<7;i++){
  const dt=new Date(mon);dt.setDate(mon.getDate()+i);const key=iso(dt),entry=r.days.find(x=>x.date===key);
  dates.push(key);classes.push(model.find(c=>c.name===entry?.classification));totals.push(weeklyDayTotal(entry));
  const header=document.createElement("button");header.type="button";header.className="weekly-day-header";header.setAttribute("aria-label","Abrir vista diária: "+dt.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"}));
  for(const [cls,val] of [["weekday",dt.toLocaleDateString("pt-PT",{weekday:"short"}).replace(".","")],["number",String(dt.getDate())],["classification",entry?.classification||"—"]]){
   const span=document.createElement("span");span.className=cls;span.textContent=val;header.append(span);
  }
  markWeeklyColumn(header,key);header.onclick=()=>{day=dt;overviewMode="day";weeklySelection=null;overview().catch(error);};if(key===iso(new Date()))header.classList.add("today");grid.append(header);
 }
 for(const meal of meals){
  if(meal==="lunch")appendWeeklyEvents(grid,dates,"morning");
  if(meal==="dinner")appendWeeklyEvents(grid,dates,"afternoon");
  for(let i=0;i<7;i++){
   const color=assignedColor(dates[i],meal,r.days.find(e=>e.date===dates[i])?.classification),avg=color?average(plans[color]?.[meal]||[]):null;
   if(!color){const empty=document.createElement("div");empty.className="weekly-empty";markWeeklyColumn(empty,dates[i]);grid.append(empty);continue;}
   const active=weeklySelection?.date===dates[i]&&weeklySelection?.meal===meal;
   const b=document.createElement("button");b.type="button";b.className="weekly-meal tone-"+color+(active?" is-active":"");markWeeklyColumn(b,dates[i]);
   const label=document.createElement("span");label.className="weekly-meal-name";label.textContent=meal==="breakfast"?"Peq Alm.":names[meal]||meal;b.append(label);
   if(avg){const value=document.createElement("span");value.className="weekly-meal-kcal";value.textContent=fmt(avg.kcal,0);b.append(value);}
   b.setAttribute("aria-label",(names[meal]||meal)+" "+dates[i]+" — abrir opções");b.setAttribute("aria-pressed",String(active));
   b.onclick=()=>{weeklySelection=active?null:{date:dates[i],meal,color};renderWeekly(mon,r,weekMenus);};grid.append(b);
  }
 }
 for(let i=0;i<7;i++){
  const box=document.createElement("div");box.className="weekly-day-total";markWeeklyColumn(box,dates[i]);const total=totals[i];
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
   appendMealItems(section,options[0].items);
  }else options.forEach((o,i)=>{const item=optionEl(o,i,true);item.classList.add("weekly-option-card");section.append(item);});
  attachSupplements(section,(supplementsByDay[date]||[]).filter(x=>x.moment===meal||(meal==="lunch"&&x.moment==="lunch_or_dinner")));
  detail.append(section);
 }
 if(weeklySelection?.periEventId&&dates.includes(weeklySelection.date)){
   const item=periMeals.find(x=>x.event_id===weeklySelection.periEventId&&x.phase===weeklySelection.phase&&x.event_date===weeklySelection.date);
   if(item){
    const section=document.createElement("section");section.className="weekly-detail peri-weekly-detail";
    const top=document.createElement("div");top.className="weekly-detail-heading";
    const caption=document.createElement("small");caption.textContent=new Date(item.event_date+"T12:00:00").toLocaleDateString("pt-PT",{weekday:"short",day:"2-digit",month:"2-digit"});
    const title=document.createElement("strong");title.textContent=item.phase==="pre"&&calendarEvents.some(e=>e.id===item.event_id&&e.kind==="match")?"Jogo":item.title;
    const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","Fechar refeição");close.onclick=()=>{weeklySelection=null;renderWeekly(mon,r,weekMenus);};
    const group=document.createElement("div");group.className="weekly-detail-titles";group.append(caption,title);top.append(group,close);section.append(top);
    const opts=item.options||[],avg=average(opts);
    if(avg){const line=document.createElement("div");line.className="weekly-meal-average";line.append(nutrition(avg));section.append(line);}
    if(opts.length===1){for(const food of opts[0].items||[]){const line=document.createElement("div");line.className="foods";line.textContent=periFoodText(food);section.append(line);}}
    else opts.forEach((option,index)=>{const card=optionEl(option,index,true);card.classList.add("weekly-option-card");section.append(card);});
    detail.append(section);
   }
  }

 const heading=document.createElement("div");heading.className="weekly-summary-heading";const h=document.createElement("h2");h.textContent="Média diária";heading.append(h);root.append(heading);
 const valid=totals.filter(Boolean);
 if(!valid.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem dados publicados para calcular a média desta semana.";root.append(p);}
 else{const avg={kcal:0,protein_g:0,carbs_g:0,fat_g:0};for(const t of valid)for(const k in avg)avg[k]+=t[k]/valid.length;root.append(weeklySummary(avg));}
 const weeklySupplements=new Map();
 for(const date of dates){
  for(const item of supplementsByDay[date]||[]){
   const group=item.rule==="daily"?"Diariamente":item.rule==="match"?"MD":item.rule==="md-1"?"MD-1":item.rule==="md+1"?"MD+1":item.rule==="training"?"Treino":"Outros";
   const key=group+"|"+(item.library_id||item.name)+"|"+item.dose;
   if(!weeklySupplements.has(key))weeklySupplements.set(key,{group,name:item.name,dose:item.dose,dates:[],timing:item.display_moment||item.timing_text||""});
   weeklySupplements.get(key).dates.push(date);
  }
 }
 if(weeklySupplements.size){
  const summary=document.createElement("details");summary.className="weekly-supplement-summary";
  const header=document.createElement("summary");header.textContent="Suplementação";header.prepend(mealIcon("pill"));summary.append(header);
  for(const group of ["Diariamente","Treino","MD-1","MD","MD+1","Outros"]){
   const items=[...weeklySupplements.values()].filter(x=>x.group===group);
   if(!items.length)continue;
   const row=document.createElement("div");row.className="weekly-supplement-group";
   const label=document.createElement("strong");label.textContent=group;row.append(label);
   for(const item of items){const entry=document.createElement("div");entry.className="weekly-supplement-entry";entry.textContent=item.name+" - "+item.dose+(item.timing?", "+item.timing.toLowerCase():"");row.append(entry);}summary.append(row);
  }
  root.append(summary);
 }
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
  if(avg){const kcal=document.createElement("span");kcal.className="weekly-meal-kcal";kcal.textContent=fmt(avg.kcal,0);section.append(kcal);}
  return section;
 }
 const head=document.createElement("summary");head.className="daily-meal-head";
 const title=document.createElement("strong");title.textContent=item.title;head.append(title);decorateLabel(head,item.title);
 if(avg){const nutritionSummary=document.createElement("span");nutritionSummary.className="meal-average meal-average-inline";nutritionSummary.append(nutrition(avg));head.append(nutritionSummary);}
 section.append(head);
 if(opts.length===1){for(const food of opts[0].items||[]){const p=document.createElement("div");p.className="foods";p.textContent=periFoodText(food);section.append(p);}}
 else opts.forEach((option,index)=>section.append(optionEl(option,index)));
 return section;
}
function eventCard(event,compact=false){
 const section=document.createElement("div");section.className=compact?"weekly-event-card":"daily-event-card";
 const label=document.createElement("span");label.textContent=event.title;section.append(label);if(!compact)decorateLabel(section,event.title||event.kind);
 if(!compact&&event.kind!=="match"&&event.event_date>=iso(new Date())){
   const toggle=document.createElement("button");toggle.type="button";toggle.className="daily-event-edit";toggle.setAttribute("aria-label","Editar "+event.title);toggle.title="Editar "+event.title;toggle.innerHTML="<svg class=\"hugeicon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 5.41226 15.7842 5.05637 16.4211C4.70047 17.058 4.3424 18.5619 4 20C5.43809 19.6576 6.94199 19.2995 7.57889 18.9436C8.21579 18.5877 8.73844 18.0651 9.78375 17.0198L18.0176 8.78591M15.2141 5.98239L18.0176 8.78591\"/><path d=\"M11 20H17\"/></svg>";
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
   const fields=document.createElement("div");fields.className="daily-event-fields";const dateField=document.createElement("div");dateField.className="daily-event-field daily-event-date";dateField.append(date);const periodField=document.createElement("div");periodField.className="daily-event-field daily-event-period";periodField.append(session);fields.append(dateField,periodField);
   const actions=document.createElement("div");actions.className="daily-event-actions";save.className="daily-event-save";actions.append(save);
   editor.append(fields,actions,warning);
   const remove=document.createElement("button");remove.type="button";remove.className="daily-event-remove";
   remove.setAttribute("aria-label","Remover "+event.title);remove.title="Remover "+event.title;
   remove.innerHTML="<svg class=\"hugeicon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5\"/><path d=\"M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5\"/><path d=\"M9.5 16.5L9.5 10.5M14.5 16.5L14.5 10.5\"/></svg>";
   remove.onclick=async()=>{
     if(!confirm("Remover "+event.title+" deste dia? As refeições peri-treino associadas deixam também de ser contabilizadas."))return;
     remove.disabled=true;
     try{
       await api("/api/v2/player/events/"+encodeURIComponent(event.id),{method:"DELETE",
         headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf}});
       await overview();
     }catch(e){warning.textContent=e.message;editor.hidden=false;remove.disabled=false;}
   };
   section.append(toggle,remove,editor);
 }
 return section;
}
function matchWithIntraCard(event,item){
 const opts=item.options||[],avg=average(opts);
 const section=document.createElement("details");
 section.className="daily-event-card match-intra-card";
 const head=document.createElement("summary");head.className="daily-meal-head";
 const matchIcon=mealIcon("football");matchIcon.classList.add("meal-leading-icon");head.append(matchIcon);const label=document.createElement("strong");label.textContent=event.title;head.append(label);
 if(avg){
  const totals=document.createElement("span");totals.className="meal-average meal-average-inline";
  totals.append(nutrition(avg));head.append(totals);
 }
 section.append(head);
 if(opts.length===1){
  for(const food of opts[0].items||[]){
   section.append(periItemBlock(food));
  }
 }else opts.forEach((option,index)=>section.append(optionEl(option,index)));
 return section;
}

let supplementsByDay={};
function supplementsCard(items){
 const box=document.createElement("details");box.className="daily-supplements";
 const title=document.createElement("summary");title.textContent="Suplementação";box.append(title);const pill=mealIcon("pill");pill.classList.add("supplement-leading-icon");title.prepend(pill);
 for(const x of items){
  const line=document.createElement("div");line.className="supplement-entry";
  const name=document.createElement("strong");name.textContent=x.name+" · "+x.dose;
  const moment=document.createElement("small");moment.textContent=x.display_moment||x.timing_text||({"breakfast":"Pequeno-almoço","lunch":"Almoço","snack":"Lanche","dinner":"Jantar","supper":"Ceia","training":"Treino","match":"Jogo","lunch_or_dinner":"Almoço ou jantar"})[x.moment]||"Sem associação";
  line.append(name,moment);if(x.note){const note=document.createElement("small");note.textContent=x.note;line.append(note);}box.append(line);
 }
 return box;
}
function attachSupplements(card,items){
 if(!items.length)return;
 const area=document.createElement("div");area.className="supplement-in-meal";
 const label=document.createElement("strong");label.textContent="Suplementação";area.append(label);
 for(const x of items){const line=document.createElement("div");line.textContent=x.name+" · "+x.dose;area.append(line);}
 card.append(area);
}
function appendDailyEvents(host,date,session){
 for(const event of calendarEvents.filter(e=>e.event_date===date&&e.session===session)){
  const associated=periMeals.filter(p=>p.event_id===event.id&&p.event_date===date);
  const intra=event.kind==="match"?associated.find(p=>p.phase==="pre"):null;
  if(event.kind==="match"&&intra)host.append(matchWithIntraCard(event,intra));
  else{
   for(const item of associated.filter(p=>p.phase==="pre"))host.append(makePeriCard(item));
   host.append(eventCard(event));
  }
  const eventCardElement=Array.from(host.children).at(-1);
  if(eventCardElement&&event.kind&&eventCardElement.tagName==="DETAILS")attachSupplements(eventCardElement,(supplementsByDay[date]||[]).filter(x=>x.moment===event.kind));
  for(const item of associated.filter(p=>p.phase==="post"))host.append(makePeriCard(item));
 }
}
function appendWeeklyEvents(host,dates,session){
 if(!calendarEvents.some(e=>dates.includes(e.event_date)&&e.session===session))return;
 for(const date of dates){
  const slot=document.createElement("div");slot.className="weekly-event-slot";if(weeklySelection?.date===date)slot.classList.add("weekly-selected-column");
  for(const event of calendarEvents.filter(e=>e.event_date===date&&e.session===session)){
   const associated=periMeals.filter(p=>p.event_id===event.id&&p.event_date===date);
   const intra=event.kind==="match"?associated.find(p=>p.phase==="pre"):null;
   if(intra){
    const button=eventCard(event,true),avg=average(intra.options||[]);
    button.classList.add("weekly-meal");
    button.classList.add("weekly-match-with-intra");
    button.setAttribute("role","button");button.tabIndex=0;
    const active=weeklySelection?.periEventId===intra.event_id&&weeklySelection?.phase==="pre"&&weeklySelection?.date===date;
    button.setAttribute("aria-pressed",String(active));
    if(avg){const kcal=document.createElement("span");kcal.className="weekly-meal-kcal weekly-match-kcal";kcal.textContent=fmt(avg.kcal,0);button.append(kcal);}
    const select=()=>{weeklySelection=active?null:{date,periEventId:intra.event_id,phase:"pre"};if(weeklyContext)renderWeekly(weeklyContext.mon,weeklyContext.r,weeklyContext.weekMenus);};
    button.onclick=select;button.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select();}};
    slot.append(button);
   }else{
    for(const item of associated.filter(p=>p.phase==="pre"))slot.append(makePeriCard(item,true));
    slot.append(eventCard(event,true));
   }
   for(const item of associated.filter(p=>p.phase==="post"))slot.append(makePeriCard(item,true));
  }
  host.append(slot);
 }
}

async function overview(){
 const d=iso(day),mon=monday(day),end=new Date(mon);end.setDate(mon.getDate()+6);
 const r=await api("/api/v2/player/calendar?start="+iso(mon)+"&end="+iso(end));
 model=r.classifications;meals=r.meals;dayColorOverrides=Object.fromEntries((r.meal_color_overrides||[]).map(e=>[e.meal_date+"|"+e.meal,e.color]));periMeals=r.peri_meals||[];supplementsByDay=r.supplements_by_day||{};calendarEvents=(r.events||[]).concat((r.matches||[]).map(m=>({id:m.id,event_date:m.match_date,kind:"match",session:!m.match_time||m.match_time<"15:00"?"morning":"afternoon",title:"Jogo"})));
 const isWeek=overviewMode==="week";
 for(const b of document.querySelectorAll("#overview-mode button"))b.setAttribute("aria-pressed",String(b.dataset.view===overviewMode));
 $("week-strip").hidden=isWeek;$("date-title").hidden=isWeek;$("day-details").hidden=isWeek;$("weekly-view").hidden=!isWeek;
 if(isWeek){const weekMenus=await api("/api/v2/player/menus?start="+iso(mon)+"&end="+iso(end));renderWeekly(mon,r,weekMenus.menus||[]);return;}
 const menus=await api("/api/v2/player/menus?start="+d+"&end="+d);
 $("date-title").textContent=day.toLocaleDateString("pt-PT",{weekday:"short",day:"numeric",month:"numeric",year:"numeric"});
 const strip=$("week-strip");strip.replaceChildren();
 const prev=document.createElement("button");prev.type="button";prev.className="week-arrow";prev.textContent="‹";prev.setAttribute("aria-label","Dia anterior");prev.onclick=()=>{day.setDate(day.getDate()-7);overview().catch(error);};strip.append(prev);
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
 const next=document.createElement("button");next.type="button";next.className="week-arrow";next.textContent="›";next.setAttribute("aria-label","Dia seguinte");next.onclick=()=>{day.setDate(day.getDate()+7);overview().catch(error);};strip.append(next);
 const root=$("day-details");root.replaceChildren();
 const entry=r.days.find(x=>x.date===d);
 if(!entry?.classification&&!calendarEvents.some(e=>e.event_date===d)&&!meals.some(meal=>assignedColor(d,meal,entry?.classification))&&!(supplementsByDay[d]||[]).length){root.textContent="Sem programação definida para este dia.";return;}

 const total={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let complete=true,assigned=0;
 for(const meal of meals){const color=assignedColor(d,meal,entry?.classification);if(!color)continue;assigned++;const avg=average(plans[color]?.[meal]||[]);if(!avg){complete=false;continue;}for(const key in total)total[key]+=avg[key];}
 for(const item of periMeals.filter(x=>x.event_date===d)){assigned++;const avg=average(item.options||[]);if(!avg){complete=false;continue;}for(const key in total)total[key]+=avg[key];}
 if(assigned){
  const summary=document.createElement("section");summary.className="daily-nutrition nutrition-donut-summary";
  if(complete){
   const hero=document.createElement("div");hero.className="nutrition-hero";
   const energy=document.createElement("div");energy.className="nutrition-energy";
   const label=document.createElement("small");label.textContent="kcal";
   const value=document.createElement("strong");value.textContent=fmt(total.kcal,0);
   energy.append(label,value);
   const weight=Number(me?.weight_kg),hasWeight=Number.isFinite(weight)&&weight>0;
   if(hasWeight){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(total.kcal/weight,1)+" kcal/kg";energy.append(ratio);}
   hero.append(energy);summary.append(hero);
   const macros=document.createElement("div");macros.className="nutrition-macro-row";
   for(const [key,title,cls] of [["protein_g","Proteína","protein"],["carbs_g","Hidratos","carbs"],["fat_g","Gordura","fat"]]){
    const cell=document.createElement("div");cell.className="nutrition-macro "+cls;
    const name=document.createElement("small");name.textContent=title;
    const grams=document.createElement("strong");grams.textContent=fmt(total[key],0)+" g";
    cell.append(name,grams);
    if(hasWeight){const ratio=document.createElement("small");ratio.className="per-kg";ratio.textContent=fmt(total[key]/weight,1)+" g/kg";cell.append(ratio);}
    macros.append(cell);
   }
   summary.append(macros);
   const expand=document.createElement("button");expand.type="button";expand.className="nutrition-expand";expand.setAttribute("aria-expanded","false");expand.setAttribute("aria-label","Expandir resumo nutricional");expand.textContent="";
   const weeklyCharts=document.createElement("div");weeklyCharts.className="nutrition-weekly-charts";weeklyCharts.hidden=true;
   const weekDays=[];
   for(let offset=0;offset<7;offset++){
    const date=new Date(mon);date.setDate(mon.getDate()+offset);const key=iso(date);
    const dayModel=r.days?.find(x=>x.date===key);
    const sum={kcal:0,protein_g:0,carbs_g:0,fat_g:0};let found=false;
    for(const meal of meals){const color=assignedColor(key,meal,dayModel?.classification);const a=average(plans[color]?.[meal]||[]);if(a){found=true;for(const nutrient of Object.keys(sum))sum[nutrient]+=Number(a[nutrient]||0);}}
    for(const peri of periMeals.filter(x=>x.event_date===key)){const a=average(peri.options||[]);if(a){found=true;for(const nutrient of Object.keys(sum))sum[nutrient]+=Number(a[nutrient]||0);}}
    weekDays.push({date,key,total:sum,found});
   }
   function buildBars(title,key,color,scale,decimals=0){
    const wrap=document.createElement("section");wrap.className="nutrition-chart-section";
    const heading=document.createElement("strong");heading.textContent=title;wrap.append(heading);
    const bars=document.createElement("div");bars.className="nutrition-chart-bars";
    const valid=weekDays.filter(x=>x.found&&Number.isFinite(x.total[key]/scale));
    const mean=valid.length?valid.reduce((sum,x)=>sum+x.total[key]/scale,0)/valid.length:null;
    const max=Math.max(1,...weekDays.map(x=>x.found?x.total[key]/scale:0),mean||0);
    for(const item of weekDays){
     const column=document.createElement("div");column.className="nutrition-chart-column";
     if(item.key===iso(new Date()))column.classList.add("nutrition-chart-today");
     const n=document.createElement("span");n.className="nutrition-chart-number";n.textContent=item.found?fmt(item.total[key]/scale,decimals):"–";n.style.color=color;n.style.color=color;
     const track=document.createElement("div");track.className="nutrition-chart-track";
     const fill=document.createElement("div");fill.className="nutrition-chart-fill";fill.style.height=(item.found?Math.max(4,item.total[key]/scale/max*100):0)+"%";fill.style.background=color;track.append(fill);
     const dayLabel=document.createElement("small");dayLabel.textContent=String(new Date(item.key+"T12:00:00").getDate());column.append(n,track,dayLabel);bars.append(column);
    }
    if(mean!==null){
     const line=document.createElement("div");line.className="nutrition-chart-average";
     line.style.setProperty("--avg-offset",String(72*Math.min(1,mean/max))+"px");
     line.setAttribute("aria-label","Média semanal: "+fmt(mean,decimals)+(key==="kcal"?" kcal":scale===1?" g":" g/kg"));
     bars.append(line);
    }
    wrap.append(bars);return wrap;
   }
   weeklyCharts.append(buildBars("Calorias da semana","kcal","#82d4a4",1));
   const macroHeader=document.createElement("div");macroHeader.className="macro-chart-header";const macroTitle=document.createElement("strong");macroTitle.textContent="Macros da semana";macroTitle.className="macro-chart-heading";macroHeader.append(macroTitle);weeklyCharts.append(macroHeader);
   const modes=document.createElement("div");modes.className="macro-chart-switch";const gramsMode=document.createElement("button");gramsMode.textContent="g";const kgMode=document.createElement("button");kgMode.textContent="g/kg";modes.append(gramsMode,kgMode);macroHeader.append(modes);
   const macArea=document.createElement("div");weeklyCharts.append(macArea);
   const renderMacroMode=mode=>{
    macArea.replaceChildren();if(mode==="kg"&&!hasWeight){const info=document.createElement("p");info.className="hint";info.textContent="Para consultar g/kg, adiciona o peso do jogador ao perfil.";macArea.append(info);return;}gramsMode.classList.toggle("selected",mode==="g");kgMode.classList.toggle("selected",mode==="kg");
    const divisor=mode==="kg"?(hasWeight?weight:NaN):1;
    for(const [key,title,color] of [["protein_g","Proteína","#64b4f7"],["carbs_g","Hidratos","#f0a077"],["fat_g","Gordura","#eed076"]])macArea.append(buildBars(title,key,color,divisor,mode==="kg"?1:0));
   };
   gramsMode.onclick=e=>{e.stopPropagation();renderMacroMode("g");};kgMode.onclick=e=>{e.stopPropagation();renderMacroMode("kg");};kgMode.disabled=false;kgMode.title=hasWeight?"Valores por quilograma":"Peso do jogador indisponível no perfil";
   renderMacroMode("g");
   expand.onclick=()=>{weeklyCharts.hidden=!weeklyCharts.hidden;expand.setAttribute("aria-expanded",String(!weeklyCharts.hidden));};
   summary.append(expand,weeklyCharts);
  }else{const note=document.createElement("p");note.className="hint";note.textContent="Resumo incompleto: existem refeições sem plano publicado.";summary.append(note);}
  root.append(summary);
 }
 for(const meal of meals){
  if(meal==="lunch")appendDailyEvents(root,d,"morning");
  if(meal==="dinner")appendDailyEvents(root,d,"afternoon");
  const color=assignedColor(d,meal,entry?.classification),menu=(meal==="lunch"||meal==="dinner")?menus.menus.find(x=>x.meal===meal):null;
  if(!color&&!menu)continue;
  const section=document.createElement("details");section.className="meal daily-meal"+(color?" tone-"+color:"");
  const head=document.createElement("summary");head.className="daily-meal-head";const title=document.createElement("strong");title.textContent=names[meal];head.append(title);decorateLabel(head,meal);
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
    appendMealItems(body,single.items);
    section.append(body);
   }else options.forEach((o,i)=>{const card=optionEl(o,i);card.classList.add("player-meal-option-subcard");section.append(card);});
  }
  attachSupplements(section,(supplementsByDay[d]||[]).filter(x=>(x.moment===meal||(meal==="lunch"&&x.moment==="lunch_or_dinner"))));
  root.append(section);
 }
 if((supplementsByDay[d]||[]).length)root.append(supplementsCard(supplementsByDay[d]));
}
function openPlansSection(section){
 $("plans-landing").hidden=section!=="landing";
 $("plans-prescriptions").hidden=section!=="prescriptions";
 $("plans-assessments").hidden=section!=="assessments";
 if(section==="prescriptions")renderPlans();
 if(section==="assessments")loadPlayerAssessments().catch(err=>{$("assessment-measurements").textContent="Não foi possível carregar as avaliações.";});
}
function renderPlans(){
 const root=$("plan-colors"),detail=$("plan-detail");root.replaceChildren();detail.replaceChildren();
 const available=Object.keys(plans).filter(c=>Object.values(plans[c]).some(a=>a.length));
 for(const color of available){
  const b=document.createElement("button"),dot=document.createElement("span");dot.className="color-dot "+color;
  b.append(dot,document.createTextNode(colorNames[color]));b.className=selectedColor===color?"selected":"";
  b.onclick=()=>{selectedColor=selectedColor===color?null:color;renderPlans();};root.append(b);
 }
 for(const [kind,label] of [["training","Peri-treino"],["match","Peri-jogo"]]){
  const published=periPlans[kind]?.options;
  if(!published||!Object.values(published).some(options=>options.length))continue;
  const key="peri-"+kind,b=document.createElement("button");b.textContent=label;
  b.className=selectedColor===key?"selected":"";
  b.onclick=()=>{selectedColor=selectedColor===key?null:key;renderPlans();};root.append(b);
 }
 const supplementButton=document.createElement("button");supplementButton.textContent="Suplementação";supplementButton.className=selectedColor==="supplements"?"selected":"";
 supplementButton.onclick=()=>{selectedColor=selectedColor==="supplements"?null:"supplements";renderPlans();};root.append(supplementButton);
 if(!selectedColor)return;
 if(selectedColor==="supplements"){renderSupplementPlan().catch(error);return;}
 if(selectedColor.startsWith("peri-")){
  const kind=selectedColor.slice(5),published=periPlans[kind]?.options||{};
  for(const [phase,label] of [["pre",kind==="match"?"Intra-jogo":"Pré-treino"],["post",kind==="match"?"Pós-jogo":"Pós-treino"]]){
   const opts=published[phase]||[];if(!opts.length)continue;
   const section=document.createElement("section");section.className="meal plan-meal";
   const header=document.createElement("div");header.className="option";
   const heading=document.createElement("h3");heading.textContent=label;header.append(heading);
   const avg=average(opts);if(avg)header.append(nutrition(avg));section.append(header);
   opts.forEach((o,i)=>{const item=optionEl(o,i,true);item.classList.add("plan-option-card");section.append(item);});
   detail.append(section);
  }
  return;
 }
 if(!plans[selectedColor])return;
 for(const meal of ["breakfast","lunch","snack","dinner","supper"]){
  const opts=plans[selectedColor][meal]||[];if(!opts.length)continue;
  const section=document.createElement("details");section.className="meal daily-meal plan-overview-meal tone-"+selectedColor;
  const header=document.createElement("summary");header.className="daily-meal-head";
  const h=document.createElement("strong");h.textContent=names[meal];header.append(h);decorateLabel(header,meal);
  const avg=average(opts);if(avg){const totals=document.createElement("span");totals.className="meal-average meal-average-inline";totals.append(nutrition(avg));header.append(totals);}
  section.append(header);
  if(opts.length===1){
   const body=document.createElement("div");body.className="single-meal-option";
   appendMealItems(body,opts[0].items);
   section.append(body);
  }else opts.forEach((o,i)=>{const card=optionEl(o,i);card.classList.add("player-meal-option-subcard");section.append(card);});
  detail.append(section);
 }
}
const dishPhotoCache=new Map();
let menuRenderToken=0;
function cachedDishPhoto(id){
 const key=String(id);
 if(!dishPhotoCache.has(key)){
  const url="/api/v2/player/dish-photo/"+encodeURIComponent(key)+"?v=2";
  const pending=fetch(url,{credentials:"same-origin"}).then(r=>{if(!r.ok)throw Error("Foto indisponível");return r.blob();}).then(blob=>URL.createObjectURL(blob)).catch(()=>null);
  dishPhotoCache.set(key,pending);
 }
 return dishPhotoCache.get(key);
}
function openDishPhoto(src,alt){
 if(!src)return;
 const overlay=document.createElement("div");overlay.className="dish-photo-overlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label",alt||"Fotografia do prato");
 const close=document.createElement("button");close.type="button";close.className="dish-photo-close";close.textContent="×";close.setAttribute("aria-label","Fechar fotografia");
 const image=document.createElement("img");image.src=src;image.alt=alt||"Prato";
 const previous=document.activeElement;const dismiss=()=>{overlay.remove();document.removeEventListener("keydown",onKey);previous?.focus?.();};
 const onKey=e=>{if(e.key==="Escape")dismiss();};
 close.onclick=dismiss;overlay.onclick=e=>{if(e.target===overlay)dismiss();};document.addEventListener("keydown",onKey);
 overlay.append(close,image);document.body.append(overlay);close.focus();
}
async function menusView(){const start=monday(menuWeek),end=new Date(start);end.setDate(end.getDate()+6);$("menu-week").textContent= start.getMonth()===end.getMonth()&&start.getFullYear()===end.getFullYear()?start.getDate()+" a "+end.getDate()+" de "+start.toLocaleDateString("pt-PT",{month:"long",year:"numeric"}):start.getDate()+" de "+start.toLocaleDateString("pt-PT",{month:"long"})+" a "+end.getDate()+" de "+end.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});const [m,c,dishResponse]=await Promise.all([api("/api/v2/player/menus?start="+iso(start)+"&end="+iso(end)),api("/api/v2/player/calendar?start="+iso(start)+"&end="+iso(end)),api("/api/v2/player/dishes")]);const dishMap=new Map(dishResponse.dishes.map(x=>[x.name_pt,x.id]));const root=$("menu-days");const renderToken=++menuRenderToken;const fragment=document.createDocumentFragment();for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=iso(d),dayClass=c.days.find(x=>x.date===key);const section=document.createElement("section");section.className="day-menu";const h=document.createElement("div");h.className="menu-day-heading";const title=document.createElement("h3");title.textContent=d.toLocaleDateString("pt-PT",{weekday:"long"});title.textContent=title.textContent.charAt(0).toUpperCase()+title.textContent.slice(1);const sub=document.createElement("span");sub.className="menu-day-subtitle";sub.textContent=String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+(dayClass?.classification?" · "+dayClass.classification:"");h.append(title,sub);section.append(h);for(const meal of ["lunch","dinner"]){const menu=m.menus.find(x=>x.menu_date===key&&x.meal===meal);if(!menu)continue;const div=document.createElement("div");div.className="row menu-entry";
 const label=document.createElement("strong");label.textContent=names[meal];
 const rowClass=c.classifications.find(x=>x.name===dayClass?.classification);const override=(c.meal_color_overrides||[]).find(x=>x.meal_date===key&&x.meal===meal);const color=Object.prototype.hasOwnProperty.call(menu,"effective_color")?menu.effective_color:(override?override.color:rowClass?.meals?.[meal]);
 div.classList.add(color&&color!=="none"?"tone-"+color:"tone-neutral");const title=document.createElement("div");title.className="menu-entry-heading";
 if(color&&color!=="none"){const dot=document.createElement("span");dot.className="color-dot "+color;title.append(dot);}
 title.append(label);
 const body=document.createElement("div");body.className="menu-entry-body";
 const name=document.createElement("span");name.className="value";name.textContent=menu.value;body.append(name);
 if(menu.kind==="dish"&&dishMap.has(menu.value)){
  const photo=document.createElement("img");photo.className="dish-img";photo.alt=menu.value;photo.loading="lazy";photo.decoding="async";const dishId=dishMap.get(menu.value);cachedDishPhoto(dishId).then(src=>{if(!src)return;photo.src=src;photo.classList.add("dish-photo-ready");photo.tabIndex=0;photo.setAttribute("role","button");photo.setAttribute("aria-label","Ampliar fotografia: "+menu.value);photo.onclick=()=>openDishPhoto(src,menu.value);photo.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDishPhoto(src,menu.value);}};});body.append(photo);
 }
 div.append(title,body);section.append(div);}fragment.append(section);}if(renderToken===menuRenderToken)root.replaceChildren(fragment);}
function error(e){if(e.status===401||e.status===403)return;$("status").textContent=e.message||String(e);}
$("login-form").onsubmit=async e=>{e.preventDefault();$("login-error").textContent="";try{await api("/api/login",{method:"POST",body:JSON.stringify({identifier:$("username").value.trim().toLowerCase(),password:$("password").value})});$("password").value="";await session();}catch(err){$("login-error").textContent="Não foi possível entrar. Verifica as credenciais e tenta novamente.";}};$("logout").onclick=async()=>{const button=$("logout");button.disabled=true;try{await api("/api/logout",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":playerCsrf},body:"{}"});playerCsrf="";revokePlayerView();$("status").textContent="";$("login-error").textContent="";}catch(err){$("status").textContent="Não foi possível terminar a sessão. Tenta novamente.";}finally{button.disabled=false;}};for(const b of document.querySelectorAll("[data-tab]"))b.onclick=()=>show(b.dataset.tab).catch(error);for(const [id,n] of [["menu-prev",-7],["menu-next",7]])$(id).onclick=()=>{menuWeek.setDate(menuWeek.getDate()+n);menusView().catch(error);};for(const b of document.querySelectorAll("#overview-mode button"))b.onclick=()=>{overviewMode=b.dataset.view;weeklySelection=null;overview().catch(error);};$("player-avatar").onclick=()=>show("profile").catch(error);$("profile-logout").onclick=()=>$("logout").click();
$("profile-password-toggle").onclick=()=>{const form=$("profile-password-form");form.hidden=!form.hidden;};
$("profile-password-form").onsubmit=async e=>{
 e.preventDefault();const feedback=$("profile-password-feedback"),button=e.currentTarget.querySelector('button[type="submit"]');
 const current=$("profile-current-password").value,next=$("profile-new-password").value,confirm=$("profile-confirm-password").value;
 if(next!==confirm){feedback.textContent="As novas palavras-passe não coincidem.";return;}
 if(next.length<8){feedback.textContent="Utiliza pelo menos 8 caracteres.";return;}
 if(!profileUsername){feedback.textContent="Não foi possível identificar a conta. Volta a iniciar sessão.";return;}
 button.disabled=true;feedback.textContent="";
 try{await api("/api/change-password",{method:"POST",body:JSON.stringify({identifier:profileUsername,current_password:current,new_password:next})});
 $("profile-current-password").value="";$("profile-new-password").value="";$("profile-confirm-password").value="";
 revokePlayerView();$("status").textContent="Palavra-passe alterada. Inicia sessão novamente.";
 }catch(err){feedback.textContent="Não foi possível alterar a palavra-passe. Confirma a palavra-passe atual e tenta novamente.";}finally{button.disabled=false;}
};
for(const item of document.querySelectorAll("#profile .mile-icon")){const name=[...item.classList].find(x=>x.startsWith("icon-"))?.slice(5);if(name)item.replaceWith(mealIcon(name));}

loadOfficialHugeicons();
for(const icon of document.querySelectorAll("#plans-landing .mile-icon")){const name=[...icon.classList].find(x=>x.startsWith("icon-"))?.slice(5);if(name)icon.replaceWith(mealIcon(name));}
for(const icon of document.querySelectorAll("#tabs .mile-icon")){const name=[...icon.classList].find(x=>x.startsWith("icon-"))?.slice(5);if(name)icon.replaceWith(mealIcon(name));}
updateOfficialIcons();
$("plans-open-prescriptions").onclick=()=>openPlansSection("prescriptions");
$("plans-open-assessments").onclick=()=>openPlansSection("assessments");
$("plans-back-prescriptions").onclick=()=>openPlansSection("landing");
$("plans-back-assessments").onclick=()=>openPlansSection("landing");
session().catch(()=>{$("login-panel").hidden=false;});


/* Player anthropometry data. Only clinician-published measurements are shown. */
let assessmentRecords=[],assessmentFields={},assessmentAverages=[],assessmentGroup="resumo";
const assessNumber=value=>Number(value).toLocaleString("pt-PT",{minimumFractionDigits:1,maximumFractionDigits:1});
function assessmentDate(iso){if(!iso)return"";const parts=iso.split("-");return parts.length===3?parts[2]+"/"+parts[1]+"/"+parts[0]:iso;}
async function loadPlayerAssessments(){
 $("assessment-measurements").textContent="A carregar avaliações…";
 const response=await api("/api/v2/player/assessments");
 assessmentRecords=response.assessments||[];
 assessmentFields=response.fields||{};
 assessmentAverages=response.averages_fields||[];
 renderPlayerAssessments();
}

function buildAssessmentTrend(points,unit,axisStep){
 const holder=document.createElement("div");holder.className="assessment-trend";
 const history=document.createElement("details");history.className="assessment-history-card";
 const historySummary=document.createElement("summary");historySummary.textContent="Todas as avaliações ("+points.length+")";history.append(historySummary);
 const rows=document.createElement("div");rows.className="assessment-history-points";
 points.slice().reverse().forEach(p=>{const row=document.createElement("div"),date=document.createElement("span"),value=document.createElement("strong");date.textContent=assessmentDate(p.date);value.textContent=assessNumber(p.value)+(unit?" "+unit:"");row.append(date,value);rows.append(row);});history.append(rows);
 if(points.length<2){
  const note=document.createElement("p");note.className="assessment-trend-note";note.textContent="O gráfico ficará disponível após duas avaliações com este parâmetro.";holder.append(note,history);return holder;
 }
 const visible=points.slice(-10),values=visible.map(p=>p.value);
 const step=axisStep||(unit==="kg"||unit==="cm"?1:unit==="mm"?5:1);
 const minimum=Math.min(...values),maximum=Math.max(...values);
 let low=Math.floor(minimum/step)*step,high=Math.ceil(maximum/step)*step;
 if(low===high){low-=step;high+=step;}
 const tickCount=Math.round((high-low)/step);
 const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
 const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
 svg.setAttribute("viewBox","0 0 344 176");svg.setAttribute("preserveAspectRatio","xMidYMid meet");
 svg.setAttribute("role","img");svg.setAttribute("aria-label","Evolução das últimas "+visible.length+" avaliações. Média: "+assessNumber(mean)+(unit?" "+unit:""));
 const left=27,right=338,top=22,bottom=148;
 const y=v=>bottom-(v-low)/(high-low)*(bottom-top),x=i=>left+(right-left)*i/(visible.length-1);
 const add=(tag,attributes,css,text)=>{const node=document.createElementNS(ns,tag);for(const [name,value]of Object.entries(attributes||{}))node.setAttribute(name,String(value));if(css)node.setAttribute("class",css);if(text!==undefined)node.textContent=text;svg.append(node);return node;};
 for(let i=0;i<=tickCount;i++){
  const v=low+i*step,yy=y(v);
  add("line",{x1:left,y1:yy,x2:right,y2:yy},"assessment-chart-grid");
  add("text",{x:left-8,y:yy+3.5,"text-anchor":"end"},"assessment-chart-tick",String(Math.round(v)));
 }
 add("line",{x1:left,y1:y(mean),x2:right,y2:y(mean)},"assessment-chart-mean");
 const coords=visible.map((p,i)=>[x(i),y(p.value)]);
 add("polyline",{points:coords.map(p=>p.join(",")).join(" ")},"assessment-chart-line");
 const labels=[],dots=[];
 coords.forEach(([cx,cy],i)=>{
  dots.push(add("circle",{cx,cy,r:4.5},"assessment-chart-point"));
  labels.push(add("text",{x:cx,y:Math.max(12,cy-10),"text-anchor":"middle"},"assessment-chart-value",assessNumber(visible[i].value)));
 });
 const guide=add("line",{x1:left,y1:top,x2:left,y2:bottom},"assessment-chart-guide");
 guide.style.display="none";
 const focus=document.createElement("div");focus.className="assessment-chart-focus";focus.setAttribute("aria-live","off");
 const avg=document.createElement("div");avg.className="assessment-chart-average";avg.textContent="— Média: "+assessNumber(mean)+(unit?" "+unit:"");
 let active=-1;
 const highlight=index=>{
  active=index;
  const p=visible[index];guide.setAttribute("x1",coords[index][0]);guide.setAttribute("x2",coords[index][0]);
  guide.style.display="";
  dots.forEach((dot,i)=>dot.classList.toggle("is-selected",i===index));
  focus.textContent=assessmentDate(p.date);
  labels.forEach((label,i)=>label.classList.toggle("is-selected",i===index));
 };
 const clear=()=>{active=-1;guide.style.display="none";dots.forEach(dot=>dot.classList.remove("is-selected"));focus.textContent="";labels.forEach(l=>l.classList.remove("is-selected"));};
 const move=event=>{
  const rect=svg.getBoundingClientRect();if(!rect.width)return;
  const px=(event.clientX-rect.left)/rect.width*344;
  let nearest=0;for(let i=1;i<coords.length;i++)if(Math.abs(coords[i][0]-px)<Math.abs(coords[nearest][0]-px))nearest=i;
  if(nearest!==active)highlight(nearest);
 };
 svg.addEventListener("pointerdown",event=>{if(svg.setPointerCapture)svg.setPointerCapture(event.pointerId);move(event);});
 svg.addEventListener("pointermove",event=>{if(event.pointerType==="mouse"&&event.buttons===0&&active===-1)return;move(event);});
 svg.addEventListener("pointerup",()=>{});
 svg.addEventListener("pointercancel",clear);
 svg.addEventListener("pointerleave",event=>{if(event.pointerType==="mouse")clear();});
 clear();
 holder.append(svg,focus,avg,history);
 return holder;
}
function renderPlayerAssessments(){
 for(const button of document.querySelectorAll("[data-assessment-tab]"))button.setAttribute("aria-pressed",String(button.dataset.assessmentTab===assessmentGroup));
 const target=$("assessment-measurements"),stamp=$("assessment-most-recent");target.replaceChildren();stamp.replaceChildren();
 if(!assessmentRecords.length){
  const empty=document.createElement("p");empty.className="assessment-empty-state";empty.textContent="Ainda não existem avaliações publicadas.";target.append(empty);return;
 }
 const recent=assessmentRecords[assessmentRecords.length-1];
 stamp.textContent="Última avaliação · "+assessmentDate(recent.assessed_on);
 for(const [key,label,unit] of assessmentFields[assessmentGroup]||[]){
  const readings=assessmentRecords.filter(r=>Number.isFinite(r.measurements?.[key])).map(r=>({date:r.assessed_on,value:Number(r.measurements[key])}));
  const current=readings.length?readings[readings.length-1]:null,prior=readings.length>1?readings[readings.length-2]:null;
  const details=document.createElement("details");details.className="assessment-measure-card";
  const summary=document.createElement("summary");
  const left=document.createElement("span");left.className="assessment-metric-name";left.textContent=unit&&!label.endsWith("("+unit+")")?label+" ("+unit+")":label;
  const right=document.createElement("span");right.className="assessment-metric-right";
  const number=document.createElement("strong");number.textContent=current?assessNumber(current.value):"—";right.append(number);
  const change=document.createElement("small");change.className="assessment-change";
  if(prior&&current){let delta=Math.round((current.value-prior.value)*1000)/1000;change.textContent=(delta>0?"+":delta<0?"−":"")+assessNumber(Math.abs(delta));}
  else change.textContent=current?"Primeira medição":"Sem dados";
  right.append(change);
  const arrow=document.createElement("span");arrow.className="assessment-expander";arrow.setAttribute("aria-hidden","true");
  summary.append(left,right,arrow);details.append(summary,buildAssessmentTrend(readings,unit,assessmentGroup==="pregas"&&unit==="mm"?2:assessmentGroup==="resumo"&&unit==="mm"?5:undefined));target.append(details);
 }
 if(assessmentGroup==="resumo"){
  const recentAverages=recent.averages||{},known=assessmentAverages.filter(([key])=>recentAverages[key]!==undefined);
  if(known.length){const averages=document.createElement("div");averages.className="assessment-averages";const head=document.createElement("h3");head.textContent="Médias do relatório";averages.append(head);
   for(const [key,label,unit] of known){const row=document.createElement("div"),l=document.createElement("span"),v=document.createElement("strong");l.textContent=label;v.textContent=assessNumber(recentAverages[key])+(unit?" "+unit:"");row.append(l,v);averages.append(row);}target.append(averages);}
  if(recent.formula_note){const note=document.createElement("p");note.className="assessment-formula";note.textContent="Gordura corporal: "+recent.formula_note;target.append(note);}
 }
 if(!target.children.length){const empty=document.createElement("p");empty.className="assessment-empty-state";empty.textContent="Ainda não existem medições publicadas nesta categoria.";target.append(empty);}
}
for(const button of document.querySelectorAll("[data-assessment-tab]"))button.onclick=()=>{assessmentGroup=button.dataset.assessmentTab;renderPlayerAssessments();};
