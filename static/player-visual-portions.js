"use strict";
/* The Mile — photos supplied by the nutrition team. No photo is generated here.
   Only photos of the selected, currently published meal option are shown. */
(()=>{
 let layer=null;
 function grams(value){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString("pt-PT",{maximumFractionDigits:2})+" g":"—";
 }
 function matchingOption(option,index,color,meal){
  if(!option)return null;
  return (index?.[color]?.[meal]||[]).find(row=>
   row.option_ref===option.option_ref&&row.source_draft_id===option.source_draft_id)||null;
 }
 function close(){
  if(!layer)return;
  const original=layer;
  layer=null;
  document.removeEventListener("keydown",original._key);
  document.body.classList.remove("visual-portions-open");
  original.remove();
  if(original._previousFocus?.isConnected)original._previousFocus.focus({preventScroll:true});
 }
 function show(date,mealTitle,option){
  close();
  if(!option||!(option.groups||[]).some(group=>(group.alternatives||[]).some(ref=>ref.photo_id)))return;
  const previousFocus=document.activeElement;
  const overlay=document.createElement("div");overlay.className="tm-portion-overlay";
  const sheet=document.createElement("section");sheet.className="tm-portion-sheet";
  sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
  sheet.setAttribute("aria-label","Porções visuais — "+mealTitle+" — "+(option.title||"Opção "+option.number));
  const header=document.createElement("header");header.className="tm-portion-sheet-header";
  const headCopy=document.createElement("div");
  const title=document.createElement("h2");title.textContent="Ver porções";
  const dateText=document.createElement("p");
  dateText.textContent=mealTitle+" · "+new Date(date+"T12:00:00").toLocaleDateString("pt-PT",{day:"numeric",month:"long"});
  const optionName=document.createElement("p");optionName.className="tm-portion-sheet-option";
  optionName.textContent=option.title||"Opção "+option.number;
  headCopy.append(title,dateText,optionName);
  const closeButton=document.createElement("button");closeButton.type="button";closeButton.className="tm-portion-sheet-close";
  closeButton.setAttribute("aria-label","Fechar porções visuais");closeButton.textContent="×";
  closeButton.addEventListener("click",close);
  header.append(headCopy,closeButton);sheet.append(header);
  const content=document.createElement("div");content.className="tm-portion-sheet-content";sheet.append(content);
  for(const group of option.groups||[]){
   const photos=(group.alternatives||[]).filter(item=>item.photo_id);
   if(!photos.length)continue;
   const section=document.createElement("section");section.className="tm-portion-photo-group";
   const heading=document.createElement("h3");
   const groupName=group.visual_examples?"Acompanhamentos":
    (photos.length>1?"Alternativas":photos[0].category);
   const quantity=photos[0].prescribed_g;
   heading.textContent=groupName+(Number.isFinite(Number(quantity))?" · "+grams(quantity):"");
   section.append(heading);
   const carousel=document.createElement("div");carousel.className="tm-portion-photo-carousel";
   carousel.setAttribute("aria-label",groupName);
   for(const ref of photos){
    const card=document.createElement("article");card.className="tm-portion-photo-tile";
    const photo=document.createElement("img");photo.loading="lazy";photo.decoding="async";
    photo.src="/api/v2/player/visual-portions/image/"+encodeURIComponent(ref.photo_id);
    photo.alt=ref.photo_subject==="Carne branca"?
     "Fotografia de carne branca como orientação visual para Carne/Peixe, "+grams(ref.reference_g):
     "Fotografia de "+ref.category+", "+grams(ref.reference_g);
    const details=document.createElement("div");details.className="tm-portion-photo-description";
    const category=document.createElement("strong");category.textContent=ref.category;
    details.append(category);
    // Exact quantities need no repetitive labels; for a near photo,
    // disclose its actual weight briefly instead of suggesting an exact match.
    if(Math.abs(Number(ref.reference_g)-Number(ref.prescribed_g))>.01||
       (ref.match==="near"&&ref.category==="Arroz + Batata")){
     const near=document.createElement("small");near.className="tm-portion-approximate";
     near.textContent="Foto de "+grams(ref.reference_g);
     details.append(near);
    }
    card.append(photo,details);carousel.append(card);
   }
   section.append(carousel);content.append(section);
  }
  sheet.addEventListener("keydown",event=>{
   if(event.key!=="Tab")return;
   const focusable=[...sheet.querySelectorAll("button:not([disabled])")].filter(el=>el.offsetParent!==null);
   if(!focusable.length)return;
   if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable[focusable.length-1].focus();}
   if(!event.shiftKey&&document.activeElement===focusable[focusable.length-1]){event.preventDefault();focusable[0].focus();}
  });
  overlay.append(sheet);
  overlay.addEventListener("click",event=>{if(event.target===overlay)close();});
  overlay._previousFocus=previousFocus;
  overlay._key=event=>{if(event.key==="Escape")close();};
  document.body.append(overlay);document.body.classList.add("visual-portions-open");
  layer=overlay;document.addEventListener("keydown",overlay._key);
  closeButton.focus({preventScroll:true});
 }
 function appendAction({card,date,mealTitle,color,meal,option,index,refresh}){
  if(!card||!matchingOption(option,index,color,meal))return;
  const button=document.createElement("button");button.type="button";button.className="tm-daily-portions-action";
  button.textContent="Ver porções";
  button.setAttribute("aria-label","Ver porções de "+(option.title||"Opção "+option.number)+" — "+mealTitle);
  // A <summary> toggles its parent <details> by default: this independent
  // action must open photos without expanding or collapsing the option.
  if(card.tagName==="SUMMARY")card.classList.add("tm-portion-summary-with-action");
  button.addEventListener("click",async event=>{
   event.preventDefault();event.stopPropagation();
   if(button.disabled)return;
   button.disabled=true;
   try{
    // Revalidate *this* exact published option ref (and source revision)
    // on each open, so changed/unpublished choices cannot reuse stale photos.
    const current=await refresh();
    if(!card.isConnected)return;
    const selected=matchingOption(option,current?.options_by_color||{},color,meal);
    if(selected)show(date,mealTitle,selected);
    else{
     button.remove();
     const status=document.getElementById("status");
     if(status)status.textContent="O plano foi atualizado. Atualiza o dia para consultar as novas porções.";
    }
   }catch(err){
    const status=document.getElementById("status");
    if(status)status.textContent="Não foi possível abrir as porções. Tenta novamente.";
   }finally{button.disabled=false;}
  });
  button.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")event.stopPropagation();});
  card.append(button);
 }
 window.tmVisualPortions={appendAction,close};
})();
