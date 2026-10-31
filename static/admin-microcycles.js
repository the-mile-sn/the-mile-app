"use strict";
const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"};
const colors={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"VP · Verde preparação"};
const $=id=>document.getElementById(id);
let csrf="",athletes=[],model=null,calendarMonth=new Date(),selectedCalendarDay=null,validatedPlansByColor={},mealOptionsByColor={};
calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
function status(msg,cls=""){const el=$("status");el.textContent=msg;el.className="status "+cls;}
async function request(path,opts={}){const headers={"Accept":"application/json"};if(opts.body){headers["Content-Type"]="application/json";}if(opts.method&&opts.method!=="GET"){headers["X-CSRF-Token"]=csrf;}const r=await fetch(path,{credentials:"same-origin",...opts,headers});let out;try{out=await r.json();}catch{out={error:"Resposta inválida do servidor"};}if(!r.ok)throw Error(out.error||"Pedido falhou");return out;}
async function start(){try{const me=await request("/api/me");if(!me.user||me.user.role!=="admin"){throw Error("login_required");}csrf=me.csrf;$("admin-account-identity").textContent=me.user.name+" · "+me.user.email;$("admin-login-panel").hidden=true;$("tm-admin-legacy").hidden=true;$("admin-workspace").hidden=false;await loadAthletes();if(typeof window.tmOpenAdminDashboard==="function")window.tmOpenAdminDashboard();status("Backoffice pronto.");}catch(e){$("admin-workspace").hidden=true;$("admin-login-panel").hidden=false;}}
$("admin-login-form").addEventListener("submit",async e=>{e.preventDefault();const feedback=$("admin-login-error");feedback.textContent="";try{await fetch("/api/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:$("admin-login-email").value.trim().toLowerCase(),password:$("admin-login-password").value})}).then(async r=>{if(!r.ok)throw Error("invalid_login");});$("admin-login-password").value="";await start();}catch(err){feedback.textContent="Não foi possível iniciar sessão. Confirma as credenciais.";}});
let administratorIdentity=null;
async function loadAdminAccounts(){
 const res=await request("/api/admins");
 const host=$("admin-users-list");host.replaceChildren();
 for(const a of res.admins){
  const row=document.createElement("p");
  row.textContent=a.name+" · "+a.email+" · "+(a.active?"Ativo":"Inativo")+(a.activated?"":" · Por ativar");
  host.append(row);
 }
}
$("tm-admin-nav-account").addEventListener("click",()=>{const panel=$("admin-account-panel");if(panel.hidden)$("admin-account-toggle").click();panel.scrollIntoView({behavior:"smooth",block:"start"});});

$("admin-account-toggle").onclick=async()=>{
 const panel=$("admin-account-panel");panel.hidden=!panel.hidden;
 $("admin-account-toggle").setAttribute("aria-expanded",String(!panel.hidden));
 if(!panel.hidden)try{await loadAdminAccounts();}catch(e){$("admin-invite-feedback").textContent=e.message;}
};
$("admin-password-form").onsubmit=async e=>{
 e.preventDefault();const feedback=$("admin-password-feedback");feedback.textContent="";
 try{
  await request("/api/password",{method:"POST",body:JSON.stringify({current_password:$("admin-current-password").value,new_password:$("admin-new-password").value})});
  $("admin-current-password").value="";$("admin-new-password").value="";
  feedback.textContent="Palavra-passe alterada. Outras sessões foram terminadas.";
 }catch(err){feedback.textContent="Não foi possível alterar a palavra-passe: "+err.message;}
};
$("admin-invite-form").onsubmit=async e=>{
 e.preventDefault();const feedback=$("admin-invite-feedback");feedback.textContent="";
 try{
  const res=await request("/api/admins",{method:"POST",body:JSON.stringify({name:$("admin-invite-name").value.trim(),email:$("admin-invite-email").value.trim()})});
  $("admin-invite-link").value=res.activation_url;
  $("admin-invite-link-label").hidden=false;$("admin-invite-copy").hidden=false;
  feedback.textContent="Convite criado. Partilha a ligação apenas com o administrador indicado.";
  await loadAdminAccounts();
 }catch(err){feedback.textContent="Não foi possível gerar convite: "+err.message;}
};
$("admin-invite-copy").onclick=async()=>{
 try{await navigator.clipboard.writeText($("admin-invite-link").value);$("admin-invite-feedback").textContent="Ligação copiada.";}
 catch(e){$("admin-invite-feedback").textContent="Seleciona e copia a ligação manualmente.";}
};
$("admin-signout").onclick=async()=>{
 const feedback=$("admin-signout-feedback");feedback.textContent="";
 try{
  await request("/api/logout",{method:"POST",body:"{}"});
  csrf="";$("admin-account-panel").hidden=true;$("admin-workspace").hidden=true;$("admin-login-panel").hidden=false;
  $("admin-login-password").value="";
 }catch(e){feedback.textContent="Não foi possível terminar sessão: "+e.message;}
};
async function loadAthletes(prefer){const data=await request("/api/v2/athletes");athletes=data.athletes;const list=$("athlete");list.replaceChildren();for(const a of athletes){const o=document.createElement("option");o.value=a.id;o.textContent=a.name;list.appendChild(o);}if(!athletes.length){model=null;$("matrix").hidden=true;$("calendar-section").hidden=true;status("Cria o primeiro jogador de teste.");return;}list.value=prefer||list.value||athletes[0].id;await loadModel();}
const planningSearch=$("tm-planning-search"),planningResults=$("tm-planning-results"),planningPicker=$("tm-planning-picker");
const planningNormalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
function updatePlanningPlayerControls(){
 const select=$("athlete"),avatar=$("tm-planning-avatar");
 if(!select||!avatar)return;
 const name=select.selectedOptions[0]?.textContent||"";
 avatar.textContent=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toLocaleUpperCase("pt-PT")||"—";
 planningSearch.value=name;
 closePlanningResults();
}
function closePlanningResults(){planningResults.hidden=true;planningSearch.setAttribute("aria-expanded","false");planningResults.replaceChildren();}
function renderPlanningResults(){
 const select=$("athlete");
 const query=planningNormalize(planningSearch.value);
 const words=query.split(/\s+/).filter(Boolean);
 planningResults.replaceChildren();
 let count=0;
 for(const option of select.options){
  const name=planningNormalize(option.textContent);
  if(!words.every(term=>name.split(/\s+/).some(part=>part.startsWith(term))))continue;
  const item=document.createElement("button");item.type="button";item.className="tm-planning-result";item.setAttribute("role","option");
  item.setAttribute("aria-selected",String(option.value===select.value));
  item.textContent=option.textContent;
  item.addEventListener("mousedown",event=>event.preventDefault());
  item.addEventListener("click",()=>{
   const previous=select.value;select.value=option.value;closePlanningResults();
   planningSearch.value=option.textContent;
   if(previous!==select.value)select.dispatchEvent(new Event("change",{bubbles:true}));
  });
  planningResults.append(item);count++;
 }
 if(!count){const empty=document.createElement("div");empty.className="tm-planning-result-empty";empty.textContent="Nenhum jogador encontrado.";planningResults.append(empty);}
 planningResults.hidden=false;planningSearch.setAttribute("aria-expanded","true");
}
planningSearch.addEventListener("focus",renderPlanningResults);
planningSearch.addEventListener("input",renderPlanningResults);
planningSearch.addEventListener("keydown",event=>{
 if(event.key==="Escape"){closePlanningResults();planningSearch.value=$("athlete").selectedOptions[0]?.textContent||"";}
 if(event.key==="Enter"&&!planningResults.hidden){event.preventDefault();const first=planningResults.querySelector("button");if(first)first.click();}
});
document.addEventListener("pointerdown",event=>{if(!planningPicker.contains(event.target))closePlanningResults();});
$("tm-planning-cancel-create").addEventListener("click",()=>{$("tm-players-create-form").hidden=true;$("new-name").value="";});
window.tmOpenPlayerCreate=()=>{$("tm-players-create-form").hidden=false;$("new-name").focus();$("tm-players-create-form").scrollIntoView({behavior:"smooth",block:"center"});};
async function loadModel(){updatePlanningPlayerControls();if(!$("athlete").value)return;selectedCalendarDay=null;selectedNutritionWeek=null;model=await request("/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/microcycles");profileEditing=false;render();renderProfileSummary();await loadPlanDrafts();await loadCalendar();showBackofficeView(backofficeView);}
async function runScenarioPreview(){
 const aid=model?.athlete?.id,day=$("scenario-preview-date").value;
 const out=$("scenario-preview-output"),info=$("scenario-preview-status");
 if(!aid||!day){info.textContent="Seleciona uma data.";return;}
 const button=$("scenario-preview-run");button.disabled=true;info.textContent="A consultar…";out.replaceChildren();
 try{
  const data=await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/prescription-preview?date="+encodeURIComponent(day));
  if(model?.athlete?.id!==aid)return;
  info.textContent="Classificação: "+(data.classification||"Sem classificação")+" · Pré-visualização, sem alterações guardadas.";
  const table=document.createElement("table");table.className="scenario-matrix";
  const header=document.createElement("tr");
  for(const name of ["Refeição","Cor efetiva","Origem","Cenário"]){const th=document.createElement("th");th.textContent=name;header.append(th);}
  table.append(header);
  const sourceLabels={base:"Modelo base",manual:"Alteração manual",scenario:"Cenário pós-jogo"};
  for(const meal of model.meals){
   const item=data.meals?.[meal]||{};
   const tr=document.createElement("tr");
   for(const value of [names[meal],item.color?(colors[item.color]||item.color):"Sem refeição",sourceLabels[item.source]||"—",item.scenario||"—"]){
    const td=document.createElement("td");td.textContent=value;tr.append(td);
   }
   table.append(tr);
  }
  out.append(table);
  const summary=document.createElement("div");summary.className="scenario-nutrition-comparison";
  const heading=document.createElement("h4");heading.textContent="Comparação nutricional · Total diário";summary.append(heading);
  const matrix=document.createElement("table");matrix.className="scenario-matrix";
  const header2=document.createElement("tr");for(const label of ["Nutriente","Prescrição atual","Cenário simulado"]){const th=document.createElement("th");th.textContent=label;header2.append(th);}matrix.append(header2);
  const current=data.nutrition_current||{},effective=data.nutrition_preview||{};
  for(const [key,label,unit] of [["kcal","Energia","kcal"],["protein_g","Proteína","g"],["carbs_g","Hidratos","g"],["fat_g","Gordura","g"]]){
   const tr=document.createElement("tr");
   for(const value of [label,...[current,effective].map(x=>x.total?Number(x.total[key]).toLocaleString("pt-PT",{maximumFractionDigits:key==="kcal"?0:1})+" "+unit:"—")]){const td=document.createElement("td");td.textContent=value;tr.append(td);}
   matrix.append(tr);
  }
  summary.append(matrix);
  const note=document.createElement("p");note.className="hint";
  note.textContent="Cálculo de teste com opções validadas e refeições peri-treino/peri-jogo aplicáveis ("+(data.peri_count||0)+"). "+
    ((current.state==="partial"||effective.state==="partial")?"Atenção: existem refeições sem dados completos; os totais são parciais.":"");
  summary.append(note);out.append(summary);
 }catch(e){info.textContent="Não foi possível consultar: "+e.message;}
 finally{button.disabled=false;}
}
$("scenario-preview-run").addEventListener("click",runScenarioPreview);
$("scenario-week-run").addEventListener("click",async()=>{
 const aid=model?.athlete?.id,day=$("scenario-preview-date").value;
 const out=$("scenario-week-output"),label=$("scenario-week-status"),button=$("scenario-week-run");
 if(!aid||!day){label.textContent="Seleciona primeiro uma data.";return;}
 button.disabled=true;out.replaceChildren();label.textContent="A consultar semana…";
 try{
  const data=await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/prescription-week-preview?date="+encodeURIComponent(day));
  if(model?.athlete?.id!==aid)return;
  label.textContent="Semana de "+monitoringDate(data.start)+" a "+monitoringDate(data.end)+" · Apenas leitura.";
  const table=document.createElement("table");table.className="scenario-matrix";
  const head=document.createElement("tr");
  for(const txt of ["Dia","Classificação","Atual · kcal","Simulado · kcal","Diferença","Menus com cor diferente"]){const th=document.createElement("th");th.textContent=txt;head.append(th);}table.append(head);
  for(const item of data.days){
   const a=item.current?.total?.kcal,b=item.simulated?.total?.kcal;
   const menuChanges=(item.menu_colors||[]).filter(m=>m.current_color!==m.simulated_color);
   const tr=document.createElement("tr");
   for(const txt of [monitoringDate(item.date),item.classification||"—",a==null?"—":Math.round(a)+" kcal",b==null?"—":Math.round(b)+" kcal",a==null||b==null?"—":(b-a>=0?"+":"")+Math.round(b-a)+" kcal",menuChanges.length?menuChanges.map(x=>names[x.meal]||x.meal).join(", "):"—"]){const td=document.createElement("td");td.textContent=txt;tr.append(td);}table.append(tr);
  }
  out.append(table);
  const note=document.createElement("p");note.className="hint";note.textContent="Os totais parciais podem omitir refeições com dados em falta. Os menus são comparados apenas por cor, sem alterar pratos nem prescrições.";out.append(note);
 }catch(e){label.textContent="Falha na consulta semanal: "+e.message;}
 finally{button.disabled=false;}
});
// Read-only comparison of validated admin options and active player publications.
$("scenario-parity-run").addEventListener("click",async()=>{
 const aid=model?.athlete?.id,day=$("scenario-preview-date").value;
 const output=$("scenario-parity-output"),status=$("scenario-parity-status"),button=$("scenario-parity-run");
 if(!aid||!day){status.textContent="Seleciona primeiro uma data.";return;}
 button.disabled=true;output.replaceChildren();status.textContent="A comparar fontes nutricionais…";
 try{
  const response=await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/nutrition-source-parity?date="+encodeURIComponent(day));
  if(model?.athlete?.id!==aid)return;
  status.textContent="Semana de "+monitoringDate(response.start)+" a "+monitoringDate(response.end)+" · Diagnóstico de leitura.";
  const fmt=(value)=>Number.isFinite(value)?value.toLocaleString("pt-PT",{maximumFractionDigits:1,minimumFractionDigits:0}):"—";
  const namesNutrition=[["kcal","kcal"],["protein_g","P (g)"],["carbs_g","HC (g)"],["fat_g","G (g)"]];
  for(const row of (response.days||[])){
   const section=document.createElement("section");section.className="scenario-week-preview";
   const h=document.createElement("h4");h.textContent=monitoringDate(row.date)+" · "+(row.classification||"—");section.append(h);
   const table=document.createElement("table");table.className="scenario-matrix";
   const header=document.createElement("tr");
   for(const text of ["Nutriente","Atual validado","Atual publicado","Simulado validado","Simulado publicado","Desvio simulado"]){
    const th=document.createElement("th");th.textContent=text;header.append(th);
   }
   table.append(header);
   for(const [key,name] of namesNutrition){
    const a=row.sources?.validated?.current,b=row.sources?.published?.current;
    const c=row.sources?.validated?.simulated,d=row.sources?.published?.simulated;
    const delta=row.comparison?.simulated?.delta?.[key];
    const tr=document.createElement("tr");
    const fields=[name,a?.state==="complete"?fmt(a.total?.[key]):"Incompleto",b?.state==="complete"?fmt(b.total?.[key]):"Incompleto",c?.state==="complete"?fmt(c.total?.[key]):"Incompleto",d?.state==="complete"?fmt(d.total?.[key]):"Incompleto",delta==null?"Não comparável":(delta>0?"+":"")+fmt(delta)];
    for(const value of fields){const td=document.createElement("td");td.textContent=value;tr.append(td);}
    table.append(tr);
   }
   section.append(table);
   const issues=[];
   for(const src of ["validated","published"]){for(const variant of ["current","simulated"]){
    const item=row.sources?.[src]?.[variant];if(item?.state==="partial")issues.push(src+" / "+variant+": "+(item.missing||[]).map(String).join(", "));
   }}
   const hint=document.createElement("p");hint.className="hint";
   hint.textContent="Peri: "+(row.peri_count||0)+" · "+(issues.length?("Dados incompletos: "+issues.join(" · ")):"Sem dados em falta nas duas fontes.");
   section.append(hint);output.append(section);
  }
 }catch(error){status.textContent="Falha na comparação: "+error.message;}
 finally{button.disabled=false;}
});
const scenarioTypes=["MD+1","MD+2","MD+1/-3","MD+2/-2","MD+1/-2","MD+2/-1"];
const scenarioVariants=[["very_low","Very low"],["low","Low"],["medium","Medium"]];
let scenarioCells=[];
async function loadScenarioEditor(){
 if(!model)return;
 const athleteId=model.athlete.id;
 try{
  const response=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/scenario-cells");
  if(model?.athlete?.id!==athleteId)return;
  scenarioCells=response.cells||[];
  renderScenarioEditor();
 }catch(error){$("scenario-feedback").textContent="Não foi possível carregar os cenários: "+error.message;}
}
function renderScenarioEditor(){
 if(!model)return;
 const target=$("scenario-cells");target.replaceChildren();
 const table=document.createElement("table");table.className="scenario-matrix";
 const head=document.createElement("tr");
 for(const title of ["Classificação","Cenário",...model.meals.map(meal=>names[meal])]){
  const th=document.createElement("th");th.textContent=title;head.append(th);
 }
 table.append(head);
 for(const type of scenarioTypes){
  const baseline=model.classifications.find(row=>row.name===type);
  for(const [scenario,scenarioLabel] of scenarioVariants){
   const tr=document.createElement("tr");
   const dayCell=document.createElement("td");dayCell.textContent=type;tr.append(dayCell);
   const scenarioCell=document.createElement("td");scenarioCell.textContent=scenarioLabel;tr.append(scenarioCell);
   for(const meal of model.meals){
    const td=document.createElement("td"),select=document.createElement("select");
    const base=baseline?.meals?.[meal]||null;
    const current=scenarioCells.find(x=>x.classification===type&&x.scenario===scenario&&x.meal===meal);
    const existing=current?.color||"";
    select.setAttribute("aria-label",type+" "+scenarioLabel+" "+names[meal]);
    const defaultOption=document.createElement("option");defaultOption.value="";
    defaultOption.textContent="Igual ao High"+(base?" · "+(colors[base]||base):" · sem refeição");
    select.append(defaultOption);
    for(const color of model.colors){const option=document.createElement("option");option.value=color;option.textContent=colors[color]||color;select.append(option);}
    select.value=existing;select.dataset.color=existing||base||"none";
    select.className="microcycle-color-select";
    select.addEventListener("change",async()=>{
     const next=select.value||null;select.disabled=true;
     try{
      await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/scenario-cells",{method:"PUT",body:JSON.stringify({classification:type,scenario,meal,color:next})});
      scenarioCells=scenarioCells.filter(x=>!(x.classification===type&&x.scenario===scenario&&x.meal===meal));
      if(next)scenarioCells.push({classification:type,scenario,meal,color:next});
      select.dataset.color=next||base||"none";
      $("scenario-feedback").textContent="Guardado: "+type+" · "+scenarioLabel+" · "+names[meal]+". A prescrição atual não foi alterada.";
     }catch(error){select.value=existing;$("scenario-feedback").textContent="Não foi possível guardar: "+error.message;}
     finally{select.disabled=false;}
    });
    td.append(select);tr.append(td);
   }
   table.append(tr);
  }
 }
 target.append(table);
}
function render(){const root=$("matrix");root.replaceChildren();const tbl=document.createElement("table");const header=document.createElement("tr");for(const label of ["Classificação","Pequeno-almoço","Almoço","Lanche","Jantar","Ceia"]){const th=document.createElement("th");th.textContent=label;header.appendChild(th);}tbl.appendChild(header);for(const row of model.classifications){const tr=document.createElement("tr"),title=document.createElement("td");title.textContent=(row.configured?"● ":"○ ")+row.name;tr.appendChild(title);for(const meal of model.meals){const td=document.createElement("td"),sel=document.createElement("select");sel.setAttribute("aria-label",row.name+" "+names[meal]);for(const [value,label] of [["","— Sem refeição"],...model.colors.map(c=>[c,colors[c]||c])]){const o=document.createElement("option");o.value=value;o.textContent=label;sel.appendChild(o);}sel.value=row.meals[meal]||"";sel.classList.add("microcycle-color-select");sel.dataset.color=sel.value||"none";sel.addEventListener("change",async()=>{const prior=row.meals[meal];const next=sel.value||null;sel.disabled=true;status("A guardar "+row.name+" · "+names[meal]+"…");try{await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/microcycles/"+encodeURIComponent(row.name),{method:"PUT",body:JSON.stringify({meal,color:next})});row.meals[meal]=next;sel.dataset.color=next||"none";row.configured=true;title.textContent="● "+row.name;status("Guardado: "+row.name+" · "+names[meal]+".","success");}catch(e){sel.value=prior||"";status("Não foi possível guardar: "+e.message,"warn");}finally{sel.disabled=false;}});td.appendChild(sel);tr.appendChild(td);}tbl.appendChild(tr);}root.appendChild(tbl);root.hidden=backofficeView!=="matrix";}
$("filipe-activate").addEventListener("click",async()=>{
  const button=$("filipe-activate"),feedback=$("admin-access-feedback");
  button.disabled=true;feedback.textContent="A verificar a conta do Filipe...";
  $("admin-activation-result").hidden=true;
  try{
    const data=await request("/api/admins");
    const account=(data.admins||[]).find(a=>a.email.toLowerCase()==="filipesousa@themile.pt"&&a.active);
    if(!account)throw Error("A conta do Filipe não está disponível neste ambiente.");
    const result=await request("/api/admins/"+encodeURIComponent(account.id)+"/activation",{method:"POST",body:JSON.stringify({})});
    $("admin-activation-url").value=result.activation_url;
    $("admin-activation-result").hidden=false;
    feedback.textContent="Ligação gerada. Copia e envia em privado ao Filipe. Válida durante 24 horas.";
  }catch(e){feedback.textContent="Não foi possível gerar a ligação: "+e.message;}
  finally{button.disabled=false;}
});
$("copy-admin-activation").addEventListener("click",async()=>{
  const input=$("admin-activation-url");
  try{await navigator.clipboard.writeText(input.value);$("admin-access-feedback").textContent="Ligação copiada. Envia-a em privado ao Filipe.";}
  catch(e){input.focus();input.select();$("admin-access-feedback").textContent="Seleciona e copia a ligação para a partilhares em privado.";}
});
let monitoringSavedWeights=[];
const monitoringWeightDate=()=>$("monitoring-weight-date").value;
$("monitoring-weight-date").max=new Date().toISOString().slice(0,10);
$("monitoring-weight-date").value=new Date().toISOString().slice(0,10);
$("monitoring-weight-form").addEventListener("submit",async e=>{
 e.preventDefault();const aid=model?.athlete?.id;if(!aid)return;
 const button=e.submitter||$("monitoring-weight-form").querySelector('[type="submit"]');button.disabled=true;
 try{
  await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/monitoring/weight",{method:"POST",body:JSON.stringify({action:"save",date:monitoringWeightDate(),weight:$("monitoring-weight-value").value})});
  $("monitoring-weight-feedback").textContent="Registo guardado.";
  $("monitoring-weight-cancel").hidden=true;await openMonitoring("weight");
 }catch(err){$("monitoring-weight-feedback").textContent="Não foi possível guardar: "+err.message;}finally{button.disabled=false;}
});
$("monitoring-weight-cancel").addEventListener("click",()=>{$("monitoring-weight-value").value="";$("monitoring-weight-date").value=new Date().toISOString().slice(0,10);$("monitoring-weight-cancel").hidden=true;});
async function deleteMonitoringWeight(date){
 const aid=model?.athlete?.id;if(!aid||!window.confirm("Eliminar o registo de peso de "+monitoringDate(date)+"? Esta ação não afeta avaliações antropométricas."))return;
 try{await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/monitoring/weight",{method:"POST",body:JSON.stringify({action:"delete",date,confirm:"ELIMINAR_PESO"})});$("monitoring-weight-feedback").textContent="Registo eliminado.";await openMonitoring("weight");}
 catch(err){$("monitoring-weight-feedback").textContent="Não foi possível eliminar: "+err.message;}
}
const gameMinutesSelect=$("monitoring-game-minutes");
for(const [value,label] of [["not_played","Não joguei"],...Array.from({length:24},(_,i)=>[String((i+1)*5),String((i+1)*5)+" min"])]){const option=document.createElement("option");option.value=value;option.textContent=label;gameMinutesSelect.append(option);}
$("monitoring-game-form").addEventListener("submit",async event=>{
 event.preventDefault();const aid=model?.athlete?.id;if(!aid)return;
 const button=$("monitoring-game-form").querySelector('[type="submit"]');button.disabled=true;
 try{
  await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/monitoring/game",{method:"POST",body:JSON.stringify({action:"save",match_id:$("monitoring-game-match").value,minutes:$("monitoring-game-minutes").value,answers:{}})});
  $("monitoring-game-feedback").textContent="Resposta guardada. Nenhuma prescrição foi alterada.";
  $("monitoring-game-cancel").hidden=true;await openMonitoring("game");
 }catch(err){$("monitoring-game-feedback").textContent="Não foi possível guardar: "+err.message;}finally{button.disabled=false;}
});
$("monitoring-game-cancel").addEventListener("click",()=>{$("monitoring-game-cancel").hidden=true;$("monitoring-game-minutes").value="not_played";});
async function deleteMonitoringGame(matchId,date){
 const aid=model?.athlete?.id;if(!aid||!window.confirm("Eliminar a resposta pós-jogo de "+monitoringDate(date)+"? O jogo e o microciclo não serão eliminados."))return;
 try{await request("/api/v2/athletes/"+encodeURIComponent(aid)+"/monitoring/game",{method:"POST",body:JSON.stringify({action:"delete",match_id:matchId,confirm:"ELIMINAR_POS_JOGO"})});$("monitoring-game-feedback").textContent="Resposta eliminada.";await openMonitoring("game");}
 catch(err){$("monitoring-game-feedback").textContent="Não foi possível eliminar: "+err.message;}
}
let monitoringRequestVersion=0;
const monitoringDate=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||"")?iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4):iso;
const monitoringDecimal=n=>Number(n).toLocaleString("pt-PT",{maximumFractionDigits:2});
function renderMonitoringWeightChart(rows){
 const host=$("monitoring-weight-chart");host.replaceChildren();host.hidden=false;
 const dated=rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.weigh_date||"")&&Number.isFinite(Number(r.weight_kg))).slice().sort((a,b)=>a.weigh_date.localeCompare(b.weigh_date));
 const header=document.createElement("div");header.className="tm-weight-chart-head";
 const title=document.createElement("strong");title.textContent="Evolução do peso";
 const controls=document.createElement("div");controls.className="tm-weight-chart-controls";
 const period=document.createElement("select");period.setAttribute("aria-label","Período do gráfico de peso");
 for(const [value,label] of [["7","7 dias"],["15","15 dias"],["month","Mensal"]]){const option=document.createElement("option");option.value=value;option.textContent=label;period.append(option);}
 const month=document.createElement("select");month.setAttribute("aria-label","Mês do gráfico de peso");
 const months=[...new Set(dated.map(r=>r.weigh_date.slice(0,7)))].sort().reverse();
 const formatter=new Intl.DateTimeFormat("pt-PT",{month:"long",year:"numeric",timeZone:"UTC"});
 for(const m of months){const opt=document.createElement("option");opt.value=m;opt.textContent=formatter.format(new Date(m+"-01T12:00:00Z"));month.append(opt);}
 month.hidden=true;controls.append(period,month);header.append(title,controls);host.append(header);
 const plot=document.createElement("div");plot.className="tm-weight-chart-plot";host.append(plot);
 const draw=()=>{
  month.hidden=period.value!=="month";plot.replaceChildren();
  const today=new Date(),end=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const cutoff=new Date(end);cutoff.setDate(end.getDate()-(Number(period.value)||7)+1);
  const localIso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const points=dated.filter(r=>period.value==="month"?r.weigh_date.startsWith(month.value):r.weigh_date>=localIso(cutoff)&&r.weigh_date<=localIso(end));
  if(!points.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem pesagens registadas neste período.";plot.append(p);return;}
  const W=760,H=250,left=46,right=24,top=34,bottom=40,ns="http://www.w3.org/2000/svg";
  const values=points.map(p=>Number(p.weight_kg)),min=Math.min(...values),max=Math.max(...values),span=Math.max(.5,max-min),lo=min-span*.22,hi=max+span*.22;
  const x=i=>left+(W-left-right)*(points.length===1?.5:i/(points.length-1));
  const y=value=>top+(hi-value)/(hi-lo)*(H-top-bottom);
  const svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.setAttribute("role","img");svg.setAttribute("aria-label","Evolução do peso em "+period.selectedOptions[0].textContent);
  const node=(name,attrs,text)=>{const n=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=String(text);return n;};
  for(let i=0;i<=4;i++){const value=lo+(hi-lo)*i/4,cy=y(value);svg.append(node("line",{x1:left,y1:cy,x2:W-right,y2:cy,stroke:"#3d444d","stroke-dasharray":"3 5"}),node("text",{x:left-7,y:cy+4,"text-anchor":"end",fill:"#a3afbb","font-size":"11"},monitoringDecimal(value)));}
  const average=values.reduce((a,b)=>a+b,0)/values.length,meanY=y(average);
  svg.append(node("line",{x1:left,y1:meanY,x2:W-right,y2:meanY,stroke:"#b5bec9","stroke-dasharray":"6 6"}),node("text",{x:W-right-4,y:Math.max(top+11,meanY-8),"text-anchor":"end",fill:"#cbd4dd","font-size":"11"},"Média "+monitoringDecimal(average)+" kg"));
  const coords=points.map((p,i)=>({x:x(i),y:y(Number(p.weight_kg))}));
  svg.append(node("polyline",{points:coords.map(p=>p.x+","+p.y).join(" "),fill:"none",stroke:"#8DAFC6","stroke-width":"2.6","stroke-linecap":"round","stroke-linejoin":"round"}));
  for(const i of new Set([0,Math.floor((points.length-1)/2),points.length-1]))svg.append(node("text",{x:coords[i].x,y:H-12,"text-anchor":i===0?"start":i===points.length-1?"end":"middle",fill:"#a3afbb","font-size":"11"},monitoringDate(points[i].weigh_date)));
  const tooltip=document.createElement("div");tooltip.className="tm-weight-point-tooltip";tooltip.hidden=true;
  const guide=node("line",{x1:coords.at(-1).x,y1:top,x2:coords.at(-1).x,y2:H-bottom,stroke:"#91a9bf","stroke-dasharray":"4 5",opacity:0});
  const focus=node("circle",{cx:coords.at(-1).x,cy:coords.at(-1).y,r:8,fill:"none",stroke:"#dceefc","stroke-width":2,opacity:0});
  svg.append(guide,focus);
  let pinned=false;
  const showPoint=i=>{
   const p=coords[i];tooltip.textContent=monitoringDate(points[i].weigh_date)+" · "+monitoringDecimal(points[i].weight_kg)+" kg";
   tooltip.style.left=Math.max(12,Math.min(86,p.x/W*100))+"%";
   tooltip.style.top=Math.max(7,p.y/H*100-9)+"%";tooltip.hidden=false;
   guide.setAttribute("x1",p.x);guide.setAttribute("x2",p.x);guide.setAttribute("opacity",".8");
   focus.setAttribute("cx",p.x);focus.setAttribute("cy",p.y);focus.setAttribute("opacity","1");
  };
  const nearestAt=e=>{
   const rect=svg.getBoundingClientRect();if(!rect.width)return;
   const position=(e.clientX-rect.left)/rect.width*W;
   const i=coords.reduce((best,p,index)=>Math.abs(p.x-position)<Math.abs(coords[best].x-position)?index:best,0);
   showPoint(i);
  };
  coords.forEach((p,i)=>{
   const dot=node("circle",{cx:p.x,cy:p.y,r:4.5,fill:"#1b2027",stroke:"#a5c7de","stroke-width":"2.5",tabindex:"0",role:"button","aria-label":monitoringDate(points[i].weigh_date)+" · "+monitoringDecimal(points[i].weight_kg)+" kg"});
   dot.addEventListener("focus",()=>showPoint(i));
   dot.addEventListener("blur",()=>{if(!pinned){tooltip.hidden=true;guide.setAttribute("opacity",0);focus.setAttribute("opacity",0);}});
   dot.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pinned=!pinned;showPoint(i);}});
   svg.append(dot);
  });
  // Match the assessment chart: hover anywhere over the plotted area.
  svg.addEventListener("pointermove",nearestAt);
  svg.addEventListener("pointerleave",()=>{if(!pinned){tooltip.hidden=true;guide.setAttribute("opacity",0);focus.setAttribute("opacity",0);}});
  svg.addEventListener("click",e=>{nearestAt(e);pinned=!pinned;});
  plot.append(svg,tooltip);
 };
 period.addEventListener("change",draw);month.addEventListener("change",draw);draw();
}
async function openMonitoring(kind){
 const athleteId=model?.athlete?.id;if(!athleteId)return;
 const version=++monitoringRequestVersion;
 for(const k of ["weight","game"]){$("monitoring-"+k+"-content").hidden=k!==kind;$("monitoring-"+k+"-button").setAttribute("aria-pressed",String(k===kind));}
 const info=$("monitoring-"+kind+"-status"),list=$("monitoring-"+kind+"-list");
 info.textContent="A carregar…";list.replaceChildren();
 if(kind==="weight"){$("monitoring-reference").replaceChildren();$("monitoring-weight-chart").replaceChildren();$("monitoring-weight-chart").hidden=true;}
 try{
  const data=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/monitoring");
  if(version!==monitoringRequestVersion||model?.athlete?.id!==athleteId)return;
  if(kind==="game"){
   const select=$("monitoring-game-match"),selected=select.value;select.replaceChildren();
   for(const match of data.matches||[]){const option=document.createElement("option");option.value=match.id;option.textContent=monitoringDate(match.match_date);select.append(option);}
   if([...select.options].some(x=>x.value===selected))select.value=selected;
   $("monitoring-game-register").disabled=select.options.length===0;if(!select.options.length)$("monitoring-game-form").hidden=true;
  }
  const rows=kind==="weight"?data.weights:data.games;
  if(kind==="weight"){
   const ref=data.weight_reference,sourceNames={"7_day_average":"Média dos últimos 7 dias","latest_recent":"Último registo recente","latest_older":"Último registo disponível","assessment":"Última avaliação antropométrica"};
   $("monitoring-reference").textContent=ref?"Peso de referência: "+monitoringDecimal(ref.weight_kg)+" kg · "+(sourceNames[ref.source]||ref.source):"Peso de referência: ainda sem dados disponíveis";
   renderMonitoringWeightChart(rows);
  }
  if(!rows.length){info.textContent=kind==="weight"?"Ainda não existem registos de peso.":"Ainda não existem respostas pós-jogo.";return;}
  info.textContent=rows.length+" registo(s)";
  const table=document.createElement("table");table.className=kind==="game"?"tm-postmatch-matrix":"tm-weight-records";
  const fields=kind==="game"?[["match_date","Data"],["minutes","Minutos"],["feeling","Bem-estar"],["effort","Esforço"],["gi_level","Gastrointestinal"],["game_symptoms","Sintomas"],["food_pre","Pré-jogo"],["food_during","Durante o jogo"],["caffeine_pre","Cafeína pré-jogo"],["caffeine_half","Cafeína ao intervalo"],["recovery_shake","Recovery"]]:[["weigh_date","Data"],["weight_kg","Peso em jejum"]];
  const head=document.createElement("tr");for(const [,label]of fields){const th=document.createElement("th");th.textContent=label;head.append(th);}const th=document.createElement("th");th.textContent="Ações";head.append(th);const thead=document.createElement("thead");thead.append(head);table.append(thead);
  const body=document.createElement("tbody");
  const answerLabels={feeling:"Bem-estar",effort:"Esforço",gi_level:"Gastrointestinal",gi_symptoms:"Sintomas gastrointestinais",game_symptoms:"Sintomas durante o jogo",food_pre:"Refeição pré-jogo",food_between:"Entre refeição e jogo",food_during:"Durante o jogo",caffeine_pre:"Cafeína pré-jogo",caffeine_half:"Cafeína ao intervalo",nitrates_pre:"Nitratos",recovery_shake:"Recovery"};
  const alternatives={none:"Nenhum",mild:"Ligeiro",moderate:"Moderado",severe:"Intenso",cramps:"Cãibras",muscle_pain:"Dores musculares",injury:"Lesão",weakness_dizziness:"Fraqueza/tonturas"};
  const visualTone=(key,value)=>{
   if(value===undefined||value===null||value===""||(Array.isArray(value)&&!value.length))return "missing";
   if(key==="feeling"){const n=Number(value);return n>=7?"positive":n>=4?"caution":"negative";}
   if(key==="effort"){const n=Number(value);return n<=3?"positive":n<=7?"caution":"negative";}
   if(key==="gi_level"){const n=Number(value);return value==="none"||n===0?"positive":value==="mild"||n<=2?"caution":"negative";}
   if(key==="gi_symptoms"||key==="game_symptoms")return value==="none"||Array.isArray(value)&&value.includes("none")?"positive":"negative";
   if(key==="recovery_shake")return value===true?"positive":value===false?"neutral":"neutral";
   return "neutral";
  };
  const visualIcon=(key,value)=>{
   if(key==="feeling")return "♡";
   if(key==="effort")return "◷";
   if(key==="gi_level"||key==="gi_symptoms")return "◇";
   if(key==="game_symptoms")return "✧";
   if(key==="food_pre"||key==="food_during")return "◉";
   if(key==="caffeine_pre"||key==="caffeine_half")return "☕";
   if(key==="recovery_shake")return "✓";
   return "•";
  };
  const visualValue=(key,value,label)=>{
   const badge=document.createElement("span");badge.className="tm-answer-badge tm-answer-"+visualTone(key,value);
   const icon=document.createElement("span");icon.className="tm-answer-icon";icon.textContent=visualIcon(key,value);icon.setAttribute("aria-hidden","true");
   const body=document.createElement("span");body.textContent=label;badge.append(icon,body);return badge;
  };
  const fmt=(value,key)=>value===undefined||value===null||value===""||Array.isArray(value)&&!value.length?"Não preenchido":Array.isArray(value)?value.map(v=>alternatives[v]||String(v)).join(", "):typeof value==="boolean"?(value?"Sim":"Não"):alternatives[value]||String(value)+(["feeling","effort"].includes(key)?"/10":"");
  for(const record of rows){
   const tr=document.createElement("tr"),answers=(()=>{try{return JSON.parse(record.answers_json||"{}")}catch{return {};}})();
   for(const [key] of fields){
    const td=document.createElement("td");const v=key==="match_date"?monitoringDate(record.match_date):key==="weigh_date"?monitoringDate(record.weigh_date):key==="minutes"?(record.minutes==null?"Não joguei":record.minutes+" min"):key==="weight_kg"?monitoringDecimal(record.weight_kg)+" kg":fmt(answers[key],key);
    const value=document.createElement("span");value.textContent=v;if(v==="Não preenchido")value.className="tm-unanswered";if(kind==="game"&&!["match_date","minutes"].includes(key))td.append(visualValue(key,answers[key],v));else td.append(value);tr.append(td);
   }
   const actions=document.createElement("td");actions.className="tm-clinical-row-actions";
   if(kind==="game"){
    const extra=document.createElement("tr");extra.hidden=true;const cell=document.createElement("td");cell.colSpan=fields.length+1;
    const grid=document.createElement("div");grid.className="tm-form-answer-grid";
    for(const [key,label]of Object.entries(answerLabels)){const item=document.createElement("div");item.className="tm-form-answer-field";const small=document.createElement("small");small.textContent=label;const strong=document.createElement("strong");strong.textContent=fmt(answers[key],key);if(strong.textContent==="Não preenchido")strong.className="tm-unanswered";item.append(small,visualValue(key,answers[key],strong.textContent));grid.append(item);}
    cell.append(grid);extra.append(cell);
    const details=document.createElement("button");details.type="button";details.textContent="Detalhes";details.setAttribute("aria-expanded","false");details.onclick=()=>{extra.hidden=!extra.hidden;details.textContent=extra.hidden?"Detalhes":"Recolher";details.setAttribute("aria-expanded",String(!extra.hidden));};actions.append(details);
    const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.onclick=()=>{$("monitoring-game-form").hidden=false;$("monitoring-game-register").setAttribute("aria-expanded","true");$("monitoring-game-register").textContent="Fechar registo";$("monitoring-game-match").value=record.match_id;$("monitoring-game-minutes").value=record.minutes==null?"not_played":String(record.minutes);$("monitoring-game-cancel").hidden=false;$("monitoring-game-minutes").focus();};
    const remove=document.createElement("button");remove.type="button";remove.textContent="Eliminar";remove.onclick=()=>deleteMonitoringGame(record.match_id,record.match_date);actions.append(edit,remove);tr.append(actions);body.append(tr,extra);
   }else{
    const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.onclick=()=>{$("monitoring-weight-form").hidden=false;$("monitoring-weight-register").setAttribute("aria-expanded","true");$("monitoring-weight-register").textContent="Fechar registo";$("monitoring-weight-date").value=record.weigh_date;$("monitoring-weight-value").value=record.weight_kg;$("monitoring-weight-cancel").hidden=false;};
    const remove=document.createElement("button");remove.type="button";remove.textContent="Eliminar";remove.onclick=()=>deleteMonitoringWeight(record.weigh_date);
    actions.append(edit,remove);tr.append(actions);body.append(tr);
   }
  }
  table.append(body);const overflow=document.createElement("div");overflow.className="tm-form-table-scroll";overflow.append(table);list.append(overflow);
 }catch(e){if(version===monitoringRequestVersion)info.textContent="Não foi possível carregar os registos."; }
}
for(const kind of ["weight","game"]){
 const toggle=$("monitoring-"+kind+"-register"),form=$("monitoring-"+kind+"-form");
 const setOpen=open=>{form.hidden=!open;toggle.setAttribute("aria-expanded",String(open));toggle.textContent=open?"Fechar registo":"+ Registar";};
 toggle.addEventListener("click",()=>setOpen(form.hidden));
 form.addEventListener("submit",()=>{setOpen(false);});
}
$("monitoring-weight-button").addEventListener("click",()=>openMonitoring("weight"));
$("monitoring-game-button").addEventListener("click",()=>openMonitoring("game"));
let profileEditing=false;
function renderProfileSummary(){
  if(!model)return;
  const athlete=model.athlete,root=$("profile-summary");root.replaceChildren();
  root.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;margin:18px 0";
  const fields=[
    ["Nome","name",athlete.name,"text"],
    ["Sexo","sex",athlete.sex,"sex"],
    ["Peso atual","weight_kg",athlete.weight_kg,"number"],
    ["Altura","height_cm",athlete.height_cm,"number"],
    ["Posição em campo","field_position",athlete.field_position,"position"],["Ponto braço (cm)","arm_point",athlete.arm_point,"number"],["Ponto coxa (cm)","thigh_point",athlete.thigh_point,"number"],["Notas internas","profile_notes",athlete.profile_notes,"textarea"]
  ];
  for(const [label,key,value,type] of fields){
    const card=document.createElement("div");card.className="profile-info-card";
    card.style.cssText="display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid #36363c;border-radius:12px;min-width:0;background:#19191d";
    const caption=document.createElement("small");caption.textContent=label;caption.style.color="#a9a9b2";
    let field;
    if(profileEditing){
      field=type==="textarea"?document.createElement("textarea"):document.createElement(type==="sex"||type==="position"?"select":"input");
      if(type==="sex"||type==="position"){const options=type==="sex"?[["","Por definir"],["F","Feminino"],["M","Masculino"]]:["","GR","DD","DE","DC","MDC","MC","MOC","ED","EE","PL","Outro"].map(v=>[v,v||"Por definir"]);for(const [v,t] of options){const opt=document.createElement("option");opt.value=v;opt.textContent=t;field.append(opt);}}
      if(type!=="textarea"&&type!=="sex"&&type!=="position"){field.type=type;if(type==="number"){field.step=".1";field.min=key==="weight_kg"?"20":key==="height_cm"?"100":"0";field.max=key==="weight_kg"?"250":key==="height_cm"?"230":key==="arm_point"?"100":"150";}}
      field.value=value??"";field.dataset.profileField=key;field.setAttribute("aria-label",label);
      field.style.cssText="width:100%;box-sizing:border-box;min-width:0";
      if(type==="textarea")field.rows=3;
    }else{
      field=document.createElement("strong");
      field.textContent=value==null||value===""?(key==="profile_notes"?"Sem notas":"Por preencher"):String(value)+(key==="weight_kg"?" kg":key==="height_cm"?" cm":"");
      field.style.cssText="font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere";
    }
    card.append(caption,field);root.appendChild(card);
  }
  $("edit-athlete-profile").hidden=profileEditing;
  $("profile-inline-actions").hidden=!profileEditing;
}
window.tmSyncPlanningAthleteProfile=athlete=>{
 if(!athlete)return;
 if(model?.athlete?.id===athlete.id){model.athlete=athlete;if(!profileEditing)renderProfileSummary();}
 const choice=Array.from($("athlete").options).find(option=>option.value===athlete.id);
 if(choice)choice.textContent=athlete.name;
};
$("edit-athlete-profile").addEventListener("click",()=>{profileEditing=true;renderProfileSummary();});
$("cancel-athlete-profile").addEventListener("click",()=>{profileEditing=false;renderProfileSummary();});
$("save-athlete-profile").addEventListener("click",async()=>{
  if(!model)return;
  const button=$("save-athlete-profile");button.disabled=true;
  try{
    const get=key=>document.querySelector('[data-profile-field="'+key+'"]').value;
    const raw=get("weight_kg"),height=get("height_cm");
    const result=await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/profile",{method:"PUT",body:JSON.stringify({
      name:get("name").trim(),sex:get("sex")||null,weight_kg:raw===""?null:Number(raw),height_cm:height===""?null:Number(height),profile_notes:get("profile_notes"),field_position:get("field_position"),arm_point:get("arm_point")===""?null:Number(get("arm_point")),thigh_point:get("thigh_point")===""?null:Number(get("thigh_point"))
    })});
    model.athlete=result.athlete;profileEditing=false;renderProfileSummary();
    const active=$("athlete").selectedOptions[0];if(active)active.textContent=result.athlete.name;
    await loadCalendar();status("Perfil do jogador atualizado.","success");
  }catch(e){status("Erro ao guardar perfil: "+e.message,"warn");}
  finally{button.disabled=false;}
});
let selectedNutritionWeek=null,periByDay={},dayColorOverrides={},effectiveAdminColorsByDay={};
let backofficeView="calendar",menuWeek=new Date(),menuLookup={},dishLibrary=[];
function weekStart(date){const d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;}
async function loadMenus(){
  if(!model)return;
  const start=weekStart(menuWeek),finish=new Date(start);finish.setDate(start.getDate()+6);
  const begin=isoDay(start),end=isoDay(finish);
  $("menu-week").textContent=begin+" — "+end;
  const data=await request(matchBase()+"/menus?start="+begin+"&end="+end);
  dishLibrary=(await request("/api/v2/dishes")).dishes;
  renderDishEditor();refreshDishCategories();
  const calendarData=await request(matchBase()+"/calendar?start="+begin+"&end="+end);
  const calendar=calendarData.days;
  const menuColorOverrides=colorOverrideLookup(calendarData.meal_color_overrides);
  const root=$("menu-grid");root.replaceChildren();
  const pending=new Map();
  const saveWeek=$("save-menu-week");
  const feedback=$("menu-save-feedback");
  saveWeek.disabled=true;feedback.textContent="";
  const mark=(key,entry)=>{pending.set(key,entry);saveWeek.disabled=false;feedback.textContent=pending.size+" refeição(ões) por guardar";};
  saveWeek.onclick=async()=>{
    saveWeek.disabled=true;feedback.textContent="A guardar a semana…";
    try{await request(matchBase()+"/menus/batch",{method:"PUT",body:JSON.stringify({items:[...pending.values()]})});
      feedback.textContent="Semana guardada com sucesso.";await loadMenus();
      feedback.textContent="Semana guardada com sucesso.";status("Menus da semana guardados.","success");
    }catch(e){feedback.textContent="Erro ao guardar: "+e.message;saveWeek.disabled=false;}
  };
  for(let i=0;i<7;i++){
    const day=new Date(start);day.setDate(start.getDate()+i);const date=isoDay(day);
    const section=document.createElement("section");section.className="menu-day-card";
    const calendarDay=calendar.find(item=>item.date===date);
    const modelRow=model.classifications.find(item=>item.name===calendarDay?.classification);
    const title=document.createElement("h3");title.textContent=day.toLocaleDateString("pt-PT",{weekday:"long",day:"2-digit",month:"short"})+(calendarDay?.classification?" · "+calendarDay.classification:"");section.appendChild(title);
    for(const meal of ["lunch","dinner"]){
      const existing=data.menus.find(x=>x.menu_date===date&&x.meal===meal);
      const line=document.createElement("div");line.className="menu-meal-card";
      const heading=document.createElement("div");heading.className="menu-meal-heading";
      const overrideKey=date+"|"+meal;
      const assignedColor=Object.prototype.hasOwnProperty.call(menuColorOverrides,overrideKey)?menuColorOverrides[overrideKey]:modelRow?.meals?.[meal];
      const color=document.createElement("span");color.className="menu-color-label"+(assignedColor?" meal-"+assignedColor:"");color.textContent="";color.setAttribute("aria-label",assignedColor?(colors[assignedColor]||assignedColor):"Sem cor");color.title=color.getAttribute("aria-label");
      const label=document.createElement("strong");label.textContent=names[meal];heading.append(label,color);line.appendChild(heading);
      const kind=document.createElement("select");
      for(const [value,name] of [["category","Categoria"],["dish","Prato completo"]]){const opt=document.createElement("option");opt.value=value;opt.textContent=name;kind.appendChild(opt);}
      kind.value=existing?.kind||"category";kind.className="menu-kind";line.appendChild(kind);
      const category=document.createElement("select");
      const categoryNames=["Carne branca","Carne vermelha","Peixe magro","Peixe gordo","Livre","Pós-jogo","Mix"];
      const previousCategory=existing?.kind==="category"?existing.value:"";
      const categories=previousCategory&&!categoryNames.includes(previousCategory)?[previousCategory,...categoryNames]:categoryNames;
      const chooseCategory=document.createElement("option");chooseCategory.value="";chooseCategory.textContent="Selecionar categoria…";category.appendChild(chooseCategory);
      for(const name of categories){const option=document.createElement("option");option.value=name;option.textContent=name;category.appendChild(option);}
      category.value=previousCategory||"";category.className="menu-choice";line.appendChild(category);
      const dish=document.createElement("input");dish.type="text";dish.maxLength=200;dish.placeholder="Nome do prato (base de menus em preparação)";dish.value=existing?.kind==="dish"?existing.value:"";line.appendChild(dish);
      const selectedDish=dishLibrary.find(x=>x.name_pt===existing?.value);
      const dishFilter=document.createElement("select");dishFilter.className="menu-choice";dishFilter.setAttribute("aria-label","Filtrar pratos por categoria");
      const all=document.createElement("option");all.value="";all.textContent="Todas as categorias";dishFilter.appendChild(all);
      const libraryCategories=[...new Set(dishLibrary.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));
      for(const name of libraryCategories){const opt=document.createElement("option");opt.value=name;opt.textContent=name;dishFilter.appendChild(opt);}
      dishFilter.value=selectedDish?.category||"";line.appendChild(dishFilter);
      const picker=document.createElement("div");picker.className="menu-combobox";line.appendChild(picker);
      const dishSearch=document.createElement("input");dishSearch.type="search";dishSearch.className="menu-choice";dishSearch.placeholder="Pesquisar e selecionar prato…";dishSearch.autocomplete="off";dishSearch.setAttribute("role","combobox");dishSearch.setAttribute("aria-autocomplete","list");dishSearch.setAttribute("aria-expanded","false");picker.appendChild(dishSearch);
      const suggestions=document.createElement("div");suggestions.className="menu-suggestions";suggestions.setAttribute("role","listbox");suggestions.hidden=true;picker.appendChild(suggestions);
      let chosenDishId=selectedDish?.id||"";
      dishSearch.value=selectedDish?.name_pt||"";
      const candidates=()=>dishLibrary.filter(x=>(x.active||x.id===selectedDish?.id)&&(!dishFilter.value||x.category===dishFilter.value)&&(!dishSearch.value.trim()||x.name_pt.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").includes(dishSearch.value.trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")))).slice(0,30);
      const closeSuggestions=()=>{suggestions.hidden=true;dishSearch.setAttribute("aria-expanded","false");};
      const updatePreview=()=>{const item=dishLibrary.find(x=>x.id===chosenDishId);preview.hidden=!item;if(item)preview.src="/api/v2/dishes/image/"+encodeURIComponent(item.id);};
      const pickDish=item=>{chosenDishId=item.id;dishSearch.value=item.name_pt;closeSuggestions();updatePreview();queue();};
      const showSuggestions=()=>{
        suggestions.replaceChildren();
        const items=candidates();
        if(!items.length){const empty=document.createElement("div");empty.className="menu-suggestion-empty";empty.textContent="Nenhum prato encontrado";suggestions.appendChild(empty);}
        for(const item of items){
          const option=document.createElement("button");option.type="button";option.className="menu-suggestion";option.setAttribute("role","option");option.textContent=item.name_pt;
          option.addEventListener("mousedown",event=>event.preventDefault());
          option.addEventListener("click",()=>pickDish(item));suggestions.appendChild(option);
        }
        suggestions.hidden=false;dishSearch.setAttribute("aria-expanded","true");
      };
      dishSearch.addEventListener("focus",showSuggestions);
      dishSearch.addEventListener("input",()=>{chosenDishId="";updatePreview();showSuggestions();});
      dishSearch.addEventListener("keydown",e=>{
        if(e.key==="Escape"){closeSuggestions();dishSearch.blur();}
        if(e.key==="Enter"&&!suggestions.hidden){e.preventDefault();const item=candidates()[0];if(item)pickDish(item);}
      });
      dishSearch.addEventListener("blur",()=>{setTimeout(closeSuggestions,120);});
      dishFilter.addEventListener("change",()=>{chosenDishId="";dishSearch.value="";updatePreview();closeSuggestions();});
      const preview=document.createElement("img");preview.alt="Fotografia do prato";preview.className="menu-dish-image";line.appendChild(preview);
      updatePreview();
      const toggle=()=>{category.hidden=kind.value!=="category";dishSearch.hidden=kind.value!=="dish";picker.hidden=kind.value!=="dish";dishFilter.hidden=kind.value!=="dish";preview.hidden=kind.value!=="dish"||!chosenDishId;dish.hidden=true;closeSuggestions();};
      kind.addEventListener("change",toggle);toggle();
      const queue=()=>{
        const selectedDish=dishLibrary.find(x=>x.id===chosenDishId);
        const selected=kind.value==="category"?category.value:(selectedDish?.name_pt||"");
        if(!selected)return;
        mark(date+"|"+meal,{menu_date:date,meal,kind:kind.value,value:selected});
      };
      kind.addEventListener("change",queue);category.addEventListener("change",queue);
      section.appendChild(line);
    }
    root.appendChild(section);
  }
}
$("menu-prev").addEventListener("click",()=>{menuWeek=weekStart(menuWeek);menuWeek.setDate(menuWeek.getDate()-7);loadMenus().catch(e=>status(e.message,"warn"));});
$("menu-next").addEventListener("click",()=>{menuWeek=weekStart(menuWeek);menuWeek.setDate(menuWeek.getDate()+7);loadMenus().catch(e=>status(e.message,"warn"));});

