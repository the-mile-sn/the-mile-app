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
      "Texto individual ou clínico: revisão profissional obrigatória. Não exportar."):null;
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
      "Notas individuais, alternativas e textos clínicos ficam de fora.");
    const search=create("input","i18n-plan-common-search");
    search.type="search";
    search.placeholder="Pesquisar títulos e unidades…";
    search.setAttribute("aria-label","Pesquisar traduções comuns");
    const list=create("div","i18n-plan-common-list");
    const detail=create("div","i18n-plan-common-detail");
    panel.append(header,intro,search,list,detail);
    let groups=[];
    const refresh=async()=>{
      const result=await send("/api/v2/admin/i18n/plans/common");
      if(seq!==generation||host.hidden)return;
      groups=result.items||[];
      showList();
    };
    const openGroup=item=>{
      detail.replaceChildren();
      const groupHead=create("div","i18n-plan-detail-head");
      groupHead.append(create("strong","",
        item.field_kind==="option_title"?"Título de opção":"Unidade de apresentação"),
        create("small","",item.missing_count+" ocorrências para aprovar"));
      const context=create("p","i18n-plan-policy",item.field_kind==="option_title"?
        "Contexto: "+item.meal_context:"Apenas expressões de unidade inequívocas");
      const cols=create("div","i18n-plan-compare");
      const pt=create("div","i18n-plan-pt");
      pt.append(create("small","","Português · original"),
                create("p","",item.source_text));
      const en=create("label","i18n-plan-en");
      en.append(create("small","","English · tradução revista"));
      const editor=create("textarea","");
      editor.rows=3;
      editor.maxLength=10000;
      editor.value=item.suggestion?.text||"";
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
              "Título · "+item.meal_context:"Unidade simples")+
            (item.missing_count>100?" · em grupos de 100":"")));
        row.addEventListener("click",()=>openGroup(item));
        list.append(row);
      }
    };
    search.addEventListener("input",showList);
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
      const audit=result.reuse_audit;
      if(audit){
        auditPanel.append(create("strong","","Diagnóstico de reutilização — dados agregados"));
        const stats=create("div","i18n-plan-audit-grid");
        const numbers=[
          ["Textos próprios",audit.visible_text_fields],
          ["Títulos repetidos",audit.repeated_option_title_occurrences],
          ["Alimentos com inglês aprovado",audit.approved_library_food_references],
          ["Alternativas personalizadas",audit.alternative_overrides],
          ["Notas individuais",audit.individual_notes],
          ["Sugestões de unidades",audit.simple_unit_suggestions]
        ];
        for(const [label,count] of numbers){
          const tile=create("div","i18n-plan-audit-stat");
          tile.append(create("strong","",Number(count||0).toLocaleString("pt-PT")),
                      create("small","",label));
          stats.append(tile);
        }
        auditPanel.append(stats,create("p","",
          "Os números não incluem nomes de jogadores nem textos clínicos. "+
          "As alternativas não são associadas automaticamente a alimentos. "+
          "Nenhuma sugestão é guardada ou aprovada sem revisão."));
      }
      renderList(status,query);
      await renderCommon(commonPanel);
    }catch(e){
      if(seq===generation)list.replaceChildren(
        create("p","i18n-feedback","Não foi possível consultar publicações: "+e.message));
    }
  };
  window.tmI18nPlans={load,hide};
})();
