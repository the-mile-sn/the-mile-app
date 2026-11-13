"use strict";
/* Agendamentos — first-stage administrative shell.
 * No booking is created and no existing appointment is fetched in this phase.
 */
(()=>{
 const byId=id=>document.getElementById(id);
 const root=byId("tm-appointments-root"),auth=byId("tm-appointments-auth");
 if(!root||!auth)return;
 const tabNames=["agenda","reservas","configuracao"];
 const range=byId("tm-appointments-range"),days=byId("tm-appointments-days");
 const locale=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"});
 const longRange=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric"});
 const lisbon=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"});
 function todayInLisbon(){
  const parts=Object.fromEntries(lisbon.formatToParts(new Date()).map(part=>[part.type,part.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
 }
 function utcDay(iso){return new Date(iso+"T12:00:00Z");}
 function shift(iso,delta){const d=utcDay(iso);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
 function monday(iso){const day=(utcDay(iso).getUTCDay()+6)%7;return shift(iso,-day);}
 let selected=todayInLisbon(),view="week";
 function render(){
  const now=todayInLisbon(),dates=view==="day"?[selected]:Array.from({length:7},(_,i)=>shift(monday(selected),i));
  const first=dates[0],last=dates[dates.length-1];
  const title=view==="day"?longRange.format(utcDay(selected)):
   new Intl.DateTimeFormat("pt-PT",{day:"numeric",month:"short",timeZone:"UTC"}).format(utcDay(first))+" – "+longRange.format(utcDay(last));
  range.textContent=title;
  byId("tm-appointments-previous").setAttribute("aria-label",view==="week"?"Semana anterior":"Dia anterior");
  byId("tm-appointments-next").setAttribute("aria-label",view==="week"?"Semana seguinte":"Dia seguinte");
  days.classList.toggle("is-day",view==="day");
  days.replaceChildren();
  for(const iso of dates){
   const node=document.createElement("div");
   node.className="tm-appointments-day"+(iso===now?" is-today":"");
   if(iso===now)node.setAttribute("aria-current","date");
   const dayName=document.createElement("small");
   dayName.textContent=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",weekday:"short"}).format(utcDay(iso));
   const date=document.createElement("strong");
   date.textContent=new Intl.DateTimeFormat("pt-PT",{timeZone:"UTC",day:"2-digit",month:"short"}).format(utcDay(iso));
   node.append(dayName,date);
   days.append(node);
  }
 }
 function setView(next){
  view=next;
  for(const btn of document.querySelectorAll("[data-appointments-view]")){
   const active=btn.dataset.appointmentsView===next;
   btn.classList.toggle("is-active",active);
   btn.setAttribute("aria-pressed",String(active));
  }
  render();
 }
 function switchTab(key,changeHistory=false){
  if(!tabNames.includes(key))key="agenda";
  for(const name of tabNames){
   const active=name===key,tab=byId("tm-appointments-tab-"+name),panel=byId("tm-appointments-panel-"+name);
   panel.hidden=!active;
   tab.classList.toggle("is-active",active);
   tab.setAttribute("aria-selected",String(active));
   tab.tabIndex=active?0:-1;
  }
  if(changeHistory)history.replaceState(null,"",location.pathname+location.search+"#"+key);
 }
 for(const btn of document.querySelectorAll("[data-appointments-tab]")){
  btn.addEventListener("click",()=>switchTab(btn.dataset.appointmentsTab,true));
  btn.addEventListener("keydown",event=>{
   if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
   event.preventDefault();
   const current=tabNames.indexOf(btn.dataset.appointmentsTab);
   const next=event.key==="Home"?0:event.key==="End"?tabNames.length-1:
    (current+(event.key==="ArrowRight"?1:-1)+tabNames.length)%tabNames.length;
   const tab=byId("tm-appointments-tab-"+tabNames[next]);
   switchTab(tabNames[next],true);tab.focus();
  });
 }
 document.querySelectorAll("[data-appointments-view]").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.appointmentsView)));
 byId("tm-appointments-today").addEventListener("click",()=>{selected=todayInLisbon();render();});
 byId("tm-appointments-previous").addEventListener("click",()=>{selected=shift(selected,view==="week"?-7:-1);render();});
 byId("tm-appointments-next").addEventListener("click",()=>{selected=shift(selected,view==="week"?7:1);render();});
 window.addEventListener("hashchange",()=>switchTab(location.hash.slice(1)));
 switchTab(location.hash.slice(1));
 setView("week");
 async function validate(){
  try{
   const res=await fetch("/api/me",{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}});
   if(!res.ok)throw new Error("unauthorized");
   const data=await res.json();
   if(data.user?.role!=="admin")throw new Error("forbidden");
   auth.hidden=true;root.hidden=false;
  }catch(error){
   const title=document.createElement("h1");
   title.textContent="Acesso reservado";
   const explanation=document.createElement("p");
   explanation.textContent="É necessário iniciar sessão como administrador para aceder a Agendamentos.";
   const back=document.createElement("a");
   back.href="/";back.textContent="Entrar no backoffice";
   auth.replaceChildren(title,explanation,back);
  }
 }
 validate();
})();