let simulationDay=new Date(),publishedSimulation={};
let playerView="overview",playerSelectedPlan=null,playerMenuWeek=new Date();
function playerFormattedNutrition(values){
 const root=document.createElement("span");root.className="nutrient-colors player-formatted-nutrition";
 for(const [key,prefix,cls,digits] of [["kcal","","nutrient-kcal",0],["protein_g","P ","nutrient-protein",1],["carbs_g","HC ","nutrient-carbs",1],["fat_g","G ","nutrient-fat",1]]){
  const item=document.createElement("span");item.className=cls;const raw=values?.[key];const n=typeof raw==="number"?raw:Number(String(raw??"").trim().replace(",","."));item.textContent=prefix+(raw===null||raw===undefined||String(raw).trim()===""||!Number.isFinite(n)?"—":formatNutrition(n,digits))+(key==="kcal"?" kcal":" g");root.appendChild(item);
 }
 return root;
}
function playerOption(option,index){
 const details=document.createElement("details");details.className="import-option";
 const summary=document.createElement("summary");summary.className="plan-option-summary";
 const label=document.createElement("span");label.textContent="Opção "+(option.number||index+1)+(option.title?" · "+option.title:"");summary.appendChild(label);
 if(option.totals){const values=playerFormattedNutrition(option.totals);values.classList.add("player-option-expanded-values");summary.appendChild(values);}
 details.appendChild(summary);
 for(const item of option.items||[]){const line=document.createElement("p");line.className="player-plan-food";line.textContent=item.kind==="food"?((item.quantity||"")+" · "+(item.name||"")):(item.text||"");details.appendChild(line);}
 return details;
}
async function playerShowPlans(){
 const [data,periData]=await Promise.all([request(matchBase()+"/plan-imports/published-preview"),request(matchBase()+"/peri-imports")]),root=$("player-plan-list"),detail=$("player-plan-detail");
 root.replaceChildren();detail.replaceChildren();
 const available=Object.entries(data.options_by_color).filter(([,meals])=>Object.values(meals).some(options=>options.length));
 for(const [color] of available){
  const button=document.createElement("button");button.className="player-plan-button"+(playerSelectedPlan===color?" active":"");
  const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+color;button.append(dot,document.createTextNode(colors[color]||color));root.appendChild(button);
  button.onclick=()=>{playerSelectedPlan=playerSelectedPlan===color?null:color;playerShowPlans().catch(e=>status(e.message,"warn"));};
 }
 for(const [kind,label] of [["training","Peri-treino"],["match","Peri-jogo"]]){
  const opts=periData.active?.[kind]?.options;if(!opts||!Object.values(opts).some(arr=>arr.length))continue;
  const button=document.createElement("button"),key="peri-"+kind;
  button.className="player-plan-button"+(playerSelectedPlan===key?" active":"");button.textContent=label;
  button.onclick=()=>{playerSelectedPlan=playerSelectedPlan===key?null:key;playerShowPlans().catch(e=>status(e.message,"warn"));};
  root.append(button);
 }
 if(!root.children.length){root.textContent="Ainda não há planos publicados.";return;}
 if(playerSelectedPlan?.startsWith("peri-")){
  const kind=playerSelectedPlan.slice(5),phases=periData.active?.[kind]?.options||{};
  for(const [phase,label] of [["pre",kind==="match"?"Intra-jogo":"Pré-treino"],["post",kind==="match"?"Pós-jogo":"Pós-treino"]]){
   const opts=phases[phase]||[];if(!opts.length)continue;
   const section=document.createElement("section");section.className="player-sim-meal";
   const header=document.createElement("div");header.className="player-meal-header";const title=document.createElement("h3");title.textContent=label;header.append(title);
   const avg=averageMealNutrition(opts);if(avg)header.append(playerFormattedNutrition(avg));section.append(header);
   opts.forEach((option,i)=>section.append(playerOption(option,i)));detail.append(section);
  }
  return;
 }
 if(!playerSelectedPlan||!data.options_by_color[playerSelectedPlan])return;
 const meals=data.options_by_color[playerSelectedPlan];
 for(const meal of model.meals){if(!meals[meal]?.length)continue;const section=document.createElement("section");section.className="player-sim-meal";const header=document.createElement("div");header.className="player-meal-header";const title=document.createElement("h3");title.textContent=names[meal];header.appendChild(title);const average=averageMealNutrition(meals[meal]);if(average)header.appendChild(playerFormattedNutrition(average));section.appendChild(header);meals[meal].forEach((option,i)=>section.appendChild(playerOption(option,i)));detail.appendChild(section);}
}
async function playerShowMenus(){
 const monday=weekStart(playerMenuWeek),last=new Date(monday);last.setDate(monday.getDate()+6);
 const begin=isoDay(monday),end=isoDay(last);$("player-menu-week").textContent=begin+" — "+end;
 const [menus,calendar,dishes]=await Promise.all([request(matchBase()+"/menus?start="+begin+"&end="+end),request(matchBase()+"/calendar?start="+begin+"&end="+end),request("/api/v2/dishes")]);
 const root=$("player-menu-days");root.replaceChildren();
 for(let i=0;i<7;i++){
  const date=new Date(monday);date.setDate(monday.getDate()+i);const key=isoDay(date),day=calendar.days.find(item=>item.date===key);
  const section=document.createElement("section");section.className="player-menu-day";
  const title=document.createElement("h3");title.textContent=date.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"short"})+(day?.classification?" · "+day.classification:"");section.appendChild(title);
  for(const meal of ["lunch","dinner"]){
   const menu=menus.menus.find(item=>item.menu_date===key&&item.meal===meal);if(!menu)continue;
   const line=document.createElement("div");line.className="player-menu-entry";
   const name=document.createElement("strong");name.textContent=names[meal];line.appendChild(name);
   const row=model.classifications.find(c=>c.name===day?.classification),baseline=row?.meals?.[meal];
   const exception=(calendar.meal_color_overrides||[]).find(x=>x.meal_date===key&&x.meal===meal)?.color;
   const color=exception||baseline;
   if(color){const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+color;line.appendChild(dot);}
   const value=document.createElement("span");value.textContent=menu.value;line.appendChild(value);
   if(menu.kind==="dish"){const dish=dishes.dishes.find(item=>item.name_pt===menu.value);if(dish){const img=document.createElement("img");img.className="player-menu-photo";img.src="/api/v2/dishes/image/"+encodeURIComponent(dish.id);img.alt=menu.value;line.appendChild(img);}}
   section.appendChild(line);
  }
  root.appendChild(section);
 }
}
async function showPlayerView(view){
 playerView=view;for(const [key,id] of [["overview","player-overview"],["plans","player-full-plans"],["menus","player-full-menus"]])$(id).hidden=key!==view;
 for(const button of document.querySelectorAll("[data-player-view]"))button.setAttribute("aria-pressed",button.dataset.playerView===view?"true":"false");
 if(view==="overview")await loadPlayerSimulation();if(view==="plans")await playerShowPlans();if(view==="menus")await playerShowMenus();
}
for(const button of document.querySelectorAll("[data-player-view]"))button.addEventListener("click",()=>showPlayerView(button.dataset.playerView).catch(e=>status(e.message,"warn")));
for(const [id,delta] of [["player-menu-prev",-7],["player-menu-next",7]])$(id).addEventListener("click",()=>{playerMenuWeek.setDate(playerMenuWeek.getDate()+delta);playerShowMenus().catch(e=>status(e.message,"warn"));});
async function loadPlayerSimulation(){
  if(!model)return;
  const d=isoDay(simulationDay);
  $("player-preview-date").textContent=simulationDay.toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const [plans,calendar,menus,refs]=await Promise.all([
    request(matchBase()+"/plan-imports/published-preview"),
    request(matchBase()+"/calendar?start="+d+"&end="+d),
    request(matchBase()+"/menus?start="+d+"&end="+d),
    request(matchBase()+"/reference-weights?start="+d+"&end="+d)
  ]);
  publishedSimulation=plans.options_by_color;
  dayColorOverrides=colorOverrideLookup(calendar.meal_color_overrides);
  effectiveAdminColorsByDay=calendar.effective_colors||{};
  const strip=$("player-week-strip");strip.replaceChildren();
  const monday=weekStart(simulationDay);
  for(let i=0;i<7;i++){
    const date=new Date(monday);date.setDate(monday.getDate()+i);
    const btn=document.createElement("button");btn.type="button";btn.className="player-day-pill"+(isoDay(date)===d?" active":"");
    const short=date.toLocaleDateString("pt-PT",{weekday:"short"});
    btn.textContent=short+" "+date.getDate();
    btn.onclick=()=>{simulationDay=date;loadPlayerSimulation().catch(e=>status(e.message,"warn"));};
    strip.appendChild(btn);
  }
  const summary=$("player-day-summary");summary.replaceChildren();
  const host=$("player-preview-meals");host.replaceChildren();
  const day=calendar.days[0];
  if(!day||(!day.classification&&!model.meals.some(meal=>colorForDay(day,meal)))){host.textContent="Sem prescrição para este dia.";return;}
  const heading=document.createElement("h3");heading.textContent=day.classification;host.appendChild(heading);
  const publishedTotals={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
  let hasValues=false,complete=true;
  for(const entry of mealColorsForDay(day)){
    if(!entry.color)continue;
    const options=publishedSimulation[entry.color]?.[entry.meal]||[];
    const average=averageMealNutrition(options);
    if(!average){complete=false;continue;}
    hasValues=true;for(const key of Object.keys(publishedTotals))publishedTotals[key]+=average[key];
  }
  for(const peri of calendar.peri_meals||[]){
    if(peri.event_date!==d)continue;
    const avg=averageMealNutrition(peri.options||[]);
    if(!avg){complete=false;continue;}
    hasValues=true;
    for(const key of Object.keys(publishedTotals))publishedTotals[key]+=avg[key];
  }
  if(hasValues){
    const caption=document.createElement("small");caption.textContent=complete?"Resumo nutricional do dia":"Resumo parcial · faltam planos publicados";summary.appendChild(caption);
    nutritionCards(summary,publishedTotals,refs.weights_by_date?.[d]?.weight_kg);
  }

  for(const entry of mealColorsForDay(day)){
    const menu=(entry.meal==="lunch"||entry.meal==="dinner")?menus.menus.find(item=>item.menu_date===d&&item.meal===entry.meal):null;
    if(!entry.color&&!menu)continue;
    const section=document.createElement("section");section.className="player-sim-meal";
    const title=document.createElement("h3");title.textContent=names[entry.meal];section.appendChild(title);
    if(entry.color){const bar=document.createElement("div");bar.className="meal-"+entry.color;bar.style.cssText="height:9px;border-radius:8px;margin:8px 0 15px";section.appendChild(bar);}
    if(menu){const menuLine=document.createElement("div");menuLine.className="player-sim-menu";const label=document.createElement("small");label.textContent=menu.kind==="dish"?"Prato do dia":"Categoria do menu";const value=document.createElement("strong");value.textContent=menu.value;menuLine.append(label,value);section.appendChild(menuLine);}
    const options=entry.color?(publishedSimulation[entry.color]?.[entry.meal]||[]):[];
    if(entry.color&&!options.length){const missing=document.createElement("p");missing.className="hint";missing.textContent="Plano ainda não publicado para esta refeição.";section.appendChild(missing);}
    for(const [index,option] of options.entries()){
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.textContent="Opção "+(option.number||index+1)+(option.title?" · "+option.title:"");details.appendChild(summary);
      if(option.totals){const p=document.createElement("p");p.appendChild(coloredNutrition(option.totals));details.appendChild(p);}
      for(const item of option.items||[]){const line=document.createElement("p");line.className="player-plan-food";line.textContent=item.kind==="food"?((item.quantity||"")+" · "+(item.name||"")):(item.text||"");details.appendChild(line);}
      section.appendChild(details);
    }
    host.appendChild(section);
  }
}
for(const [id,delta] of [["player-preview-prev",-1],["player-preview-next",1]]){
  $(id).addEventListener("click",()=>{simulationDay.setDate(simulationDay.getDate()+delta);loadPlayerSimulation().catch(e=>status(e.message,"warn"));});
}
let v2Access=null;
async function loadV2Access(){
 if(!model)return;
 const data=await request(matchBase()+"/access");v2Access=data.access;
 $("v2-access-create").hidden=!!v2Access;$("v2-access-manage").hidden=!v2Access;
 $("v2-access-state").textContent=v2Access?"Username: "+v2Access.username+" · "+(v2Access.active?"Acesso ativo":"Acesso bloqueado"):"Ainda não existe uma conta associada.";
 if(v2Access)$("v2-access-toggle").textContent=v2Access.active?"Bloquear acesso":"Reativar acesso";
}
$("v2-access-create-btn").onclick=async()=>{
 const username=$("v2-access-username").value.trim().toLowerCase(),password=$("v2-access-password").value;
 if(!confirm("Criar conta de testes para "+model.athlete.name+" com username "+username+"?"))return;
 try{await request(matchBase()+"/access",{method:"POST",body:JSON.stringify({username,password})});$("v2-access-password").value="";$("v2-access-feedback").textContent="Acesso criado. Guarda a palavra-passe num local seguro.";await loadV2Access();}
 catch(e){$("v2-access-feedback").textContent="Erro: "+e.message;}
};
$("v2-access-toggle").onclick=async()=>{
 const active=!v2Access.active;
 if(!confirm((active?"Reativar":"Bloquear")+" o acesso de "+model.athlete.name+"?"))return;
 try{await request(matchBase()+"/access",{method:"PUT",body:JSON.stringify({active})});$("v2-access-feedback").textContent=active?"Acesso reativado.":"Acesso bloqueado; sessões terminadas.";await loadV2Access();}
 catch(e){$("v2-access-feedback").textContent="Erro: "+e.message;}
};
function showBackofficeView(view){
  backofficeView=view;
  const sections={profile:["athlete-weight-panel"],calendar:["calendar-section"],plans:["plan-import-panel","peri-panel"],supplements:["supplements-panel"],matrix:["matrix","scenario-editor","model-legend"],menus:["menus-panel"],"player-preview":["player-preview-panel"]};
  for(const [key,ids] of Object.entries(sections))for(const id of ids){
    const el=$(id);if(el)el.hidden=key!==view||!model;
  }
  for(const button of document.querySelectorAll("#backoffice-nav [data-view]")){
    button.setAttribute("aria-pressed",button.dataset.view===view?"true":"false");
  }
  // Administrator activation stays in Definições and must not be hidden by Planning.
  if(view==="profile"&&model)loadV2Access().catch(e=>status(e.message,"warn"));
  const calendarReady=view==="calendar"?loadCalendar().catch(e=>{status(e.message,"warn");}):null;
  if(view==="supplements"&&model)loadSupplementEditor().catch(e=>status(e.message,"warn"));
  if(view==="plans"&&model)loadPeriImports().catch(e=>status(e.message,"warn"));
  // Avaliações is loaded by its dedicated navigation controller.
  if(view==="player-preview"){showPlayerView(playerView).catch(e=>status(e.message,"warn"));}
  if(view==="menus"&&model)loadMenus().catch(e=>status(e.message,"warn"));
  if(view==="matrix"&&model)loadScenarioEditor();
  return calendarReady;
}
for(const button of document.querySelectorAll("#backoffice-nav [data-view]")){
  button.addEventListener("click",()=>showBackofficeView(button.dataset.view));
}
$("athlete").addEventListener("change",()=>loadModel().catch(e=>status(e.message,"warn")));
$("create").addEventListener("click",async()=>{const name=$("new-name").value.trim(),sex=$("new-sex").value,weightRaw=$("new-weight").value.trim(),weight=Number(weightRaw.replace(",",".")),username=$("new-username").value.trim().toLowerCase(),password=$("new-password").value;if(!name||!sex||weightRaw===""||!Number.isFinite(weight)||weight<20||weight>250||!/^[a-z]{4,40}$/.test(username)||password.length<12)return status("Preenche o nome, sexo, utilizador (4–40 letras) e palavra-passe (mínimo 12 caracteres).","warn");$("create").disabled=true;try{const r=await request("/api/v2/athletes",{method:"POST",body:JSON.stringify({name,sex,weight_kg:weight,username,password})});for(const id of ["new-name","new-weight","new-username","new-password"])$(id).value="";$("new-sex").value="";await loadAthletes(r.athlete.id);$("tm-players-create-form").hidden=true;if(typeof window.tmRefreshPlayersList==="function")await window.tmRefreshPlayersList();status("Jogador e acesso criados.","success");}catch(e){status(e.message,"warn");}finally{$("create").disabled=false;}});
start();

function isoDay(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function matchBase(){return "/api/v2/athletes/"+encodeURIComponent(model.athlete.id);}

// An explicit per-day exception takes precedence over the microcycle model.
function colorForDay(day,meal,overrides=dayColorOverrides){
  const row=model&&model.classifications.find(r=>r.name===(day.classification||"Geral"));
  const fallback=row?.meals?.[meal]||null;
  const selected=overrides[day.date+"|"+meal];
  if(Object.hasOwn(overrides,day.date+"|"+meal))return selected==="none"?null:selected;
  if(overrides===dayColorOverrides){const resolved=effectiveAdminColorsByDay[day.date]?.[meal];if(resolved)return resolved.color;}
  return fallback;
}
function mealColorsForDay(day,overrides=dayColorOverrides){
  return model.meals.map(meal=>({meal,color:colorForDay(day,meal,overrides)}));
}
function colorOverrideLookup(rows){
 return Object.fromEntries((rows||[]).map(r=>[r.meal_date+"|"+r.meal,r.color]));
}
function averageMealNutrition(options){
  const keys=["kcal","protein_g","carbs_g","fat_g"];
  if(!options.length)return null;
  const sums=Object.fromEntries(keys.map(key=>[key,0]));
  for(const option of options){
    if(!option.totals)return null;
    for(const key of keys){
      const raw=option.totals[key];
      if(raw===undefined||raw===null||String(raw).trim()==="")return null;
      const value=Number(String(raw).replace(",","."));
      if(!Number.isFinite(value)||value<0)return null;
      sums[key]+=value;
    }
  }
  return Object.fromEntries(keys.map(key=>[key,sums[key]/options.length]));
}
function formatNutrition(value,digits=1){return value.toLocaleString("pt-PT",{maximumFractionDigits:digits,minimumFractionDigits:digits});}
function nutritionSummary(average){
  return formatNutrition(average.kcal,0)+" kcal · P "+formatNutrition(average.protein_g)+" g · HC "+formatNutrition(average.carbs_g)+" g · G "+formatNutrition(average.fat_g)+" g";
}
function plannedDayTotals(day,periLookup=periByDay,colorLookup=dayColorOverrides){
  // Days without a specific classification inherit the configured Geral meal colors.
  const totals={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
  const missing=[];let count=0;
  for(const entry of mealColorsForDay(day,colorLookup)){
    if(!entry.color)continue;
    const average=averageMealNutrition(mealOptionsByColor[entry.color]?.[entry.meal]||[]);
    if(!average){missing.push(names[entry.meal]+" ("+(colors[entry.color]||entry.color)+")");continue;}
    for(const key of Object.keys(totals))totals[key]+=average[key];
    count++;
  }
  for(const peri of periLookup[day.date]||[]){
    const average=averageMealNutrition(peri.options||[]);
    if(!average){missing.push(peri.title);continue;}
    for(const key of Object.keys(totals))totals[key]+=average[key];
    count++;
  }
  return {state:missing.length?"partial":"complete",count,missing,total:count?totals:null};
}
function nutritionCards(host,totals,referenceWeight=null,relativeMeans=null){
  const grid=document.createElement("div");grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px;margin:12px 0";
  for(const [key,label,unit,digits] of [["kcal","Energia","kcal",0],["protein_g","Proteína","g",1],["carbs_g","Hidratos","g",1],["fat_g","Gordura","g",1]]){
    const card=document.createElement("div");card.style.cssText="border:1px solid #414148;border-radius:12px;padding:14px";
    const caption=document.createElement("small");caption.textContent=label;card.appendChild(caption);
    const value=document.createElement("strong");value.style.cssText="display:block;font-size:1.35em;margin-top:6px";
    value.textContent=formatNutrition(totals[key],digits)+" "+unit;card.appendChild(value);
    const weight=referenceWeight==null?NaN:Number(referenceWeight);
    const rel=relativeMeans?relativeMeans[key]:(Number.isFinite(weight)&&weight>0?totals[key]/weight:null);
    if(rel!==null&&Number.isFinite(rel)){const relative=document.createElement("small");relative.style.cssText="display:block;margin-top:6px";relative.textContent=formatNutrition(rel,key==="kcal"?1:2)+(key==="kcal"?" kcal/kg":" g/kg");card.appendChild(relative);}
    grid.appendChild(card);
  }
  host.appendChild(grid);
}
function renderNutritionTotals(host,label,result,referenceWeight=null){
  const block=document.createElement("section");block.className="import-validation-progress";
  const heading=document.createElement("h3");heading.textContent=label;block.appendChild(heading);
  const description=document.createElement("p");
  description.textContent=result.state==="unclassified"?"Sem classificação nutricional definida.":result.state==="complete"?"Total planeado · Todas as refeições atribuídas têm valores disponíveis.":result.total?"Subtotal incompleto · Existem refeições atribuídas sem valores disponíveis.":"Ainda não existem valores nutricionais calculáveis.";
  block.appendChild(description);
  if(result.total)nutritionCards(block,result.total,referenceWeight);
  if(result.missing.length){const note=document.createElement("p");note.textContent="Em falta: "+result.missing.join("; ");block.appendChild(note);}
  host.appendChild(block);
}

function renderDayPreview(day,host){
  host.replaceChildren();
  window.currentNutritionDay=day;

  const heading=document.createElement("h3");
  heading.textContent="Refeições · "+day.date+" · "+(day.classification||"Geral automático · por definir");
  host.appendChild(heading);
  const grid=document.createElement("div");grid.className="day-meals";
  const detail=document.createElement("section");detail.className="meal-options-detail";
  for(const entry of mealColorsForDay(day)){
    const cell=document.createElement("div");cell.className="day-meal";
    const label=document.createElement("span");label.textContent=names[entry.meal];
    const value=document.createElement("strong");
    value.textContent=entry.color?" ":"";
    if(entry.color)value.className="meal-"+entry.color;
    cell.append(label,value);
    const modelRow=model.classifications.find(r=>r.name===day.classification);
    const baseline=modelRow?.meals?.[entry.meal]||null;
    const isOverride=Object.hasOwn(dayColorOverrides,day.date+"|"+entry.meal);
    const choose=document.createElement("select");
    choose.className="day-color-select";choose.setAttribute("aria-label","Alterar cor de "+names[entry.meal]+" apenas em "+day.date);
    const inherit=document.createElement("option");inherit.value="";inherit.textContent="Modelo"+(baseline?" · "+(colors[baseline]||baseline):" · sem cor");choose.append(inherit);
    const noMeal=document.createElement("option");noMeal.value="none";noMeal.textContent="Nenhuma · remover refeição";choose.append(noMeal);
    for(const [colorName,labelText] of Object.entries(colors)){
      const option=document.createElement("option");option.value=colorName;option.textContent=labelText;choose.append(option);
    }
    choose.value=isOverride?dayColorOverrides[day.date+"|"+entry.meal]:"";
    choose.addEventListener("change",async()=>{
      choose.disabled=true;
      try{
        await request(matchBase()+"/calendar/meal-color",{method:"PUT",body:JSON.stringify({date:day.date,meal:entry.meal,color:choose.value||null})});
        selectedCalendarDay=day.date;
        status((choose.value==="none"?"Refeição removida":choose.value?"Cor atualizada":"Reposta a cor do Modelo")+" apenas para "+names[entry.meal]+" em "+day.date+".","success");
        await loadCalendar();
      }catch(e){status("Não foi possível atualizar a cor: "+e.message,"warn");choose.disabled=false;}
    });
    cell.append(choose);
    if(isOverride){const hint=document.createElement("small");hint.className="day-color-exception";hint.textContent="Exceção deste dia";cell.append(hint);}
    if(entry.meal==="lunch"||entry.meal==="dinner"){const menu=menuLookup[day.date+"|"+entry.meal];if(menu){const note=document.createElement("small");note.textContent="Menu: "+menu.value;cell.appendChild(note);}}
    if(entry.color){
      const options=mealOptionsByColor[entry.color]?.[entry.meal]||[];
      const available=Boolean(validatedPlansByColor[entry.color]);
      const availability=document.createElement("small");
      availability.textContent=!available?"Plano "+(colors[entry.color]||entry.color)+" em falta":options.length?options.length+" opções disponíveis":"Refeição não encontrada no plano";
      cell.appendChild(availability);
      if(available&&options.length){
        const average=averageMealNutrition(options);
        const avg=document.createElement("small");
        avg.textContent=average?"Média planeada: "+nutritionSummary(average):"Média indisponível: verificar totais das opções";
        cell.appendChild(avg);
      }
      if(available&&options.length){
        const view=document.createElement("button");view.type="button";view.textContent="Ver opções";
        view.addEventListener("click",()=>{
          detail.replaceChildren();
          const title=document.createElement("h3");title.textContent=names[entry.meal]+" · "+(colors[entry.color]||entry.color)+" · "+day.date;detail.appendChild(title);
          const average=averageMealNutrition(options);
          const avgLine=document.createElement("p");
          avgLine.textContent=average?"Média planeada das "+options.length+" opções: "+nutritionSummary(average):"Não é possível calcular a média: uma ou mais opções têm valores em falta.";
          detail.appendChild(avgLine);
          for(const option of options){
            const box=document.createElement("details");box.className="import-option";
            const caption=document.createElement("summary");
            caption.textContent="Opção "+option.number+(option.title?" · "+option.title:"");
            box.appendChild(caption);
            if(option.totals){
              const totals=document.createElement("p");
              totals.textContent=option.totals.kcal+" kcal · P "+option.totals.protein_g+" g · HC "+option.totals.carbs_g+" g · G "+option.totals.fat_g+" g";
              box.appendChild(totals);
            }
            for(const item of option.items||[]){
              const line=document.createElement("div");line.className="import-structured-line";
              line.textContent=item.kind==="food"?(item.quantity||"")+" · "+(item.name||""):"Nota: "+(item.text||"");
              box.appendChild(line);
            }
            detail.appendChild(box);
          }
        });
        cell.appendChild(view);
      }
    }
    grid.appendChild(cell);
  }
  host.appendChild(grid);
  if((periByDay[day.date]||[]).length){
    const area=document.createElement("div");area.className="import-validation-progress";
    const head=document.createElement("h3");head.textContent="Refeições peri-treino e peri-jogo";area.append(head);
    for(const item of periByDay[day.date]){
      const avg=averageMealNutrition(item.options||[]);const p=document.createElement("p");
      p.textContent=item.title+" · "+(item.session==="morning"?"Manhã":"Tarde")+(avg?" · "+nutritionSummary(avg):" · Valores indisponíveis");
      area.append(p);
    }
    host.append(area);
  }
  renderNutritionTotals(host,"Resumo nutricional do dia",plannedDayTotals(day),dayWeightReferences?.[day.date]?.weight_kg);
  host.appendChild(detail);
  const hint=document.createElement("p");hint.textContent="Pré-visualização administrativa. Os planos ainda não estão publicados aos jogadores.";host.appendChild(hint);
}

let dayWeightReferences={};
async function loadCalendar(){
  if(!model)return;
  const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
  const last=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0);
  const data=await request(matchBase()+"/calendar?start="+isoDay(first)+"&end="+isoDay(last));
  dayColorOverrides=colorOverrideLookup(data.meal_color_overrides);
  effectiveAdminColorsByDay=data.effective_colors||{};
  periByDay=Object.fromEntries(data.days.map(d=>[d.date,(data.peri_meals||[]).filter(p=>p.event_date===d.date)]));
  const menuData=await request(matchBase()+"/menus?start="+isoDay(first)+"&end="+isoDay(last));
  menuLookup=Object.fromEntries(menuData.menus.map(m=>[m.menu_date+"|"+m.meal,m]));
  if(!selectedNutritionWeek){
    const today=new Date();
    const anchor=today.getFullYear()===first.getFullYear()&&today.getMonth()===first.getMonth()?today:first;
    selectedNutritionWeek=isoDay(weekStart(anchor));
  }
  let weekly=$("nutrition-weekly-summary");
  if(!weekly){weekly=document.createElement("section");weekly.id="nutrition-weekly-summary";weekly.className="import-validation-progress";$("calendar-matches").insertAdjacentElement("afterend",weekly);}
  weekly.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="Média semanal";weekly.appendChild(heading);
  const navigation=document.createElement("div");navigation.className="calendar-navigation";
  const previous=document.createElement("button");previous.type="button";previous.textContent="← Semana anterior";
  const next=document.createElement("button");next.type="button";next.textContent="Semana seguinte →";
  const range=document.createElement("strong");navigation.append(previous,range,next);weekly.appendChild(navigation);
  const monday=new Date(selectedNutritionWeek+"T12:00:00");
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  range.textContent=monday.toLocaleDateString("pt-PT",{day:"2-digit",month:"short"})+" – "+sunday.toLocaleDateString("pt-PT",{day:"2-digit",month:"short",year:"numeric"});
  const step=delta=>{const date=new Date(monday);date.setDate(date.getDate()+delta);selectedNutritionWeek=isoDay(date);loadCalendar().catch(e=>status(e.message,"warn"));};
  previous.addEventListener("click",()=>step(-7));next.addEventListener("click",()=>step(7));
  const [weeklyData,weeklyRefs]=await Promise.all([request(matchBase()+"/calendar?start="+isoDay(monday)+"&end="+isoDay(sunday)),request(matchBase()+"/reference-weights?start="+isoDay(monday)+"&end="+isoDay(sunday))]);
  dayWeightReferences={...(dayWeightReferences||{}),...(weeklyRefs.weights_by_date||{})};
  const weeklyPeri=Object.fromEntries(weeklyData.days.map(d=>[d.date,(weeklyData.peri_meals||[]).filter(x=>x.event_date===d.date)]));
  const weeklyColors=colorOverrideLookup(weeklyData.meal_color_overrides);
  const results=weeklyData.days.map(d=>plannedDayTotals(d,weeklyPeri,weeklyColors));
  const covered=results.filter(item=>item.total).length;
  const complete=weeklyData.days.length===7&&results.every((item)=>item.state==="complete"&&item.total);
  const progress=document.createElement("p");
  progress.textContent=covered+"/7 dias com valores nutricionais disponíveis";
  weekly.appendChild(progress);
  if(complete){
    const sums={kcal:0,protein_g:0,carbs_g:0,fat_g:0};
    for(const result of results)for(const key of Object.keys(sums))sums[key]+=result.total[key];
    const average=Object.fromEntries(Object.entries(sums).map(([key,value])=>[key,value/7]));
    const relativeMeans={};for(const key of Object.keys(sums)){const ratios=results.map((result,i)=>{const rawWeight=dayWeightReferences[weeklyData.days[i]?.date]?.weight_kg;const w=rawWeight==null?NaN:Number(rawWeight);return Number.isFinite(w)&&w>0?result.total[key]/w:null;});if(ratios.every(x=>x!==null))relativeMeans[key]=ratios.reduce((a,b)=>a+b,0)/ratios.length;}
    nutritionCards(weekly,average,null,relativeMeans);
  }else{
    const warning=document.createElement("p");
    warning.textContent="Média diária semanal indisponível: faltam prescrições ou valores nutricionais para completar os sete dias.";
    weekly.appendChild(warning);
  }
  const days=$("calendar-days");days.replaceChildren();
  $("calendar-title").textContent=first.toLocaleDateString("pt-PT",{month:"long",year:"numeric"});
  for(let i=0;i<(first.getDay()+6)%7;i++){const empty=document.createElement("div");empty.className="calendar-empty";days.appendChild(empty);}
  for(const day of data.days){
    const el=document.createElement("div");el.className="calendar-day"+(day.needs_review?" calendar-review":"")+(day.classification?"":" calendar-general-fallback");if(!day.classification){el.style.outline="1px dashed #a28a55";el.style.outlineOffset="-3px";el.style.backgroundColor="rgba(162,138,85,.10)";}
    const date=document.createElement("strong");date.textContent=Number(day.date.slice(-2));el.appendChild(date);
    const type=document.createElement("span");type.textContent=day.needs_review?"Rever":day.classification||"Geral · por definir";el.appendChild(type);
    if(day.needs_review){el.title=day.candidates.map(x=>x.match_date+": "+x.classification).join(" | ");}
    if(data.matches.some(m=>m.match_date===day.date)){el.classList.add("calendar-match");}
    const dayEvents=(data.events||[]).filter(e=>e.event_date===day.date);
    if(dayEvents.length){
      const chip=document.createElement("span");chip.className="calendar-event-mark";
      chip.textContent=dayEvents.map(e=>CALENDAR_EVENT_NAMES[e.kind]||e.title).join(" · ");
      chip.title=chip.textContent;el.append(chip);
    }
    const strip=document.createElement("div");strip.className="day-color-strip";
    for(const entry of mealColorsForDay(day)){
      const dot=document.createElement("i");
      dot.className="day-color-dot"+(entry.color?" meal-"+entry.color:"");
      dot.title=names[entry.meal]+": "+(entry.color?(colors[entry.color]||entry.color):"Sem cor atribuída");
      strip.appendChild(dot);
    }
    el.appendChild(strip);
    el.setAttribute("role","button");el.tabIndex=0;
    el.setAttribute("aria-label","Ver cores das refeições de "+day.date+(day.classification?"":" · Geral aplicado automaticamente, dia por definir"));
    const selectDay=()=>{
      const wasSelected=selectedCalendarDay===day.date;
      selectedCalendarDay=wasSelected?null:day.date;
      $("calendar-new-date").value=day.date;
      if($("calendar-new-kind").value==="supplementation")renderCalendarSupplementChoices().catch(e=>status(e.message,"warn"));
      const chosenWeek=isoDay(weekStart(new Date(day.date+"T12:00:00")));
      if(!wasSelected&&selectedNutritionWeek!==chosenWeek){selectedNutritionWeek=chosenWeek;loadCalendar().catch(e=>status(e.message,"warn"));return;}
      for(const item of days.querySelectorAll(".calendar-day"))item.classList.remove("calendar-selected");
      if(wasSelected){preview.hidden=true;preview.replaceChildren();}else{el.classList.add("calendar-selected");preview.hidden=false;renderDayPreview(day,preview);}
    };
    el.addEventListener("click",selectDay);
    el.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectDay();}});
    if(selectedCalendarDay===day.date)el.classList.add("calendar-selected");
    days.appendChild(el);
  }
  let preview=$("day-preview");
  if(!preview){
    preview=document.createElement("div");preview.id="day-preview";
    preview.className="day-preview";
    days.insertAdjacentElement("afterend",preview);
  }
  const focused=data.days.find(d=>d.date===selectedCalendarDay);
  preview.hidden=!focused;
  if(focused){renderDayPreview(focused,preview);}
  const list=$("calendar-matches");list.replaceChildren();
  const combined=[
    ...(data.matches||[]).map(m=>({
      id:m.id,kind:"match",event_date:m.match_date,session:!m.match_time||m.match_time<"15:00"?"morning":"afternoon",
      title:"Jogo",match_time:m.match_time||"",
      pre_override:(data.match_peri_overrides||[]).find(x=>x.match_id===m.id&&x.phase==="pre")?.state||"auto",
      post_override:(data.match_peri_overrides||[]).find(x=>x.match_id===m.id&&x.phase==="post")?.state||"auto"
    })),
    ...(data.events||[])
  ].sort((a,b)=>a.event_date.localeCompare(b.event_date)||(a.session===b.session?0:a.session==="morning"?-1:1));
  if(!combined.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem eventos neste mês.";list.append(p);}
  for(const ev of combined)list.append(renderUnifiedEvent(ev));
  const supplementation=await request(matchBase()+"/supplements");
  for(const [date,entry] of Object.entries(supplementation.overrides||{})){
   if(date<isoDay(first)||date>isoDay(last)||!(entry.add||[]).length)continue;
   const card=document.createElement("div");card.className="event-admin-row";
   const label=document.createElement("span");
   label.textContent=date+" · Suplementação · "+entry.add.map(x=>x.name).join(", ");
   const edit=document.createElement("button");edit.type="button";edit.textContent="Editar suplementos";
   edit.onclick=()=>{
    $("calendar-new-kind").value="supplementation";$("calendar-new-date").value=date;
    syncCalendarEventForm();renderCalendarSupplementChoices().catch(e=>status(e.message,"warn"));
    $("calendar-event-form").scrollIntoView({behavior:"smooth",block:"center"});
   };
   card.append(label,edit);list.append(card);
  }
  $("calendar-section").hidden=false;
}
$("calendar-prev").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);loadCalendar().catch(e=>status(e.message,"warn"));});
$("calendar-next").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);loadCalendar().catch(e=>status(e.message,"warn"));});

