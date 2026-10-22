"use strict";
const names={breakfast:"Pequeno-almoço",lunch:"Almoço",snack:"Lanche",dinner:"Jantar",supper:"Ceia"};
const colors={orange:"Laranja",yellow:"Amarelo",blue:"Azul",green:"Verde",vp:"VP · Verde preparação"};
const $=id=>document.getElementById(id);
let csrf="",athletes=[],model=null,calendarMonth=new Date(),selectedCalendarDay=null,validatedPlansByColor={};
calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
function status(msg,cls=""){const el=$("status");el.textContent=msg;el.className="status "+cls;}
async function request(path,opts={}){const headers={"Accept":"application/json"};if(opts.body){headers["Content-Type"]="application/json";}if(opts.method&&opts.method!=="GET"){headers["X-CSRF-Token"]=csrf;}const r=await fetch(path,{credentials:"same-origin",...opts,headers});let out;try{out=await r.json();}catch{out={error:"Resposta inválida do servidor"};}if(!r.ok)throw Error(out.error||"Pedido falhou");return out;}
async function start(){try{const me=await request("/api/me");if(!me.user||me.user.role!=="admin"){status("É necessário iniciar sessão como administrador na aplicação de testes.","warn");return;}csrf=me.csrf;await loadAthletes();status("Ambiente de testes pronto.");}catch(e){status("Não foi possível ligar: "+e.message,"warn");}}
async function loadAthletes(prefer){const data=await request("/api/v2/athletes");athletes=data.athletes;const list=$("athlete");list.replaceChildren();for(const a of athletes){const o=document.createElement("option");o.value=a.id;o.textContent=a.name;list.appendChild(o);}if(!athletes.length){model=null;$("matrix").hidden=true;$("calendar-section").hidden=true;status("Cria o primeiro jogador de teste.");return;}list.value=prefer||list.value||athletes[0].id;await loadModel();}
async function loadModel(){if(!$("athlete").value)return;selectedCalendarDay=null;model=await request("/api/v2/athletes/"+encodeURIComponent($("athlete").value)+"/microcycles");render();await loadPlanDrafts();await loadCalendar();}
function render(){const root=$("matrix");root.replaceChildren();const tbl=document.createElement("table");const header=document.createElement("tr");for(const label of ["Classificação","Pequeno-almoço","Almoço","Lanche","Jantar","Ceia"]){const th=document.createElement("th");th.textContent=label;header.appendChild(th);}tbl.appendChild(header);for(const row of model.classifications){const tr=document.createElement("tr"),title=document.createElement("td");title.textContent=(row.configured?"● ":"○ ")+row.name;tr.appendChild(title);for(const meal of model.meals){const td=document.createElement("td"),sel=document.createElement("select");sel.setAttribute("aria-label",row.name+" "+names[meal]);for(const [value,label] of [["","— Sem refeição"],...model.colors.map(c=>[c,colors[c]||c])]){const o=document.createElement("option");o.value=value;o.textContent=label;sel.appendChild(o);}sel.value=row.meals[meal]||"";sel.addEventListener("change",async()=>{const prior=row.meals[meal];const next=sel.value||null;sel.disabled=true;status("A guardar "+row.name+" · "+names[meal]+"…");try{await request("/api/v2/athletes/"+encodeURIComponent(model.athlete.id)+"/microcycles/"+encodeURIComponent(row.name),{method:"PUT",body:JSON.stringify({meal,color:next})});row.meals[meal]=next;row.configured=true;title.textContent="● "+row.name;await loadCalendar();status("Guardado: "+row.name+" · "+names[meal]+".","success");}catch(e){sel.value=prior||"";status("Não foi possível guardar: "+e.message,"warn");}finally{sel.disabled=false;}});td.appendChild(sel);tr.appendChild(td);}tbl.appendChild(tr);}root.appendChild(tbl);root.hidden=false;}
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
$("athlete").addEventListener("change",()=>loadModel().catch(e=>status(e.message,"warn")));
$("create").addEventListener("click",async()=>{const name=$("new-name").value.trim();if(!name)return status("Escreve o nome do jogador.","warn");$("create").disabled=true;try{const r=await request("/api/v2/athletes",{method:"POST",body:JSON.stringify({name})});$("new-name").value="";await loadAthletes(r.athlete.id);status("Jogador de teste criado.","success");}catch(e){status(e.message,"warn");}finally{$("create").disabled=false;}});
start();

