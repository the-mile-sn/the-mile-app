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
   recipe_category:"Categorias",supplement:"Suplementação",plan:"Planos"
 };
 const embedded=!!document.getElementById("tm-admin-translations-page");
 const startKind=new URLSearchParams(window.location.search).get("entity_kind");
 let catalogRequestSeq=0;
 let csrf="",state={kind:(Object.prototype.hasOwnProperty.call(displayKind,startKind)?startKind:"food"),status:"all",query:"",page:1,pageSize:25,selected:null,
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
 const badge=(status)=>{
   const pill=create("span","i18n-status-pill",translations[status]||status);
   pill.dataset.state=status;
   return pill;
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
     const button=create(group.integrated||group.kind==="plan"?"button":"div","i18n-library");
     if(group.integrated||group.kind==="plan"){
       button.type="button";
       button.dataset.kind=group.kind;
       button.setAttribute("aria-pressed",String(group.kind===state.kind));
       button.addEventListener("click",()=>{
         state.kind=group.kind;state.status="all";state.query="";state.page=1;
         resetStatusPicker();$("i18n-search").value="";
         closeReview();resetBulk();loadCatalog();
         (state.kind==="plan"?$("i18n-plan-stage"):$("i18n-work-panel")).scrollIntoView({behavior:"smooth",block:"start"});
       });
     }
     button.append(create("strong","",group.label));
     button.append(create("span","",group.record_count===null?
       "Sem registos":group.record_count+" registos"+
         ""));
     lib.append(button);
   }
   $("i18n-library-panel").hidden=false;
 };
 const resetStatusPicker=()=>{
   $("i18n-status").value="all";
   // The Mile Select observes native change and retains the original select
   // as the source of truth; the handler below avoids redundant API calls.
   $("i18n-status").dispatchEvent(new Event("change",{bubbles:true}));
 };
 const buildTabs=()=>{
   const tabs=$("i18n-tabs");tabs.replaceChildren();
   for(const card of $("i18n-libraries").querySelectorAll("button.i18n-library")){
     card.setAttribute("aria-pressed",String(card.dataset.kind===state.kind));
   }
   for(const [key,label] of Object.entries(displayKind)){
     const b=create("button","",label);b.type="button";
     b.setAttribute("aria-pressed",String(state.kind===key));
     b.addEventListener("click",()=>{
       if(state.kind===key)return;
       state.kind=key;state.page=1;state.status="all";state.query="";
       resetStatusPicker();$("i18n-search").value="";
       closeReview();resetBulk();loadCatalog();
     });tabs.append(b);
   }
   $("i18n-library-link").dataset.libraryKind=state.kind;
   $("i18n-library-link").textContent=state.kind==="plan"?"Abrir Planos":"Abrir biblioteca";
 };
 let bulkRows=[],bulkSelected=new Set(),bulkBusy=false,bulkSeq=0,bulkKind=null;
 const bulkEntryRows=()=>[...$("i18n-bulk-items").querySelectorAll(".i18n-bulk-row")];
 const updateBulkActions=()=>{
   const count=bulkSelected.size;
   $("i18n-bulk-select-100").disabled=bulkBusy||
     !bulkEntryRows().some(row=>!row.hidden&&
       !bulkSelected.has(Number(row.dataset.index)));
   $("i18n-bulk-select-all").checked=bulkRows.length>0&&count===bulkRows.length;
   $("i18n-bulk-select-all").indeterminate=count>0&&count<bulkRows.length;
   $("i18n-bulk-submit").textContent="Aprovar "+count+" selecionada"+(count===1?"":"s");
   $("i18n-bulk-submit").disabled=bulkBusy||!count||!$("i18n-bulk-reviewed").checked;
   const label=bulkKind==="recipe"?"textos de receitas":
     bulkKind==="supplement"?"textos de suplementos":
     bulkKind==="dish"?"traduções":"propostas";
   $("i18n-bulk-summary").textContent=bulkRows.length+" "+label+
     " por rever · "+count+" selecionadas";
 };
 const resetBulk=()=>{
   bulkSeq++;
   if(bulkBusy)return;
   bulkRows=[];bulkSelected.clear();bulkKind=null;
   $("i18n-bulk-select-100").disabled=true;
   $("i18n-bulk-review").hidden=true;
   $("i18n-bulk-items").replaceChildren();
   $("i18n-bulk-select-all").checked=false;
   $("i18n-bulk-reviewed").checked=false;
   $("i18n-bulk-filter").value="";
   msg("",false,"i18n-bulk-feedback");
 };
 const openBulk=async()=>{
   if(bulkBusy||!["food","dish","recipe","supplement"].includes(state.kind))return;
   resetBulk();
   const kind=state.kind;
   const noun=kind==="food"?"alimentos":kind==="dish"?"pratos":
     kind==="recipe"?"receitas":"suplementos";
   const request=++bulkSeq;
   $("i18n-bulk-open").disabled=true;
   msg("A preparar revisão das traduções de "+noun+"…",false);
   try{
     const endpoint="/api/v2/admin/i18n/batch/preview"+
       (kind==="food"?"":"?entity_kind="+kind);
     const data=await send(endpoint);
     if(request!==bulkSeq||state.kind!==kind)return;
     bulkKind=kind;
     $("i18n-bulk-title").textContent="Aprovação em lote · "+
       (kind==="food"?"Alimentos":kind==="dish"?"Pratos":
        kind==="recipe"?"Receitas":"Suplementação");
     $("i18n-bulk-all-label").textContent=kind==="food"?
       "Selecionar todas as propostas pendentes":kind==="dish"?
       "Selecionar todas as traduções por rever":"Selecionar todos os textos por rever";
     bulkRows=data.items||[];
     const list=$("i18n-bulk-items");
     list.replaceChildren();
     const recipeGroups=new Map();
     for(let i=0;i<bulkRows.length;i++){
       const entry=bulkRows[i];
       let parent=list;
       if(kind==="recipe"||kind==="supplement"){
         let group=recipeGroups.get(entry.entity_id);
         if(!group){
           group=create("section","i18n-bulk-recipe-group");
           group.dataset.recipeId=entry.entity_id;
           const header=create("div","i18n-bulk-recipe-header");
           const heading=create("strong","",entry.record_title||
             (kind==="recipe"?"Receita":"Suplemento"));
           const selectRecipe=create("button","i18n-secondary","Selecionar textos visíveis");
           selectRecipe.type="button";
           selectRecipe.addEventListener("click",()=>{
             if(bulkBusy)return;
             let added=0;
             for(const row of group.querySelectorAll(".i18n-bulk-row")){
               const index=Number(row.dataset.index);
               if(row.hidden||bulkSelected.has(index))continue;
               bulkSelected.add(index);
               row.querySelector('input[type="checkbox"]').checked=true;
               added++;
             }
             if(added){
               $("i18n-bulk-reviewed").checked=false;
               updateBulkActions();
             }
           });
           header.append(heading,selectRecipe);
           group.append(header);
           recipeGroups.set(entry.entity_id,group);
           list.append(group);
         }
         parent=group;
       }
       const row=create("label","i18n-bulk-row");
       row.dataset.index=String(i);
       const checkbox=create("input");checkbox.type="checkbox";
       checkbox.value=entry.entity_id;
       checkbox.dataset.index=String(i);
       const details=create("span","i18n-bulk-entry");
       if(kind==="recipe"||kind==="supplement"){
         details.append(create("small","i18n-bulk-field",entry.field_label||entry.field_path));
       }
       const pair=create("span","i18n-bulk-pair");
       pair.append(create("strong","",entry.source_text),
                   create("span","",entry.translated_text));
       details.append(pair);
       checkbox.addEventListener("change",()=>{
         if(bulkBusy)return;
         if(checkbox.checked)bulkSelected.add(i);else bulkSelected.delete(i);
         $("i18n-bulk-reviewed").checked=false;
         updateBulkActions();
       });
       row.append(checkbox,details);parent.append(row);
     }
     $("i18n-bulk-review").hidden=false;
     $("i18n-bulk-reviewed").checked=false;
     updateBulkActions();
     msg("");
     $("i18n-bulk-review").scrollIntoView({behavior:"smooth",block:"start"});
   }catch(error){
     if(request===bulkSeq)msg("Não foi possível preparar a revisão: "+error.message,true);
   }finally{$("i18n-bulk-open").disabled=false;}
 };
 const submitBulk=async()=>{
   if(bulkBusy||bulkKind!==state.kind||!["food","dish","recipe","supplement"].includes(state.kind)||
       !bulkSelected.size||!$("i18n-bulk-reviewed").checked)return;
   const kind=bulkKind;
   const noun=kind==="food"?"alimentos":kind==="dish"?"pratos":
     kind==="recipe"?"receitas":"suplementos";
   const fieldPath=kind==="food"?"display_name":kind==="dish"?"name_pt":null;
   const chosen=[...bulkSelected].sort((a,b)=>a-b).map(i=>bulkRows[i]);
   if(chosen.some(item=>!item||(fieldPath!==null&&item.field_path!==fieldPath)))return;
   bulkBusy=true;
   $("i18n-bulk-submit").disabled=true;
   $("i18n-bulk-select-100").disabled=true;
   $("i18n-bulk-open").disabled=true;
   $("i18n-bulk-close").disabled=true;
   let approved=0;
   try{
     for(let i=0;i<chosen.length;i+=100){
       const rows=chosen.slice(i,i+100).map(item=>({
         entity_id:item.entity_id,field_path:item.field_path,
         expected_source_hash:item.expected_source_hash,
         expected_candidate_hash:item.expected_candidate_hash,
       }));
       const result=await send("/api/v2/admin/i18n/batch/approve",{
         method:"POST",body:{entity_kind:kind,rows}});
       approved+=result.approved;
       msg("Aprovadas "+approved+" de "+chosen.length+" traduções.",false,"i18n-bulk-feedback");
     }
     bulkBusy=false;
     resetBulk();
     closeReview();
     await Promise.all([loadOverview(),loadCatalog()]);
     msg(approved+" traduções de "+noun+" aprovadas. Os originais não foram alterados.");
   }catch(error){
     bulkBusy=false;
     resetBulk();
     await Promise.allSettled([loadOverview(),loadCatalog()]);
     msg("Aprovação interrompida após "+approved+" traduções. "+
       "As restantes continuam pendentes; abre uma nova revisão. "+error.message,true);
   }finally{
     bulkBusy=false;
     $("i18n-bulk-open").disabled=false;
     $("i18n-bulk-close").disabled=false;
   }
 };
 const loadCatalog=async()=>{
   const currentRequest=++catalogRequestSeq;
   buildTabs();
   const isPlan=state.kind==="plan";
   $("i18n-bulk-tools").hidden=!["food","dish","recipe","supplement"].includes(state.kind);
   if(!["food","dish","recipe","supplement"].includes(state.kind)||
       (bulkKind!==null&&bulkKind!==state.kind))resetBulk();
   $("i18n-plan-stage").hidden=!isPlan;
   $("i18n-results").hidden=isPlan;
   $("i18n-results-count").hidden=isPlan;
   $("i18n-prev").parentElement.hidden=isPlan;
   $("i18n-import-panel").hidden=isPlan;
   $("i18n-work-panel").hidden=false;
   $("i18n-work-panel").dataset.planMode=isPlan?"1":"0";
   $("i18n-work-title").textContent=isPlan?"Planos":"Revisão manual";
   if(isPlan){
     closeReview();
     msg("");
     if(window.tmI18nPlans?.load){
       await window.tmI18nPlans.load({csrfToken:csrf,status:state.status,query:state.query});
     }else msg("Não foi possível carregar o módulo privado dos Planos.",true);
     return;
   }
   window.tmI18nPlans?.hide?.();
   msg("A carregar conteúdos…");
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
       main.append(create("strong","",entry.source_text));
       if(entry.category)main.append(create("small","",entry.category));
       const fieldStates=new Set((entry.fields||[]).map(field=>field.state));
       const displayedState=state.status!=="all" ? state.status :
         (fieldStates.size>1 ? "mixed" : entry.state);
       const arrow=create("span","i18n-result-arrow");
       arrow.setAttribute("aria-hidden","true");
       // Reuse the same chevron shape already used by the Admin navigation.
       arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
       b.append(main,badge(displayedState),arrow);
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
   stats(summary);
 };
 const closeReview=()=>{
   state.selected=null;state.row=null;state.edited=false;state.legacy="";
   $("i18n-fields").replaceChildren();
   $("i18n-review").hidden=true;
   $("i18n-history-panel").open=false;
 };
 const openReview=async(entry)=>{
   const fields=Array.isArray(entry.fields)&&entry.fields.length?entry.fields:[entry];
   const primary=fields.find(f=>state.status==="all"||f.state===state.status)||fields[0];
   const chooseField=(field)=>{
     if(!field)return;
     state.selected={...entry,field_path:field.field_path};
     state.legacy=field.legacy_candidate||"";
     state.row=null;state.edited=false;
     $("i18n-review-title").textContent=entry.source_text;
     $("i18n-existing").hidden=!state.legacy;
     msg("",false,"i18n-review-feedback");
     refreshDetail();
   };
   // Records with one display field need no redundant dropdown.
   $("i18n-field-picker").hidden=fields.length<=1;
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
 let opening=null;
 const activate=async(kind)=>{
   if(Object.prototype.hasOwnProperty.call(displayKind,kind)&&kind!==state.kind){
     state.kind=kind;state.status="all";state.query="";state.page=1;
     resetStatusPicker();$("i18n-search").value="";
     closeReview();resetBulk();
   }
   if(opening)return opening;
   opening=(async()=>{
     const session=await send("/api/me");
     if(session?.user?.role!=="admin")throw Error("acesso_restrito");
     csrf=session.csrf||"";
     await loadOverview();await loadCatalog();
   })().catch(error=>msg(
     "Não foi possível abrir a gestão de traduções: "+error.message+
     ". Confirma a sessão de administrador e a ativação segura do módulo.",true))
     .finally(()=>{opening=null;});
   return opening;
 };
 const init=()=>{
   window.addEventListener("mile:translations-imported",()=>{
     if(embedded&&document.getElementById("tm-admin-translations-page").hidden)return;
     closeReview();loadOverview();loadCatalog();
   });
   if(embedded)window.addEventListener("mile:translations-open",event=>{
     activate(event.detail?.kind);
   });
   $("i18n-bulk-open").addEventListener("click",openBulk);
   $("i18n-bulk-close").addEventListener("click",resetBulk);
   $("i18n-bulk-submit").addEventListener("click",submitBulk);
   $("i18n-bulk-select-100").addEventListener("click",()=>{
     if(bulkBusy)return;
     const rows=bulkEntryRows();
     let added=0;
     for(const row of rows){
       if(added>=100)break;
       const index=Number(row.dataset.index);
       if(row.hidden||bulkSelected.has(index))continue;
       bulkSelected.add(index);
       row.querySelector('input[type="checkbox"]').checked=true;
       added++;
     }
     if(added){
       $("i18n-bulk-reviewed").checked=false;
       updateBulkActions();
     }
   });
   $("i18n-bulk-select-all").addEventListener("change",event=>{
     if(bulkBusy)return;
     bulkSelected=event.target.checked?
       new Set(bulkRows.map((_,i)=>i)):new Set();
     for(const checkbox of $("i18n-bulk-items").querySelectorAll('input[type="checkbox"]')){
       checkbox.checked=bulkSelected.has(Number(checkbox.dataset.index));
     }
     $("i18n-bulk-reviewed").checked=false;
     updateBulkActions();
   });
   $("i18n-bulk-reviewed").addEventListener("change",updateBulkActions);
   $("i18n-bulk-filter").addEventListener("input",event=>{
     const search=event.target.value.trim().toLocaleLowerCase("pt-PT");
     for(const row of bulkEntryRows()){
       const entry=bulkRows[Number(row.dataset.index)];
       const searchable=[entry.record_title||"",entry.field_label||"",
         entry.source_text,entry.translated_text].join(" ");
       row.hidden=!!search&&!searchable.toLocaleLowerCase("pt-PT").includes(search);
     }
     for(const group of $("i18n-bulk-items").querySelectorAll(".i18n-bulk-recipe-group")){
       group.hidden=![...group.querySelectorAll(".i18n-bulk-row")].some(row=>!row.hidden);
     }
     updateBulkActions();
   });
   $("i18n-close").addEventListener("click",closeReview);
   $("i18n-library-link").addEventListener("click",()=>{
     if(!embedded)return;
     const library=$("i18n-library-link").dataset.libraryKind;
     if(library==="food")window.tmOpenAdminFoodLibrary?.("foods");
     else if(library==="supplement")window.tmOpenAdminFoodLibrary?.("supplements");
     else if(library==="dish")window.tmOpenAdminMenusRecipes?.();
     else if(library==="plan")window.tmOpenAdminPlans?.();
     else window.tmOpenAdminRecipeLibrary?.();
   });
   $("i18n-status").addEventListener("change",event=>{
     if(state.status===event.target.value)return;
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
     state.edited=true;$("i18n-approve").disabled=true;
   });
   $("i18n-propose").addEventListener("click",()=>write("propose"));
   $("i18n-approve").addEventListener("click",()=>write("approve"));
   if(!embedded)activate(startKind);
 };
 init();
})();