let selectedPlanId=null,selectedPlanMode="consult";
async function loadPlanDrafts(){
  if(!model)return;
  const data=await request(matchBase()+"/plan-imports");
  const readiness=await request(matchBase()+"/plan-imports/publication-status");
  validatedPlansByColor=Object.fromEntries(readiness.colors.map(entry=>[entry.color,entry.validated_count>0]));
  const mealData=await request(matchBase()+"/plan-imports/meal-options");
  mealOptionsByColor=mealData.options_by_color;
  const historyData=await request(matchBase()+"/plan-imports/publication-history");
  const panel=$("publication-readiness");panel.replaceChildren();
  const title=document.createElement("h3");title.textContent="Planos alimentares";panel.appendChild(title);
  const list=$("import-list");list.replaceChildren();
  const drafts=data.drafts||[];
  for(const entry of readiness.colors){
    const latest=drafts.filter(d=>d.color===entry.color).sort((a,b)=>(b.created_at||0)-(a.created_at||0))[0];
    const row=document.createElement("div");row.className="plan-simple-row";
    const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+entry.color;row.appendChild(dot);
    const info=document.createElement("div");info.className="plan-simple-info";
    const name=document.createElement("strong");name.textContent=colors[entry.color]||entry.color;
    const state=document.createElement("small");
    state.textContent=entry.publication?"Publicado":latest?(latest.status==="validated"?"Validado · por publicar":"Em revisão"):"Sem plano";state.classList.toggle("is-published",Boolean(entry.publication));
    info.append(name,state);row.appendChild(info);
    if(latest){
      row.classList.add("plan-selectable");row.tabIndex=0;row.setAttribute("role","button");
      row.setAttribute("aria-expanded",selectedPlanId===latest.id?"true":"false");
      const toggle=async()=>{
        if(selectedPlanId===latest.id){selectedPlanId=null;selectedPlanMode="consult";$("import-review").replaceChildren();await loadPlanDrafts();return;}
        try{
          const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(latest.id));
          selectedPlanId=latest.id;selectedPlanMode="consult";showImportedDraft(result.draft);await loadPlanDrafts();
        }catch(e){$("import-feedback").textContent="Erro ao abrir plano: "+e.message;}
      };
      row.addEventListener("click",toggle);
      row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}});
      const chevron=document.createElement("span");chevron.className="plan-row-chevron";chevron.textContent=selectedPlanId===latest.id?"⌄":"›";row.appendChild(chevron);
    }
    const assigned=[...new Set(model.classifications.flatMap(cls=>model.meals.filter(meal=>cls.meals[meal]===entry.color)))];
    const missing=entry.validated_count?assigned.filter(meal=>!averageMealNutrition(mealOptionsByColor[entry.color]?.[meal]||[])):[];
    if(missing.length){
      const warning=document.createElement("p");warning.className="plan-simple-warning";
      warning.textContent="Rever opções de: "+missing.map(meal=>names[meal]).join(", ");row.appendChild(warning);
    }
    if(selectedPlanId===latest?.id){row.classList.add("plan-active-row");row.classList.add("plan-active-"+entry.color);}
    panel.appendChild(row);
  }
  let history=$("plan-publication-history");
  if(!history){history=document.createElement("details");history.id="plan-publication-history";history.className="import-validation-progress";$("publication-readiness").insertAdjacentElement("afterend",history);}
  history.replaceChildren();
  const heading=document.createElement("summary");heading.textContent="Histórico de publicações ("+historyData.history.length+")";history.appendChild(heading);
  for(const item of historyData.history){
    const line=document.createElement("p");line.textContent=(colors[item.color]||item.color)+" · "+new Date(item.published_at*1000).toLocaleString("pt-PT")+" · "+(item.replaced_at?"Substituído":"Ativo");history.appendChild(line);
  }
  list.hidden=true;
  const current=$("import-review");
  if(!drafts.length)current.replaceChildren();

}
let planPendingSaves=[];
const periUnchangedCopies=new Set();
function coloredNutrition(values){
  const out=document.createElement("span");out.className="nutrient-colors";
  for(const [key,prefix,klass] of [["kcal","","nutrient-kcal"],["protein_g","P ","nutrient-protein"],["carbs_g","HC ","nutrient-carbs"],["fat_g","G ","nutrient-fat"]]){
    const span=document.createElement("span");span.className=klass;
    span.textContent=prefix+(values?.[key]??"—")+(key==="kcal"?" kcal":" g");out.appendChild(span);
  }
  return out;
}
function renderPlayerPlanPreview(draft,host){
  host.replaceChildren();
  const intro=document.createElement("p");intro.className="hint";intro.textContent="Simulação administrativa da consulta pelo jogador · Não publicado";host.appendChild(intro);
  const byMeal=new Map();
  for(const group of draft.extracted.groups)for(const meal of group.meals||[]){
    if(!byMeal.has(meal))byMeal.set(meal,[]);
    byMeal.get(meal).push(...group.options);
  }
  for(const meal of model.meals){
    const options=byMeal.get(meal)||[];
    if(!options.length)continue;
    const section=document.createElement("section");section.className="player-plan-meal";
    const title=document.createElement("h4");title.textContent=names[meal];section.appendChild(title);
    for(const [index,option] of options.entries()){
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.textContent="Opção "+(option.number||index+1)+(option.title?" · "+option.title:"");details.appendChild(summary);
      for(const item of option.items||[]){
        if(item.kind==="title")continue;
        const line=document.createElement("p");line.className="player-plan-food";
        line.textContent=item.kind==="food"?(item.quantity+" · "+item.name):(item.text||"");details.appendChild(line);
      }
      section.appendChild(details);
    }
    host.appendChild(section);
  }
}
function showImportedDraft(draft){
  const root=$("import-review");root.replaceChildren();
  const header=document.createElement("div");header.className="plan-detail-header";
  const h=document.createElement("h3");const dot=document.createElement("span");dot.className="plan-simple-dot meal-"+draft.color;h.append(dot,document.createTextNode(colors[draft.color]||draft.color));header.appendChild(h);
  header.classList.add("plan-action-header");root.appendChild(header);
  const edit=document.createElement("button");edit.type="button";edit.textContent=selectedPlanMode==="edit"?"Validar":"Editar";
  edit.addEventListener("click",async()=>{
    edit.disabled=true;
    try{
      if(selectedPlanMode==="consult"){
        if(draft.status==="validated"){
          const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/review-status",{method:"POST",body:JSON.stringify({action:"reopen"})});
          draft.status=result.status;
        }
        selectedPlanMode="edit";
      }else{
        await Promise.all(planPendingSaves);
        const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/review-status",{method:"POST",body:JSON.stringify({action:"approve"})});
        draft.status=result.status;selectedPlanMode="consult";
        await loadPlanDrafts();
      }
      showImportedDraft(draft);await loadPlanDrafts();
    }catch(e){status("Não foi possível concluir: "+e.message,"warn");}finally{edit.disabled=false;}
  });
  if(selectedPlanMode==="consult")header.appendChild(edit);
  if(selectedPlanMode==="consult"&&draft.status==="validated"){
    const publish=document.createElement("button");publish.type="button";publish.textContent="Publicar";publish.className="plan-publish-action is-pending";header.appendChild(publish);
    publish.onclick=async()=>{
      if(!window.confirm("Publicar o plano "+(colors[draft.color]||draft.color)+" apenas para "+model.athlete.name+"? Esta ação cria uma versão publicada e substitui a anterior desta cor."))return;
      publish.disabled=true;
      try{
        await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/publish",{method:"POST",body:JSON.stringify({confirmation:"PUBLICAR",athlete_id:model.athlete.id})});
        status("Plano publicado com sucesso.","success");
        await loadPlanDrafts();
      }catch(e){status("Erro ao publicar: "+e.message,"warn");}finally{publish.disabled=false;}
    };
  }
  if(selectedPlanMode==="edit"){
    const indicator=document.createElement("small");indicator.textContent="Alterações guardadas automaticamente · validação pendente";header.appendChild(indicator);
  }
  draft.extracted.groups.forEach((group,groupIndex)=>{
    const groupTitle=document.createElement("div");groupTitle.className="plan-group-title";
    const heading=document.createElement("h3");heading.textContent=group.heading||"Refeição";groupTitle.appendChild(heading);
    if(selectedPlanMode==="edit"){
      const mapping=document.createElement("div");mapping.className="plan-meal-mapping";
      for(const meal of model.meals){
        const label=document.createElement("label");const check=document.createElement("input");check.type="checkbox";check.checked=group.meals.includes(meal);label.append(check,document.createTextNode(" "+names[meal]));mapping.appendChild(label);
        check.addEventListener("change",async()=>{
          const choices=[...mapping.querySelectorAll("label")].filter(l=>l.querySelector("input").checked).map(l=>model.meals[[...mapping.children].indexOf(l)]);
          try{await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/group-meals",{method:"PUT",body:JSON.stringify({group_index:groupIndex,meals:choices})});group.meals=choices;status("Correspondência das refeições atualizada.","success");}
          catch(e){check.checked=!check.checked;status("Erro na correspondência: "+e.message,"warn");}
        });
      }
      groupTitle.appendChild(mapping);
    }else{const mapping=document.createElement("small");mapping.textContent=group.meals.map(m=>names[m]).join(" / ");groupTitle.appendChild(mapping);}
    root.appendChild(groupTitle);
    group.options.forEach((option,optionIndex)=>{
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.className="plan-option-summary";
      const name=document.createElement("span");name.className="plan-option-name";name.textContent="Opção "+option.number+(option.title?" · "+option.title:"");
      const nutrients=document.createElement("span");nutrients.className="plan-option-nutrition";
      if(option.totals)nutrients.appendChild(coloredNutrition(option.totals));else nutrients.textContent="Valores por confirmar";
      summary.append(name,nutrients);details.appendChild(summary);

      for(const item of option.items||[]){
        if(item.kind==="title")continue;
        const line=document.createElement("div");line.className="import-structured-line";
        const name=document.createElement("span");
        name.textContent=item.kind==="food"?item.quantity+" · "+item.name:item.text;
        if(item.kind==="instruction"||item.kind==="note")name.textContent="Nota: "+item.text;
        line.appendChild(name);
        if(item.nutrients){
          const nutrient=document.createElement("span");nutrient.className="import-nutrients";
          nutrient.appendChild(coloredNutrition(item.nutrients));
          line.appendChild(nutrient);
        }
        if(item.needs_review){const note=document.createElement("small");note.textContent="Verificar";line.appendChild(note);}
        details.appendChild(line);
      }
      if(selectedPlanMode==="edit")details.addEventListener("toggle",()=>{if(details.open&&!details.querySelector(".option-editor"))showOptionEditor(draft,groupIndex,optionIndex,details);});
      root.appendChild(details);
    });
  });
  if(selectedPlanMode==="edit"){edit.classList.add("plan-validate-action");const footer=document.createElement("div");footer.className="plan-editor-footer";footer.append(edit);root.append(footer);}
}

function showOptionEditor(draft,groupIndex,optionIndex,details){
  const option=draft.extracted.groups[groupIndex].options[optionIndex];
  const existing=details.querySelector(".option-editor");if(existing){existing.remove();return;}
  const form=document.createElement("div");form.className="option-editor";
  const field=(label,value,parent=form)=>{
    const wrap=document.createElement("label");wrap.textContent=label;
    const input=document.createElement("input");input.value=value||"";wrap.appendChild(input);parent.appendChild(wrap);return input;
  };
  const title=field("Título / descrição",option.title||((option.items||[]).find(i=>i.kind==="title")||{}).text||"");
  const totals={};
  for(const [key,label] of [["kcal","kcal"],["protein_g","Proteína (g)"],["carbs_g","HC (g)"],["fat_g","Gordura (g)"]]){
    totals[key]=field("Total · "+label,option.totals?.[key]||"");
  }
  const edits=[];
  const addPlanLine=(item,index)=>{
    const box=document.createElement("fieldset");box.className="meal-line-editor";const legend=document.createElement("legend");legend.textContent="Linha "+(index+1);box.appendChild(legend);
    const type=document.createElement("select");
    for(const [value,label] of [["food","Alimento"],["note","Nota"],["collapsible_note","Nota colapsável"]]){
      const el=document.createElement("option");el.value=value;el.textContent=label;type.appendChild(el);
    }
    type.value=item.kind==="food"?"food":item.kind==="collapsible_note"?"collapsible_note":"note";const typeLabel=document.createElement("label");typeLabel.textContent="Tipo de linha";typeLabel.className="meal-line-kind";typeLabel.append(type);box.appendChild(typeLabel);
    const noteTitle=field("Título (opcional)",item.kind==="collapsible_note"?(item.title||""):"",box);
    const foodRow=document.createElement("div");foodRow.className="meal-food-row";box.append(foodRow);
    const quantity=field("Quantidade",item.quantity||"",foodRow);
    const name=field("Alimento / texto",item.kind==="food"?item.name:item.text,foodRow);
    const noteDescription=document.createElement("label");noteDescription.className="meal-note-description";noteDescription.textContent="Descrição";const noteTextarea=document.createElement("textarea");noteTextarea.rows=4;noteTextarea.maxLength=4000;noteTextarea.value=item.kind==="collapsible_note"?(item.text||""):"";noteDescription.append(noteTextarea);box.append(noteDescription);
    const nutrientRow=document.createElement("div");nutrientRow.className="meal-nutrient-row";box.append(nutrientRow);
    const nutrients={};
    for(const [key,label] of [["kcal","kcal"],["protein_g","P"],["carbs_g","HC"],["fat_g","G"]]){
      nutrients[key]=field(label,item.nutrients?.[key]||"",nutrientRow);
      nutrients[key].parentElement.classList.add("nutrient-"+key);
    }
    const updateFields=()=>{
      const kind=type.value;
      box.dataset.lineKind=kind;
      noteTitle.parentElement.style.display=kind==="collapsible_note"?"":"none";
      name.parentElement.firstChild.textContent=kind==="food"?"Alimento":"Texto da nota";
      foodRow.style.display=kind==="collapsible_note"?"none":"";
      noteDescription.style.display=kind==="collapsible_note"?"":"none";
      nutrientRow.style.display=kind==="food"?"":"none";
      quantity.parentElement.style.display=kind==="food"?"":"none";
      for(const input of Object.values(nutrients))input.parentElement.style.display=kind==="food"?"":"none";
    };
    type.addEventListener("change",updateFields);updateFields();
    const remove=document.createElement("button");remove.type="button";remove.className="option-remove-line";remove.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';remove.title="Remover linha";remove.setAttribute("aria-label","Remover linha "+(index+1));
    box.appendChild(remove);
    form.appendChild(box);
    const edit={type,name,noteTitle,noteTextarea,quantity,nutrients,box,removed:false};edits.push(edit);
    remove.onclick=()=>{edit.removed=true;box.remove();persist();};
  };
  (option.items||[]).filter(item=>item.kind!=="title").forEach(addPlanLine);
  const addLine=document.createElement("button");addLine.type="button";addLine.textContent="+ Adicionar linha";addLine.onclick=()=>addPlanLine({kind:"note",text:""},edits.length);form.appendChild(addLine);
  const feedback=document.createElement("p");feedback.className="hint";feedback.textContent="As alterações são guardadas automaticamente ao sair de cada campo.";form.appendChild(feedback);
  let saveChain=Promise.resolve();
  const persist=()=>{
    const entries=edits.filter(edit=>!edit.removed).map(edit=>{
      const kind=edit.type.value;
      const nutrients=Object.fromEntries(Object.entries(edit.nutrients).map(([key,input])=>[key,input.value.trim()]));
      return {kind,text:kind==="collapsible_note"?edit.noteTextarea.value:edit.name.value.trim(),name:kind==="food"?edit.name.value.trim():"",quantity:kind==="food"?edit.quantity.value.trim():"",nutrients:kind==="food"&&Object.values(nutrients).some(Boolean)?nutrients:null,...(kind==="collapsible_note"?{title:edit.noteTitle.value.trim()}:{})};
    });
    const totalValues=Object.fromEntries(Object.entries(totals).map(([key,input])=>[key,input.value.trim()]));
    const payload={group_index:groupIndex,option_index:optionIndex,option:{title:title.value.trim(),totals:Object.values(totalValues).some(Boolean)?totalValues:null,items:entries,reviewed:Boolean(option.reviewed)}};
    feedback.textContent="A guardar alterações…";
    saveChain=saveChain.catch(()=>{}).then(async()=>{
      const response=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id),{method:"PUT",body:JSON.stringify(payload)});
      option.items=response.option.items;option.title=response.option.title;option.totals=response.option.totals;option.reviewed=response.option.reviewed;
      feedback.textContent="Alterações guardadas automaticamente.";
    }).catch(e=>{feedback.textContent="Erro ao guardar: "+e.message;throw e;});
    planPendingSaves.push(saveChain);
    saveChain.finally(()=>{planPendingSaves=planPendingSaves.filter(p=>p!==saveChain);}).catch(()=>{});
  };
  form.addEventListener("change",event=>{if(event.target.matches("input,select,textarea"))persist();});
  details.appendChild(form);
}
$("import-submit").addEventListener("click",async()=>{
  if(!model)return;
  const file=$("import-pdf").files[0];
  if(!file||!file.name.toLowerCase().endsWith(".pdf")||file.size>3*1024*1024){$("import-feedback").textContent="Seleciona um PDF válido até 3 MB.";return;}
  const button=$("import-submit");button.disabled=true;$("import-feedback").textContent="A analisar o PDF…";
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const result=await request(matchBase()+"/plan-imports",{method:"POST",body:JSON.stringify({color:$("import-color").value,filename:file.name,pdf_base64:btoa(binary)})});
    $("import-feedback").textContent="Rascunho guardado. Rever a extração antes de qualquer futura publicação.";
    showImportedDraft(result.draft);await loadPlanDrafts();
  }catch(e){$("import-feedback").textContent="Erro na importação: "+e.message;}
  finally{button.disabled=false;}
});

