"use strict";
/* Isolated, feature-gated Backoffice i18n review UI.
   Does not modify the existing library or plan components. */
(()=>{
 try{
   document.documentElement.dataset.adminTheme =
     localStorage.getItem("tm-admin-theme")==="light"?"light":"dark";
 }catch(_){document.documentElement.dataset.adminTheme="dark";}
 const $=id=>document.getElementById(id);
 const translations={
   missing:"Por traduzir",legacy_review:"Inglês existente · por rever",
   pending:"Por rever",approved:"Aprovada",outdated:"Desatualizada",
   original:"Original português",mixed:"Vários estados"
 };
 const displayKind={
   food:"Alimentos",dish:"Pratos",recipe:"Receitas",
   recipe_category:"Categorias",supplement:"Suplementação"
 };
 const startKind=new URLSearchParams(window.location.search).get("entity_kind");
 let catalogRequestSeq=0;
 let csrf="",state={suggestionsEnabled:false,kind:(Object.prototype.hasOwnProperty.call(displayKind,startKind)?startKind:"food"),status:"all",query:"",page:1,pageSize:25,selected:null,
                     row:null,edited:false,busy:false,legacy:""};
 const create=(tag,className,txt)=>{
   const el=document.createElement(tag);
   if(className)el.className=className;
   if(txt!==undefined)el.textContent=String(txt);
   return el;
 };
 const msg=(message,error=false,target="i18n-feedback")=>{
   $(target).textContent=message||"";
   $(target).dataset.error=error?"1":"0";
 };
 const send=async(path,{method="GET",body}={})=>{
   const options={method,credentials:"same-origin",headers:{"Accept":"application/json"}};
   if(body!==undefined){
     options.headers["Content-Type"]="application/json";
     options.headers["X-CSRF-Token"]=csrf;
     options.body=JSON.stringify(body);
   }
   const response=await fetch(path,options);
   let data;
   try{data=await response.json();}catch(_){data={};}
   if(!response.ok)throw Error(data.error||"http_"+response.status);
   return data;
 };
 const queryString=(data)=>new URLSearchParams(Object.entries(data)
   .filter(([key,val])=>val!==undefined&&val!==null&&val!=="")).toString();
 const badge=(status)=>create("span","i18n-status-pill",translations[status]||status);
 const suggestibleField=(key)=>!!key&&
   (key.entity_kind==="food"&&key.field_path==="display_name"||
    key.entity_kind==="dish"&&key.field_path==="name_pt"||
    key.entity_kind==="recipe_category"&&key.field_path==="name"||
    key.entity_kind==="supplement"&&key.field_path==="name"||
    key.entity_kind==="recipe"&&key.field_path!=="notes");
 const canSuggest=()=>state.suggestionsEnabled&&state.row&&!state.edited&&!state.row.candidate&&
   !state.legacy&&!state.busy&&suggestibleField(state.selected);
 const updateSuggestionAction=()=>{
   const button=$("i18n-suggest");
   button.hidden=!canSuggest();
   button.disabled=state.busy;
 };
 const stats=(summary)=>{
   const container=$("i18n-stats");container.replaceChildren();
   for(const [key,label] of [
     ["missing","Por traduzir"],["legacy_review","Inglês existente"],
     ["pending","Por rever"],["approved","Aprovadas"],["outdated","Desatualizadas"]
   ]){
     const card=create("div","i18n-stat");
     card.append(create("strong","",summary.statuses[key]||0),
                 create("span","",label));
     container.append(card);
   }
   container.hidden=false;
   const lib=$("i18n-libraries");lib.replaceChildren();
   for(const group of summary.libraries){
     const button=create(group.integrated?"button":"div","i18n-library");
     if(group.integrated){
       button.type="button";
       button.addEventListener("click",()=>{
         state.kind=group.kind;state.status="all";state.query="";state.page=1;
         $("i18n-status").value="all";$("i18n-search").value="";
         loadCatalog();
         $("i18n-work-panel").scrollIntoView({behavior:"smooth",block:"start"});
       });
     }
     button.append(create("strong","",group.label));
     button.append(create("span","",group.record_count===null?
       "Estrutura ainda não disponível":group.record_count+" registos"));
     if(group.integrated){
       button.append(create("small","",
         group.field_count+" textos visíveis · "+
         group.statuses.approved+" aprovados · "+
         group.statuses.legacy_review+" traduções antigas por rever"));
     }else{
       button.append(create("small","","Inventário inicial · Tradução ainda não integrada"));
     }
     lib.append(button);
   }
   $("i18n-library-panel").hidden=false;
 };
 const buildTabs=()=>{
   const tabs=$("i18n-tabs");tabs.replaceChildren();
   for(const [key,label] of Object.entries(displayKind)){
     const b=create("button","",label);b.type="button";
     b.setAttribute("aria-pressed",String(state.kind===key));
     b.addEventListener("click",()=>{
       if(state.kind===key)return;
       state.kind=key;state.page=1;state.status="all";state.query="";
       $("i18n-status").value="all";$("i18n-search").value="";
       closeReview();loadCatalog();
     });tabs.append(b);
   }
   $("i18n-library-link").href=state.kind==="food"?"/?nav=food-library":
     state.kind==="dish"?"/?nav=dishes":
     state.kind==="supplement"?"/?nav=supplements":"/?nav=recipes";
 };
 const loadCatalog=async()=>{
   const currentRequest=++catalogRequestSeq;
   buildTabs();msg("A carregar conteúdos…");$("i18n-work-panel").hidden=false;
   try{
     const params=queryString({
       entity_kind:state.kind,status:state.status,query:state.query,
       page:state.page,page_size:state.pageSize
     });
     const result=await send("/api/v2/admin/i18n/catalog?"+params);
     if(currentRequest!==catalogRequestSeq)return;
     const list=$("i18n-results");list.replaceChildren();
     $("i18n-results-count").textContent=result.total+" registos encontrados";
     if(!result.items.length){
       list.append(create("p","i18n-results-count","Não existem conteúdos para estes filtros."));
     }
     for(const entry of result.items){
       const b=create("button","i18n-result");b.type="button";
       const main=create("span","");
       const count=entry.fields?.length||1;
       main.append(create("strong","",entry.source_text),
         create("small","",entry.category+" · "+count+
           (count===1?" texto visível":" textos visíveis")));
       const fieldStates=new Set((entry.fields||[]).map(field=>field.state));
       const displayedState=state.status!=="all" ? state.status :
         (fieldStates.size>1 ? "mixed" : entry.state);
       b.append(main,badge(displayedState),create("span","i18n-result-arrow","›"));
       b.addEventListener("click",()=>openReview(entry));
       list.append(b);
     }
     const pages=Math.max(1,Math.ceil(result.total/state.pageSize));
     $("i18n-page-indicator").textContent="Página "+state.page+" / "+pages;
     $("i18n-prev").disabled=state.page<=1;
     $("i18n-next").disabled=state.page>=pages;
     msg("");
   }catch(error){if(currentRequest===catalogRequestSeq)
     msg("Não foi possível consultar o inventário: "+error.message,true);}
 };
 const loadOverview=async()=>{
   const summary=await send("/api/v2/admin/i18n/overview");
   state.suggestionsEnabled=summary.suggestions_enabled===true;
   stats(summary);
   updateSuggestionAction();
 };
 const closeReview=()=>{
   state.selected=null;state.row=null;state.edited=false;state.legacy="";
   $("i18n-fields").replaceChildren();
   $("i18n-review").hidden=true;
   $("i18n-history-panel").open=false;
   updateSuggestionAction();
 };
 const openReview=async(entry)=>{
   const fields=Array.isArray(entry.fields)&&entry.fields.length?entry.fields:[entry];
   const primary=fields.find(f=>state.status==="all"||f.state===state.status)||fields[0];
   const chooseField=(field)=>{
     if(!field)return;
     state.selected={...entry,field_path:field.field_path};
     state.legacy=field.legacy_candidate||"";
     state.row=null;state.edited=false;
     updateSuggestionAction();
     $("i18n-review-title").textContent=entry.source_text;
     $("i18n-existing").hidden=!state.legacy;
     msg("",false,"i18n-review-feedback");
     refreshDetail();
   };
   const select=$("i18n-fields");select.replaceChildren();
   for(const field of fields){
     const option=document.createElement("option");
     option.value=field.field_path;
     option.textContent=field.field_label||field.field_path;
     select.append(option);
   }
   select.value=primary.field_path;
   select.onchange=()=>chooseField(fields.find(f=>f.field_path===select.value));
   $("i18n-review").hidden=false;
   chooseField(primary);
   $("i18n-review").scrollIntoView({behavior:"smooth",block:"start"});
 };
 const refreshDetail=async()=>{
   if(!state.selected)return;
   const key=state.selected;
   try{
     const q=queryString({
       entity_kind:key.entity_kind,entity_id:key.entity_id,
       field_path:key.field_path
     });
     const detail=await send("/api/v2/admin/i18n?"+q);
     // Keep selection only if it still refers to the current record.
     if(!state.selected || state.selected.entity_id!==key.entity_id ||
       state.selected.field_path!==key.field_path)return;
     state.row=detail;
     state.edited=false;
     $("i18n-source-text").textContent=detail.source_text;
     // Present legacy dish EN text immediately, without approving it.
     $("i18n-target-text").value=detail.candidate?.text||state.legacy||"";
     const stateLabel=detail.candidate ?
       (translations[detail.candidate.status]||detail.candidate.status) :
       (state.legacy?"Inglês existente na biblioteca · por rever":"Ainda sem tradução");
     $("i18n-translation-state").textContent=stateLabel;
     $("i18n-approve").disabled=!detail.candidate||
       detail.candidate.status!=="pending";
     $("i18n-propose").disabled=false;
     updateSuggestionAction();
     const history=await send("/api/v2/admin/i18n/history?"+q+"&limit=25");
     const panel=$("i18n-history");panel.replaceChildren();
     if(!history.history.length)panel.append(create("p","","Sem revisões anteriores."));
     for(const record of history.history){
       const wrap=create("div","i18n-history-entry");
       const timestamp=Number(record.created_at);
       const moment=Number.isFinite(timestamp)?new Date(timestamp/1e6).toLocaleString("pt-PT"):"";
       wrap.append(create("strong","",
         (record.action==="approved"?"Aprovado":"Proposto")+" · "+moment),
         create("p","",record.translated_text));
       panel.append(wrap);
     }
   }catch(error){msg("Não foi possível abrir a tradução: "+error.message,true,"i18n-review-feedback");}
 };
 const updateAfterWrite=async()=>{
   await Promise.all([loadOverview(),loadCatalog()]);
   await refreshDetail();
 };
 const suggest=async()=>{
   if(!canSuggest())return;
   const key={...state.selected},current=state.row;
   state.busy=true;updateSuggestionAction();
   msg("A gerar uma sugestão…",false,"i18n-review-feedback");
   try{
     const response=await send("/api/v2/admin/i18n/suggest",{
       method:"POST",body:{
         entity_kind:key.entity_kind,entity_id:key.entity_id,
         field_path:key.field_path,language:"en",
         expected_source_hash:current.source_hash
       }
     });
     if(!state.selected||!state.row||
        state.selected.entity_id!==key.entity_id||
        state.selected.entity_kind!==key.entity_kind||
        state.selected.field_path!==key.field_path||
        state.row.source_hash!==current.source_hash)return;
     $("i18n-target-text").value=response.suggestion||"";
     state.edited=true;
     $("i18n-approve").disabled=true;
     msg("Sugestão inserida para revisão. Ainda não foi guardada nem aprovada.",
         false,"i18n-review-feedback");
   }catch(error){
     if(state.selected&&state.selected.entity_id===key.entity_id&&
        state.selected.field_path===key.field_path)
       msg("Não foi possível gerar sugestão: "+error.message,true,"i18n-review-feedback");
   }finally{state.busy=false;updateSuggestionAction();}
 };
 const write=async(kind)=>{
   if(state.busy||!state.row||!state.selected)return;
   const current=state.row,key=state.selected;
   let url,body;
   if(kind==="propose"){
     const text=$("i18n-target-text").value.trim();
     if(!text){msg("Escreve a tradução inglesa antes de guardar.",true,"i18n-review-feedback");return;}
     url="/api/v2/admin/i18n/propose";
     body={entity_kind:key.entity_kind,entity_id:key.entity_id,
       field_path:key.field_path,language:"en",
       expected_source_hash:current.source_hash,translated_text:text};
   }else{
     if(state.edited){msg("Guarda primeiro o texto alterado para ser revisto.",true,"i18n-review-feedback");return;}
     if(!current.candidate||current.candidate.status!=="pending")return;
     url="/api/v2/admin/i18n/approve";
     body={entity_kind:key.entity_kind,entity_id:key.entity_id,
       field_path:key.field_path,language:"en",
       expected_source_hash:current.source_hash,
       expected_candidate_hash:current.candidate.candidate_hash};
   }
   state.busy=true;$("i18n-propose").disabled=true;$("i18n-approve").disabled=true;
   try{
     await send(url,{method:"POST",body});
     msg(kind==="propose"?"Proposta guardada. Necessita de aprovação.":"Tradução aprovada.",
         false,"i18n-review-feedback");
     await updateAfterWrite();
   }catch(error){
     msg("A alteração não foi aplicada: "+error.message,true,"i18n-review-feedback");
     await refreshDetail();
   }finally{state.busy=false;$("i18n-propose").disabled=false;}
 };
 const init=async()=>{
   $("i18n-close").addEventListener("click",closeReview);
   $("i18n-status").addEventListener("change",event=>{
     state.status=event.target.value;state.page=1;loadCatalog();
   });
   $("i18n-search").addEventListener("input",event=>{
     state.query=event.target.value;state.page=1;
     clearTimeout(init.searchTimer);
     init.searchTimer=setTimeout(loadCatalog,220);
   });
   $("i18n-prev").addEventListener("click",()=>{state.page--;loadCatalog();});
   $("i18n-next").addEventListener("click",()=>{state.page++;loadCatalog();});
   $("i18n-target-text").addEventListener("input",()=>{
     state.edited=true;$("i18n-approve").disabled=true;updateSuggestionAction();
   });
   $("i18n-suggest").addEventListener("click",suggest);
   $("i18n-propose").addEventListener("click",()=>write("propose"));
   $("i18n-approve").addEventListener("click",()=>write("approve"));
   try{
     const session=await send("/api/me");
     if(session?.user?.role!=="admin")throw Error("acesso_restrito");
     csrf=session.csrf||"";
     await loadOverview();await loadCatalog();
   }catch(error){
     msg("Não foi possível abrir a gestão de traduções: "+error.message+
         ". Confirma a sessão de administrador e a ativação segura do módulo.",true);
   }
 };
 init();
})();
