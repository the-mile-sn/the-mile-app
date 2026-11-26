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
  let csrf="",generation=0,publicationSequence=0,loading=false,activeWrites=0;
  const hasChanges=(scope=host)=>!!scope?.querySelector('textarea[data-tm-dirty="1"]');
  const canLeave=(scope=host)=>!activeWrites&&(!hasChanges(scope)||confirm("Existem traduções por guardar. Pretendes descartá-las?"));
  const trackEditor=(editor,initial)=>{editor.dataset.tmDirty=String(Number(editor.value.trim()!==String(initial||"").trim()));};
  let publications=[],active=null,activeFields=[];
  const states={missing:"Por traduzir",pending:"Por rever",
                approved:"Aprovada",outdated:"Desatualizada"};
  const send=async(path,method="GET",data)=>{
    const headers={"Accept":"application/json"};
    if(method!=="GET"){
      headers["Content-Type"]="application/json";
      headers["X-CSRF-Token"]=csrf;
    }
    if(method!=="GET")activeWrites++;
    try{
    const r=await fetch(path,{method,credentials:"same-origin",headers,
       ...(data===undefined?{}:{body:JSON.stringify(data)})});
    let body={};
    try{body=await r.json();}catch(_){}
    if(!r.ok)throw Error(body.error||"http_"+r.status);
    return body;
    }finally{if(method!=="GET")activeWrites--;}
  };
  const statusText=item=>{
    const x=item.statuses||{};
    return (x.approved||0)+" aprovados · "+(x.pending||0)+" por rever · "+
      (x.missing||0)+" por traduzir · "+(x.outdated||0)+" desatualizados";
  };
  const labelPlan=item=>[item.plan_type||"Plano",item.player_label].filter(Boolean).join(" · ");
  const error=(target,message)=>{
    target.textContent=message;
    target.dataset.error=message?"1":"0";
  };
  const hide=()=>{
    generation++;publicationSequence++;active=null;activeFields=[];loading=false;
    const dialog=$("i18n-plan-review-dialog");if(dialog?.open)dialog.close();
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
      button.addEventListener("click",()=>{if(canLeave($("i18n-plan-detail")))openPublication(item.publication_ref);});
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
        "Título com tradução aprovada noutro plano":
        item.suggestion.origin==="approved_exact_quantity"?
        "Quantidade com tradução aprovada noutro plano":
        item.suggestion.origin==="approved_exact_food_name"?
        "Nome com tradução aprovada na biblioteca de alimentos":
        item.suggestion.origin==="approved_exact_supplement_name"?
        "Nome com tradução aprovada na biblioteca de suplementos":
        item.suggestion.origin==="language_neutral_quantity"?
        "Símbolo internacional · pode manter-se igual em inglês":
        "Unidade de apresentação · regra conservadora";
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
        "Nota de consumo do plano. Confirma o contexto.":
      item.field_kind==="food_override"?
        "Apresentação alimentar personalizada. Confirma o contexto.":
        "Texto personalizado: revisão privada obrigatória."):null;
    const updateButtons=()=>{
      const modified=editor.value.trim()!==(item.translated_text||"").trim();
      trackEditor(editor,item.translated_text);
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
    const seq=generation,request=++publicationSequence,detail=$("i18n-plan-detail"),dialog=$("i18n-plan-review-dialog");
    if(!detail||!dialog)return;
    $("i18n-plan-review-title").textContent=labelPlan(publications.find(p=>p.publication_ref===public_ref)||{});
    $("i18n-plan-review-status").textContent="";
    detail.replaceChildren(create("p","i18n-results-count","A consultar versão publicada…"));
    if(!dialog.open)dialog.showModal();
    dialog.scrollTop=0;
    try{
      const result=await send("/api/v2/admin/i18n/plans/fields?"+
        new URLSearchParams({publication_ref:public_ref}));
      if(seq!==generation||request!==publicationSequence||host.hidden)return;
      active=public_ref;activeFields=result.fields||[];
      detail.replaceChildren();
      $("i18n-plan-review-title").textContent=labelPlan(result.publication);
      $("i18n-plan-review-status").textContent="";
      // Historical approvals are never applied automatically across publications.
      // Present only unambiguous, hash-matched candidates for explicit review.
      let recovery=null;
      if((result.publication.statuses?.missing||0)>0){
        try{
          recovery=await send("/api/v2/admin/i18n/plans/recovery?"+
            new URLSearchParams({publication_ref:public_ref}));
        }catch(_){recovery=null;}
      }
      if(seq!==generation||request!==publicationSequence||host.hidden)return;
      if(recovery&&recovery.candidates?.length){
        const panel=create("section","i18n-plan-option");
        panel.append(create("h3","","Recuperar traduções já aprovadas"),
          create("p","i18n-plan-policy",
            "Correspondências de texto anteriormente aprovado, não novas aprovações. "+
            "Confirma cada tradução e o contexto da refeição. Notas e textos clínicos "+
            "exigem revisão individual. Não altera os planos nem valores nutricionais."));
        const choices=[];
        const list=create("div","i18n-plan-common-list");
        for(const suggestion of recovery.candidates){
          const label=create("label","i18n-plan-unique-row");
          const tick=create("input");tick.type="checkbox";
          const text=create("span","");
          text.append(create("strong","",suggestion.group+" · "+suggestion.field_label),
            create("span","",suggestion.source_text),
            create("span","",suggestion.translated_text));
          if(suggestion.sensitive)text.append(
            create("small","","Texto sensível: confirma instruções e contexto clínico."));
          label.append(tick,text);list.append(label);
          choices.push({tick,suggestion});
        }
        panel.append(list);
        const selectSafe=create("button","i18n-secondary",
          "Selecionar títulos e textos não sensíveis");
        selectSafe.type="button";
        const acknowledgement=create("label","i18n-bulk-attestation");
        const understood=create("input");understood.type="checkbox";
        acknowledgement.append(understood,
          create("span","","Revisei todas as traduções selecionadas e confirmei o contexto."));
        const apply=create("button","i18n-primary","Aprovar traduções selecionadas");
        apply.type="button";apply.disabled=true;
        const feedback=create("p","i18n-feedback");
        const update=()=>{
          apply.disabled=!understood.checked||!choices.some(c=>c.tick.checked);
        };
        selectSafe.onclick=()=>{
          for(const choice of choices)if(!choice.suggestion.sensitive)choice.tick.checked=true;
          understood.checked=false;update();
        };
        understood.addEventListener("change",update);
        for(const choice of choices)choice.tick.addEventListener("change",()=>{
          understood.checked=false;update();
        });
        apply.onclick=async()=>{
          if(apply.disabled||activeWrites)return;
          if(hasChanges(detail)){error(feedback,"Guarda primeiro os textos alterados antes de recuperar traduções.");return;}
          activeWrites++;
          const locked=[...detail.querySelectorAll("textarea, .tm-plan-translation-body button")].filter(el=>!el.disabled);
          for(const el of locked)el.disabled=true;
          apply.disabled=true;selectSafe.disabled=true;
          error(feedback,"");
          try{
            const rows=choices.filter(c=>c.tick.checked).map(c=>({
              field_path:c.suggestion.field_path,
              expected_source_hash:c.suggestion.expected_source_hash,
              expected_candidate_hash:c.suggestion.candidate_hash,
              reviewed:true
            }));
            if(!rows.length||rows.length>100)throw Error("Seleção inválida");
            const answer=await send("/api/v2/admin/i18n/plans/recovery/approve",
              "POST",{publication_ref:public_ref,rows,acknowledged:true});
            error(feedback,String(answer.approved||0)+" traduções aprovadas.");
            const updated=await send("/api/v2/admin/i18n/plans");
            publications=updated.items||[];
            renderList($("i18n-status")?.value||"all",$("i18n-search")?.value||"");
            await openPublication(public_ref);
          }catch(e){
            error(feedback,"A recuperação foi interrompida: "+e.message);
            selectSafe.disabled=false;update();
          }finally{activeWrites--;for(const el of locked)if(el.isConnected)el.disabled=false;}
        };
        panel.append(selectSafe,acknowledgement,apply,feedback);
        detail.append(panel);
      }
      if(recovery?.conflicts){
        detail.append(create("p","i18n-plan-policy",
          "Existem traduções anteriores divergentes. Esses campos exigem "+
          "revisão individual e não foram sugeridos para recuperação."));
      }
      const body=create("div","tm-plan-translation-body");
      detail.append(body);
      renderSharedReview({body,result,ref:public_ref,close:dialog.querySelector(".i18n-plan-detail-head button"),onSaved:fresh=>{
        const updated=fresh.publication;
        if(updated){publications=publications.map(p=>p.publication_ref===public_ref?{...p,...updated}:p);renderList($("i18n-status")?.value||"all",$("i18n-search")?.value||"");}
      }});
      dialog.scrollTop=0;
    }catch(e){
      if(seq===generation&&request===publicationSequence)detail.replaceChildren(
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
      "Textos idênticos agrupados para revisão, incluindo quantidades "+
      "de apresentação. Aprova até 100 ocorrências da mesma expressão. "+
      "Alternativas e suplementos exigem revisão privada.");
    const search=create("input","i18n-plan-common-search");
    search.type="search";
    search.placeholder="Pesquisar títulos, nomes, quantidades e notas…";
    search.setAttribute("aria-label","Pesquisar traduções comuns");
    const list=create("div","i18n-plan-common-list");
    const detail=create("div","i18n-plan-common-detail");
    let groups=[],approvalBusy=false;
    panel.append(header,intro,search,list,detail);
    const ackLabel=create("label","i18n-bulk-attestation");
    const ackCheck=create("input");ackCheck.type="checkbox";
    ackLabel.append(ackCheck,create("span","",
      "Confirmei a revisão das traduções que vou aprovar"));
    const bulkButton=create("button","i18n-primary","Aprovar em massa");
    bulkButton.type="button";bulkButton.disabled=true;
    const approvalPanel=create("section","i18n-plan-bulk-approval");
    const approvalHeading=create("strong","","Aprovação em massa");
    const approvalCount=create("p","i18n-plan-bulk-count");
    const approvalHint=create("p","i18n-plan-bulk-hint");
    approvalPanel.append(approvalHeading,approvalCount,ackLabel,bulkButton,approvalHint);
    const approvalFeedback=create("p","i18n-feedback");
    approvalPanel.append(approvalFeedback);
    panel.insertBefore(approvalPanel,search);
    const matchingGroups=()=>groups.filter(g=>{
      const term=search.value.trim().toLocaleLowerCase("pt-PT");
      return !term||[g.source_text,g.meal_context,g.field_kind].join(" ")
        .toLocaleLowerCase("pt-PT").includes(term);
    });
    const updateApprovalButtons=()=>{
      const ready=matchingGroups().filter(g=>g.csv_eligible&&g.imported_text&&
        (g.imported_status==="pending"||g.imported_status==="approved"));
      const count=ready.length,occurrences=ready.reduce((total,g)=>total+g.missing_count,0);
      bulkButton.disabled=approvalBusy||!ackCheck.checked||!count;
      bulkButton.textContent=approvalBusy?"A processar…":
        "Aprovar em massa · até "+Math.min(100,count)+" expressões";
      approvalCount.textContent=count?
        count+" expressões guardadas prontas para aprovação · "+
          occurrences+" ocorrências por traduzir":
        "Não existem traduções guardadas por aprovar neste filtro.";
      approvalHint.textContent=approvalBusy?"A aprovação está em curso.":
        !count?"Revê os textos individualmente.":
        !ackCheck.checked?
          "Assinala a confirmação acima para ativar o botão. "+
          "Cada expressão é aprovada em grupos de até 100 ocorrências.":
          "Pronto para aprovar. Cada expressão é aprovada em grupos de "+
          "até 100 ocorrências, com histórico de revisão.";
    };
    ackCheck.addEventListener("change",updateApprovalButtons);
    bulkButton.addEventListener("click",async()=>{
      if(approvalBusy||!ackCheck.checked)return;
      const queue=matchingGroups().filter(g=>g.csv_eligible&&g.imported_text&&
        (g.imported_status==="pending"||g.imported_status==="approved")).slice(0,100);
      if(!queue.length)return;
      approvalBusy=true;updateApprovalButtons();
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
          approvalFeedback.textContent="Aprovadas "+total+
            " ocorrências em "+count+" expressões…";
        }
        await refresh();
        approvalFeedback.textContent="Aprovadas "+total+" ocorrências de "+count+
          " expressões. Para grupos com mais de 100 ocorrências, confirma novo lote.";
      }catch(e){
        approvalFeedback.textContent="Aprovação interrompida após "+count+
          " expressões e "+total+" ocorrências: "+e.message+
          ". Os lotes anteriores ficaram aprovados; atualiza e revê o restante.";
        await refresh();
      }finally{
        ackCheck.checked=false;approvalBusy=false;updateApprovalButtons();
      }
    });
    const refresh=async()=>{
      const result=await send("/api/v2/admin/i18n/plans/common");
      if(seq!==generation||host.hidden)return;
      groups=result.items||[];
      showList();
              updateApprovalButtons();
    };
    const openGroup=item=>{
      detail.replaceChildren();
      const groupHead=create("div","i18n-plan-detail-head");
      groupHead.append(create("strong","",
        item.field_kind==="option_title"?"Título de opção":
        item.field_kind==="individual_note"?"Nota de consumo do plano":
        item.field_kind==="food_override"?"Apresentação alimentar personalizada":
        "Unidade de apresentação"),
        create("small","",item.missing_count+" ocorrências para aprovar"));
      const context=create("p","i18n-plan-policy",
        item.field_kind==="display_quantity"?
          "Quantidade apresentada · preserva os números e unidades originais":
        item.field_kind==="food_override"?
          "Nome genérico, sem informação de jogador. Revê a correspondência.":
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
      const initial=editor.value;
      const update=()=>{trackEditor(editor,initial);approve.disabled=busy||!check.checked||!editor.value.trim();};
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
              "Nota do plano · "+item.meal_context:
              item.field_kind==="food_override"?
              "Apresentação alimentar":"Unidade simples")+
            (item.missing_count>100?" · em grupos de 100":"")+
            (item.imported_status?" · Tradução "+(
              item.imported_status==="approved"?"revisto":"guardada por rever"):"")));
        row.addEventListener("click",()=>{if(canLeave(detail))openGroup(item);});
        list.append(row);
      }
    };
    search.addEventListener("input",()=>{showList();updateApprovalButtons();});
    try{await refresh();}
    catch(e){
      if(seq===generation)list.replaceChildren(
        create("p","i18n-feedback","Não foi possível carregar textos comuns: "+e.message));
    }
  };

  const load=async({csrfToken,status="all",query=""}={})=>{
    csrf=csrfToken||csrf;
    const seq=++generation;
    publicationSequence++;
    const previousDialog=$("i18n-plan-review-dialog");if(previousDialog?.open)previousDialog.close();
    host.replaceChildren();
    const section=(title,open=false)=>{
      const el=create("details","i18n-plan-manager-section");
      el.open=open;
      const header=create("summary","");
      header.append(create("span","",title),reviewIcon("chevron"));
      el.append(header);return el;
    };
    const planSection=section("Traduções dos planos",true);
    const commonSection=section("Textos comuns");
    const privateSection=section("Textos personalizados");
    const auditSection=section("Detalhes técnicos");
    const list=create("div","i18n-plan-list");list.id="i18n-plan-items";
    const dialog=create("dialog","tm-plan-translation-dialog i18n-manager-plan-dialog");dialog.id="i18n-plan-review-dialog";
    dialog.setAttribute("aria-labelledby","i18n-plan-review-title");
    const header=create("div","i18n-plan-detail-head");
    const heading=create("div","i18n-manager-plan-heading");
    const title=create("strong","","Plano publicado");title.id="i18n-plan-review-title";
    const statusLabel=create("small","");statusLabel.id="i18n-plan-review-status";
    heading.append(title,statusLabel);
    const close=create("button","i18n-quiet","Fechar");close.type="button";
    const detail=create("div","i18n-plan-detail");detail.id="i18n-plan-detail";
    const closeReview=()=>{if(canLeave(detail)){publicationSequence++;active=null;activeFields=[];dialog.close();detail.replaceChildren();}};
    close.onclick=closeReview;
    dialog.addEventListener("cancel",event=>{event.preventDefault();closeReview();});
    header.append(heading,close);dialog.append(header,detail);
    const auditPanel=create("div","i18n-plan-audit");
    const privatePanel=create("section","i18n-plan-private-queue");
    const commonPanel=create("section","i18n-plan-common");
    planSection.append(list);commonSection.append(commonPanel);privateSection.append(privatePanel);auditSection.append(auditPanel);
    host.append(planSection,commonSection,privateSection,auditSection,dialog);
    const renderPrivateQueue=audit=>{
      privatePanel.replaceChildren();
      const counts=audit?.coverage_by_kind||{};
      const kinds=["alternative_override","supplement_label"];
      const count=kinds.reduce((sum,kind)=>sum+
        Number(counts[kind]?.missing||0)+Number(counts[kind]?.pending||0)+
        Number(counts[kind]?.outdated||0),0);
      const head=create("div","i18n-plan-detail-head");
      head.append(create("strong","","Alternativas e suplementos"));
      const open=create("button","i18n-secondary",
        count?"Rever "+count+" textos":"Revisão concluída");
      open.type="button";open.disabled=!count;
      head.append(open);
      const message=create("p","i18n-plan-policy",count?"Revisão individual dos textos personalizados.":"Sem textos personalizados pendentes.");
      const statusMessage=create("p","i18n-feedback");
      statusMessage.setAttribute("role","status");
      const rows=create("div","i18n-plan-private-list");
      privatePanel.append(head,message,statusMessage,rows);
      open.addEventListener("click",async()=>{
        if(open.disabled||!canLeave(rows))return;
        open.disabled=true;
        rows.replaceChildren();
        statusMessage.textContent="A consultar apenas os planos com campos pendentes…";
        const relevant=publications.filter(p=>
          ["missing","pending","outdated"].some(kind=>
            Number(p.statuses?.[kind]||0)>0));
        let found=0,errors=0;
        for(const publication of relevant){
          if(seq!==generation||host.hidden)return;
          try{
            const url="/api/v2/admin/i18n/plans/fields?"+
              new URLSearchParams({publication_ref:publication.publication_ref});
            const result=await send(url);
            if(seq!==generation||host.hidden)return;
            const items=(result.fields||[]).filter(f=>
              kinds.includes(f.field_kind)&&f.status!=="approved");
            if(!items.length)continue;
            const section=create("section","i18n-plan-private-publication");
            const title=create("strong","",labelPlan(result.publication));
            const label=create("small","",items.length+" textos a rever");
            const groupHead=create("div","i18n-plan-detail-head");
            groupHead.append(title,label);
            section.append(groupHead);
            for(const field of items){
              section.append(renderField(field,publication.publication_ref));
              found++;
            }
            rows.append(section);
          }catch(e){
            errors++;
            statusMessage.textContent="Não foi possível consultar "+
              errors+" plano(s). Reabre a revisão para tentar novamente.";
          }
        }
        if(seq!==generation||host.hidden)return;
        if(!found){
          rows.append(create("p","i18n-results-count",
            errors?"Revisão incompleta. Volta a tentar após atualizar a página.":
              "Não existem alternativas ou suplementos por rever. "+
              "Atualiza o diagnóstico para confirmar a cobertura."));
        }
        if(!errors)statusMessage.textContent=found+
          " campos disponíveis para revisão privada. "+
          "Depois de aprovar, utiliza «Atualizar diagnóstico» "+
          "e «Abrir revisão privada» para atualizar esta lista.";
        open.disabled=false;
      });
    };
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
          if(reload.disabled||!canLeave(privatePanel))return;
          reload.disabled=true;feedback.textContent="A atualizar…";
          try{
            const fresh=await send("/api/v2/admin/i18n/plans");
            if(seq!==generation||host.hidden)return;
            publications=fresh.items||[];
            renderAudit(fresh.reuse_audit);
            renderPrivateQueue(fresh.reuse_audit);
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
      renderPrivateQueue(result.reuse_audit);
      renderList(status,query);
      await renderCommon(commonPanel);
    }catch(e){
      if(seq===generation)list.replaceChildren(
        create("p","i18n-feedback","Não foi possível consultar publicações: "+e.message));
    }
  };
  // Reuse the existing field renderer and version-bound translation endpoints.
  const reviewIcon=(kind)=>{
    const ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");
    for(const [k,v] of Object.entries({viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor","stroke-width":"1.8","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"}))svg.setAttribute(k,v);
    const path=document.createElementNS(ns,"path");
    path.setAttribute("d",kind==="check"?"M5 12l4 4L19 6":"m6 9 6 6 6-6");
    svg.append(path);return svg;
  };
  const renderSharedReview=({body,result,ref,close,onSaved})=>{
    const entries=[];
    const summary=create("div","tm-plan-review-summary");
    const count=create("small","");
    summary.append(create("span","","Português / English"),count);
    body.append(summary);
    const footer=create("div","tm-plan-review-footer");
    const feedback=create("small","i18n-feedback");
    const save=create("button","i18n-primary","Guardar e aprovar");
    save.type="button";
    footer.append(feedback,save);
    let busy=false;
    const selected=()=>entries.filter(e=>e.input.value.trim()&&(e.input.value.trim()!==(e.field.translated_text||"").trim()||e.selected));
    const refresh=()=>{
      count.textContent=entries.filter(e=>e.field.status==="approved").length+" de "+entries.length+" aprovadas";
      save.disabled=busy||!selected().length||selected().length>100;
      for(const e of entries){
        const modified=e.input.value.trim()!==(e.field.translated_text||"").trim();
        const approved=!modified&&!e.selected&&e.field.status==="approved";
        e.state.replaceChildren(approved?reviewIcon("check"):document.createTextNode(modified?"Por guardar":e.selected?"Por aprovar":states[e.field.status]||""));
        e.state.setAttribute("aria-label",approved?"Aprovada":e.state.textContent);
        e.state.dataset.status=modified||e.selected?"pending":e.field.status;
        e.input.disabled=busy;
        e.input.dataset.tmDirty=String(Number(modified||e.selected));
        if(e.pick){e.pick.disabled=busy;e.pick.hidden=modified||e.field.status==="approved"||!e.input.value.trim();}
      }
    };
    let groupName=null,group=null;
    for(const field of result.fields||[]){
      if(field.group!==groupName||!group){
        groupName=field.group;
        group=create("details","tm-plan-review-group");
        group.open=!entries.length;
        const groupHeader=create("summary","");
        groupHeader.append(create("span","",groupName||"Textos do plano"),reviewIcon("chevron"));
        group.append(groupHeader);
        body.append(group);
      }
      const row=create("article","i18n-plan-field tm-plan-review-row");
      const top=create("div","i18n-plan-field-head");
      const state=create("small","i18n-plan-field-state");
      top.append(create("strong","",field.field_label),state);
      const cols=create("div","i18n-plan-compare");
      const pt=create("div","i18n-plan-pt");
      pt.append(create("p","",field.source_text));
      const input=create("textarea","");
      input.rows=field.source_text.length>120?3:1;
      input.maxLength=10000;
      input.value=field.translated_text||"";
      input.setAttribute("aria-label","English · "+field.field_label);
      const en=create("div","i18n-plan-en");
      en.append(input);
      cols.append(pt,en);
      row.append(top,cols);
      const entry={field,input,state,selected:false,pick:null};
      const pick=create("button","i18n-quiet","Selecionar para aprovação");
      pick.type="button";entry.pick=pick;
      pick.onclick=()=>{if(busy||activeWrites)return;entry.selected=!entry.selected;pick.textContent=entry.selected?"Retirar seleção":"Selecionar para aprovação";refresh();};
      row.append(pick);
      if(field.suggestion&&field.status==="missing"){
        const use=create("button","i18n-quiet","Usar sugestão");
        use.type="button";use.onclick=()=>{if(busy||activeWrites)return;input.value=field.suggestion.text;refresh();};
        row.append(use);
      }
      input.addEventListener("input",()=>{entry.selected=false;pick.textContent="Selecionar para aprovação";refresh();});
      entries.push(entry);group.append(row);
    }
    body.append(footer);

    save.onclick=async()=>{
      if(busy||activeWrites||!selected().length)return;
      const pending=selected();
      if(pending.length>100)return;
      busy=true;activeWrites++;refresh();close.disabled=true;feedback.textContent="";
      try{
        await send("/api/v2/admin/i18n/plans/save-approved","POST",{publication_ref:ref,rows:pending.map(e=>({
          field_path:e.field.field_path,expected_source_hash:e.field.source_hash,
          expected_candidate_hash:e.field.candidate_hash,expected_status:e.field.status,
          translated_text:e.input.value.trim()
        }))});
        const fresh=await send("/api/v2/admin/i18n/plans/fields?"+new URLSearchParams({publication_ref:ref}));
        for(const e of pending){
          const next=fresh.fields.find(f=>f.field_path===e.field.field_path);
          if(!next)throw Error("Campo indisponível");
          Object.assign(e.field,next);e.input.value=next.translated_text||"";e.selected=false;
        }
        feedback.textContent="Traduções guardadas e aprovadas.";
        onSaved?.(fresh);
      }catch(e){feedback.textContent="Não foi possível concluir: "+e.message;}
      finally{activeWrites--;busy=false;close.disabled=false;refresh();}
    };
    refresh();
    if(!entries.length)body.insertBefore(create("p","i18n-plan-policy","Não existem textos específicos para tradução neste plano."),footer);
  };
  const openDraft=async(draftId)=>{
    if(document.getElementById("tm-plan-translation-dialog"))return;
    const dialog=create("dialog","tm-admin-translations-page tm-plan-translation-dialog");
    dialog.id="tm-plan-translation-dialog";
    dialog.setAttribute("aria-labelledby","tm-plan-translation-title");
    const heading=create("div","i18n-plan-detail-head");
    const title=create("strong","","Plano publicado");
    title.id="tm-plan-translation-title";
    const close=create("button","i18n-quiet","Fechar");
    close.type="button";close.onclick=()=>{if(canLeave(dialog))dialog.close();};
    dialog.addEventListener("cancel",event=>{if(!canLeave(dialog))event.preventDefault();});
    heading.append(title,close);
    const body=create("div","tm-plan-translation-body");
    body.append(create("p","i18n-plan-policy","A consultar versão publicada…"));
    dialog.append(heading,body);
    dialog.addEventListener("close",()=>dialog.remove(),{once:true});
    document.body.append(dialog);
    dialog.showModal();
    try{
      const session=await send("/api/me");
      if(session?.user?.role!=="admin"||!session.csrf)throw Error("acesso_restrito");
      csrf=session.csrf;
      const result=await send("/api/v2/admin/i18n/plans/fields?"+
        new URLSearchParams({draft_id:draftId}));
      if(!dialog.open||!dialog.isConnected)return;
      const ref=result.publication?.publication_ref;
      if(!/^[a-f0-9]{64}$/.test(ref||""))throw Error("versão indisponível");
      title.textContent=labelPlan(result.publication);
      body.replaceChildren();
      renderSharedReview({body,result,ref,close});
    }catch(e){
      if(dialog.open&&dialog.isConnected)body.replaceChildren(
        create("p","i18n-feedback",e.message==="plan_publication_not_found"?
          "Este plano ainda não tem uma versão publicada para rever.":
          "Não foi possível consultar a versão publicada: "+e.message));
    }
  };
  window.tmI18nPlans={load,hide,openDraft,canLeave,hasChanges};
})();