async function photoAsWebp(file){
  if(!file||file.size>12000000)throw Error("Seleciona uma fotografia PNG, JPG ou WebP até 12 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function refreshDishCategories(){
  const select=$("new-dish-category");const previous=select.value;
  select.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent="Selecionar categoria";select.appendChild(empty);
  for(const name of [...new Set(dishLibrary.map(d=>d.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"))){
    const option=document.createElement("option");option.value=name;option.textContent=name;select.appendChild(option);
  }
  select.value=previous;
}
async function uploadDishPhoto(file,fields){
  const image=await photoAsWebp(file);
  return request("/api/v2/dishes/photo",{method:"POST",body:JSON.stringify({...fields,image})});
}
$("create-dish").addEventListener("click",async()=>{
  const button=$("create-dish"),feedback=$("dish-new-feedback");
  const name_pt=$("new-dish-pt").value.trim(),name_en=$("new-dish-en").value.trim(),category=$("new-dish-category").value.trim(),photo=$("new-dish-photo").files[0];
  if(!name_pt||!category||!photo){feedback.textContent="Indica nome português, categoria e fotografia.";return;}
  button.disabled=true;feedback.textContent="A guardar prato…";
  try{await uploadDishPhoto(photo,{name_pt,name_en,category});
    feedback.textContent="Prato adicionado à biblioteca universal.";
    $("new-dish-pt").value="";$("new-dish-en").value="";$("new-dish-category").value="";$("new-dish-photo").value="";
    dishLibrary=(await request("/api/v2/dishes")).dishes;renderDishEditor();refreshDishCategories();
  }catch(e){feedback.textContent="Erro: "+e.message;}finally{button.disabled=false;}
});
function renderDishEditor(){
  const host=$("dish-editor-list");if(!host)return;host.replaceChildren();
  const query=($("dish-search").value||"").trim().toLocaleLowerCase("pt-PT");
  if(!query){host.textContent="";return;}
  const matches=dishLibrary.filter(d=>(d.name_pt+" "+d.category).toLocaleLowerCase("pt-PT").includes(query)).slice(0,25);
  for(const dish of matches){
    const card=document.createElement("div");card.className="dish-edit-card";
    const photo=document.createElement("img");photo.src="/api/v2/dishes/image/"+encodeURIComponent(dish.id)+"?v="+Date.now();photo.alt=dish.name_pt;photo.loading="lazy";card.appendChild(photo);
    const fields=document.createElement("div");fields.className="dish-edit-fields";
    const photoLabel=document.createElement("label");photoLabel.textContent="Substituir fotografia";
    const photoInput=document.createElement("input");photoInput.type="file";photoInput.accept="image/*";photoLabel.appendChild(photoInput);fields.appendChild(photoLabel);
    const photoButton=document.createElement("button");photoButton.type="button";photoButton.textContent="Atualizar fotografia";
    photoButton.onclick=async()=>{if(!photoInput.files[0])return;photoButton.disabled=true;
      try{await uploadDishPhoto(photoInput.files[0],{id:dish.id});photoInput.value="";photo.src="/api/v2/dishes/image/"+encodeURIComponent(dish.id)+"?v="+Date.now();status("Fotografia atualizada.","success");}
      catch(e){status("Erro: "+e.message,"warn");}finally{photoButton.disabled=false;}
    };fields.appendChild(photoButton);
    const inputs=[];
    for(const [key,label] of [["name_pt","Nome português"],["name_en","Nome inglês"],["category","Categoria"]]){
      const wrap=document.createElement("label");wrap.textContent=label;const input=document.createElement("input");input.value=dish[key]||"";input.maxLength=200;wrap.appendChild(input);fields.appendChild(wrap);inputs.push(input);
    }

    const save=document.createElement("button");save.type="button";save.textContent="Guardar alterações";
    save.onclick=async()=>{save.disabled=true;try{
      await request("/api/v2/dishes/edit",{method:"PUT",body:JSON.stringify({id:dish.id,name_pt:inputs[0].value,name_en:inputs[1].value,category:inputs[2].value,active:true})});
      dish.name_pt=inputs[0].value;dish.name_en=inputs[1].value;dish.category=inputs[2].value;dish.active=1;
      status("Prato atualizado na biblioteca universal.","success");
    }catch(e){status("Erro: "+e.message,"warn");}finally{save.disabled=false;}};
    fields.appendChild(save);card.appendChild(fields);host.appendChild(card);
  }
  if(!matches.length)host.textContent="Nenhum prato encontrado.";
}
$("dish-search").addEventListener("input",renderDishEditor);
$("dish-catalog-import").addEventListener("click",async()=>{
  const input=$("dish-catalog-file"),feedback=$("dish-catalog-feedback"),file=input.files?.[0];
  if(!file){feedback.textContent="Seleciona o pacote ZIP da biblioteca.";return;}
  const button=$("dish-catalog-import");button.disabled=true;feedback.textContent="A importar biblioteca…";
  try{
    const response=await fetch("/api/v2/dishes/import",{method:"POST",credentials:"same-origin",headers:{"X-CSRF-Token":csrf},body:file});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Erro na importação");
    feedback.textContent=data.imported+" pratos importados com fotografias.";
    await loadMenus();
  }catch(e){feedback.textContent="Erro: "+e.message;}finally{button.disabled=false;}
});

const CALENDAR_EVENT_NAMES={training:"Treino",match:"Jogo",travel:"Viagem"};
function calendarEventEndpoint(){return matchBase()+"/events";}
function dayPartSelect(value,label){
 const field=document.createElement("label");field.textContent=label;
 const select=document.createElement("select");
 for(const [code,title] of [["morning","Manhã"],["afternoon","Tarde"]]){
  const option=document.createElement("option");option.value=code;option.textContent=title;select.append(option);
 }
 select.value=value;field.append(select);return {field,select};
}
function periToggle(phase,kind,initial){
 const field=document.createElement("label");field.className="calendar-peri-check";
 const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=initial!=="off";
 const name=document.createElement("span");name.textContent=(phase==="pre"?"Pré-":"Pós-")+(kind==="match"?"jogo":"treino");
 field.append(checkbox,name);
 return {field,checkbox};
}
function renderUnifiedEvent(ev){
 const card=document.createElement("section");card.className="calendar-unified-event";
 const heading=document.createElement("div");heading.className="calendar-unified-heading";
 const title=document.createElement("strong");title.textContent=CALENDAR_EVENT_NAMES[ev.kind]||ev.title;
 const dateLabel=document.createElement("span");dateLabel.textContent=ev.event_date+" · "+(ev.kind==="match"&&ev.match_time?ev.match_time:ev.session==="morning"?"Manhã":"Tarde");
 heading.append(title,dateLabel);
 const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";heading.append(edit);card.append(heading);
 const controls=document.createElement("form");controls.className="calendar-inline-editor";controls.hidden=true;
 const dateWrap=document.createElement("label");dateWrap.textContent="Data";
 const date=document.createElement("input");date.type="date";date.required=true;date.value=ev.event_date;dateWrap.append(date);controls.append(dateWrap);
 const period=dayPartSelect(ev.session,"Período");
 const timeWrap=document.createElement("label");timeWrap.textContent="Hora do jogo";
 const time=document.createElement("input");time.type="time";time.value=ev.match_time||"";timeWrap.append(time);
 if(ev.kind==="match")controls.append(timeWrap);else controls.append(period.field);
 if(ev.kind==="travel"){
  const label=document.createElement("label");label.textContent="Descrição";
  const text=document.createElement("input");text.value=ev.title;text.maxLength=100;text.required=true;label.append(text);controls.append(label);
 }
 let pre=null,post=null;
 if(ev.kind==="match"||ev.kind==="training"){
  pre=periToggle("pre",ev.kind,ev.pre_override);
  post=periToggle("post",ev.kind,ev.post_override);
  controls.append(pre.field,post.field);
 }
 const save=document.createElement("button");save.type="submit";save.textContent="Guardar";
 const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";remove.className="calendar-remove";
 controls.append(save,remove);
 edit.onclick=()=>{controls.hidden=!controls.hidden;edit.textContent=controls.hidden?"Editar":"Fechar";};
 const feedback=$("calendar-event-feedback");
 controls.onsubmit=async e=>{
  e.preventDefault();save.disabled=true;
  try{
   if(ev.kind==="match"){
    await request(matchBase()+"/matches/"+encodeURIComponent(ev.id),{method:"PUT",body:JSON.stringify({match_date:date.value,match_time:time.value||null})});
    await saveMatchPeri(ev.id,pre.checkbox.checked,post.checkbox.checked);
   }else{
    await request(calendarEventEndpoint()+"/"+encodeURIComponent(ev.id),{method:"PUT",body:JSON.stringify({
      event_date:date.value,session:period.select.value,title:ev.kind==="travel"?controls.querySelector('input[maxlength="100"]').value:ev.title,
      ...(pre?{pre_override:pre.checkbox.checked?"auto":"off",post_override:post.checkbox.checked?"auto":"off"}:{})
    })});
   }
   feedback.textContent="Evento atualizado.";
   const [year,month]=date.value.split("-").map(Number);calendarMonth=new Date(year,month-1,1);
   await loadCalendar();
  }catch(err){feedback.textContent="Erro ao guardar: "+err.message;}finally{save.disabled=false;}
 };
 remove.onclick=async()=>{
  if(!confirm("Remover "+(CALENDAR_EVENT_NAMES[ev.kind]||"evento")+" de "+ev.event_date+"?"))return;
  remove.disabled=true;
  try{
   const url=ev.kind==="match"?matchBase()+"/matches/"+encodeURIComponent(ev.id):calendarEventEndpoint()+"/"+encodeURIComponent(ev.id);
   await request(url,{method:"DELETE"});feedback.textContent="Evento removido.";await loadCalendar();
  }catch(err){feedback.textContent="Erro ao remover: "+err.message;}finally{remove.disabled=false;}
 };
 card.append(controls);return card;
}
async function saveMatchPeri(matchId,pre,post){
 for(const [phase,enabled] of [["pre",pre],["post",post]]){
  await request(matchBase()+"/match-peri/"+encodeURIComponent(matchId)+"/"+phase,{method:"PUT",body:JSON.stringify({state:enabled?"auto":"off"})});
 }
}
function syncCalendarEventForm(){
 const kind=$("calendar-new-kind").value,game=kind==="match",training=kind==="training";
 $("calendar-supp-options").hidden=kind!=="supplementation";
 $("calendar-new-session").closest("div").hidden=game||kind==="supplementation";
 $("calendar-new-time-wrap").hidden=!game;
 $("calendar-new-title-wrap").hidden=kind!=="travel";
 $("calendar-pre-wrap").hidden=!(game||training);
 $("calendar-post-wrap").hidden=!(game||training);
 $("calendar-pre-label").textContent=game?"Intra-jogo":"Pré-treino";
 $("calendar-post-label").textContent=game?"Pós-jogo":"Pós-treino";
}

async function renderCalendarSupplementChoices(){
 if(!model)return;
 const assigned=await request(matchBase()+"/supplements");
 const root=$("calendar-supp-list");root.replaceChildren();
 const date=$("calendar-new-date").value,day=assigned.overrides?.[date]?.add||[];
 const options=assigned.plan||[];
 for(const [index,item] of options.entries()){
  const label=document.createElement("label");label.className="calendar-peri-check";
  const cb=document.createElement("input");cb.type="checkbox";cb.dataset.suppIndex=String(index);
  cb.checked=day.some(x=>item.library_id?x.library_id===item.library_id:x.name===item.name);
  const title=document.createElement("span");title.textContent=item.name+" · "+item.dose;
  label.append(cb,title);root.append(label);
 }
 if(!options.length)root.textContent="Ainda não há suplementos atribuídos a este jogador. Associa-os primeiro no separador Suplementação.";
}
async function saveCalendarSupplements(date){
 const selected=Array.from($("calendar-supp-list").querySelectorAll("input:checked")).map(x=>Number(x.dataset.suppIndex));
 const data=await request(matchBase()+"/supplements"),current=data.overrides[date]||{add:[],remove:[]};
 const assigned=data.plan||[];
 const isAssigned=x=>assigned.some(p=>p.library_id?x.library_id===p.library_id:x.name===p.name);
 const preserved=(current.add||[]).filter(x=>!isAssigned(x));
 const additions=selected.map(i=>assigned[i]).filter(Boolean).map(item=>({
  library_id:item.library_id||"",name:item.name,dose:item.dose,moment:item.moment,rule:"daily",timing_text:item.timing_text||"",note:item.note||""
 }));
 data.overrides[date]={...current,add:preserved.concat(additions)};
 await request(matchBase()+"/supplements",{method:"PUT",body:JSON.stringify(data)});
}
$("calendar-new-date").addEventListener("change",()=>renderCalendarSupplementChoices().catch(e=>status(e.message,"warn")));
$("calendar-new-kind").addEventListener("change",()=>{syncCalendarEventForm();if($("calendar-new-kind").value==="supplementation")renderCalendarSupplementChoices().catch(e=>status(e.message,"warn"));});
$("calendar-new-date").value=isoDay(new Date());
syncCalendarEventForm();
$("calendar-event-form").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!model)return;
 const kind=$("calendar-new-kind").value,date=$("calendar-new-date").value;
 const button=$("calendar-add-event"),feedback=$("calendar-event-feedback");button.disabled=true;
 try{
  if(kind==="supplementation"){
   await saveCalendarSupplements(date);
  }else if(kind==="match"){
   const response=await request(matchBase()+"/matches",{method:"POST",
     body:JSON.stringify({match_date:date,match_time:$("calendar-new-time").value||null})});
   await saveMatchPeri(response.match.id,$("calendar-new-pre").checked,$("calendar-new-post").checked);
  }else{
   await request(calendarEventEndpoint(),{method:"POST",body:JSON.stringify({
    event_date:date,kind,session:$("calendar-new-session").value,
    title:kind==="training"?"Treino":$("calendar-new-title").value.trim()||"Viagem",
    ...(kind==="training"?{pre_override:$("calendar-new-pre").checked?"auto":"off",
      post_override:$("calendar-new-post").checked?"auto":"off"}:{})
   })});
  }
  feedback.textContent=kind==="supplementation"?"Suplementação do dia atualizada.":"Evento adicionado ao calendário.";
  const [year,month]=date.split("-").map(Number);calendarMonth=new Date(year,month-1,1);
  await loadCalendar();
 }catch(err){feedback.textContent="Não foi possível adicionar: "+err.message;}
 finally{button.disabled=false;}
});

function periEndpoint(){return "/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/peri-imports";}
function periMessage(value){$("peri-feedback").textContent=value;}
let periExpandedKind=null;
async function loadPeriImports(){
 if(!model)return;
 const result=await request(periEndpoint());
 $("peri-current").replaceChildren();
 const list=$("peri-list");list.replaceChildren();
 for(const [kind,title] of [["training","Peri-treino"],["match","Peri-jogo"]]){
  const all=(result.imports||[]).filter(d=>d.kind===kind);
  const drafts=all.filter(d=>d.status==="draft"),published=all.filter(d=>d.status==="published");
  const chosen=drafts[0]||published[0];
  const active=result.active?.[kind]?.options;
  const section=document.createElement("details");section.className="peri-plan-section";section.dataset.periKind=kind;section.open=periExpandedKind===kind;
  section.addEventListener("toggle",()=>{if(section.open)periExpandedKind=kind;else if(periExpandedKind===kind)periExpandedKind=null;});
  const summary=document.createElement("summary");summary.className="peri-summary";const headline=document.createElement("strong");headline.textContent=title;const state=document.createElement("span");state.className="peri-state";const hasPending=drafts.some(d=>!periUnchangedCopies.has(d.id));state.textContent=hasPending?"Em revisão":active?"Publicado":drafts.length?"Rascunho":"Sem plano";state.classList.toggle("is-published",!hasPending&&Boolean(active));const meta=document.createElement("span");meta.className="peri-summary-text";meta.append(headline,state);summary.append(meta);section.append(summary);
  const controls=document.createElement("div");controls.className="event-admin-row peri-plan-actions";const headRow=document.createElement("div");headRow.className="peri-plan-header";section.append(headRow);headRow.append(controls);
  
  if(chosen){
   const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";
   edit.onclick=async()=>{
    try{
     const data=chosen.status==="draft"
      ?await request(periEndpoint()+"/"+encodeURIComponent(chosen.id))
      :await request(periEndpoint()+"/"+encodeURIComponent(chosen.id)+"/copy",{method:"POST",body:JSON.stringify({})});
     if(chosen.status!=="draft")periUnchangedCopies.add(data.draft.id);
     periExpandedKind=kind;await loadPeriImports();renderPeriDraft(data.draft,true);periMessage("");
    }catch(e){periMessage("Erro ao editar: "+e.message);}
   };
   controls.append(edit);
  }
  if(drafts.length&&!drafts.every(d=>periUnchangedCopies.has(d.id))){const publishState=document.createElement("span");publishState.className="peri-pending-label";publishState.textContent="Alterações por publicar";controls.append(publishState);}
  const groups=active||{};
  for(const [phase,phaseLabel] of [["pre",kind==="match"?"Intra-jogo":"Pré-treino"],["post",kind==="match"?"Pós-jogo":"Pós-treino"]]){
   const options=groups[phase]||[];if(!options.length)continue;
   const heading=document.createElement("h4");heading.textContent=phaseLabel;section.append(heading);
   for(const [i,option] of options.entries()){
    const choice=document.createElement("div");choice.className="peri-option-consult peri-option-flat";
    const top=document.createElement("div");top.className="peri-option-heading";
    const name=document.createElement("strong");name.textContent=phaseLabel+" · "+(option.title||"Opção "+(option.number||i+1));
    const totals=document.createElement("span");totals.className="peri-macros";for(const [key,prefix,unit,kindClass] of [["kcal",""," kcal","energy"],["protein_g","P "," g","protein"],["carbs_g","HC "," g","carbs"],["fat_g","G "," g","fat"]]){if(option.totals?.[key]==null)continue;const part=document.createElement("span");part.className="peri-macro-"+kindClass;const raw=String(option.totals[key]).replace(",",".");const num=Number(raw);part.textContent=prefix+(key==="kcal"&&Number.isFinite(num)?String(Math.round(num)):String(option.totals[key]).replace(".",","))+unit;totals.append(part);}
    top.append(name,totals);choice.append(top);
    for(const item of option.items||[]){const line=document.createElement("p");line.textContent=item.kind==="food"?[item.quantity,item.name].filter(Boolean).join(" · "):(item.text||"");choice.append(line);}
    section.append(choice);
   }
  }
  
  list.append(section);
 }
 const history=document.createElement("details");history.className="peri-history";
 const published=(result.imports||[]).filter(d=>d.status==="published");
 const title=document.createElement("summary");title.textContent="Histórico de publicações ("+published.length+")";history.append(title);
 for(const draft of published){
  const row=document.createElement("div");row.className="event-admin-row";
  const label=document.createElement("span");label.textContent=draft.kind==="training"?"Peri-treino":"Peri-jogo";
  const button=document.createElement("button");button.type="button";button.textContent="Ver versão";button.onclick=async()=>{try{const data=await request(periEndpoint()+"/"+encodeURIComponent(draft.id));renderPeriDraft(data.draft);}catch(e){periMessage(e.message);}};
  row.append(label,button);history.append(row);
 }
 list.append(history);
}
function renderPeriDraft(draft,editing=false){
 const root=$("peri-review");root.replaceChildren();
 const heading=document.createElement("h3");heading.textContent=draft.kind==="training"?"Peri-treino":"Peri-jogo";root.append(heading);
 
 draft.extracted.groups.forEach((group,gi)=>{
  const title=document.createElement("h3");title.textContent=group.heading;root.append(title);
  group.options.forEach((option,oi)=>{
   const card=document.createElement("section");card.className="peri-editor-option";
   const title=document.createElement("strong");title.textContent="Opção "+option.number;card.append(title);
   if(!editing){const info=document.createElement("p");info.textContent="kcal "+(Number.isFinite(Number(String(option.totals?.kcal??"").replace(",",".")))?Math.round(Number(String(option.totals?.kcal).replace(",","."))):"—")+" · P "+(option.totals?.protein_g??"—")+" g · HC "+(option.totals?.carbs_g??"—")+" g · G "+(option.totals?.fat_g??"—")+" g";card.append(info);const name=document.createElement("p");name.textContent=option.title||"";card.append(name);(option.lines||[]).forEach((line,i)=>{if(!line.trim())return;const item=document.createElement("p");const labels={pre_warmup:"Pré-aquecimento",post_warmup:"Pós-aquecimento",first_half:"Durante a 1.ª parte",half_time:"Intervalo",second_half:"Durante a 2.ª parte",throughout:"Ao longo do jogo"};item.textContent=(labels[option.timings?.[i]]?labels[option.timings[i]]+" — ":"")+line;card.append(item);});root.append(card);return;}
   const form=document.createElement("div");form.className="peri-option-grid";
   const fields={};
   for(const [key,label] of [["kcal","kcal"],["protein_g","P"],["carbs_g","HC"],["fat_g","G"]]){
    const wrapper=document.createElement("label");wrapper.textContent=label;const input=document.createElement("input");input.type="text";input.inputMode="decimal";input.value=option.totals?.[key]??"";fields[key]=input;wrapper.append(input);form.append(wrapper);
   }
   const bodyGrid=document.createElement("div");bodyGrid.className="peri-editor-body";card.append(bodyGrid);
   const leftColumn=document.createElement("div");leftColumn.className="peri-editor-left";bodyGrid.append(leftColumn,form);
   const dishName=document.createElement("label");dishName.textContent="Título da opção";const titleInput=document.createElement("input");titleInput.value=option.title||"";dishName.append(titleInput);leftColumn.append(dishName);
   const foodsLabel=document.createElement("label");foodsLabel.textContent="Alimentos e instruções (uma linha por item)";
   const intra=draft.kind==="match"&&group.meals.includes("pre");
   const timingRows=[];
   const timingOptions=[["","Sem timing específico"],["pre_warmup","Pré-aquecimento"],["post_warmup","Pós-aquecimento"],["first_half","Durante a 1.ª parte"],["half_time","Intervalo"],["second_half","Durante a 2.ª parte"],["throughout","Ao longo do jogo"]];
   const textarea=document.createElement("textarea");textarea.rows=5;textarea.value=(option.lines||[]).join("\n");
   if(intra){
    foodsLabel.textContent="Timing e alimentos";
    const rows=document.createElement("div");rows.className="peri-timing-rows";
    const addRow=(line="",timing="")=>{
     const wrap=document.createElement("div");wrap.style.cssText="display:grid;grid-template-columns:minmax(155px,1fr) minmax(200px,2fr) auto;gap:10px;align-items:center;margin:10px 0";
     const select=document.createElement("select");select.setAttribute("aria-label","Timing");
     for(const [value,label] of timingOptions){const opt=document.createElement("option");opt.value=value;opt.textContent=label;select.append(opt);}
     select.value=timing;
     const input=document.createElement("input");input.value=line;input.placeholder="Alimento, quantidade e instruções";input.setAttribute("aria-label","Alimento e instruções");
     const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";remove.disabled=draft.status!=="draft";
     const row={wrap,select,input};timingRows.push(row);
     remove.onclick=()=>{wrap.remove();timingRows.splice(timingRows.indexOf(row),1);};
     wrap.append(select,input,remove);rows.append(wrap);
    };
    const lines=option.lines||[];
    lines.forEach((line,index)=>addRow(line,option.timings?.[index]||""));
    if(!lines.length)addRow();
    foodsLabel.append(rows);
    const add=document.createElement("button");add.type="button";add.textContent="+ Adicionar alimento";add.disabled=draft.status!=="draft";add.onclick=()=>addRow();foodsLabel.append(add);
   }else foodsLabel.append(textarea);
   leftColumn.append(foodsLabel);
   /* Validation is confirmed explicitly by the save action, without a redundant checkbox. */
   const save=document.createElement("button");save.type="button";save.textContent="Validar";save.className="peri-option-validate";save.disabled=draft.status!=="draft";
   save.onclick=async()=>{
    save.disabled=true;
    const payload={group_index:gi,option_index:oi,option:{
      totals:Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value.trim()])),
      title:titleInput.value.trim(),lines:intra?timingRows.map(r=>r.input.value).filter(x=>x.trim()):textarea.value.split(/\r?\n/),...(intra?{timings:timingRows.filter(r=>r.input.value.trim()).map(r=>r.select.value)}:{}),reviewed:true
    }};
    try{
      await request(periEndpoint()+"/"+encodeURIComponent(draft.id)+"/option",{method:"PUT",body:JSON.stringify(payload)});
      periUnchangedCopies.delete(draft.id);
      periMessage("");
    }catch(e){periMessage(e.message);}finally{save.disabled=draft.status!=="draft";}
   };const actions=document.createElement("div");actions.className="peri-editor-footer";actions.append(save);card.append(actions);root.append(card);
  });
 });
 if(editing&&draft.status==="draft"){
  const pub=document.createElement("button");pub.type="button";pub.textContent="Publicar";pub.className="peri-publish-action is-pending";
  pub.onclick=async()=>{
    if(!confirm("Confirmas a publicação? As refeições serão aplicadas aos eventos futuros, respeitando as remoções manuais."))return;
    pub.disabled=true;try{
      await request(periEndpoint()+"/"+encodeURIComponent(draft.id)+"/publish",{method:"POST",body:JSON.stringify({confirmation:"PUBLICAR",athlete_id:$("athlete").value})});
      periMessage("");
      periUnchangedCopies.delete(draft.id);
      await loadPeriImports();root.replaceChildren();
    }catch(e){periMessage("Publicação bloqueada: "+e.message);}finally{pub.disabled=false;}
  };const targetSection=[...document.querySelectorAll(".peri-plan-section")].find(el=>el.dataset.periKind===draft.kind);const actionBar=targetSection?.querySelector(".peri-plan-actions");if(actionBar){actionBar.append(pub);}else{const fallback=document.createElement("div");fallback.className="peri-publication-bar";fallback.append(pub);root.prepend(fallback);}
 }
}
$("peri-import").addEventListener("click",async()=>{
 if(!model)return;
 const file=$("peri-pdf").files?.[0];
 if(!file||file.size>3*1024*1024||!file.name.toLowerCase().endsWith(".pdf")){periMessage("Seleciona um PDF até 3 MB.");return;}
 const button=$("peri-import");button.disabled=true;periMessage("A interpretar o PDF...");
 try{
  const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const result=await request(periEndpoint(),{method:"POST",body:JSON.stringify({kind:$("peri-kind").value,filename:file.name,pdf_base64:btoa(binary)})});
  periMessage("Rascunho importado. Confirma os alimentos e os valores nutricionais antes de publicar.");
  await loadPeriImports();renderPeriDraft(result.draft,true);
 }catch(e){periMessage("Erro ao importar: "+e.message);}finally{button.disabled=false;}
});

