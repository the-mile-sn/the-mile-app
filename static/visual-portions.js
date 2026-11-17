"use strict";
/* Embedded in the existing Biblioteca Alimentar navigation, never a stand-alone page. */
(()=>{
 const root=document.getElementById("tm-food-library-page");
 if(!root)return;
 const get=id=>document.getElementById(id);
 const foods=get("tm-food-main"),portions=get("tm-visual-portions-page");
 // Navigation is provided by the shared sidebar.
 const input=get("tm-portion-file"),feedback=get("tm-portion-feedback");
 const grid=get("tm-portion-grid"),paging=get("tm-portion-paging");
 const progress=get("tm-portion-progress"),loadMore=get("tm-portion-load-more");
 const search=get("tm-portion-search"),category=get("tm-portion-category");
 const BATCH_SIZE=16;
 let references=[],loaded=false,loading=false,filteredReferences=[],visibleCount=BATCH_SIZE;
 const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 function mode(which){
  const visual=which==="portions";
  foods.hidden=visual;portions.hidden=!visual;
  root.dataset.librarySection=visual?"portions":"foods";
  if(visual&&!loaded&&!loading)load();
 }
 window.tmShowAdminFoodLibrarySection=mode;
 /* Some approved WebP files contain opaque white in their outside margins.
    Remove only near-white pixels connected to an outer edge, never alter
    stored photographs or opaque pixels enclosed by the plate. */
 function clearWhitePhotoMargins(image){
  if(image.dataset.photoMarginsChecked)return;
  image.dataset.photoMarginsChecked="1";
  if(!image.naturalWidth||!image.naturalHeight)return;
  const canvas=document.createElement("canvas");
  const scale=Math.min(1,600/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return;
  try{
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
   const data=frame.data,w=canvas.width,h=canvas.height,n=w*h;
   const white=i=>{
    const p=i*4;
    return data[p+3]>240&&data[p]>=245&&data[p+1]>=245&&data[p+2]>=245
      &&Math.max(data[p],data[p+1],data[p+2])-Math.min(data[p],data[p+1],data[p+2])<=8;
   };
   let corners=0;
   for(const i of [0,w-1,(h-1)*w,h*w-1])if(white(i))corners++;
   if(corners<2)return; // already transparent, or no white photo backdrop
   const visited=new Uint8Array(n),queue=new Int32Array(n);
   let head=0,tail=0;
   const add=i=>{if(visited[i]||!white(i))return;visited[i]=1;queue[tail++]=i;};
   for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
   for(let y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
   if(!tail)return;
   while(head<tail){
    const i=queue[head++],x=i%w,y=(i-x)/w;
    if(x>0)add(i-1);if(x<w-1)add(i+1);
    if(y>0)add(i-w);if(y<h-1)add(i+w);
   }
   for(let i=0;i<n;i++)if(visited[i])data[i*4+3]=0;
   ctx.putImageData(frame,0,0);
   canvas.toBlob(blob=>{
    if(!blob||!image.isConnected)return;
    const url=URL.createObjectURL(blob);
    image.addEventListener("load",()=>URL.revokeObjectURL(url),{once:true});
    image.src=url;
   },"image/webp",.9);
  }catch(_error){/* Keep the original image if canvas processing is unavailable. */}
 }

 /* The edit action replaces one reference photo, never its weight, category or state. */
 const photoEditor=document.createElement("dialog");
 photoEditor.className="tm-portion-photo-editor";
 photoEditor.setAttribute("aria-label","Substituir fotografia da porção");
 const editorTitle=document.createElement("h3");editorTitle.textContent="Editar fotografia";
 const editorDescription=document.createElement("p");editorDescription.className="tm-portion-photo-help";
 editorDescription.textContent="Substitui apenas a fotografia desta porção. Usa preferencialmente uma imagem PNG ou WebP com fundo transparente.";
 const editorPreview=document.createElement("img");editorPreview.className="tm-portion-photo-preview";editorPreview.alt="Pré-visualização da fotografia selecionada";
 const editorFile=document.createElement("input");editorFile.type="file";editorFile.accept="image/png,image/webp,image/jpeg";editorFile.className="tm-portion-photo-input";editorFile.setAttribute("aria-label","Escolher nova fotografia");
 const editorFeedback=document.createElement("p");editorFeedback.className="tm-portion-photo-feedback";editorFeedback.setAttribute("role","status");
 const editorActions=document.createElement("div");editorActions.className="tm-portion-photo-actions";
 const editorCancel=document.createElement("button");editorCancel.type="button";editorCancel.textContent="Cancelar";editorCancel.className="tm-action-secondary";
 const editorSave=document.createElement("button");editorSave.type="button";editorSave.textContent="Guardar fotografia";editorSave.className="tm-action-primary";
 editorActions.append(editorCancel,editorSave);
 photoEditor.append(editorTitle,editorDescription,editorPreview,editorFile,editorFeedback,editorActions);
 portions.append(photoEditor);
 let editingReference=null,selectedImageUrl=null;
 function clearEditorPreview(){
  if(selectedImageUrl)URL.revokeObjectURL(selectedImageUrl);
  selectedImageUrl=null;
 }
 function closePhotoEditor(){
  if(photoEditor.open)photoEditor.close();
  clearEditorPreview();editingReference=null;editorFile.value="";
 }
 editorCancel.addEventListener("click",closePhotoEditor);
 photoEditor.addEventListener("close",()=>{clearEditorPreview();editingReference=null;editorFile.value="";});
 editorFile.addEventListener("change",()=>{
  clearEditorPreview();
  const file=editorFile.files?.[0];
  if(!file)return;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)){editorFeedback.textContent="Seleciona uma imagem PNG, JPEG ou WebP.";return;}
  selectedImageUrl=URL.createObjectURL(file);
  editorPreview.src=selectedImageUrl;
  editorFeedback.textContent="";
 });
 function openPhotoEditor(ref){
  editingReference=ref;editorFile.value="";editorFeedback.textContent="";
  clearEditorPreview();
  editorTitle.textContent="Editar fotografia · "+ref.category+" "+ref.total_g+" g";
  editorPreview.src="/api/v2/visual-portions/image/"+encodeURIComponent(ref.id)+"?t="+Date.now();
  photoEditor.showModal();
 }
 async function prepareWebp(file){
  let source;
  try{source=await createImageBitmap(file);}
  catch(_error){throw Error("Não foi possível abrir esta imagem. Experimenta PNG, JPEG ou WebP.");}
  try{
   const limit=3*1024*1024;
   const canvas=document.createElement("canvas");
   const ctx=canvas.getContext("2d");
   if(!ctx)throw Error("Não foi possível processar a fotografia neste dispositivo.");
   const largest=Math.max(source.width,source.height);
   if(!largest)throw Error("Fotografia inválida.");
   for(const maxSide of [1200,960,800,640,480]){
    const scale=Math.min(1,maxSide/largest);
    canvas.width=Math.max(1,Math.round(source.width*scale));
    canvas.height=Math.max(1,Math.round(source.height*scale));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    for(const quality of [.86,.72,.56,.4]){
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
     if(blob&&blob.type==="image/webp"&&blob.size<=limit)return blob;
    }
   }
   throw Error("Não foi possível comprimir automaticamente esta fotografia. Experimenta outro formato.");
  }finally{source.close();}
 }
 editorSave.addEventListener("click",async()=>{
  const file=editorFile.files?.[0],ref=editingReference;
  if(!file||!ref){editorFeedback.textContent="Seleciona primeiro uma fotografia.";return;}
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)){editorFeedback.textContent="Formato de imagem inválido.";return;}
  editorSave.disabled=true;editorCancel.disabled=true;editorFeedback.textContent="A guardar fotografia…";
  try{
   const blob=await prepareWebp(file);
   const res=await fetch("/api/v2/visual-portions/image/"+encodeURIComponent(ref.id),{
    method:"POST",credentials:"same-origin",
    headers:{"Accept":"application/json","Content-Type":"image/webp","X-CSRF-Token":csrf},
    body:blob
   });
   const payload=await res.json();
   if(!res.ok)throw Error(payload.error||"Falha ao guardar fotografia.");
   const current=ref;closePhotoEditor();
   for(const card of grid.querySelectorAll(".tm-portion-card[data-ref-id]")){
    if(card.dataset.refId!==current.id)continue;
    const picture=card.querySelector(":scope > img");
    if(!picture)continue;
    picture.dataset.photoMarginsChecked="1";
    picture.src="/api/v2/visual-portions/image/"+encodeURIComponent(current.id)+"?v="+Date.now();
   }
   feedback.textContent="Fotografia de "+current.category+" "+current.total_g+" g atualizada.";
  }catch(error){editorFeedback.textContent=error.message||"Não foi possível guardar a fotografia.";}
  finally{editorSave.disabled=false;editorCancel.disabled=false;}
 });
 function makeCard(ref){
  const card=document.createElement("article");card.className="tm-portion-card";card.dataset.refId=ref.id;
  const image=document.createElement("img");image.loading="lazy";image.decoding="async";
  image.src="/api/v2/visual-portions/image/"+encodeURIComponent(ref.id);
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
  const toggle=document.createElement("button");toggle.type="button";toggle.className="tm-portion-toggle";
  function renderStatus(){
   toggle.setAttribute("aria-pressed",String(!!ref.active));toggle.textContent=ref.active?"Ativa":"Inativa";
  }
  renderStatus();
  toggle.addEventListener("click",async()=>{
   toggle.disabled=true;
   try{
    const res=await request("/api/v2/visual-portions/"+encodeURIComponent(ref.id),{method:"PUT",body:JSON.stringify({active:!ref.active})});
    ref.active=!!res.active;renderStatus();
    if(!previewBody.hidden&&previewAthlete.value)previewForAthlete();
   }catch(e){feedback.textContent="Não foi possível alterar a referência: "+e.message;}
   finally{toggle.disabled=false;}
  });
  const heading=document.createElement("div");heading.className="tm-portion-heading";
  heading.append(label,toggle);
  info.prepend(heading);
  const edit=document.createElement("button");edit.type="button";edit.className="tm-portion-photo-edit tm-ui-action-icon";
  edit.title="Editar fotografia de "+ref.category+" "+ref.total_g+" g";
  edit.setAttribute("aria-label",edit.title);
  edit.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>';
  edit.addEventListener("click",()=>openPhotoEditor(ref));
  card.append(info,image,edit);
  image.addEventListener("load",()=>clearWhitePhotoMargins(image),{once:true});
  return card;
 }
 function updatePaging(){
  const shown=Math.min(visibleCount,filteredReferences.length);
  paging.hidden=filteredReferences.length===0;
  progress.textContent="A mostrar "+shown+" de "+filteredReferences.length+" referências";
  const remaining=filteredReferences.length-shown;
  loadMore.hidden=remaining<=0;
  if(remaining>0)loadMore.textContent="Ver mais ("+Math.min(BATCH_SIZE,remaining)+")";
 }
 function draw(){
  const categories=[...new Set(references.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,"pt"));
  const selected=category.value;
  category.replaceChildren();
  const blank=document.createElement("option");blank.value="";blank.textContent="Todas as categorias";category.append(blank);
  for(const name of categories){const item=document.createElement("option");item.value=name;item.textContent=name;category.append(item);}
  category.value=categories.includes(selected)?selected:"";
  const term=normalize(search.value);
  filteredReferences=references.filter(ref=>{
   if(category.value&&ref.category!==category.value)return false;
   const display=ref.category+" "+ref.total_g+" g "+(ref.rice_g!==null&&ref.rice_g!==undefined?"arroz "+ref.rice_g+" g batata "+ref.potato_g+" g":"");
   return !term||normalize(display).includes(term);
  });
  grid.replaceChildren();
  if(!filteredReferences.length){
   const empty=document.createElement("p");empty.className="tm-portion-empty";
   empty.textContent=references.length?"Nenhuma referência corresponde aos filtros.":"Ainda não existem referências fotográficas.";
   grid.append(empty);updatePaging();return;
  }
  const batch=document.createDocumentFragment();
  for(const ref of filteredReferences.slice(0,visibleCount))batch.append(makeCard(ref));
  grid.append(batch);updatePaging();
 }
 function showMore(){
  const from=Math.min(visibleCount,filteredReferences.length);
  visibleCount=Math.min(visibleCount+BATCH_SIZE,filteredReferences.length);
  const batch=document.createDocumentFragment();
  for(const ref of filteredReferences.slice(from,visibleCount))batch.append(makeCard(ref));
  grid.append(batch);updatePaging();
 }
 loadMore.addEventListener("click",showMore);
 async function load(){
  loading=true;feedback.textContent="A carregar referências visuais…";
  try{
   const result=await request("/api/v2/visual-portions");
   references=result.references||[];loaded=true;visibleCount=BATCH_SIZE;
   feedback.textContent="";
   draw();
  }catch(error){feedback.textContent="Não foi possível carregar as fotografias: "+error.message;}
  finally{loading=false;}
 }
 search.addEventListener("input",()=>{visibleCount=BATCH_SIZE;draw();});
 category.addEventListener("change",()=>{visibleCount=BATCH_SIZE;draw();});
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

 window.tmOpenAdminVisualPortions=()=>{if(typeof window.tmOpenAdminFoodLibrary==="function")window.tmOpenAdminFoodLibrary("portions");};
})();