function isoDay(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function matchBase(){return "/api/v2/athletes/"+encodeURIComponent(model.athlete.id);}

// Read-only daily meal color preview based on the selected athlete's matrix.
function mealColorsForDay(day){
  const row=model&&model.classifications.find(r=>r.name===day.classification);
  return model.meals.map(meal=>({meal,color:row&&row.meals[meal]||null}));
}
function renderDayPreview(day,host){
  host.replaceChildren();
  const heading=document.createElement("h3");
  heading.textContent="Refeições · "+day.date+" · "+(day.classification||"Sem classificação");
  host.appendChild(heading);
  const grid=document.createElement("div");grid.className="day-meals";
  for(const entry of mealColorsForDay(day)){
    const cell=document.createElement("div");cell.className="day-meal";
    const label=document.createElement("span");label.textContent=names[entry.meal];
    const value=document.createElement("strong");
    value.textContent=entry.color?(colors[entry.color]||entry.color):"— Sem cor atribuída";
    if(entry.color)value.className="meal-"+entry.color;
    cell.append(label,value);
    if(entry.color){const availability=document.createElement("small");availability.textContent=validatedPlansByColor[entry.color]?"Plano validado disponível":"Plano "+(colors[entry.color]||entry.color)+" em falta";cell.appendChild(availability);}
    grid.appendChild(cell);
  }
  host.appendChild(grid);
  const hint=document.createElement("p");
  hint.textContent="Pré-visualização automática da matriz deste jogador. Não publica prescrições.";
  host.appendChild(hint);
}

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
    const strip=document.createElement("div");strip.className="day-color-strip";
    for(const entry of mealColorsForDay(day)){
      const dot=document.createElement("i");
      dot.className="day-color-dot"+(entry.color?" meal-"+entry.color:"");
      dot.title=names[entry.meal]+": "+(entry.color?(colors[entry.color]||entry.color):"Sem cor atribuída");
      strip.appendChild(dot);
    }
    el.appendChild(strip);
    el.setAttribute("role","button");el.tabIndex=0;
    el.setAttribute("aria-label","Ver cores das refeições de "+day.date);
    const selectDay=()=>{
      selectedCalendarDay=day.date;
      for(const item of days.querySelectorAll(".calendar-day"))item.classList.remove("calendar-selected");
      el.classList.add("calendar-selected");
      renderDayPreview(day,preview);
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
  const focused=data.days.find(d=>d.date===selectedCalendarDay)||data.days.find(d=>d.classification)||data.days[0];
  if(focused){selectedCalendarDay=focused.date;renderDayPreview(focused,preview);
    for(const el of days.querySelectorAll(".calendar-day")){
      if(el.getAttribute("aria-label")==="Ver cores das refeições de "+focused.date)el.classList.add("calendar-selected");
    }
  }
  const list=$("calendar-matches");list.replaceChildren();
  for(const match of data.matches){
    const item=document.createElement("div");item.className="calendar-match-item";
    const date=document.createElement("span");date.textContent="Jogo · "+match.match_date+(match.match_time?" · "+match.match_time:"");item.appendChild(date);
    const edit=document.createElement("button");edit.type="button";edit.textContent="✎ Editar";edit.setAttribute("aria-label","Editar jogo de "+match.match_date);
    edit.addEventListener("click",()=>{
      const controls=document.createElement("div");controls.className="calendar-match-edit";
      const day=document.createElement("input");day.type="date";day.value=match.match_date;
      const hour=document.createElement("input");hour.type="time";hour.value=match.match_time||"";
      const save=document.createElement("button");save.type="button";save.textContent="Guardar jogo";
      const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancelar";
      save.addEventListener("click",async()=>{save.disabled=true;try{await request(matchBase()+"/matches/"+encodeURIComponent(match.id),{method:"PUT",body:JSON.stringify({match_date:day.value,match_time:hour.value||null})});const parts=day.value.split("-").map(Number);calendarMonth=new Date(parts[0],parts[1]-1,1);await loadCalendar();status("Jogo atualizado.","success");}catch(e){status("Erro ao editar jogo: "+e.message,"warn");save.disabled=false;}});
      cancel.addEventListener("click",()=>controls.remove());controls.append(day,hour,save,cancel);item.appendChild(controls);
    });item.appendChild(edit);
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
  try{await request(matchBase()+"/matches",{method:"POST",body:JSON.stringify({match_date:day,match_time:$("match-time").value||null})});
    const parts=day.split("-").map(Number);calendarMonth=new Date(parts[0],parts[1]-1,1);
    $("match-date").value="";$("match-time").value="";await loadCalendar();status("Jogo guardado e calendário atualizado.","success");
  }catch(e){status("Não foi possível guardar o jogo: "+e.message,"warn");}finally{btn.disabled=false;}
});
$("calendar-prev").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);loadCalendar().catch(e=>status(e.message,"warn"));});
$("calendar-next").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);loadCalendar().catch(e=>status(e.message,"warn"));});