let supplementDraft={plan:[],overrides:{}};
let publishedSupplementSnapshot="[]";
let supplementMatches=[];
function supplementPublishedKey(){return JSON.stringify(supplementDraft.plan);}
function supplementPending(){return supplementPublishedKey()!==publishedSupplementSnapshot;}
async function loadSupplementEditor(){
 supplementDraft=await request(matchBase()+"/supplements");publishedSupplementSnapshot=supplementPublishedKey();await loadSupplementLibrary();
 const today=new Date();const first=new Date(today.getFullYear(),today.getMonth(),1);const last=new Date(first);last.setDate(last.getDate()+55);
 const calendar=await request(matchBase()+"/calendar?start="+isoDay(first)+"&end="+isoDay(last));supplementMatches=calendar.matches||[];
 renderSupplementEditor();
}
function renderSupplementMatchExclusions(){
 const host=$("supp-match-exclusions");if(!host)return;host.replaceChildren();
 const current=supplementDraft.match_exclusions||{};
 const eligible=supplementDraft.plan.filter(item=>(item.prescriptions||[item]).some(p=>["match","md-1","md+1"].includes(p.rule)));
 if(!eligible.length||!supplementMatches.length){host.textContent="Sem protocolos associados a jogos para suspender.";return;}
 for(const match of supplementMatches){
  const wrap=document.createElement("details");wrap.className="supp-match-exclusion";
  const title=document.createElement("summary");title.textContent="Jogo · "+match.match_date;wrap.append(title);
  const group=document.createElement("div");group.className="supp-match-exclusion-options";
  for(const item of eligible){
   const key=item.library_id||item.name;const label=document.createElement("label");const check=document.createElement("input");
   check.type="checkbox";check.checked=(current[match.id]||[]).includes(key);
   check.onchange=()=>{const values=new Set((supplementDraft.match_exclusions||{})[match.id]||[]);
    if(check.checked)values.add(key);else values.delete(key);
    supplementDraft.match_exclusions ||= {};
    if(values.size)supplementDraft.match_exclusions[match.id]=[...values];else delete supplementDraft.match_exclusions[match.id];
    $("supp-feedback").textContent="Exceções por publicar.";
   };
   label.append(check,document.createTextNode(" Suspender "+item.name+" neste jogo (MD-1, MD e MD+1)"));group.append(label);
  }
  wrap.append(group);host.append(wrap);
 }
}
function renderSupplementEditor(){
 const list=$("supp-base-list");list.replaceChildren();
 renderSupplementMatchExclusions();
 const labels={daily:"Diária",training:"Treino",match:"MD","md-1":"MD-1","md+1":"MD+1",breakfast:"Pequeno-almoço",lunch:"Almoço",lunch_or_dinner:"Almoço ou jantar",dinner:"Jantar",snack:"Lanche",supper:"Ceia"};
 for(const [i,item] of supplementDraft.plan.entries()){
  const row=document.createElement("div");row.className="event-admin-row supp-associated-row";row.classList.add(JSON.stringify(item)===(JSON.parse(publishedSupplementSnapshot)[i]===undefined?"":JSON.stringify(JSON.parse(publishedSupplementSnapshot)[i]))?"supp-published":"supp-pending");
  const label=document.createElement("span");
  
  const rules=item.prescriptions?.length?item.prescriptions:[item];
  label.textContent=item.name+" · "+rules.map(p=>[p.dose,p.timing_text||labels[p.moment]||p.moment||"Sem associação",labels[p.rule]||p.rule].filter(Boolean).join(" · ")).join("  |  ");
  const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";
  edit.onclick=()=>{
   const form=document.createElement("div");form.className="supp-inline-edit";
   const fields=[["name","Suplemento"],["dose","Dose"],["timing_text","Momento ou condição"],["note","Instruções"]];
   const inputs={};
   for(const [key,title] of fields){const wrap=document.createElement("label");wrap.textContent=title;const input=document.createElement("input");input.value=item[key]||"";inputs[key]=input;wrap.append(input);form.append(wrap);}
   for(const [key,title,options] of [["moment","Associação",[["","Sem associação"],["breakfast","Pequeno-almoço"],["lunch","Almoço"],["lunch_or_dinner","Almoço ou jantar"],["dinner","Jantar"],["training","Treino"],["match","Jogo"]]],["rule","Frequência",[["daily","Diária"],["training","Treino"],["match","MD"],["md-1","MD-1"],["md+1","MD+1"]]]]){
    const wrap=document.createElement("label");wrap.textContent=title;const select=document.createElement("select");for(const [value,text] of options){const opt=document.createElement("option");opt.value=value;opt.textContent=text;select.append(opt);}select.value=item[key]||"";inputs[key]=select;wrap.append(select);form.append(wrap);
   }
   const prescriptions=document.createElement("div");prescriptions.className="supp-prescription-rules";
   const rows=[];
   function addRule(source){
    const entry=document.createElement("div");entry.className="supp-prescription-rule";
    const fields={};
    for(const [key,title,options] of [["rule","Frequência",[["daily","Diária"],["training","Treino"],["md-1","MD-1"],["match","MD"],["md+1","MD+1"]]],["dose","Dose",null],["moment","Associar a",[["","Sem associação"],["breakfast","Pequeno-almoço"],["lunch","Almoço"],["lunch_or_dinner","Almoço ou jantar"],["snack","Lanche"],["dinner","Jantar"],["supper","Ceia"],["training","Treino"],["match","Jogo"]]],["timing_text","Momento da toma",null]]){
     const wrap=document.createElement("label");wrap.textContent=title;
     const input=options?document.createElement("select"):document.createElement("input");
     if(options)for(const [v,t] of options){const opt=document.createElement("option");opt.value=v;opt.textContent=t;input.append(opt);}
     input.value=source[key]||"";fields[key]=input;wrap.append(input);entry.append(wrap);
    }
    const remove=document.createElement("button");remove.type="button";remove.textContent="Remover toma";remove.onclick=()=>{entry.remove();const i=rows.indexOf(fields);if(i>=0)rows.splice(i,1);};entry.append(remove);rows.push(fields);prescriptions.append(entry);
   }
   for(const prescription of item.prescriptions||[{rule:item.rule,dose:item.dose,moment:item.moment,timing_text:item.timing_text}])addRule(prescription);
   const add=document.createElement("button");add.type="button";add.textContent="+ Adicionar outra prescrição";add.onclick=()=>addRule({rule:"daily",dose:item.dose,moment:"",timing_text:""});
   form.append(prescriptions,add);
   const save=document.createElement("button");save.textContent="Aplicar alterações";save.type="button";save.onclick=()=>{
    if(!inputs.name.value.trim()||!inputs.dose.value.trim())return;
    if(!rows.length||rows.some(r=>!r.dose.value.trim()))return;
    for(const key of Object.keys(inputs))item[key]=inputs[key].value.trim();
    item.prescriptions=rows.map(r=>({rule:r.rule.value,dose:r.dose.value.trim(),moment:r.moment.value,timing_text:r.timing_text.value.trim(),note:item.note}));
    $("supp-feedback").textContent="Alterações por publicar.";renderSupplementEditor();
   };
   const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancelar";cancel.onclick=()=>renderSupplementEditor();
   form.append(save,cancel);row.replaceChildren(form);
  };
  const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";
  remove.onclick=()=>{supplementDraft.plan.splice(i,1);$("supp-feedback").textContent="Alterações por publicar.";renderSupplementEditor();};
  const controls=document.createElement("div");controls.className="supp-associated-actions";controls.append(edit,remove);
  row.append(label,controls);list.append(row);
 }
}
$("supp-add").onclick=()=>{
 const name=$("supp-name").value.trim(),dose=$("supp-dose").value.trim();
 if(!name||!dose)return $("supp-feedback").textContent="Preenche suplemento e dose.";
 supplementDraft.plan.push({name,dose,moment:$("supp-moment").value,rule:$("supp-rule").value,note:""});
 $("supp-name").value="";$("supp-dose").value="";$("supp-feedback").textContent="Alterações por publicar.";renderSupplementEditor();
};
$("supp-save").onclick=async()=>{
 try{supplementDraft=await request(matchBase()+"/supplements",{method:"PUT",body:JSON.stringify(supplementDraft)});publishedSupplementSnapshot=supplementPublishedKey();renderSupplementEditor();$("supp-feedback").textContent="Suplementação publicada para o jogador.";}
 catch(e){$("supp-feedback").textContent="Não foi possível guardar: "+e.message;}
};

