"use strict";
(()=> {
 const $=id=>document.getElementById(id);
 const section=$("tm-dashboard"),legacy=$("tm-admin-legacy"),dash=$("tm-admin-nav-dashboard"),playersBtn=$("tm-admin-nav-players");
 if(!section||!legacy||!dash)return;
 const meals=["breakfast","lunch","snack","dinner","supper"];
 const icons=["☕","♜","♧","♧","☾"];
 let weekMonday,selected=null,seq=0,cache=null;
 function dateParts(date){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));return obj.year+"-"+obj.month+"-"+obj.day;}
 function monday(dateString){const d=new Date(dateString+"T12:00:00Z");const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10);}
 function shifted(iso,delta){const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
 function dateLabel(d){return new Intl.DateTimeFormat("pt-PT",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(d+"T12:00:00Z"));}
 function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
 function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
 function navActive(target){for(const b of document.querySelectorAll(".tm-admin-nav-link")){b.classList.toggle("is-active",b===target);if(b===target)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");}}
 function openDashboard(){if($("admin-workspace").hidden)return;legacy.hidden=true;section.hidden=false;navActive(dash);load().catch(err=>showError(err));window.scrollTo({top:0,behavior:"smooth"});}
 async function openPlayers(aid,day){
 section.hidden=true;legacy.hidden=false;navActive(playersBtn);
 try{
  if(aid&&$("athlete")){
   const choice=$("athlete");
   if([...choice.options].some(o=>o.value===aid)&&choice.value!==aid){
    choice.value=aid;
    if(typeof loadModel==="function")await loadModel();
   }
  }
  if(day){
   const d=new Date(day+"T12:00:00Z");
   if(typeof calendarMonth!=="undefined")calendarMonth=new Date(d.getUTCFullYear(),d.getUTCMonth(),1);
   if(typeof selectedCalendarDay!=="undefined")selectedCalendarDay=day;
   if(typeof showBackofficeView==="function")showBackofficeView("calendar");
  }
 }catch(err){if(typeof status==="function")status("Não foi possível abrir o jogador: "+err.message,"warn");}
 window.scrollTo({top:0,behavior:"smooth"});
 }
 dash.addEventListener("click",openDashboard);
 playersBtn.addEventListener("click",()=>openPlayers());
 const chooseAccount=$("tm-admin-nav-account");if(chooseAccount)chooseAccount.addEventListener("click",()=>{section.hidden=true;legacy.hidden=false;navActive(chooseAccount);});
 function showError(err){$("tm-db-error").textContent="Não foi possível consultar o Dashboard: "+err.message;}
 function paintEvents(data){const host=$("tm-db-events");host.replaceChildren();const eventData=data.today_events||{};const groups=[
 ["Jogos de hoje",eventData.games||[],"game"],
 ["Aniversários",eventData.birthdays||[],"birthday"],
 ["Respostas recentes",eventData.recent_responses||[],"response"],
 ["Pesagens de hoje",eventData.weighins||[],"weight"]];
 let hasItems=false;
 for(const [title,items,type] of groups){if(!items.length)continue;hasItems=true;const group=el("div","tm-db-event-group");group.append(el("h3","",title));for(const item of items){const btn=el("button","tm-db-event");btn.type="button";const label=type==="game"?(item.time?"Jogo às "+item.time:"Jogo agendado"):type==="birthday"?"Aniversário":type==="response"?(item.kind==="post_match"?"Resposta pós-jogo":"Avaliação publicada"):Number(item.weight_kg).toLocaleString("pt-PT",{maximumFractionDigits:1})+" kg";const line=el("span","",item.name);const meta=el("small","",label);btn.append(line,meta);btn.addEventListener("click",()=>openPlayers(item.athlete_id,type==="game"?data.today:type==="response"?(item.match_date||item.assessed_on):data.today));group.append(btn);}host.append(group);}
 if(!hasItems)host.append(el("p","tm-db-none","Sem acontecimentos ou respostas recentes a apresentar."));
 }
 function renderTable(data){const head=$("tm-db-thead"),body=$("tm-db-tbody");head.replaceChildren();body.replaceChildren();const today=data.today;const header=el("tr");const name=el("th","tm-db-name-cell");const search=el("input","tm-db-search");search.type="search";search.placeholder="Filtrar jogador";search.setAttribute("aria-label","Filtrar jogadores da matriz");name.append(el("span","tm-db-name-heading","Jogador"),search);header.append(name);
 const days=Array.from({length:7},(_,i)=>shifted(weekMonday,i));for(const [i,day] of days.entries()){const th=el("th",day===today?"tm-db-today":"");const lab=el("div","tm-db-date",["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][i]);const d=el("div","tm-db-day",dateLabel(day));const ico=el("div","tm-db-icon-row");for(const icon of icons)ico.append(el("span","",icon));th.append(lab,d,ico);header.append(th);}head.append(header);
 for(const player of data.players||[]){const tr=el("tr");tr.dataset.name=player.name.toLocaleLowerCase("pt-PT");const first=el("td","tm-db-name-cell");const btn=el("button","tm-db-player-name",player.name);btn.addEventListener("click",()=>openPlayers(player.id));first.append(btn);tr.append(first);for(const item of player.days){const td=el("td",item.date===today?"tm-db-today":"");const cell=el("button","tm-db-cell");cell.type="button";cell.setAttribute("aria-label",player.name+", "+item.date+", "+(item.classification||"sem MD"));if(selected&&selected.id===player.id&&selected.date===item.date)cell.classList.add("tm-db-selected");cell.append(el("span","tm-db-md",item.classification||"—"));const dots=el("span","tm-db-dots");for(const meal of meals){const value=item.colors?.[meal];const dot=el("span","tm-db-dot "+(value?("tm-db-"+value):"tm-db-none-dot"));dot.title=(names&&names[meal]||meal)+": "+(value||"não prescrito");dots.append(dot);}cell.append(dots);cell.addEventListener("click",()=>{selected={id:player.id,date:item.date};openPlayers(player.id,item.date);});td.append(cell);tr.append(td);}body.append(tr);}
 search.addEventListener("input",()=>{const q=search.value.trim().toLocaleLowerCase("pt-PT");let count=0;for(const tr of body.children){tr.hidden=!!q&&!tr.dataset.name.includes(q);if(!tr.hidden)count++;}$("tm-db-count").textContent=count+" jogador"+(count===1?"":"es");});$("tm-db-count").textContent=(data.players||[]).length+" jogadores";
 $("tm-db-week-title").textContent=dateLabel(days[0])+" – "+dateLabel(days[6]);$("tm-db-today-date").textContent=new Intl.DateTimeFormat("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(today+"T12:00:00Z"));
 }
 async function load(){const id=++seq;if(!weekMonday)weekMonday=monday(dateParts(new Date()));$("tm-db-error").textContent="";$("tm-db-events").textContent="A consultar…";const res=await request("/api/v2/admin/dashboard?week="+encodeURIComponent(weekMonday));if(id!==seq)return;cache=res;renderTable(res);paintEvents(res);}
 $("tm-db-prev").addEventListener("click",()=>{weekMonday=shifted(weekMonday,-7);load().catch(showError);});
 $("tm-db-next").addEventListener("click",()=>{weekMonday=shifted(weekMonday,7);load().catch(showError);});
 $("tm-db-go-today").addEventListener("click",()=>{weekMonday=monday(dateParts(new Date()));load().catch(showError);});
})();