async function loadPlanDrafts(){
  if(!model)return;
  $("plan-import-panel").hidden=false;
  const data=await request(matchBase()+"/plan-imports");
  const readiness=await request(matchBase()+"/plan-imports/publication-status");
  validatedPlansByColor=Object.fromEntries(readiness.colors.map(entry=>[entry.color,entry.validated_count>0]));
  const panel=$("publication-readiness");panel.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="Preparação para publicação · Ainda não disponível aos jogadores";panel.appendChild(heading);
  for(const entry of readiness.colors){
    const line=document.createElement("p");
    const latest=entry.plans.find(p=>p.status==="validated");
    line.textContent=(colors[entry.color]||entry.color)+": "+(entry.publication?"Publicado":latest?"Plano validado · pronto para futura publicação":"Sem plano validado")+" · "+entry.plans.length+" importação(ões)";
    panel.appendChild(line);
  }
  const list=$("import-list");list.replaceChildren();
  if(!data.drafts.length){list.textContent="Ainda não existem rascunhos deste jogador.";return;}
  for(const d of data.drafts){
    const btn=document.createElement("button");btn.type="button";
    btn.textContent=(colors[d.color]||d.color)+" · "+d.filename+" · "+(d.status==="validated"?"Validado":"Rascunho");
    btn.addEventListener("click",async()=>{
      try{const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(d.id));showImportedDraft(result.draft);}
      catch(e){$("import-feedback").textContent=e.message;}
    });
    list.appendChild(btn);
  }
}
function showImportedDraft(draft){
  const root=$("import-review");root.replaceChildren();
  const h=document.createElement("h3");h.textContent="Revisão · "+draft.filename+" · "+(colors[draft.color]||draft.color);root.appendChild(h);
  const totalCount=draft.extracted.groups.reduce((sum,group)=>sum+group.options.length,0);
  const overview=document.createElement("section");overview.className="import-validation-progress";
  const state=document.createElement("strong");
  state.textContent=draft.status==="validated"?"Plano validado":"Plano em revisão";
  overview.appendChild(state);
  const approval=document.createElement("button");approval.type="button";
  const approved=draft.status==="validated";
  approval.textContent=approved?"Reabrir para edição":"Validar plano completo";
  approval.disabled=!approved&&totalCount===0;
  approval.addEventListener("click",async()=>{
    approval.disabled=true;
    try{
      const result=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id)+"/review-status",{
        method:"POST",body:JSON.stringify({action:approved?"reopen":"approve"})
      });
      draft.status=result.status;
      showImportedDraft(draft);
      await loadPlanDrafts();
      await loadCalendar();
    }catch(e){approval.disabled=false;const p=document.createElement("p");p.textContent="Erro na validação: "+e.message;overview.appendChild(p);}
  });
  overview.appendChild(approval);
  const note=document.createElement("p");
  note.textContent=approved?"Plano aprovado internamente. Não foi publicado a nenhum jogador. Reabre para editar.":"Confirma a revisão do plano completo numa única ação. Não publica o plano.";
  overview.appendChild(note);
  root.appendChild(overview);
  for(const warning of draft.extracted.warnings){const p=document.createElement("p");p.textContent="Atenção: "+warning;root.appendChild(p);}
  draft.extracted.groups.forEach((group,groupIndex)=>{
    const groupTitle=document.createElement("h3");groupTitle.textContent=group.heading+" → "+group.meals.map(m=>names[m]).join(" / ");root.appendChild(groupTitle);
    group.options.forEach((option,optionIndex)=>{
      const details=document.createElement("details");details.className="import-option";
      const summary=document.createElement("summary");summary.textContent="Opção "+option.number+" · "+(option.totals?option.totals.kcal+" kcal":"Totais por confirmar");details.appendChild(summary);
      if(option.totals){const p=document.createElement("p");p.textContent="Proteína "+option.totals.protein_g+" g · HC "+option.totals.carbs_g+" g · Gordura "+option.totals.fat_g+" g";details.appendChild(p);}
      if(option.title){const heading=document.createElement("div");heading.className="import-structured-line";heading.textContent="Descrição: "+option.title;details.appendChild(heading);}
      for(const item of option.items||[]){
        if(item.kind==="title")continue;
        const line=document.createElement("div");line.className="import-structured-line";
        const name=document.createElement("span");
        name.textContent=item.kind==="food"?item.quantity+" · "+item.name:item.text;
        if(item.kind==="instruction"||item.kind==="note")name.textContent="Nota: "+item.text;
        line.appendChild(name);
        if(item.nutrients){
          const nutrient=document.createElement("span");nutrient.className="import-nutrients";
          nutrient.textContent=item.nutrients.kcal+" kcal · P "+item.nutrients.protein_g+" g · HC "+item.nutrients.carbs_g+" g · G "+item.nutrients.fat_g+" g";
          line.appendChild(nutrient);
        }
        if(item.needs_review){const note=document.createElement("small");note.textContent="Verificar";line.appendChild(note);}
        details.appendChild(line);
      }
      const actions=document.createElement("div");actions.className="import-option-actions";
      const edit=document.createElement("button");edit.type="button";edit.textContent="Editar opção";edit.disabled=approved;
      edit.addEventListener("click",()=>showOptionEditor(draft,groupIndex,optionIndex,details));
      actions.append(edit);details.appendChild(actions);root.appendChild(details);
    });
  });
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
  (option.items||[]).filter(item=>item.kind!=="title").forEach((item,index)=>{
    const box=document.createElement("fieldset");const legend=document.createElement("legend");legend.textContent="Linha "+(index+1);box.appendChild(legend);
    const type=document.createElement("select");
    for(const [value,label] of [["food","Alimento"],["note","Nota"]]){
      const el=document.createElement("option");el.value=value;el.textContent=label;type.appendChild(el);
    }
    type.value=item.kind==="food"?"food":"note";box.appendChild(type);
    const name=field("Alimento / texto",item.kind==="food"?item.name:item.text,box);
    const quantity=field("Quantidade",item.quantity||"",box);
    const nutrients={};
    for(const [key,label] of [["kcal","kcal"],["protein_g","P (g)"],["carbs_g","HC (g)"],["fat_g","G (g)"]]){
      nutrients[key]=field(label,item.nutrients?.[key]||"",box);
    }
    form.appendChild(box);edits.push({type,name,quantity,nutrients});
  });
  const save=document.createElement("button");save.type="button";save.textContent="Guardar correções";form.appendChild(save);
  const feedback=document.createElement("p");form.appendChild(feedback);
  save.addEventListener("click",async()=>{
    save.disabled=true;
    const entries=edits.map(edit=>{
      const kind=edit.type.value;
      const nutrients=Object.fromEntries(Object.entries(edit.nutrients).map(([key,input])=>[key,input.value.trim()]));
      return {kind,text:edit.name.value.trim(),name:kind==="food"?edit.name.value.trim():"",quantity:kind==="food"?edit.quantity.value.trim():"",nutrients:kind==="food"&&Object.values(nutrients).some(Boolean)?nutrients:null};
    });
    const totalValues=Object.fromEntries(Object.entries(totals).map(([key,input])=>[key,input.value.trim()]));
    try{
      const response=await request(matchBase()+"/plan-imports/"+encodeURIComponent(draft.id),{method:"PUT",
        body:JSON.stringify({group_index:groupIndex,option_index:optionIndex,option:{title:title.value.trim(),totals:Object.values(totalValues).some(Boolean)?totalValues:null,items:entries,reviewed:Boolean(option.reviewed)}})});
      option.items=response.option.items;option.title=response.option.title;option.totals=response.option.totals;option.reviewed=response.option.reviewed;
      feedback.textContent="Correções guardadas no rascunho, sem publicação.";
      showImportedDraft(draft);
    }catch(e){feedback.textContent="Erro: "+e.message;}finally{save.disabled=false;}
  });
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