let libraryPrescriptionRows=[];
function renderLibraryPrescriptionRules(values){
 const host=$("supp-lib-prescriptions");host.replaceChildren();libraryPrescriptionRows=[];
 const add=(source={})=>{
  const entry=document.createElement("div");entry.className="supp-prescription-rule";const fields={};
  for(const [key,title,options] of [["rule","Frequência",[["daily","Diária"],["training","Treino"],["md-1","MD-1"],["match","MD"],["md+1","MD+1"]]],["dose","Dose",null],["moment","Associar a",[["","Sem associação"],["breakfast","Pequeno-almoço"],["lunch","Almoço"],["lunch_or_dinner","Almoço ou jantar"],["snack","Lanche"],["dinner","Jantar"],["supper","Ceia"],["training","Treino"],["match","Jogo"]]],["timing_text","Momento da toma",null]]){
   const wrap=document.createElement("label");wrap.textContent=title;const input=options?document.createElement("select"):document.createElement("input");
   if(options)for(const [value,label] of options){const opt=document.createElement("option");opt.value=value;opt.textContent=label;input.append(opt);}
   input.value=source[key]||"";fields[key]=input;wrap.append(input);entry.append(wrap);
  }
  const remove=document.createElement("button");remove.type="button";remove.textContent="Remover toma";remove.onclick=()=>{entry.remove();libraryPrescriptionRows=libraryPrescriptionRows.filter(x=>x!==fields);};entry.append(remove);libraryPrescriptionRows.push(fields);host.append(entry);
 };
 (values&&values.length?values:[{rule:$("supp-lib-rule").value,dose:$("supp-lib-dose").value,moment:$("supp-lib-moment").value,timing_text:$("supp-lib-timing").value}]).forEach(add);
 $("supp-lib-add-rule").onclick=()=>add({rule:"daily",dose:"",moment:"",timing_text:""});
}
let supplementLibrary=[];
function filterSupplementLists(){
 const q=$("supp-assign-search").value.trim().toLocaleLowerCase("pt-PT");
 const lq=$("supp-library-search").value.trim().toLocaleLowerCase("pt-PT");
 const select=$("supp-lib-select"),previous=select.value,list=$("supp-lib-list"),suggestions=$("supp-search-options");suggestions.replaceChildren();
 select.replaceChildren();list.replaceChildren();
 const empty=document.createElement("option");empty.value="";empty.textContent="Selecionar...";select.append(empty);
 for(const item of supplementLibrary){
  const hay=[item.name,item.dose,item.note,item.timing_text].join(" ").toLocaleLowerCase("pt-PT");
  if(hay.includes(q)){const opt=document.createElement("option");opt.value=item.id;opt.textContent=item.name;select.append(opt);}const suggestion=document.createElement("option");suggestion.value=item.name;suggestions.append(suggestion);
  if(!lq||!hay.includes(lq))continue;
  const row=document.createElement("div");row.className="event-admin-row";
  if(item.has_image){const img=document.createElement("img");img.src="/api/v2/supplement-library/"+item.id+"/image";img.alt=item.name;img.style.cssText="height:65px;width:55px;object-fit:contain";row.append(img);}
  const label=document.createElement("span");label.className="supp-library-product";const name=document.createElement("strong");name.textContent=item.name;label.append(name);row.append(label);
  const actions=document.createElement("div");actions.className="supp-library-actions";const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.onclick=()=>{
   $("supp-lib-name").value=item.name;$("supp-lib-dose").value=item.dose;$("supp-lib-moment").value=item.moment;
   $("supp-lib-rule").value=item.rule;$("supp-lib-timing").value=item.timing_text||"";$("supp-lib-note").value=item.note||"";
   $("supp-lib-save").dataset.editId=item.id;
   renderLibraryPrescriptionRules(item.prescriptions);
   const panel=$("supp-library-editor");panel.open=true;panel.querySelector("summary").textContent="Editar suplemento";panel.scrollIntoView({behavior:"smooth",block:"nearest"});
  };actions.append(edit);const remove=document.createElement("button");remove.type="button";remove.textContent="Remover";remove.onclick=async()=>{if(!confirm("Remover este produto da biblioteca? As prescrições já atribuídas aos jogadores não serão alteradas."))return;try{await request("/api/v2/supplement-library/"+encodeURIComponent(item.id),{method:"DELETE"});await loadSupplementLibrary();}catch(e){$("supp-lib-feedback").textContent="Não foi possível remover: "+e.message;}};actions.append(remove);row.append(actions);list.append(row);
 }
 if([...select.options].some(option=>option.value===previous))select.value=previous;
}
$("supp-assign-search").addEventListener("input",()=>{const exact=supplementLibrary.find(x=>x.name.toLocaleLowerCase("pt-PT")===$("supp-assign-search").value.trim().toLocaleLowerCase("pt-PT"));$("supp-lib-select").value=exact?.id||"";});
$("supp-library-search").addEventListener("input",filterSupplementLists);
async function loadSupplementLibrary(){
 const data=await request("/api/v2/supplement-library");supplementLibrary=data.items||[];
 filterSupplementLists();
}
$("supp-lib-save").onclick=async()=>{
 const button=$("supp-lib-save");button.disabled=true;
 try{
  const file=$("supp-lib-image").files?.[0];let imageData;
  if(file){
   if(file.size>250000)throw Error("A imagem deve ter menos de 250 KB.");
   const bytes=new Uint8Array(await file.arrayBuffer());
   let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
   imageData=btoa(binary);
  }
  const payload={id:button.dataset.editId||undefined,name:$("supp-lib-name").value,dose:$("supp-lib-dose").value,
   moment:$("supp-lib-moment").value,rule:$("supp-lib-rule").value,
   timing_text:$("supp-lib-timing").value,note:$("supp-lib-note").value};
  if(!libraryPrescriptionRows.length||libraryPrescriptionRows.some(r=>!r.dose.value.trim()))throw Error("Preenche pelo menos uma toma com dose.");
  payload.prescriptions=libraryPrescriptionRows.map(r=>({rule:r.rule.value,dose:r.dose.value.trim(),moment:r.moment.value,timing_text:r.timing_text.value.trim(),note:payload.note}));
  if(imageData!==undefined)payload.image_data=imageData;
  await request("/api/v2/supplement-library",{method:"POST",body:JSON.stringify(payload)});
  delete button.dataset.editId;$("supp-lib-image").value="";
  $("supp-lib-feedback").textContent="Suplemento guardado na biblioteca.";
  await loadSupplementLibrary();
 }catch(e){$("supp-lib-feedback").textContent=e.message;}finally{button.disabled=false;}
};
$("supp-lib-assign").onclick=()=>{
 const query=$("supp-assign-search").value.trim().toLocaleLowerCase("pt-PT");const item=supplementLibrary.find(x=>x.name.toLocaleLowerCase("pt-PT")===query);
 if(!item){$("supp-feedback").textContent="Seleciona uma sugestão exata da lista.";return;}
 if(!item.prescriptions?.length && /MD-1|MD\+1|MD e|Variável|Conforme descrito|dias sem treino|dias com treino|Fase de carga/i.test([item.timing_text,item.note,item.dose].join(" "))){$("supp-feedback").textContent="Este protocolo exige revisão da regra antes de ser associado ao jogador.";return;}
 supplementDraft.plan.push({library_id:item.id,name:item.name,dose:item.dose,moment:item.moment,rule:item.rule,note:item.note,timing_text:item.timing_text,...(item.prescriptions?.length?{prescriptions:item.prescriptions.map(p=>({...p}))}:{})});
 renderSupplementEditor();$("supp-feedback").textContent="Alterações por publicar. Revê e clica em Publicar suplementação do jogador.";
};

