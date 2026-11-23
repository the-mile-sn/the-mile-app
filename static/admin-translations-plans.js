"use strict";
/* Private, version-bound Planos PT/EN editor. Never exports plan snapshots. */
(()=>{
  const $=id=>document.getElementById(id);
  const create=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=String(text);
    return el;
  };
  const host=$("i18n-plan-stage");
  if(!host)return;
  let csrf="",generation=0,loading=false;
  let publications=[],active=null,activeFields=[];
  const states={missing:"Por traduzir",pending:"Por rever",
                approved:"Aprovada",outdated:"Desatualizada"};
  const send=async(path,method="GET",data)=>{
    const headers={"Accept":"application/json"};
    if(method!=="GET"){
      headers["Content-Type"]="application/json";
      headers["X-CSRF-Token"]=csrf;
    }
    const r=await fetch(path,{method,credentials:"same-origin",headers,
       ...(data===undefined?{}:{body:JSON.stringify(data)})});
    let body={};
    try{body=await r.json();}catch(_){}
    if(!r.ok)throw Error(body.error||"http_"+r.status);
    return body;
  };
  const statusText=item=>{
    const x=item.statuses||{};
    return (x.approved||0)+" aprovados · "+(x.pending||0)+" por rever · "+
      (x.missing||0)+" por traduzir";
  };
  const labelPlan=item=>[item.plan_type||"Plano",item.player_label].filter(Boolean).join(" · ");
  const error=(target,message)=>{
    target.textContent=message;
    target.dataset.error=message?"1":"0";
  };
  const hide=()=>{
    generation++;active=null;activeFields=[];loading=false;
    host.replaceChildren();
  };
  const renderList=(statusFilter,search)=>{
    const list=$("i18n-plan-items");
    if(!list)return;
    list.replaceChildren();
    const needle=String(search||"").trim().toLocaleLowerCase("pt-PT");
    const filtered=publications.filter(p=>
      (!needle||labelPlan(p).toLocaleLowerCase("pt-PT").includes(needle))&&
      (statusFilter==="all"||statusFilter==="legacy_review"?
        statusFilter==="all":(p.statuses?.[statusFilter]||0)>0));
    if(!filtered.length){
      list.append(create("p","i18n-results-count","Não existem planos para estes filtros."));
      return;
    }
    for(const item of filtered){
      const button=create("button","i18n-result i18n-plan-item");
      button.type="button";
      button.append(create("strong","",labelPlan(item)),
                    create("small","",statusText(item)));
      if(item.state==="transitional")button.append(create("small","",
        "Versão de transição · revisão necessária"));
      button.addEventListener("click",()=>openPublication(item.publication_ref));
      list.append(button);
    }
  };
  const refreshField=async(public_ref,field_path,field,copy)=>{
    const next=await send("/api/v2/admin/i18n/plans/fields?"+
      new URLSearchParams({publication_ref:public_ref}));
    const update=next.fields.find(r=>r.field_path===field_path);
    if(!update)throw Error("Campo não disponível nesta versão.");
    Object.assign(field,update);
    copy.textContent=states[field.status]||field.status;
    return update;
  };
  const renderField=(item,public_ref)=>{
    const row=create("article","i18n-plan-field");
    const top=create("div","i18n-plan-field-head");
    const title=create("strong","",item.field_label);
    const state=create("small","i18n-plan-field-state",states[item.status]||item.status);
    top.append(title,state);
    const cols=create("div","i18n-plan-compare");
    const pt=create("div","i18n-plan-pt");
    pt.append(create("small","","Português · original"),create("p","",item.source_text));
    const en=create("label","i18n-plan-en");
    en.append(create("small","","English · tradução proposta"));
    const editor=create("textarea","");
    editor.rows=item.source_text.length>130?4:2;
    editor.maxLength=10000;
    editor.value=item.translated_text||"";
    editor.setAttribute("spellcheck","true");
    en.append(editor);
    if(item.suggestion&&item.status==="missing"){
      const hint=create("div","i18n-plan-suggestion");
      const origin=item.suggestion.origin==="approved_exact_title"?
        "Título com tradução aprovada noutro plano":"Unidade de apresentação · regra conservadora";
      hint.append(create("small","",origin+" · confirmar contexto"));
      const candidate=create("p","",item.suggestion.text);
      const use=create("button","i18n-secondary","Usar sugestão");
      use.type="button";
      use.addEventListener("click",()=>{
        if(!item.suggestion?.requires_review)return;
        editor.value=item.suggestion.text;
        editor.dispatchEvent(new Event("input",{bubbles:true}));
        editor.focus();
      });
      hint.append(candidate,use);
      en.append(hint);
    }
    cols.append(pt,en);
    const actions=create("div","i18n-plan-field-actions");
    const save=create("button","i18n-secondary","Guardar proposta");
    save.type="button";
    const reviewed=create("label","i18n-bulk-attestation");
    const checked=create("input");checked.type="checkbox";
    reviewed.append(checked,create("span","","Revisei esta tradução"));
    const approve=create("button","i18n-primary","Aprovar");
    approve.type="button";
    let busy=false;
    const feedback=create("p","i18n-feedback");
    const notice=item.sensitive?create("p","i18n-plan-sensitive",
      item.field_kind==="individual_note"?
        "Nota de consumo do plano. Revê o conteúdo antes de partilhar; "+
        "a exportação CSV está disponível apenas para notas elegíveis.":
        "Texto personalizado ou potencialmente sensível: revisão profissional "+
        "obrigatória. Não exportar."):null;
    const updateButtons=()=>{
      const modified=editor.value.trim()!==(item.translated_text||"").trim();
      save.disabled=!editor.value.trim()||!modified||busy;
      approve.disabled=item.status!=="pending"||modified||!checked.checked||busy;
    };
    editor.addEventListener("input",()=>{checked.checked=false;updateButtons();});
    checked.addEventListener("change",updateButtons);
    save.addEventListener("click",async()=>{
      if(busy)return;
      busy=true;updateButtons();
      error(feedback,"");
      try{
        await send("/api/v2/admin/i18n/plans/propose","POST",{
          publication_ref:public_ref,field_path:item.field_path,
          expected_source_hash:item.source_hash,translated_text:editor.value.trim()
        });
        await refreshField(public_ref,item.field_path,item,state);
        checked.checked=false;error(feedback,"Proposta guardada. Falta aprovação.");
      }catch(e){error(feedback,"Não foi possível guardar: "+e.message);}
      finally{busy=false;updateButtons();}
    });
    approve.addEventListener("click",async()=>{
      if(busy)return;
      busy=true;updateButtons();
      error(feedback,"");
      try{
        await send("/api/v2/admin/i18n/plans/approve","POST",{
          publication_ref:public_ref,field_path:item.field_path,
          expected_source_hash:item.source_hash,
          expected_candidate_hash:item.candidate_hash
        });
        await refreshField(public_ref,item.field_path,item,state);
        checked.checked=false;error(feedback,"Tradução aprovada.");
      }catch(e){error(feedback,"Aprovação interrompida: "+e.message);}
      finally{busy=false;updateButtons();}
    });
    updateButtons();
    actions.append(save,reviewed,approve);
    row.append(top,cols);
    if(notice)row.append(notice);
    row.append(actions,feedback);
    return row;
  };
  const openPublication=async(public_ref)=>{
    const seq=++generation,detail=$("i18n-plan-detail");
    if(!detail)return;
    detail.replaceChildren(create("p","i18n-results-count","A consultar versão publicada…"));
    try{
      const result=await send("/api/v2/admin/i18n/plans/fields?"+
        new URLSearchParams({publication_ref:public_ref}));
      if(seq!==generation||host.hidden)return;
      active=public_ref;activeFields=result.fields||[];
      detail.replaceChildren();
      const header=create("div","i18n-plan-detail-head");
      header.append(create("strong","",labelPlan(result.publication)),
                    create("small","",statusText(result.publication)));
      const back=create("button","i18n-quiet","Fechar revisão");
      back.type="button";
      back.addEventListener("click",()=>{active=null;detail.replaceChildren();});
      header.append(back);
      detail.append(header,create("p","i18n-plan-policy",
        "Traduções por versão publicada. Sem exportação CSV de dados clínicos. "+
        "Aprovações só após revisão e confirmação. Quantidades e cálculos não são alterados."));
      if(!activeFields.length){
        detail.append(create("p","i18n-results-count",
          "Este plano não tem textos específicos para tradução. "+
          "Os nomes fixos e os alimentos das bibliotecas são tratados na apresentação."));
        return;
      }
      let groupName="",group=null;
      for(const field of activeFields){
        if(field.group!==groupName){
          groupName=field.group;
          group=create("section","i18n-plan-option");
          group.append(create("h3","",groupName));
          detail.append(group);
        }
        group.append(renderField(field,public_ref));
      }
      detail.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){
      if(seq===generation)detail.replaceChildren(
        create("p","i18n-feedback","Não foi possível consultar o plano: "+e.message));
    }
  };

  const renderCommon=async panel=>{
    const seq=generation;
    panel.replaceChildren();
    const header=create("div","i18n-plan-detail-head");
    const heading=create("strong","","Traduções comuns · revisão por expressão");
    header.append(heading);
    const intro=create("p","i18n-plan-policy",
      "Títulos idênticos na mesma refeição e unidades simples. "+
      "Revê o inglês uma vez e aprova até 100 ocorrências em simultâneo. "+
      "As notas de consumo dos planos têm revisão própria; "+
      "alternativas e dados clínicos ficam fora do CSV.");
    const search=create("input","i18n-plan-common-search");
    search.type="search";
    search.placeholder="Pesquisar títulos, unidades e notas…";
    search.setAttribute("aria-label","Pesquisar traduções comuns");
    const list=create("div","i18n-plan-common-list");
    const detail=create("div","i18n-plan-common-detail");
    const csvPanel=create("section","i18n-plan-csv-tools");
    panel.append(header,intro,csvPanel,search,list,detail);
    let groups=[];
    let validated=[],csvBusy=false;
    const csvHeaders=["group_id","source_hash","expected_group_hash",
      "expected_stage_hash","field_kind","meal_context","source_text",
      "occurrences","translated_text"];
    const csvCell=(value,protect=false)=>{
      let content=String(value??"");
      if(protect&&/^[\s\u0000-\u001f]*[=+\-@]/.test(content))content="'"+content;
      return '"'+content.replaceAll('"','""')+'"';
    };
    const createCsv=rows=>"\uFEFF"+[csvHeaders,...rows.map(r=>
      csvHeaders.map(k=>r[k]??""))].map((r,index)=>r.map((cell,j)=>
        csvCell(cell,index>0&&["source_text","meal_context","translated_text"].includes(
          csvHeaders[j]))).join(";")).join("\r\n")+"\r\n";
    const parseCsv=raw=>{
      const input=raw.replace(/^\uFEFF/,"");
      const rows=[];let current=[],value="",quoted=false,atStart=true;
      const cell=()=>{current.push(value);value="";atStart=true;};
      const next=()=>{cell();if(current.some(x=>x!==""))rows.push(current);current=[];};
      for(let i=0;i<input.length;i++){
        const ch=input[i];
        if(quoted){
          if(ch==='"'&&input[i+1]==='"'){value+='"';i++;}
          else if(ch==='"')quoted=false;
          else value+=ch;
        }else if(ch==='"'&&atStart){quoted=true;atStart=false;}
        else if(ch===";")cell();
        else if(ch==="\n")next();
        else if(ch==="\r"&&input[i+1]==="\n"){}
        else if(ch==='"')throw Error("CSV com aspas inválidas.");
        else {value+=ch;atStart=false;}
      }
      if(quoted)throw Error("CSV com aspas por fechar.");
      if(value!==""||current.length)next();
      if(!rows.length||rows[0].join("|")!==csvHeaders.join("|"))
        throw Error("Cabeçalho incorreto. Usa o modelo descarregado nesta área.");
      if(rows.length>2501)throw Error("O CSV excede 2500 linhas.");
      if(rows.some(r=>r.length!==csvHeaders.length))
        throw Error("CSV com número incorreto de colunas.");
      return rows.slice(1).map(r=>Object.fromEntries(csvHeaders.map((k,i)=>[k,r[i]])));
    };
    const exportButton=create("button","i18n-secondary","Descarregar CSV dos textos comuns");
    exportButton.type="button";
    const uploadLabel=create("label","i18n-plan-csv-upload","Importar CSV traduzido");
    const fileInput=create("input","");
    fileInput.type="file";fileInput.accept=".csv,text/csv";
    uploadLabel.append(fileInput);
    const previewButton=create("button","i18n-secondary","Verificar importação");
    previewButton.type="button";
    const importButton=create("button","i18n-primary","Importar propostas");
    importButton.type="button";importButton.disabled=true;
    const ackLabel=create("label","i18n-bulk-attestation");
    const ackCheck=create("input");ackCheck.type="checkbox";
    ackLabel.append(ackCheck,create("span","",
      "Confirmei a revisão das traduções importadas que vou aprovar"));
    const bulkButton=create("button","i18n-primary","Aprovar em massa");
    bulkButton.type="button";bulkButton.disabled=true;
    const approvalPanel=create("section","i18n-plan-bulk-approval");
    const approvalHeading=create("strong","","Aprovação em massa");
    const approvalCount=create("p","i18n-plan-bulk-count");
    const approvalHint=create("p","i18n-plan-bulk-hint");
    approvalPanel.append(approvalHeading,approvalCount,ackLabel,bulkButton,approvalHint);
    const csvFeedback=create("p","i18n-feedback");
    const csvActions=create("div","i18n-plan-csv-actions");
    csvActions.append(exportButton,uploadLabel,previewButton,importButton);
    const uniquePreview=create("details","i18n-plan-unique-preview");
    const uniqueSummary=create("summary","","Segundo CSV · títulos únicos");
    const uniqueIntro=create("p","i18n-plan-policy",
      "Pré-visualização privada. Um título único pode conter informação"+
      " individualizada: confirma que não identifica jogadores e que não"+
      " contém informação clínica antes de o partilhar. Desmarca os títulos"+
      " que não devem sair do backoffice.");
    const uniqueList=create("div","i18n-plan-unique-list");
    const uniqueAcknowledge=create("label","i18n-bulk-attestation");
    const uniqueCheck=create("input");uniqueCheck.type="checkbox";
    uniqueAcknowledge.append(uniqueCheck,create("span","",
      "Revisei os títulos selecionados e confirmei que podem ser exportados"));
    const uniqueDownload=create("button","i18n-secondary",
      "Descarregar CSV de títulos únicos");
    uniqueDownload.type="button";uniqueDownload.disabled=true;
    uniquePreview.append(uniqueSummary,uniqueIntro,uniqueList,
      uniqueAcknowledge,uniqueDownload);
    const notesPreview=create("details","i18n-plan-unique-preview i18n-plan-notes-preview");
    const notesSummary=create("summary","","Terceiro CSV · notas de consumo dos planos");
    const notesIntro=create("p","i18n-plan-policy",
      "Notas escritas nas opções alimentares dos planos. Verifica o texto antes "+
      "de o exportar e desmarca qualquer referência pessoal, clínica ou sensível.");
    const notesList=create("div","i18n-plan-unique-list");
    const notesConsent=create("label","i18n-bulk-attestation");
    const notesCheck=create("input");notesCheck.type="checkbox";
    notesConsent.append(notesCheck,create("span","",
      "Revisei estas notas e confirmei que podem ser exportadas para tradução"));
    const notesDownload=create("button","i18n-secondary",
      "Descarregar CSV de notas dos planos");
    notesDownload.type="button";notesDownload.disabled=true;
    notesPreview.append(notesSummary,notesIntro,notesList,notesConsent,notesDownload);
    const quantityPreview=create("details","i18n-plan-unique-preview i18n-plan-quantity-preview");
    const quantitySummary=create("summary","","Quarto CSV · quantidades pendentes");
    const quantityIntro=create("p","i18n-plan-policy",
      "Quantidades de apresentação ainda por traduzir. Os símbolos internacionais"+
      " podem permanecer iguais em inglês; outros termos precisam de tradução."+
      " Revê cada expressão antes de exportar e desmarca as que não devam ser partilhadas.");
    const quantityStats=create("p","i18n-plan-quantity-stats");
    const quantityList=create("div","i18n-plan-unique-list");
    const quantityConsent=create("label","i18n-bulk-attestation");
    const quantityCheck=create("input");quantityCheck.type="checkbox";
    quantityConsent.append(quantityCheck,create("span","",
      "Revisei as quantidades selecionadas e confirmei que podem ser exportadas"));
    const quantityDownload=create("button","i18n-secondary",
      "Descarregar CSV de quantidades");
    quantityDownload.type="button";quantityDownload.disabled=true;
    quantityPreview.append(quantitySummary,quantityIntro,quantityStats,
      quantityList,quantityConsent,quantityDownload);
    csvPanel.append(create("strong","","Tradução por ficheiro CSV"),
      create("p","i18n-plan-policy",
        "O CSV comum mantém os títulos repetidos e unidades simples."+
        " O segundo CSV contém apenas títulos únicos candidatos, sujeitos"+
        " a uma revisão de privacidade antes do download. Não exportamos"+
        " dados pessoais, alternativas nem prescrições. As notas dos planos"+
        " têm um terceiro CSV com revisão. Preenche apenas translated_text;"+
        " importar não aprova automaticamente."),
      csvActions,uniquePreview,notesPreview,quantityPreview,approvalPanel,csvFeedback);
    const csvEntry=g=>({
      group_id:g.group_id,source_hash:g.source_hash,
      expected_group_hash:g.expected_group_hash,
      expected_stage_hash:g.expected_stage_hash,
      field_kind:g.field_kind,meal_context:g.meal_context,
      source_text:g.source_text,occurrences:g.missing_count,
      translated_text:g.imported_text||g.suggestion?.text||""
    });
    const downloadCsv=(rows,name)=>{
      const blob=new Blob([createCsv(rows)],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=name;
      document.body.append(link);link.click();link.remove();
      URL.revokeObjectURL(url);
    };
    const renderUnique=()=>{
      uniqueCheck.checked=false;
      uniqueDownload.disabled=true;
      uniqueList.replaceChildren();
      const candidates=groups.filter(g=>g.single_title_candidate&&g.csv_eligible);
      uniqueSummary.textContent="Segundo CSV · "+candidates.length+
        " títulos únicos candidatos a tradução";
      if(!candidates.length){
        uniqueList.append(create("p","i18n-plan-policy",
          "Não há títulos únicos elegíveis neste momento."));
      }
      for(const group of candidates){
        const row=create("label","i18n-plan-unique-row");
        const checkbox=create("input");checkbox.type="checkbox";
        checkbox.checked=true;checkbox.dataset.groupId=group.group_id;
        checkbox.addEventListener("change",()=>{
          uniqueCheck.checked=false;uniqueDownload.disabled=true;
        });
        row.append(checkbox,create("span","",group.source_text+
          " · "+group.meal_context));
        uniqueList.append(row);
      }
    };
    const renderNotes=()=>{
      notesCheck.checked=false;
      notesDownload.disabled=true;
      notesList.replaceChildren();
      const candidates=groups.filter(g=>g.plan_note_candidate&&g.csv_eligible);
      notesSummary.textContent="Terceiro CSV · "+candidates.length+
        " notas de consumo candidatas a tradução";
      if(!candidates.length){
        notesList.append(create("p","i18n-plan-policy",
          "Não existem notas de consumo elegíveis neste momento."));
      }
      for(const group of candidates){
        const row=create("label","i18n-plan-unique-row");
        const checkbox=create("input");checkbox.type="checkbox";
        checkbox.checked=true;checkbox.dataset.groupId=group.group_id;
        checkbox.addEventListener("change",()=>{
          notesCheck.checked=false;notesDownload.disabled=true;
        });
        row.append(checkbox,create("span","",group.source_text+
          " · "+group.meal_context));
        notesList.append(row);
      }
    };
    notesCheck.addEventListener("change",()=>{
      notesDownload.disabled=!notesCheck.checked||
        !notesList.querySelector("input:checked");
    });
    notesDownload.addEventListener("click",()=>{
      if(!notesCheck.checked)return;
      const included=new Set(Array.from(notesList.querySelectorAll("input:checked"))
        .map(el=>el.dataset.groupId));
      const rows=groups.filter(g=>g.plan_note_candidate&&g.csv_eligible&&
        included.has(g.group_id)).map(csvEntry);
      if(!rows.length){csvFeedback.textContent="Não há notas selecionadas.";return;}
      downloadCsv(rows,"the-mile-traducoes-planos-notas.csv");
      csvFeedback.textContent=rows.length+
        " notas exportadas. Confirma o conteúdo do CSV antes de o partilhar.";
      notesCheck.checked=false;notesDownload.disabled=true;
    });
    const renderQuantities=()=>{
      quantityCheck.checked=false;quantityDownload.disabled=true;
      quantityList.replaceChildren();
      const candidates=groups.filter(g=>g.quantity_candidate&&g.csv_eligible);
      const occurrences=candidates.reduce((n,g)=>n+g.missing_count,0);
      const neutral=candidates.filter(g=>g.quantity_neutral).length;
      quantitySummary.textContent="Quarto CSV · "+candidates.length+
        " quantidades únicas ("+occurrences+" ocorrências por traduzir)";
      quantityStats.textContent=neutral+
        " expressões com símbolos que podem manter-se iguais em inglês, "+
        "sujeitas a revisão. As restantes exigem tradução ou confirmação.";
      if(!candidates.length)quantityList.append(create("p","i18n-plan-policy",
        "Não existem quantidades elegíveis na fila. Os restantes campos "+
        "continuam disponíveis na revisão individual dos planos."));
      for(const group of candidates){
        const row=create("label","i18n-plan-unique-row");
        const checkbox=create("input");checkbox.type="checkbox";
        checkbox.checked=true;checkbox.dataset.groupId=group.group_id;
        checkbox.addEventListener("change",()=>{
          quantityCheck.checked=false;quantityDownload.disabled=true;
        });
        const hint=group.quantity_neutral?" · símbolo igual em inglês (a rever)":
          group.suggestion?.text?" · tradução existente (a rever)":" · traduzir";
        row.append(checkbox,create("span","",group.source_text+" · "+
          group.missing_count+" ocorrências"+hint));
        quantityList.append(row);
      }
    };
    quantityCheck.addEventListener("change",()=>{
      quantityDownload.disabled=!quantityCheck.checked||
        !quantityList.querySelector("input:checked");
    });
    quantityDownload.addEventListener("click",()=>{
      if(!quantityCheck.checked)return;
      const chosen=new Set(Array.from(quantityList.querySelectorAll("input:checked"))
        .map(el=>el.dataset.groupId));
      const rows=groups.filter(g=>g.quantity_candidate&&g.csv_eligible&&
        chosen.has(g.group_id)).map(csvEntry);
      if(!rows.length){csvFeedback.textContent="Não há quantidades selecionadas.";return;}
      downloadCsv(rows,"the-mile-traducoes-planos-quantidades.csv");
      csvFeedback.textContent=rows.length+" quantidades exportadas. "+
        "Preserva números e unidades antes de importar.";
      quantityCheck.checked=false;quantityDownload.disabled=true;
    });
    uniqueCheck.addEventListener("change",()=>{
      uniqueDownload.disabled=!uniqueCheck.checked||
        !uniqueList.querySelector("input:checked");
    });
    uniqueDownload.addEventListener("click",()=>{
      if(!uniqueCheck.checked)return;
      const included=new Set(Array.from(uniqueList.querySelectorAll("input:checked"))
        .map(el=>el.dataset.groupId));
      const rows=groups.filter(g=>g.single_title_candidate&&g.csv_eligible&&
        included.has(g.group_id)).map(csvEntry);
      if(!rows.length){csvFeedback.textContent="Não há títulos selecionados.";return;}
      downloadCsv(rows,"the-mile-traducoes-planos-titulos-unicos.csv");
      csvFeedback.textContent=rows.length+
        " títulos únicos exportados. Confirma novamente o conteúdo do CSV"+
        " antes de o partilhar.";
      uniqueCheck.checked=false;uniqueDownload.disabled=true;
    });
    const matchingGroups=()=>groups.filter(g=>{
      const term=search.value.trim().toLocaleLowerCase("pt-PT");
      return !term||[g.source_text,g.meal_context,g.field_kind].join(" ")
        .toLocaleLowerCase("pt-PT").includes(term);
    });
    const updateCsvButtons=()=>{
      importButton.disabled=csvBusy||!validated.length;
      const ready=matchingGroups().filter(g=>g.csv_eligible&&g.imported_text&&
        (g.imported_status==="pending"||g.imported_status==="approved"));
      const count=ready.length,occurrences=ready.reduce((total,g)=>total+g.missing_count,0);
      bulkButton.disabled=csvBusy||!ackCheck.checked||!count;
      bulkButton.textContent=csvBusy?"A processar…":
        "Aprovar em massa · até "+Math.min(100,count)+" expressões";
      approvalCount.textContent=count?
        count+" expressões importadas prontas para aprovação · "+
          occurrences+" ocorrências por traduzir":
        "Não existem traduções importadas por aprovar neste filtro.";
      approvalHint.textContent=csvBusy?"A aprovação está em curso.":
        !count?"Importa as traduções para ativar a aprovação em massa.":
        !ackCheck.checked?
          "Assinala a confirmação acima para ativar o botão. "+
          "Cada expressão é aprovada em grupos de até 100 ocorrências.":
          "Pronto para aprovar. Cada expressão é aprovada em grupos de "+
          "até 100 ocorrências, com histórico de revisão.";
    };
    exportButton.addEventListener("click",()=>{
      const rows=groups.filter(g=>g.csv_eligible&&!g.single_title_candidate&&
        (g.field_kind!=="display_quantity"||
         g.suggestion?.origin==="simple_unit_rule")).map(csvEntry);
      if(!rows.length){
        csvFeedback.textContent="Não há títulos repetidos ou unidades para exportar.";
        return;
      }
      downloadCsv(rows,"the-mile-traducoes-planos-comuns.csv");
      csvFeedback.textContent="CSV descarregado com "+rows.length+
        " expressões. Revê o conteúdo antes de o partilhares.";
    });
    fileInput.addEventListener("change",()=>{
      validated=[];ackCheck.checked=false;importButton.disabled=true;
      csvFeedback.textContent=fileInput.files[0]?.name||"";
      updateCsvButtons();
    });
    previewButton.addEventListener("click",async()=>{
      validated=[];importButton.disabled=true;
      const file=fileInput.files[0];
      if(!file){csvFeedback.textContent="Seleciona primeiro um CSV.";return;}
      if(file.size>1024*1024){
        csvFeedback.textContent="O ficheiro não pode exceder 1 MB.";return;
      }
      try{
        const entries=parseCsv(await file.text());
        const byId=new Map(groups.filter(g=>g.csv_eligible).map(g=>[g.group_id,g]));
        const unique=new Set();
        let blanks=0;
        for(const row of entries){
          const g=byId.get(row.group_id);
          if(!g||unique.has(row.group_id))throw Error(
            "Existe um grupo duplicado ou alterado. Descarrega um novo modelo.");
          unique.add(row.group_id);
          const safeSource=String(row.source_text).replace(/^'(?=[=+\-@])/,"");
          const safeContext=String(row.meal_context).replace(/^'(?=[=+\-@])/,"");
          if(row.source_hash!==g.source_hash||
             row.expected_group_hash!==g.expected_group_hash||
             row.expected_stage_hash!==(g.expected_stage_hash||"")||
             row.field_kind!==g.field_kind||safeContext!==g.meal_context||
             safeSource!==g.source_text)
            throw Error("O plano mudou desde a exportação. Descarrega um CSV novo.");
          const translated=row.translated_text.trim().replace(/^'(?=[=+\-@])/,"");
          if(!translated){blanks++;continue;}
          validated.push({group_id:g.group_id,source_hash:g.source_hash,
            expected_group_hash:g.expected_group_hash,
            expected_stage_hash:g.expected_stage_hash||"",translated_text:translated});
        }
        if(!validated.length)throw Error("Preenche translated_text antes de importar.");
        csvFeedback.textContent=validated.length+
          " propostas prontas a importar. "+blanks+
          " linhas vazias ficam por traduzir. Nenhuma será aprovada nesta etapa.";
        updateCsvButtons();
      }catch(e){validated=[];csvFeedback.textContent="CSV inválido: "+e.message;
        updateCsvButtons();}
    });
    importButton.addEventListener("click",async()=>{
      if(csvBusy||!validated.length)return;
      csvBusy=true;updateCsvButtons();
      let imported=0,unchanged=0;
      try{
        for(let i=0;i<validated.length;i+=100){
          if(seq!==generation)break;
          const result=await send("/api/v2/admin/i18n/plans/common/import","POST",
            {rows:validated.slice(i,i+100)});
          imported+=result.imported;unchanged+=result.unchanged;
          csvFeedback.textContent="Importação: "+Math.min(i+100,validated.length)+
            " / "+validated.length+" expressões processadas.";
        }
        validated=[];
        await refresh();
        csvFeedback.textContent=imported+" propostas importadas; "+unchanged+
          " já existentes sem alterações. Revê e confirma a aprovação em lote.";
      }catch(e){
        csvFeedback.textContent="Importação interrompida após "+imported+
          " propostas: "+e.message+". Atualiza o CSV e volta a verificar.";
        validated=[];
        await refresh();
      }finally{csvBusy=false;updateCsvButtons();}
    });
    ackCheck.addEventListener("change",updateCsvButtons);
    bulkButton.addEventListener("click",async()=>{
      if(csvBusy||!ackCheck.checked)return;
      const queue=matchingGroups().filter(g=>g.csv_eligible&&g.imported_text&&
        (g.imported_status==="pending"||g.imported_status==="approved")).slice(0,100);
      if(!queue.length)return;
      csvBusy=true;updateCsvButtons();
      let total=0,count=0;
      try{
        for(const item of queue){
          if(seq!==generation)break;
          const result=await send("/api/v2/admin/i18n/plans/common/approve","POST",{
            group_id:item.group_id,source_hash:item.source_hash,
            expected_group_hash:item.expected_group_hash,
            translated_text:item.imported_text,acknowledged:true
          });
          count++;total+=result.approved;
          csvFeedback.textContent="Aprovadas "+total+
            " ocorrências em "+count+" expressões…";
        }
        await refresh();
        csvFeedback.textContent="Aprovadas "+total+" ocorrências de "+count+
          " expressões. Para grupos com mais de 100 ocorrências, confirma novo lote.";
      }catch(e){
        csvFeedback.textContent="Aprovação interrompida após "+count+
          " expressões e "+total+" ocorrências: "+e.message+
          ". Os lotes anteriores ficaram aprovados; atualiza e revê o restante.";
        await refresh();
      }finally{
        ackCheck.checked=false;csvBusy=false;updateCsvButtons();
      }
    });
    const refresh=async()=>{
      const result=await send("/api/v2/admin/i18n/plans/common");
      if(seq!==generation||host.hidden)return;
      groups=result.items||[];
      showList();
      renderUnique();
      renderNotes();
      renderQuantities();
      updateCsvButtons();
    };
    const openGroup=item=>{
      detail.replaceChildren();
      const groupHead=create("div","i18n-plan-detail-head");
      groupHead.append(create("strong","",
        item.field_kind==="option_title"?"Título de opção":
        item.field_kind==="individual_note"?"Nota de consumo do plano":
        "Unidade de apresentação"),
        create("small","",item.missing_count+" ocorrências para aprovar"));
      const context=create("p","i18n-plan-policy",
        item.field_kind==="display_quantity"?
          "Apenas expressões de unidade inequívocas":
          "Contexto: "+item.meal_context);
      const cols=create("div","i18n-plan-compare");
      const pt=create("div","i18n-plan-pt");
      pt.append(create("small","","Português · original"),
                create("p","",item.source_text));
      const en=create("label","i18n-plan-en");
      en.append(create("small","","English · tradução revista"));
      const editor=create("textarea","");
      editor.rows=3;
      editor.maxLength=10000;
      editor.value=item.imported_text||item.suggestion?.text||"";
      en.append(editor);
      cols.append(pt,en);
      const acknowledge=create("label","i18n-bulk-attestation");
      const check=create("input");check.type="checkbox";
      acknowledge.append(check,create("span","",
        "Revisei esta expressão e confirmei que se aplica ao contexto indicado"));
      const actions=create("div","i18n-plan-field-actions");
      const approve=create("button","i18n-primary",
        "Aprovar até "+Math.min(100,item.missing_count)+" ocorrências");
      approve.type="button";
      const feedback=create("p","i18n-feedback");
      let busy=false;
      const update=()=>{approve.disabled=busy||!check.checked||!editor.value.trim();};
      editor.addEventListener("input",()=>{check.checked=false;update();});
      check.addEventListener("change",update);
      approve.addEventListener("click",async()=>{
        if(busy||!check.checked||!editor.value.trim())return;
        busy=true;update();
        feedback.textContent="";
        try{
          const result=await send("/api/v2/admin/i18n/plans/common/approve","POST",{
            group_id:item.group_id,source_hash:item.source_hash,
            expected_group_hash:item.expected_group_hash,
            translated_text:editor.value.trim(),acknowledged:true
          });
          feedback.textContent=result.approved+
            " ocorrências aprovadas com histórico individual.";
          // Group tokens are versioned; obtain fresh eligible rows after any write.
          await refresh();
          const remaining=groups.find(g=>g.group_id===item.group_id);
          if(remaining){
            openGroup(remaining);
            const msg=create("p","i18n-feedback",result.approved+
              " ocorrências aprovadas. Ainda existem "+remaining.missing_count+
              " sem tradução.");
            detail.prepend(msg);
          }else{
            detail.replaceChildren(create("p","i18n-feedback",
              result.approved+" ocorrências aprovadas. Grupo concluído."));
          }
        }catch(e){
          feedback.textContent="Não foi possível aprovar: "+e.message+
            ". Atualiza a lista antes de tentar novamente.";
          busy=false;update();
        }
      });
      actions.append(acknowledge,approve);
      update();
      detail.append(groupHead,context,cols,actions,feedback);
    };
    const showList=()=>{
      list.replaceChildren();
      const term=search.value.trim().toLocaleLowerCase("pt-PT");
      const items=groups.filter(x=>
        !term||[x.source_text,x.meal_context,x.field_kind].join(" ")
          .toLocaleLowerCase("pt-PT").includes(term));
      if(!items.length){
        list.append(create("p","i18n-results-count",
          "Não existem textos comuns para estes filtros."));
        return;
      }
      for(const item of items){
        const row=create("button","i18n-plan-common-item");
        row.type="button";
        row.append(create("strong","",item.source_text),
          create("small","",item.missing_count+" por traduzir · "+
            (item.field_kind==="option_title"?
              "Título · "+item.meal_context:
              item.field_kind==="individual_note"?
              "Nota do plano · "+item.meal_context:"Unidade simples")+
            (item.missing_count>100?" · em grupos de 100":"")+
            (item.imported_status?" · CSV "+(
              item.imported_status==="approved"?"revisto":"importado por rever"):"")));
        row.addEventListener("click",()=>openGroup(item));
        list.append(row);
      }
    };
    search.addEventListener("input",()=>{showList();updateCsvButtons();});
    try{await refresh();}
    catch(e){
      if(seq===generation)list.replaceChildren(
        create("p","i18n-feedback","Não foi possível carregar textos comuns: "+e.message));
    }
  };

  const load=async({csrfToken,status="all",query=""}={})=>{
    csrf=csrfToken||csrf;
    const seq=++generation;
    host.replaceChildren();
    const head=create("div","i18n-plan-detail-head");
    head.append(create("strong","","Planos publicados · revisão por versão"));
    const intro=create("p","i18n-plan-policy",
      "As traduções aprovadas dos alimentos serão reutilizadas na integração com as apps. "+
      "Aqui revês apenas textos específicos dos planos publicados. "+
      "O nome do jogador é apresentado apenas na sessão privada do administrador.");
    const list=create("div","i18n-plan-list");list.id="i18n-plan-items";
    const detail=create("div","i18n-plan-detail");detail.id="i18n-plan-detail";
    const auditPanel=create("div","i18n-plan-audit");
    const commonPanel=create("section","i18n-plan-common");
    host.append(head,intro,auditPanel,commonPanel,list,detail);
    try{
      const result=await send("/api/v2/admin/i18n/plans");
      if(seq!==generation||host.hidden)return;
      publications=result.items||[];
      const renderAudit=audit=>{
        auditPanel.replaceChildren();
        if(!audit)return;
        const fmt=n=>Number(n||0).toLocaleString("pt-PT");
        const states=["approved","pending","missing","outdated"];
        const labels={
          option_title:"Títulos das opções",
          individual_note:"Notas de consumo dos planos",
          display_quantity:"Quantidades apresentadas",
          alternative_override:"Alternativas personalizadas",
          food_override:"Apresentações personalizadas",
          supplement_label:"Textos de suplementos"
        };
        const categories=Object.entries(labels);
        const totals=audit.coverage_totals||{};
        const byKind=audit.coverage_by_kind||{};
        const total=states.reduce((acc,state)=>acc+Number(totals[state]||0),0);
        const header=create("div","i18n-plan-coverage-head");
        const heading=create("h3","","Cobertura das traduções dos Planos");
        const reload=create("button","i18n-secondary","Atualizar diagnóstico");
        reload.type="button";
        const feedback=create("small","i18n-plan-coverage-feedback");
        reload.addEventListener("click",async()=>{
          if(reload.disabled)return;
          reload.disabled=true;feedback.textContent="A atualizar…";
          try{
            const fresh=await send("/api/v2/admin/i18n/plans");
            if(seq!==generation||host.hidden)return;
            publications=fresh.items||[];
            renderAudit(fresh.reuse_audit);
            renderList(status,query);
          }catch(e){
            feedback.textContent="Não foi possível atualizar: "+e.message;
          }finally{reload.disabled=false;}
        });
        header.append(heading,reload);
        auditPanel.append(header,feedback);
        const overview=create("div","i18n-plan-coverage-overview");
        const overviewLabels=[
          ["approved","Aprovados"],["pending","Por rever"],
          ["missing","Por traduzir"],["outdated","Desatualizados"]
        ];
        for(const [state,label] of overviewLabels){
          const tile=create("div","i18n-plan-coverage-stat");
          tile.append(create("strong","",fmt(totals[state])),
                      create("small","",label));
          overview.append(tile);
        }
        auditPanel.append(overview);
        const approved=Number(totals.approved||0);
        auditPanel.append(create("p","i18n-plan-coverage-intro",
          "Total: "+fmt(total)+" campos próprios nas versões publicadas · "+
          (total?Math.round(100*approved/total):0)+"% aprovados. "+
          "Contagem por ocorrência, não por texto único; exclui "+
          "alimentos herdados das bibliotecas."));
        const scroller=create("div","i18n-plan-coverage-scroll");
        const table=create("table","i18n-plan-coverage-table");
        const thead=create("thead");
        const titles=create("tr");
        for(const caption of ["Tipo de conteúdo","Aprovados","Por rever",
                               "Por traduzir","Desatualizados","Total"]){
          const th=create("th","",caption);th.scope="col";titles.append(th);
        }
        thead.append(titles);table.append(thead);
        const tbody=create("tbody");
        for(const [kind,label] of categories){
          const counts=byKind[kind]||{};
          const row=create("tr");
          const name=create("th","",label);name.scope="row";row.append(name);
          for(const state of states){
            row.append(create("td","",fmt(counts[state])));
          }
          row.append(create("td","",fmt(states.reduce(
            (n,state)=>n+Number(counts[state]||0),0))));
          tbody.append(row);
        }
        const footer=create("tr","i18n-plan-coverage-total");
        const footerLabel=create("th","","Total");footerLabel.scope="row";
        footer.append(footerLabel);
        for(const state of states)footer.append(create("td","",fmt(totals[state])));
        footer.append(create("td","",fmt(total)));tbody.append(footer);
        table.append(tbody);scroller.append(table);auditPanel.append(scroller);
        auditPanel.append(create("p","i18n-plan-coverage-intro",
          "Os campos por traduzir e desatualizados precisam de nova revisão. "+
          "Este diagnóstico é apenas informativo: não exporta textos "+
          "individualizados nem aprova qualquer tradução."));
        const reuse=create("details","i18n-plan-reuse-details");
        reuse.append(create("summary","","Diagnóstico de reutilização"));
        const stats=create("div","i18n-plan-audit-grid");
        const numbers=[
          ["Textos próprios",audit.visible_text_fields],
          ["Títulos repetidos",audit.repeated_option_title_occurrences],
          ["Alimentos com inglês aprovado",audit.approved_library_food_references],
          ["Alternativas personalizadas",audit.alternative_overrides],
          ["Notas de planos",audit.individual_notes],
          ["Sugestões de unidades",audit.simple_unit_suggestions]
        ];
        for(const [label,count] of numbers){
          const tile=create("div","i18n-plan-audit-stat");
          tile.append(create("strong","",fmt(count)),create("small","",label));
          stats.append(tile);
        }
        reuse.append(stats,create("p","i18n-plan-coverage-intro",
          "A reutilização de alimentos da biblioteca é contabilizada "+
          "separadamente. Nenhuma sugestão é aprovada sem revisão."));
        auditPanel.append(reuse);
      };
      renderAudit(result.reuse_audit);
      renderList(status,query);
      await renderCommon(commonPanel);
    }catch(e){
      if(seq===generation)list.replaceChildren(
        create("p","i18n-feedback","Não foi possível consultar publicações: "+e.message));
    }
  };
  window.tmI18nPlans={load,hide};
})();
