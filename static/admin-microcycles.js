"use strict";
const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"};
const colors={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"VP · Verde preparação"};
const $=id=>document.getElementById(id);
let csrf="",athletes=[],model=null,calendarMonth=new Date();
calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
function status(msg,cls=""){const el=$("status");el.textContent=msg;el.className="status "+cls;}
async function request(path,opts={}){const headers={"Accept":"application/json"};if(opts.body){headers["Content-Type"]="application/json";headers["X-CSRF-Token"]=csrf;}const r=await fetch(path,{credentials:"same-origin",...opts,headers});let out;try{out=await r.json();}catch{out={error:"Resposta inválida do servidor"};}if(!r.ok)throw Error(out.error||"Pedido falhou");return out;}
async function start(){try{const me=await request("/api/me");if(!me.user||me.user.role!=="admin"){status("É necessário iniciar sessão como administrador na aplicação de testes.","warn");return;}csrf=me.csrf;await loadAthletes();status("Ambiente de testes pronto.");}catch(e){status("Não foi possível ligar: "+e.message,"warn");}}
async function loadAthletes(prefer){const data=await request("/api/v2/athletes");athletes=data.athletes;const list=$("athlete");list.replaceChildren();for(const a of athletes){const o=document.createElement("option");o.value=a.id;o.textContent=a.name;list.appendChild(o);}if(!athletes.length){model=null;$("matrix").hidden=true;$("calendar-section").hidden=true;status("Cria o primeiro jogador de teste.");return;}list.value=prefer||list.value||athletes[0].id;await loadModel();}
async function loadModel(){if(!$("athlete").value)return;model=await request("/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/microcycles");render();await loadCalendar();}
function render(){const root=$("matrix");root.replaceChildren();const tbl=document.createElement("table");const header=document.createElement("tr");for(const label of ["Classificação","Pequeno-almoço","Almoço","Lanche","Jantar","Ceia"]){const th=document.createElement("th");th.textContent=label;header.appendChild(th);}tbl.appendChild(header);for(const row of model.classifications){const tr=document.createElement("tr"),title=document.createElement("td");title.textContent=(row.configured?"● ":"○ ")+row.name;tr.appendChild(title);for(const meal of model.meals){const td=document.createElement("td"),sel=document.createElement("select");sel.setAttribute("aria-label",row.name+" "+names[meal]);for(const [value,label] of [["","— Sem refeição"],...model.colors.map(c=>[c,colors[c]||c])]){const o=document.createElement("option");o.value=value;o.textContent=label;sel.appendChild(o);}sel.value=row.meals[meal]||"";sel.addEventListener("change",async()=>{const prior=row.meals[meal];const next=sel.value||null;sel.disabled=true;status("A guardar "+row.name+" · "+names[meal]+"…");try{await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/microcycles/"+encodeURIComponent(row.name),{method:"PUT",body:JSON.stringify({meal,color:next})});row.meals[meal]=next;row.configured=true;title.textContent="● "+row.name;status("Guardado: "+row.name+" · "+names[meal]+".","success");}catch(e){sel.value=prior||"";status("Não foi possível guardar: "+e.message,"warn");}finally{sel.disabled=false;}});td.appendChild(sel);tr.appendChild(td);}tbl.appendChild(tr);}root.appendChild(tbl);root.hidden=false;}
$("athlete").addEventListener("change",()=>loadModel().catch(e=>status(e.message,"warn")));
$("create").addEventListener("click",async()=>{const name=$("new-name").value.trim();if(!name)return status("Escreve o nome do jogador.","warn");$("create").disabled=true;try{const r=await request("/api/v2/athletes",{method:"POST",body:JSON.stringify({name})});$("new-name").value="";await loadAthletes(r.athlete.id);status("Jogador de teste criado.","success");}catch(e){status(e.message,"warn");}finally{$("create").disabled=false;}});
start();

function isoDay(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function matchBase(){return "/api/v2/athletes/"+encodeURIComponent(model.athlete.id);}
async function loadCalendar(){
  if(!model)return;
  const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
  const last=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0);
  const data=await request(matchBase()+"/calendar?start="+isoDay(first)+"&end="+isoDay(last));
  const days=$("calendar-days");days.replaceChildren();
  $("calendar-title").textContent=first.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});
  for(let i=0;i<(first.getDay()+6)%7;i++){const empty=document.createElement("div");empty.className="calendar-empty";days.appendChild(empty);}
  for(const day of data.days){
    const el=document.createElement("div");el.className="calendar-day"+(day.needs_review?" calendar-review":"");
    const date=document.createElement("strong");date.textContent=Number(day.date.slice(-2));el.appendChild(date);
    const type=document.createElement("span");type.textContent=day.needs_review?"Rever":day.classification||"—";el.appendChild(type);
    if(day.needs_review){el.title=day.candidates.map(x=>x.match_date+": "+x.classification).join(" | ");}
    if(data.matches.some(m=>m.match_date===day.date)){el.classList.add("calendar-match");}
    days.appendChild(el);
  }
  const list=$("calendar-matches");list.replaceChildren();
  for(const match of data.matches){
    const item=document.createElement("div");item.className="calendar-match-item";
    const date=document.createElement("span");date.textContent="Jogo · "+match.match_date;item.appendChild(date);
    const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";remove.setAttribute("aria-label","Remover jogo de "+match.match_date);
    remove.addEventListener("click",async()=>{
      if(!confirm("Remover o jogo de "+match.match_date+"?"))return;
      remove.disabled=true;
      try{await request(matchBase()+"/matches/"+encodeURIComponent(match.id),{method:"DELETE"});await loadCalendar();status("Jogo removido.","success");}
      catch(e){status("Erro ao remover jogo: "+e.message,"warn");remove.disabled=false;}
    });
    item.appendChild(remove);list.appendChild(item);
  }
  $("calendar-section").hidden=false;
}
$("add-match").addEventListener("click",async()=>{
  if(!model)return;
  const day=$("match-date").value;
  if(!day)return status("Seleciona a data do jogo.","warn");
  const btn=$("add-match");btn.disabled=true;
  try{await request(matchBase()+"/matches",{method:"POST",body:JSON.stringify({match_date:day})});
    const parts=day.split("-").map(Number);calendarMonth=new Date(parts[0],parts[1]-1,1);
    $("match-date").value="";await loadCalendar();status("Jogo guardado e calendário atualizado.","success");
  }catch(e){status("Não foi possível guardar o jogo: "+e.message,"warn");}finally{btn.disabled=false;}
});
$("calendar-prev").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);loadCalendar().catch(e=>status(e.message,"warn"));});
$("calendar-next").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);loadCalendar().catch(e=>status(e.message,"warn"));});