$("supp-transfer-import").onclick=async()=>{
 const file=$("supp-transfer-file").files?.[0],feedback=$("supp-transfer-feedback");
 if(!file||file.size>5*1024*1024){feedback.textContent="Seleciona o JSON exportado da app de testes (até 5 MB).";return;}
 const button=$("supp-transfer-import");button.disabled=true;feedback.textContent="A importar biblioteca…";
 try{
  const payload=JSON.parse(await file.text());
  const result=await request("/api/v2/supplement-library/transfer",{method:"POST",body:JSON.stringify(payload)});
  feedback.textContent=result.imported+" suplementos importados de "+result.total+". Os existentes não foram substituídos.";
  await loadSupplementLibrary();
 }catch(e){feedback.textContent="Não foi possível importar: "+e.message;}
 finally{button.disabled=false;}
};
let supplementBulkPackage="";
$("supp-bulk-preview").onclick=async()=>{
 const file=$("supp-bulk-file").files?.[0],feedback=$("supp-bulk-results");
 if(!file||file.size>5*1024*1024){feedback.textContent="Seleciona o ZIP preparado até 5 MB.";return;}
 $("supp-bulk-confirm").hidden=true;supplementBulkPackage="";
 try{
  const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const encoded=btoa(binary);
  const result=await request("/api/v2/supplement-library/bulk-preview",{method:"POST",body:JSON.stringify({package_base64:encoded})});
  supplementBulkPackage=encoded;
  feedback.textContent=result.total+" registos · "+result.existing+" já existentes · "+result.to_add+" novos · "+result.review+" protocolos a rever após importação.";
  $("supp-bulk-confirm").hidden=result.to_add===0;
 }catch(e){feedback.textContent="Não foi possível analisar o pacote: "+e.message;}
};
$("supp-bulk-confirm").onclick=async()=>{
 if(!supplementBulkPackage||!confirm("Confirmas a importação dos produtos para a biblioteca? Não são atribuídos automaticamente a jogadores."))return;
 const button=$("supp-bulk-confirm");button.disabled=true;
 try{
  const result=await request("/api/v2/supplement-library/bulk-import",{method:"POST",body:JSON.stringify({package_base64:supplementBulkPackage,confirmation:"IMPORTAR"})});
  $("supp-bulk-results").textContent=result.saved+" produtos adicionados. Revê os protocolos antes de os associares a jogadores.";
  button.hidden=true;await loadSupplementLibrary();
 }catch(e){$("supp-bulk-results").textContent="Erro ao importar: "+e.message;}finally{button.disabled=false;}
};

if($("supp-lib-prescriptions")){renderLibraryPrescriptionRules([]);$("supp-library-editor").addEventListener("toggle",()=>{if($("supp-library-editor").open&&!$("supp-lib-save").dataset.editId)renderLibraryPrescriptionRules([]);});}

/* Historical Excel import: read-only preview, deliberate bulk confirmation. */
let excelHistoryEncoded="",excelHistoryAthlete="";
async function readAssessmentExcel(file){
 if(!file||!file.name.toLowerCase().endsWith(".xlsx")||file.size>5*1024*1024)throw Error("Seleciona um ficheiro .xlsx até 5 MB.");
 const buffer=new Uint8Array(await file.arrayBuffer());let binary="";
 for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));
 return btoa(binary);
}
function clearExcelPreview(){
 excelHistoryEncoded="";excelHistoryAthlete="";
 $("assessment-excel-confirm").hidden=true;
 $("assessment-excel-results").replaceChildren();
}
$("assessment-excel-preview").onclick=async()=>{
 const msg=$("assessment-excel-feedback"),button=$("assessment-excel-preview");
 clearExcelPreview();msg.textContent="";
 const athleteId=$("athlete").value;
 if(!athleteId){msg.textContent="Seleciona um jogador.";return;}
 button.disabled=true;
 try{
  const encoded=await readAssessmentExcel($("assessment-excel").files?.[0]);
  const result=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments",{method:"POST",body:JSON.stringify({action:"excel_preview",excel_base64:encoded})});
  const rows=result.assessments||[];
  const pending=rows.filter(r=>!r.existing&&Object.keys(r.measurements||{}).length);
  const wrapper=$("assessment-excel-results");wrapper.replaceChildren();
  const intro=document.createElement("p");intro.textContent=rows.length+" avaliações encontradas · "+pending.length+" novas · "+(rows.length-pending.length)+" já existentes ou sem medições.";wrapper.append(intro);
  const table=document.createElement("table");table.className="assessment-excel-table";
  const header=document.createElement("tr");for(const col of ["Data","Nome na folha","Medições","Estado / avisos"]){const th=document.createElement("th");th.textContent=col;header.append(th);}table.append(header);
  for(const r of rows){
   const tr=document.createElement("tr");const values=[r.assessed_on,r.name,String(Object.keys(r.measurements||{}).length),[r.existing?"Data já existente (será ignorada)": "",...(r.warnings||[])].filter(Boolean).join(" · ")||"Pronta para importar"];
   for(const value of values){const td=document.createElement("td");td.textContent=value;tr.append(td);}table.append(tr);
  }
  wrapper.append(table);excelHistoryEncoded=encoded;excelHistoryAthlete=athleteId;
  $("assessment-excel-confirm").hidden=!pending.length;
  msg.textContent="Confirma as datas e o jogador antes de importar. Os avisos não são corrigidos automaticamente.";
 }catch(e){msg.textContent="Não foi possível analisar o histórico: "+e.message;}
 finally{button.disabled=false;}
};
$("assessment-excel-confirm").onclick=async()=>{
 const msg=$("assessment-excel-feedback"),button=$("assessment-excel-confirm");
 const athleteId=$("athlete").value;
 if(!excelHistoryEncoded||athleteId!==excelHistoryAthlete){msg.textContent="Seleciona o jogador e pré-visualiza novamente o ficheiro.";return;}
 if(!window.confirm("Importar o histórico para este jogador e publicá-lo na App? As avaliações já existentes serão preservadas."))return;
 button.disabled=true;
 try{
  const result=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments",{method:"POST",body:JSON.stringify({action:"excel_import",excel_base64:excelHistoryEncoded,confirmation:"IMPORTAR_HISTORICO"})});
  clearExcelPreview();msg.textContent=result.imported+" avaliações importadas e publicadas. "+result.skipped+" ignoradas.";await loadAssessmentsAdmin();
 }catch(e){msg.textContent="Erro na importação: "+e.message;}finally{button.disabled=false;}
};


$("assessment-excel-fill-preview").onclick=async()=>{
 const msg=$("assessment-excel-feedback"),button=$("assessment-excel-fill-preview"),target=$("assessment-excel-fill-results");
 target.replaceChildren();$("assessment-excel-fill-confirm").hidden=true;
 const athleteId=$("athlete").value;
 if(!athleteId){msg.textContent="Seleciona um jogador.";return;}
 button.disabled=true;
 try{
  const encoded=await readAssessmentExcel($("assessment-excel").files?.[0]);
  const data=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments",{method:"POST",body:JSON.stringify({action:"excel_missing_preview",excel_base64:encoded})});
  const additions=(data.assessments||[]).filter(r=>Object.keys(r.missing||{}).length&&!(r.warnings||[]).length);
  const count=additions.reduce((n,r)=>n+Object.keys(r.missing).length,0);
  const intro=document.createElement("p");intro.textContent=additions.length+" avaliações com campos em falta · "+count+" valores novos identificados.";target.append(intro);
  const displayFields=Object.fromEntries(ASSESSMENT_GROUPS.flatMap(group=>group[2].map(([key,label,unit])=>[key,{label,unit}])));
  for(const row of additions){
   const section=document.createElement("div");section.className="assessment-missing-row";
   const heading=document.createElement("strong");heading.textContent=assessmentPtDate(row.assessed_on)+" · "+Object.keys(row.missing).length+" campos";section.append(heading);
   const list=document.createElement("ul");
   for(const [key,value] of Object.entries(row.missing)){
    const item=document.createElement("li");const field=displayFields[key];
    item.textContent=(field?.label||key)+": "+String(value).replace(".",",")+(field?.unit?" "+field.unit:"");
    list.append(item);
   }
   section.append(list);target.append(section);
  }
  excelHistoryEncoded=encoded;excelHistoryAthlete=athleteId;
  $("assessment-excel-fill-confirm").hidden=!count;
  msg.textContent="Nenhuma medição preenchida será substituída. Confirma a lista antes de avançar.";
 }catch(e){msg.textContent="Erro na comparação: "+e.message;}
 finally{button.disabled=false;}
};
$("assessment-excel-fill-confirm").onclick=async()=>{
 const athleteId=$("athlete").value,msg=$("assessment-excel-feedback"),button=$("assessment-excel-fill-confirm");
 if(!excelHistoryEncoded||athleteId!==excelHistoryAthlete){msg.textContent="Pré-visualiza novamente o ficheiro para este jogador.";return;}
 if(!window.confirm("Adicionar apenas valores em falta às avaliações existentes? Nenhum valor preenchido será substituído."))return;
 button.disabled=true;
 try{
  const result=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments",{method:"POST",body:JSON.stringify({action:"excel_fill_missing",excel_base64:excelHistoryEncoded,confirmation:"PREENCHER_CAMPOS_VAZIOS"})});
  clearExcelPreview();$("assessment-excel-fill-results").replaceChildren();msg.textContent=result.updated+" avaliações atualizadas · "+result.fields_added+" campos preenchidos.";await loadAssessmentsAdmin();
 }catch(e){msg.textContent="Erro ao atualizar: "+e.message;}
 finally{button.disabled=false;}
};
/* Assessment import: values are editable and never published by PDF upload alone. */
const ASSESSMENT_GROUPS=[
 ["geral","Dados gerais",[["height","Altura","m"]]],
 ["resumo","Resumo",[
 ["sum_8","Soma de 8 pregas","mm"],["weight","Peso corporal","kg"],["body_fat","Gordura corporal","%"],["bmi","IMC",""],["muscle_index","Índice de massa muscular",""],
 ["arm_muscle","Músculo do braço","cm"],["thigh_muscle","Músculo da coxa","cm"],["calf_muscle","Músculo do gémeo","cm"],["sum_perimeters","Soma de perímetros","cm"]]],
 ["pregas","Pregas",[
 ["back","Costas","mm"],["triceps","Trícep","mm"],["biceps","Bícep","mm"],["suprailiac","Suprailíaca","mm"],["supraspinal","Supraespinal","mm"],["abdominal_skin","Abdominal","mm"],["thigh_skin","Coxa","mm"],["calf_skin","Gémeo","mm"]]],
 ["perimetros","Perímetros",[
 ["arm_right_relaxed","Braço direito relaxado","cm"],["arm_right_flexed","Braço direito contraído","cm"],["chest","Peitoral","cm"],["waist","Cintura","cm"],["abdominal_perimeter","Abdominal","cm"],["glute","Glúteo","cm"],["thigh_right","Coxa direita","cm"],["thigh_left","Coxa esquerda","cm"],["calf_right","Gémeo direito","cm"],["calf_left","Gémeo esquerdo","cm"]]]];
