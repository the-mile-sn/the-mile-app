"use strict";
/* Embedded in the existing Biblioteca Alimentar navigation, never a stand-alone page. */
(()=>{
 const root=document.getElementById("tm-food-library-page");
 if(!root)return;
 const get=id=>document.getElementById(id);
 const foods=get("tm-food-main"),portions=get("tm-visual-portions-page");
 const tabFoods=get("tm-food-tab-foods"),tabPortions=get("tm-food-tab-portions");
 const input=get("tm-portion-file"),feedback=get("tm-portion-feedback");
 const grid=get("tm-portion-grid"),count=get("tm-portion-count");
 const search=get("tm-portion-search"),category=get("tm-portion-category");
 let references=[],loaded=false,loading=false;
 const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 function mode(which){
  const visual=which==="portions";
  foods.hidden=visual;portions.hidden=!visual;
  tabFoods.classList.toggle("is-current",!visual);
  tabPortions.classList.toggle("is-current",visual);
  tabFoods.setAttribute("aria-pressed",String(!visual));
  tabPortions.setAttribute("aria-pressed",String(visual));
  if(visual&&!loaded&&!loading)load();
 }
 tabFoods.addEventListener("click",()=>mode("foods"));
 tabPortions.addEventListener("click",()=>mode("portions"));
 function draw(){
  const categories=[...new Set(references.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,"pt"));
  const selected=category.value;
  category.replaceChildren();
  const blank=document.createElement("option");blank.value="";blank.textContent="Todas as categorias";category.append(blank);
  for(const name of categories){const item=document.createElement("option");item.value=name;item.textContent=name;category.append(item);}
  category.value=categories.includes(selected)?selected:"";
  const term=normalize(search.value);
  const filtered=references.filter(ref=>{
   if(category.value&&ref.category!==category.value)return false;
   const display=ref.category+" "+ref.total_g+" g "+(ref.rice_g?"arroz "+ref.rice_g+" g batata "+ref.potato_g+" g":"");
   return !term||normalize(display).includes(term);
  });
  count.textContent=filtered.length+" de "+references.length+" referências";
  grid.replaceChildren();
  if(!filtered.length){const empty=document.createElement("p");empty.textContent=references.length?"Nenhuma referência corresponde aos filtros.":"Ainda não foram importadas fotografias de porções.";grid.append(empty);return;}
  for(const ref of filtered){
   const card=document.createElement("article");card.className="tm-portion-card";
   const image=document.createElement("img");image.loading="lazy";image.decoding="async";image.src="/api/v2/visual-portions/image/"+encodeURIComponent(ref.id);
   image.alt=ref.photo_subject==="Carne branca"?"Fotografia de carne branca usada como exemplo para carne ou peixe, "+ref.total_g+" g":"Fotografia de "+ref.category+", "+ref.total_g+" g";
   const info=document.createElement("div");info.className="tm-portion-info";
   const label=document.createElement("strong");label.textContent=ref.category;
   const grams=document.createElement("span");grams.className="tm-portion-grams";
   grams.textContent=ref.total_g+" g";
   info.append(label,grams);
   if(ref.rice_g!==null&&ref.rice_g!==undefined){
    const breakdown=document.createElement("small");breakdown.className="tm-portion-breakdown";
    breakdown.textContent=ref.rice_g+" g arroz + "+ref.potato_g+" g batata";
    info.append(breakdown);
   }
   const toggle=document.createElement("button");toggle.type="button";toggle.className="tm-portion-toggle";toggle.setAttribute("aria-pressed",String(!!ref.active));
   toggle.textContent=ref.active?"Ativa":"Inativa";
   toggle.addEventListener("click",async()=>{
    toggle.disabled=true;
    try{const res=await request("/api/v2/visual-portions/"+encodeURIComponent(ref.id),{method:"PUT",body:JSON.stringify({active:!ref.active})});ref.active=!!res.active;draw();if(!previewBody.hidden&&previewAthlete.value)previewForAthlete();}
    catch(e){feedback.textContent="Não foi possível alterar a referência: "+e.message;toggle.disabled=false;}
   });
   card.append(image,info,toggle);grid.append(card);
  }
 }
 async function load(){
  loading=true;feedback.textContent="A carregar referências visuais…";
  try{
   const result=await request("/api/v2/visual-portions");
   references=result.references||[];loaded=true;
   feedback.textContent=references.length?"":"Importa o pacote aprovado para adicionar as fotografias.";
   draw();
  }catch(error){feedback.textContent="Não foi possível carregar as fotografias: "+error.message;}
  finally{loading=false;}
 }
 search.addEventListener("input",draw);
 category.addEventListener("change",draw);
 input.addEventListener("change",async()=>{
  const file=input.files&&input.files[0];if(!file)return;
  if(!file.name.toLowerCase().endsWith(".zip")||file.size>5*1024*1024){feedback.textContent="Seleciona o pacote ZIP aprovado (até 5 MB).";input.value="";return;}
  if(!window.confirm("Importar as referências aprovadas para a biblioteca interna do Backoffice? Isto não as publica na app dos jogadores.")){input.value="";return;}
  input.disabled=true;feedback.textContent="A importar fotografias…";
  try{
   const res=await fetch("/api/v2/visual-portions/import",{method:"POST",credentials:"same-origin",headers:{"Accept":"application/json","Content-Type":"application/zip","X-CSRF-Token":csrf},body:file});
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||"Não foi possível importar.");
   await load();
   feedback.textContent=result.imported+" referências importadas, com "+result.photos+" fotografias distintas.";
   if(!previewBody.hidden&&previewAthlete.value)previewForAthlete();
  }catch(error){feedback.textContent="Erro na importação: "+error.message;}
  finally{input.disabled=false;input.value="";}
 });

 /* Published-plan preview is read-only. This stage never modifies athlete preferences or plans. */
 const previewToggle=get("tm-portion-preview-toggle"),previewBody=get("tm-portion-preview-body");
 const previewAthlete=get("tm-portion-preview-athlete"),previewPlan=get("tm-portion-preview-plan");
 const previewMeal=get("tm-portion-preview-meal"),previewOption=get("tm-portion-preview-option");
 const previewFeedback=get("tm-portion-preview-feedback"),previewResults=get("tm-portion-preview-results");
 let athleteListLoaded=false,previewData=null,previewRequest=0;
 const labelForGrams=value=>Number(value).toLocaleString("pt-PT",{maximumFractionDigits:2})+" g";
 function selectOptions(node, rows, placeholder){
  const previous=node.value;
  node.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent=placeholder;node.append(empty);
  for(const [id,title] of rows){
   const item=document.createElement("option");item.value=String(id);item.textContent=String(title);node.append(item);
  }
  node.value=rows.some(row=>String(row[0])===previous)?previous:"";
  node.disabled=rows.length===0;
 }
 function currentPlan(){return previewData?.plans?.[Number(previewPlan.value)]||null;}
 function currentMeal(){const plan=currentPlan();return plan?.meals?.[Number(previewMeal.value)]||null;}
 function currentOption(){return currentMeal()?.options?.[Number(previewOption.value)]||null;}
 function showOptions(){
  const opt=currentOption();previewResults.replaceChildren();
  if(!opt){previewFeedback.textContent="Seleciona uma opção para consultar as fotografias.";return;}
  const groups=opt.groups||[];
  if(!groups.length){previewFeedback.textContent="Esta opção não contém alimentos com referências fotográficas nesta biblioteca.";return;}
  const total=groups.reduce((n,g)=>n+(g.alternatives||[]).filter(x=>!!x.photo_id).length,0);
  previewFeedback.textContent=total
    ?total+" fotografia(s) sugerida(s) nesta opção. Nenhuma alteração feita ao plano."
    :"Ainda não existem fotografias suficientemente próximas para esta opção.";
  let preparationReview=false;
  for(const group of groups){
   const alternatives=group.alternatives||[];
   const panel=document.createElement("article");panel.className="tm-portion-preview-group";
   if(alternatives.length>1){
    const heading=document.createElement("span");heading.className="tm-portion-preview-group-heading";
    heading.textContent=group.visual_examples?"Exemplos de acompanhamentos — a prescrição não muda":"Alternativas — escolher apenas uma";panel.append(heading);
   }
   for(const item of alternatives){
    preparationReview=preparationReview||!!item.preparation_review;
    const row=document.createElement("div");row.className="tm-portion-preview-item";
    if(item.photo_id){
     const image=document.createElement("img");image.loading="lazy";image.decoding="async";
     image.src="/api/v2/visual-portions/image/"+encodeURIComponent(item.photo_id);
     image.alt=item.photo_subject==="Carne branca"
       ?"Fotografia de carne branca usada como referência para carne ou peixe"
       :"Fotografia de "+item.category;
     row.append(image);
    }else{
     const blank=document.createElement("span");blank.className="tm-portion-preview-no-photo";
     const imgIcon=document.createElement("span");imgIcon.textContent="—";blank.append(imgIcon);
     blank.setAttribute("aria-label","Fotografia indisponível");row.append(blank);
    }
    const details=document.createElement("div");details.className="tm-portion-preview-description";
    const name=document.createElement("strong");name.textContent=item.food_name||item.category;
    const prescribed=document.createElement("span");
    prescribed.textContent="Plano: "+labelForGrams(item.prescribed_g)+(item.rice_g!=null?" · "+labelForGrams(item.rice_g)+" arroz + "+labelForGrams(item.potato_g)+" batata":"");
    const reference=document.createElement("span");
    if(item.photo_id){
     reference.textContent="Fotografia: "+labelForGrams(item.reference_g)
       +(item.reference_rice_g!=null?" · "+labelForGrams(item.reference_rice_g)+" arroz + "+labelForGrams(item.reference_potato_g)+" batata":"");
    }else if(item.match==="raw_or_invalid"){reference.textContent="Sem associação: quantidade indicada em cru/seco.";}
    else if(item.match==="invalid_quantity"){reference.textContent="Sem associação: quantidade inválida.";}
    else{reference.textContent="Sem fotografia próxima nesta categoria.";}
    details.append(name,prescribed,reference);
    const status=document.createElement("span");status.className="tm-portion-preview-match "+(item.photo_id?"has-photo":"no-match");
    status.textContent=item.match==="exact"?"Exata":item.match==="near"?"Aproximada":"Sem imagem";
    row.append(details,status);panel.append(row);
   }
   previewResults.append(panel);
  }
  if(preparationReview){
   const note=document.createElement("p");note.className="tm-portion-preview-preparation-note";
   note.textContent="Confirma se as quantidades prescritas se referem ao alimento já cozinhado. As fotografias não substituem a pesagem.";
   previewResults.append(note);
  }
 }
 function refreshOption(){
  const meal=currentMeal();
  selectOptions(previewOption,(meal?.options||[]).map((o,i)=>[i,o.title||"Opção "+(i+1)]),"Selecionar opção");
  if(meal?.options?.length&&!previewOption.value)previewOption.value="0";
  showOptions();
 }
 function refreshMeal(){
  const plan=currentPlan();
  selectOptions(previewMeal,(plan?.meals||[]).map((m,i)=>[i,m.name+(m.source_meal&&normalize(m.source_meal)!==normalize(m.name)?" · "+m.source_meal:"")]),"Selecionar refeição");
  if(plan?.meals?.length&&!previewMeal.value)previewMeal.value="0";
  refreshOption();
 }
 function refreshPlan(){
  selectOptions(previewPlan,(previewData?.plans||[]).map((p,i)=>[i,p.plan_type+(previewData.plans.filter(x=>x.plan_type===p.plan_type).length>1?" · "+p.publication_id.slice(0,8):"")]),"Selecionar plano");
  if(previewData?.plans?.length&&!previewPlan.value)previewPlan.value="0";
  refreshMeal();
 }
 async function loadAthletesForPreview(){
  if(athleteListLoaded)return;
  previewFeedback.textContent="A carregar jogadores…";
  try{
   const result=await request("/api/v2/athletes");
   const athletes=(result.athletes||[]).filter(a=>a&&a.id&&a.name);
   selectOptions(previewAthlete,athletes.map(a=>[a.id,a.name]),"Selecionar jogador");
   athleteListLoaded=true;
   previewFeedback.textContent=athletes.length?"Seleciona um jogador para visualizar as associações.":"Não há jogadores disponíveis.";
  }catch(error){previewFeedback.textContent="Não foi possível carregar jogadores: "+error.message;}
 }
 async function previewForAthlete(){
  const token=++previewRequest,athleteId=previewAthlete.value;
  previewData=null;previewResults.replaceChildren();refreshPlan();
  if(!athleteId){previewFeedback.textContent="Seleciona um jogador para consultar os planos publicados.";return;}
  previewFeedback.textContent="A verificar os planos publicados e as fotografias disponíveis…";
  try{
   const result=await request("/api/v2/visual-portions/preview?athlete_id="+encodeURIComponent(athleteId));
   if(token!==previewRequest||previewAthlete.value!==athleteId)return;
   previewData=result;refreshPlan();
   if(!result.plans?.length)previewFeedback.textContent="Este jogador não tem planos alimentares publicados com Almoço/Jantar disponíveis para pré-visualização.";
  }catch(error){if(token===previewRequest)previewFeedback.textContent="Não foi possível consultar as associações: "+error.message;}
 }
 previewToggle.addEventListener("click",()=>{
  const isOpen=previewBody.hidden;previewBody.hidden=!isOpen;
  previewToggle.setAttribute("aria-expanded",String(isOpen));
  previewToggle.textContent=isOpen?"Fechar pré-visualização":"Pré-visualizar";
  if(isOpen)loadAthletesForPreview();
 });
 previewAthlete.addEventListener("change",previewForAthlete);
 previewPlan.addEventListener("change",refreshMeal);
 previewMeal.addEventListener("change",refreshOption);
 previewOption.addEventListener("change",showOptions);

 window.tmOpenAdminVisualPortions=()=>{if(typeof window.tmOpenAdminFoodLibrary==="function")window.tmOpenAdminFoodLibrary();mode("portions");};
})();
