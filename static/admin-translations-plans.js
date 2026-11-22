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
    cols.append(pt,en);
    const actions=create("div","i18n-plan-field-actions");
    const save=create("button","i18n-secondary","Guardar proposta");
    save.type="button";
    const reviewed=create("label","i18n-bulk-attestation");
    const checked=create("input");checked.type="checkbox";
    reviewed.append(checked,create("span","","Revisei esta tradução"));
    const approve=create("button","i18n-primary","Aprovar");
    approve.type="button";
    const feedback=create("p","i18n-feedback");
    const notice=item.sensitive?create("p","i18n-plan-sensitive",
      "Texto individual ou clínico: revisão profissional obrigatória. Não exportar."):null;
    const updateButtons=()=>{
      const modified=editor.value.trim()!==(item.translated_text||"").trim();
      save.disabled=!editor.value.trim()||!modified||loading;
      approve.disabled=item.status!=="pending"||modified||!checked.checked||loading;
    };
    editor.addEventListener("input",()=>{checked.checked=false;updateButtons();});
    checked.addEventListener("change",updateButtons);
    save.addEventListener("click",async()=>{
      save.disabled=true;approve.disabled=true;
      error(feedback,"");
      try{
        await send("/api/v2/admin/i18n/plans/propose","POST",{
          publication_ref:public_ref,field_path:item.field_path,
          expected_source_hash:item.source_hash,translated_text:editor.value.trim()
        });
        await refreshField(public_ref,item.field_path,item,state);
        checked.checked=false;error(feedback,"Proposta guardada. Falta aprovação.");
      }catch(e){error(feedback,"Não foi possível guardar: "+e.message);}
      finally{updateButtons();}
    });
    approve.addEventListener("click",async()=>{
      approve.disabled=true;save.disabled=true;
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
      finally{updateButtons();}
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
  const load=async({csrfToken,status="all",query=""}={})=>{
    csrf=csrfToken||csrf;
    const seq=++generation;
    host.replaceChildren();
    const head=create("div","i18n-plan-detail-head");
    head.append(create("strong","","Planos publicados · revisão por versão"));
    const intro=create("p","i18n-plan-policy",
      "Os alimentos aprovados são reutilizados por referência. "+
      "Aqui revês apenas textos específicos dos planos publicados. "+
      "O nome do jogador é apresentado apenas na sessão privada do administrador.");
    const list=create("div","i18n-plan-list");list.id="i18n-plan-items";
    const detail=create("div","i18n-plan-detail");detail.id="i18n-plan-detail";
    host.append(head,intro,list,detail);
    try{
      const result=await send("/api/v2/admin/i18n/plans");
      if(seq!==generation||host.hidden)return;
      publications=result.items||[];
      renderList(status,query);
    }catch(e){
      if(seq===generation)list.replaceChildren(
        create("p","i18n-feedback","Não foi possível consultar publicações: "+e.message));
    }
  };
  window.tmI18nPlans={load,hide};
})();