const ASSESSMENT_AVERAGES=[["avg_skinfolds","Média da soma de pregas","mm"],["avg_weight","Peso médio","kg"],["avg_body_fat","Gordura corporal média","%"]];
let assessmentPdf="",assessmentUploadedFor="";
let assessmentHistoryAverages={};
let assessmentPriorRecords=[];
function previousAssessmentValue(key, assessedOn, excludeId){
 const earlier=assessmentPriorRecords.filter(r=>r.id!==excludeId&&(!assessedOn||r.assessed_on<assessedOn)).sort((a,b)=>b.assessed_on.localeCompare(a.assessed_on));
 const record=earlier.find(r=>r.measurements?.[key]!==undefined&&r.measurements?.[key]!==null&&String(r.measurements[key]).trim()!=="");
 return record?{value:record.measurements[key],date:record.assessed_on}:null;
}
const assessmentValue=(id)=>$(id)?.value.trim()||"";
function renderAssessmentForm(data={}){
 const box=$("assessment-review-fields");box.replaceChildren();
 const auxiliary=document.createElement("p");auxiliary.className="hint";auxiliary.textContent="Pontos auxiliares do perfil · Braço: "+(model?.athlete?.arm_point??"por preencher")+" cm · Coxa: "+(model?.athlete?.thigh_point??"por preencher")+" cm";box.append(auxiliary);
 for(const [,title,fields] of ASSESSMENT_GROUPS.filter(g=>g[0]!=="geral").concat([["medias","Médias do histórico · cálculo automático",ASSESSMENT_AVERAGES]])){
  const section=document.createElement("section");section.className="assessment-review-group";
  const heading=document.createElement("h3");heading.textContent=title;section.append(heading);
  const grid=document.createElement("div");grid.className="assessment-review-grid";
  for(const [key,label,unit] of fields){
   const row=document.createElement("label");row.textContent=label+(unit?" ("+unit+")":"");
   const input=document.createElement("input");input.type="text";input.inputMode="decimal";input.autocomplete="off";
   if(["avg_skinfolds","avg_weight","avg_body_fat","sum_8","sum_perimeters"].includes(key)){input.readOnly=true;input.setAttribute("aria-readonly","true");}
   input.id="assess-field-"+key;input.value=String((data.measurements||{})[key]??(key.startsWith("avg_")?assessmentHistoryAverages[key]:(data.averages||{})[key])??"");
   row.append(input);
   if(!key.startsWith("avg_")){const previous=previousAssessmentValue(key,data.assessed_on,data.id);const note=document.createElement("small");note.className="tm-assessment-prior-value";note.textContent=previous?"Anterior: "+previous.value+(unit?" "+unit:"")+" · "+previous.date:"Anterior: sem registo";row.append(note);}
   grid.append(row);
  }
  section.append(grid);box.append(section);
 }
 const numberOf=(key)=>{const raw=$("assess-field-"+key)?.value.trim().replace(",",".");return raw!==""&&Number.isFinite(Number(raw))?Number(raw):null;};
 const recompute=()=>{
  for(const [target,parts] of [["sum_8",["back","triceps","biceps","suprailiac","supraspinal","abdominal_skin","thigh_skin","calf_skin"]],["sum_perimeters",["arm_muscle","thigh_muscle","calf_muscle"]]]){
   const values=parts.map(numberOf);const field=$("assess-field-"+target);
   if(values.every(v=>v!==null))field.value=String(Math.round(values.reduce((a,b)=>a+b,0)*1000)/1000).replace(".",",");
  }
 };
 box.addEventListener("input",recompute);
 recompute();
 $("assess-field-height").value=String(data.measurements?.height??"");
 $("assessment-date").value=data.assessed_on||"";
 $("assessment-formula").value=data.formula_note||"";
 $("assessment-review-form").hidden=false;
}
const assessmentPtDate=(iso)=>/^\d{4}-\d{2}-\d{2}$/.test(iso||"")?iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4):iso;
const assessmentMetrics=ASSESSMENT_GROUPS[1][2];
const clinicalNumber=v=>v==null||v===""?null:(Number.isFinite(Number(String(v).replace(",",".")))?Number(String(v).replace(",",".")):null);
const clinicalFormat=v=>v==null?"—":v.toLocaleString("pt-PT",{maximumFractionDigits:2});
// Classification thresholds supplied by the clinical team. Exactly 45 belongs
// to dark green, 55 to yellow and 65 to red. Never infer cutoffs for other metrics.
function tmSkinfoldCategory(value, fieldPosition=""){
 const offset=String(fieldPosition||"").trim().toUpperCase()==="GR"?5:0;
 const n=clinicalNumber(value);
 if(n===null)return null;
 if(n>=65+offset)return {color:"#E17878",label:"Vermelho · ≥ "+(65+offset)+" mm",code:"red"};
 if(n>=55+offset)return {color:"#E7C268",label:"Amarelo · "+(55+offset)+" a < "+(65+offset)+" mm",code:"yellow"};
 if(n>45+offset)return {color:"#A4D9AE",label:"Verde claro · > "+(45+offset)+" a < "+(55+offset)+" mm",code:"light-green"};
 return {color:"#4A9879",label:"Verde escuro · ≤ "+(45+offset)+" mm",code:"dark-green"};
}
const tmClinicalDirections={sum_8:-1,body_fat:-1,muscle_index:1,arm_muscle:1,thigh_muscle:1,calf_muscle:1,sum_perimeters:1};
// These are qualitative trends configured by the clinical team; weight and BMI
// remain contextual. Do not assign a medical judgement to unchanged values.
function tmClinicalTrend(key,current,previous){
 if(current===null||previous===null)return "unknown";
 const direction=tmClinicalDirections[key]||0,change=current-previous;
 if(!direction)return "context";
 if(Math.abs(change)<0.0005)return "steady";
 return change*direction>0?"favourable":"unfavourable";
}
function tmAssessmentSvg(tag,attrs={},value){
 const node=document.createElementNS("http://www.w3.org/2000/svg",tag);
 for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));
 if(value!==undefined)node.textContent=String(value);
 return node;
}
function renderAssessmentDashboard(records){
 const host=$("tm-assessment-dashboard");if(!host)return;
 host.replaceChildren();
 // Visualisation is read-only and uses published values only. The assessment
 // editor continues to calculate sum_8 and sum_perimeters as before.
 const published=records.filter(r=>r.status==="published").slice().sort((a,b)=>a.assessed_on.localeCompare(b.assessed_on));
 if(!published.length){
  const note=document.createElement("p");note.className="hint";note.textContent="Sem avaliações publicadas para apresentar o dashboard.";host.append(note);return;
 }
 const metricGrid=document.createElement("div");metricGrid.className="tm-clinical-metrics";
 for(const [key,label,unit] of assessmentMetrics){
  const values=published.map(r=>clinicalNumber(r.measurements?.[key])).filter(v=>v!==null);
  const current=values.length?values.at(-1):null,previous=values.length>1?values.at(-2):null;
  const trend=tmClinicalTrend(key,current,previous);
  const card=document.createElement("div");card.className="tm-clinical-metric tm-clinical-trend-"+trend;
  if(key==="sum_8"){const category=tmSkinfoldCategory(current,model?.athlete?.field_position);if(category){card.classList.add("tm-skinfold-solid");card.style.setProperty("--tm-skinfold-color",category.color);card.style.borderColor=category.color;card.classList.remove("tm-clinical-trend-"+trend);}}
  const title=document.createElement("small");title.textContent=label;card.append(title);
  if(key==="sum_8"&&current!==null){
   const category=tmSkinfoldCategory(current,model?.athlete?.field_position);title.title=category.label;
  }
  const number=document.createElement("strong");number.textContent=current===null?"—":clinicalFormat(current)+(unit?" "+unit:"");
  const diff=document.createElement("em");
  if(previous===null)diff.textContent=current===null?"Sem medições":"Primeira medição";
  else{
   const delta=current-previous,arrow=Math.abs(delta)<0.0005?"→":delta>0?"↑":"↓";
   diff.textContent=arrow+" "+(delta>0?"+":delta<0?"−":"")+clinicalFormat(Math.abs(delta))+(unit?" "+unit:"")+" vs. anterior";
  }
  if(trend==="favourable")diff.title="Evolução favorável segundo o sentido definido pela equipa";
  if(trend==="unfavourable")diff.title="Evolução desfavorável segundo o sentido definido pela equipa";
  card.append(number,diff);metricGrid.append(card);
 }
 host.append(metricGrid);
 // Detail panels show the history of ONE selected skinfold or perimeter:
 // one horizontal bar per real dated measurement, dates at the left.
 const detailGrid=document.createElement("div");detailGrid.className="tm-assessment-details";
 for(const [group,title]of [["pregas","Pregas cutâneas"],["perimetros","Perímetros musculares e antropométricos"]]){
  const details=document.createElement("details");details.className="tm-assessment-detail";
  const summary=document.createElement("summary");summary.textContent=title;details.append(summary);
  const content=document.createElement("div");content.className="tm-assessment-detail-body";
  const selector=document.createElement("select");selector.setAttribute("aria-label","Escolher "+title.toLocaleLowerCase("pt-PT"));
  const extra=group==="pregas"?[["sum_8","Soma de 8 pregas","mm"]]:[["sum_perimeters","Soma de perímetros","cm"]];
  const fields=[...extra,...ASSESSMENT_GROUPS.find(g=>g[0]===group)[2]];
  fields.forEach(([key,name])=>{const opt=document.createElement("option");opt.value=key;opt.textContent=name;selector.append(opt);});
  // A single skinfold or perimeter is shown initially; sum_8 is also
  // selectable so the agreed category palette can be seen on historic bars.
  selector.value=group==="pregas"?"back":"arm_muscle";
  const graphic=document.createElement("div");graphic.className="tm-assessment-history-bars";
  const drawBars=()=>{
   graphic.replaceChildren();
   const key=selector.value,unit=fields.find(f=>f[0]===key)?.[2]||"";
   const observations=published.map(r=>({date:r.assessed_on,value:clinicalNumber(r.measurements?.[key])})).filter(o=>o.value!==null);
   if(!observations.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem medições publicadas desta variável.";graphic.append(p);return;}
   const max=Math.max(...observations.map(o=>o.value),0.01);
   for(const point of observations){
    const row=document.createElement("div");row.className="tm-assessment-history-bar-row";
    const date=document.createElement("time");date.dateTime=point.date;date.textContent=assessmentPtDate(point.date);
    const track=document.createElement("div");track.className="tm-assessment-bar-track";
    const fill=document.createElement("span");fill.className="tm-assessment-bar-fill";
    fill.style.width=Math.max(0,Math.min(100,point.value/max*100))+"%";
    if(key==="sum_8"){const category=tmSkinfoldCategory(point.value,model?.athlete?.field_position);fill.style.backgroundColor=category.color;fill.title=category.label;}
    track.append(fill);
    const value=document.createElement("strong");value.textContent=clinicalFormat(point.value)+(unit?" "+unit:"");
    row.append(date,track,value);graphic.append(row);
   }
  };
  selector.addEventListener("change",drawBars);drawBars();
  content.append(selector,graphic);details.append(content);detailGrid.append(details);
 }
 host.append(detailGrid);
 // One chart with direct hit testing across the full plot, keyboard-focusable
 // data points, visible data labels and a historical mean reference line.
 const visual=document.createElement("section");visual.className="tm-assessment-visual";
 const header=document.createElement("div");header.className="tm-assessment-visual-head";
 const heading=document.createElement("h3");heading.textContent="Evolução";
 const select=document.createElement("select");select.setAttribute("aria-label","Métrica do gráfico");
 const available=[...assessmentMetrics,...ASSESSMENT_GROUPS[2][2],...ASSESSMENT_GROUPS[3][2]];
 for(const [key,label]of available){const option=document.createElement("option");option.value=key;option.textContent=label;select.append(option);}
 const range=document.createElement("select");range.setAttribute("aria-label","Intervalo de avaliações");for(const [value,label] of [["10","Últimas 10"],["all","Todas"]]){const option=document.createElement("option");option.value=value;option.textContent=label;range.append(option);}
 const controls=document.createElement("div");controls.className="tm-assessment-chart-controls";controls.append(range,select);header.append(heading,controls);visual.append(header);
 const graph=document.createElement("div");graph.className="tm-assessment-plot";visual.append(graph);
 const drawChart=()=>{
  graph.replaceChildren();
  const key=select.value,unit=available.find(m=>m[0]===key)?.[2]||"";
  const pointsAll=published.map(r=>({date:r.assessed_on,value:clinicalNumber(r.measurements?.[key])})).filter(p=>p.value!==null);
  const points=range.value==="10"?pointsAll.slice(-10):pointsAll;
  if(points.length<2){const p=document.createElement("p");p.className="hint";p.textContent="São necessárias duas avaliações publicadas com esta métrica.";graph.append(p);return;}
  const W=760,H=250,left=43,right=23,top=34,bottom=39;
  const vals=points.map(p=>p.value),lowest=Math.min(...vals),highest=Math.max(...vals);
  const spread=Math.max(0.6,highest-lowest),lo=lowest-spread*.21,hi=highest+spread*.21;
  const plotRight=W-right,plotBottom=H-bottom,chartHeight=plotBottom-top;
  const x=i=>left+(plotRight-left)*i/(points.length-1);
  const y=v=>top+(hi-v)/(hi-lo)*chartHeight;
  const coords=points.map((p,i)=>({x:x(i),y:y(p.value)}));
  const svg=tmAssessmentSvg("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Evolução de "+select.selectedOptions[0].textContent,class:"tm-assessment-trend-svg"});
  svg.style.touchAction="pan-y";
  const hit=tmAssessmentSvg("rect",{x:0,y:0,width:W,height:H,fill:"transparent","pointer-events":"all"});svg.append(hit);
  for(let i=0;i<=4;i++){
   const level=lo+(hi-lo)*i/4,cy=y(level);
   svg.append(tmAssessmentSvg("line",{x1:left,y1:cy,x2:plotRight,y2:cy,stroke:"#41434c","stroke-width":"1","stroke-dasharray":"3 5",opacity:".65"}));
   svg.append(tmAssessmentSvg("text",{x:left-8,y:cy+4,"text-anchor":"end",fill:"#9fa6b2","font-size":"11"},clinicalFormat(level)));
  }
  const avg=vals.reduce((total,value)=>total+value,0)/vals.length,meanY=y(avg);
  svg.append(tmAssessmentSvg("line",{x1:left,y1:meanY,x2:plotRight,y2:meanY,stroke:"#a5aab5","stroke-width":"1.2","stroke-dasharray":"6 6",opacity:".84"}));
  svg.append(tmAssessmentSvg("text",{x:plotRight-5,y:Math.max(top+12,meanY-7),"text-anchor":"end",fill:"#c1c6d0","font-size":"11"},"Média "+clinicalFormat(avg)+(unit?" "+unit:"")));
  const line=tmAssessmentSvg("polyline",{points:coords.map(p=>p.x+","+p.y).join(" "),fill:"none",stroke:"#8DAFC6","stroke-width":"2.6","stroke-linecap":"round","stroke-linejoin":"round"});svg.append(line);
  // Show a small number of reference dates to preserve graph readability.
  const labelIndices=Array.from(new Set([0,Math.floor((points.length-1)/2),points.length-1]));
  for(const i of labelIndices)svg.append(tmAssessmentSvg("text",{x:coords[i].x,y:H-13,"text-anchor":i===0?"start":i===points.length-1?"end":"middle",fill:"#a9aeb7","font-size":"11"},assessmentPtDate(points[i].date)));
  const vertical=tmAssessmentSvg("line",{x1:coords.at(-1).x,y1:top,x2:coords.at(-1).x,y2:plotBottom,stroke:"#8fa8b4","stroke-dasharray":"4 5",opacity:"0"});
  const focusPoint=tmAssessmentSvg("circle",{cx:coords.at(-1).x,cy:coords.at(-1).y,r:8,stroke:"#dff4ea","stroke-width":"2",fill:"none",opacity:0});
  svg.append(vertical,focusPoint);
  const tooltip=document.createElement("div");tooltip.className="tm-assessment-hover";tooltip.hidden=true;
  let pinned=false;
  const show=i=>{
   const c=coords[i];vertical.setAttribute("x1",c.x);vertical.setAttribute("x2",c.x);vertical.setAttribute("opacity",".8");
   focusPoint.setAttribute("cx",c.x);focusPoint.setAttribute("cy",c.y);focusPoint.setAttribute("opacity","1");
   tooltip.textContent=assessmentPtDate(points[i].date)+" · "+clinicalFormat(points[i].value)+(unit?" "+unit:"");
   if(key==="sum_8"){const category=tmSkinfoldCategory(points[i].value,model?.athlete?.field_position);tooltip.style.borderColor=category.color;}else tooltip.style.borderColor="#8497a8";
   tooltip.style.left=Math.max(8,Math.min(79,c.x/W*100))+"%";
   tooltip.style.top=Math.max(8,c.y/H*100-7)+"%";tooltip.hidden=false;
  };
  let nearest=points.length-1;
  const lookup=e=>{
   const box=svg.getBoundingClientRect();
   if(!box.width)return;
   const coord=(e.clientX-box.left)/box.width*W;
   nearest=coords.reduce((best,p,i)=>Math.abs(p.x-coord)<Math.abs(coords[best].x-coord)?i:best,0);show(nearest);
  };
  svg.addEventListener("pointermove",lookup);
  svg.addEventListener("pointerleave",()=>{if(!pinned){tooltip.hidden=true;vertical.setAttribute("opacity",0);focusPoint.setAttribute("opacity",0);}});
  svg.addEventListener("click",e=>{lookup(e);pinned=!pinned;});
  const step=Math.max(1,Math.ceil(points.length/14));
  coords.forEach((c,i)=>{
   const color=key==="sum_8"?tmSkinfoldCategory(points[i].value,model?.athlete?.field_position).color:"#9fd8ba";
   const dot=tmAssessmentSvg("circle",{cx:c.x,cy:c.y,r:4.6,fill:"#1a1b20",stroke:color,"stroke-width":"2.5",tabindex:"0",role:"button","aria-label":assessmentPtDate(points[i].date)+": "+clinicalFormat(points[i].value)+" "+unit});
   dot.addEventListener("focus",()=>{nearest=i;show(i);});
   dot.addEventListener("blur",()=>{if(!pinned)tooltip.hidden=true;});
   dot.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pinned=!pinned;show(i);}});
   svg.append(dot);
   if(i%step===0||i===coords.length-1){
    svg.append(tmAssessmentSvg("text",{x:c.x,y:Math.max(17,c.y-13),"text-anchor":"middle",fill:key==="sum_8"?color:"#c8ead6","font-size":"11","font-weight":"600","pointer-events":"none"},clinicalFormat(points[i].value)));
   }
  });
  const stage=document.createElement("div");stage.className="tm-assessment-chart-stage";stage.append(svg,tooltip);graph.append(stage);

 };
 select.addEventListener("change",drawChart);range.addEventListener("change",drawChart);drawChart();host.append(visual);
}
let assessmentRegistryCache=[];
function renderAssessmentRegistry(){
 const host=$("tm-assessment-registry");if(!host)return;host.replaceChildren();
 const text=$("tm-assessment-filter-text").value.toLocaleLowerCase("pt-PT").trim(),athlete=$("tm-assessment-filter-player").value,status=$("tm-assessment-filter-status").value,date=$("tm-assessment-filter-date").value;
 const rows=assessmentRegistryCache.filter(r=>(!athlete||r.athlete_id===athlete)&&(!status||r.status===status)&&(!date||r.assessed_on===date)&&(!text||(r.athlete_name+" "+r.assessed_on).toLocaleLowerCase("pt-PT").includes(text)));
 const table=document.createElement("table");table.className="tm-assessment-table";
 const registryFields=[["weight","Peso","kg"],...ASSESSMENT_GROUPS[2][2],...ASSESSMENT_GROUPS[3][2]];
 const head=document.createElement("tr");for(const label of ["Data","Jogador",...registryFields.map(([,label,unit])=>label+(unit?" ("+unit+")":"")),"Estado","Ações"]){const th=document.createElement("th");th.textContent=label;head.append(th);}const thead=document.createElement("thead");thead.append(head);table.append(thead);
 const body=document.createElement("tbody");for(const r of rows){
  const row=document.createElement("tr");
  for(const v of [assessmentPtDate(r.assessed_on),r.athlete_name,...registryFields.map(([key])=>clinicalFormat(clinicalNumber(r.measurements?.[key]))),r.status==="published"?"Publicada":"Rascunho"]){const td=document.createElement("td");td.textContent=v;row.append(td);}
  const actions=document.createElement("td");actions.className="tm-clinical-row-actions";
  const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.onclick=async()=>{if($("athlete").value!==r.athlete_id){$("athlete").value=r.athlete_id;await loadModel();await window.tmOpenAdminAssessments(r.athlete_id);}assessmentPdf="";assessmentUploadedFor="";renderAssessmentForm(r);$("assessment-review-form").scrollIntoView({behavior:"smooth",block:"nearest"});};
  const remove=document.createElement("button");remove.type="button";remove.textContent="Eliminar";remove.className="assessment-delete-button";
  remove.onclick=async()=>{if(!window.confirm("Eliminar definitivamente a avaliação de "+assessmentPtDate(r.assessed_on)+" de "+r.athlete_name+"?"))return;remove.disabled=true;try{await request("/api/v2/athletes/"+encodeURIComponent(r.athlete_id)+"/assessments/delete",{method:"POST",body:JSON.stringify({id:r.id})});await refreshAssessmentRegistry();if($("athlete").value===r.athlete_id)await loadAssessmentsAdmin();}catch(e){$("assessment-excel-feedback").textContent="Erro ao eliminar: "+e.message;remove.disabled=false;}};
  actions.append(edit,remove);row.append(actions);body.append(row);
 }
 table.append(body);host.append(table);if(!rows.length){const p=document.createElement("p");p.className="hint";p.textContent="Sem avaliações para os filtros selecionados.";host.append(p);}
}
async function refreshAssessmentRegistry(){
 const select=$("tm-assessment-filter-player"),source=$("athlete"),prior=select.value;
 select.replaceChildren();const option=document.createElement("option");option.value="";option.textContent="Todos os jogadores";select.append(option);
 const athletes=Array.from(source.options).filter(o=>o.value);
 for(const a of athletes){const copy=document.createElement("option");copy.value=a.value;copy.textContent=a.textContent;select.append(copy);}
 select.value=Array.from(select.options).some(o=>o.value===prior)?prior:"";
 const response=await Promise.allSettled(athletes.map(a=>request("/api/v2/athletes/"+encodeURIComponent(a.value)+"/assessments")));
 assessmentRegistryCache=[];
 response.forEach((item,i)=>{if(item.status==="fulfilled")for(const r of item.value.assessments||[])assessmentRegistryCache.push({...r,athlete_id:athletes[i].value,athlete_name:athletes[i].textContent});});
 assessmentRegistryCache.sort((a,b)=>b.assessed_on.localeCompare(a.assessed_on));renderAssessmentRegistry();
}
for(const id of ["tm-assessment-filter-text","tm-assessment-filter-player","tm-assessment-filter-status","tm-assessment-filter-date"])$(id).addEventListener("input",renderAssessmentRegistry);
window.tmRefreshAssessmentRegistry=refreshAssessmentRegistry;
async function loadAssessmentsAdmin(){
 const athleteId=$("athlete").value;if(!athleteId)return;
 const result=await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments");
 const wrap=$("assessment-history");wrap.replaceChildren();
 assessmentPriorRecords=result.assessments.filter(x=>x.status==="published");
 const published=assessmentPriorRecords;
 renderAssessmentDashboard(result.assessments);
 assessmentHistoryAverages={};
 for(const [key,source] of [["avg_skinfolds","sum_8"],["avg_weight","weight"],["avg_body_fat","body_fat"]]){
  const values=published.map(x=>Number(x.measurements?.[source])).filter((v,i)=>published[i].measurements?.[source]!=null&&Number.isFinite(v));
  assessmentHistoryAverages[key]=values.length?(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2).replace(".",","):"";
  const field=$("assess-field-"+key);if(field)field.value=assessmentHistoryAverages[key];
 }
 if(!result.assessments.length){const p=document.createElement("p");p.className="hint";p.textContent="Ainda não existem avaliações para este jogador.";wrap.append(p);}
 for(const record of result.assessments.slice().reverse()){
  const button=document.createElement("button");button.type="button";button.className="assessment-history-row";
  button.textContent=record.assessed_on+" · "+(record.status==="published"?"Publicada":"Rascunho")+" · Editar";
  button.onclick=()=>{assessmentPdf="";assessmentUploadedFor="";renderAssessmentForm(record);};
  const row=document.createElement("div");row.className="assessment-history-entry";row.append(button);
  const remove=document.createElement("button");remove.type="button";remove.className="assessment-delete-button";remove.textContent="Eliminar";remove.setAttribute("aria-label","Eliminar avaliação de "+assessmentPtDate(record.assessed_on));
  remove.onclick=async()=>{
   if(!window.confirm("Eliminar definitivamente a avaliação de "+assessmentPtDate(record.assessed_on)+" deste jogador? Esta ação também a retira da App e não pode ser anulada."))return;
   remove.disabled=true;
   try{await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments/delete",{method:"POST",body:JSON.stringify({id:record.id})});$("assessment-review-form").hidden=true;await loadAssessmentsAdmin();}
   catch(e){$("assessment-excel-feedback").textContent="Não foi possível eliminar: "+e.message;remove.disabled=false;}
  };
  row.append(remove);wrap.append(row);
 }
}
$("assessment-close").onclick=()=>{if(window.confirm("Fechar a avaliação? As alterações não guardadas serão perdidas."))$("assessment-review-form").hidden=true;};
$("assessment-new").onclick=()=>{assessmentPdf="";assessmentUploadedFor="";renderAssessmentForm({});$("assessment-review-form").scrollIntoView({behavior:"smooth",block:"start"});};
async function saveAssessmentAdmin(publish){
 const msg=$("assessment-save-feedback"),athleteId=$("athlete").value;msg.textContent="";
 const measurements={},averages={};
 const height=assessmentValue("assess-field-height");if(height)measurements.height=height;
 for(const [group,,fields] of ASSESSMENT_GROUPS){
  for(const [key] of fields){const v=assessmentValue("assess-field-"+key);if(v)measurements[key]=v;}
 }

 const payload={action:"save",assessed_on:assessmentValue("assessment-date"),formula_note:assessmentValue("assessment-formula"),measurements,averages,publish};
 if(assessmentPdf&&assessmentUploadedFor===athleteId)payload.pdf_base64=assessmentPdf;
 try{
  await request("/api/v2/athletes/"+encodeURIComponent(athleteId)+"/assessments",{method:"POST",body:JSON.stringify(payload)});
  msg.textContent=publish?"Avaliação publicada.":"Rascunho guardado.";
  assessmentPdf="";assessmentUploadedFor="";
  await loadAssessmentsAdmin();refreshAssessmentRegistry().catch(()=>{});
 }catch(e){msg.textContent="Erro ao guardar: "+e.message;}
}
$("assessment-review-form").addEventListener("submit",e=>{e.preventDefault();saveAssessmentAdmin(true);});
$("assessment-draft").onclick=()=>saveAssessmentAdmin(false);
