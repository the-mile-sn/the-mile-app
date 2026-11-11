"use strict";
/* The Mile — photos supplied by the nutrition team. No photo is generated here.
   Only photos of the selected, currently published meal option are shown. */
(()=>{
 let layer=null;
 function grams(value){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString("pt-PT",{maximumFractionDigits:2})+" g":"—";
 }
 // Render actual inline SVG strokes rather than CSS masks: Safari/iOS web
 // previews can drop the mask and leave invisible action/close icons.
 function icon(paths,className){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("fill","none");
  svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-width","1.8");
  svg.setAttribute("stroke-linecap","round");
  svg.setAttribute("stroke-linejoin","round");
  svg.setAttribute("aria-hidden","true");
  svg.classList.add(className);
  for(const d of paths){
   const path=document.createElementNS(ns,"path");path.setAttribute("d",d);svg.append(path);
  }
  return svg;
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
 function enableSheetResize(sheet,handle,header){
  // The grip and non-interactive header accept vertical drag gestures.
  // Photo content retains its own native vertical scrolling.
  let expanded=false,gesture=null,ignoreHandleClickUntil=0;
  const viewHeight=()=>window.innerHeight||document.documentElement?.clientHeight||800;
  const snap=()=>{
   sheet.classList.remove("is-dragging");
   sheet.classList.toggle("is-expanded",expanded);
   sheet.style.height="";
   handle.setAttribute("aria-expanded",String(expanded));
   handle.setAttribute("aria-label",expanded?"Reduzir painel":"Expandir painel");
  };
  function start(event){
   if(event.button!=null&&event.button!==0)return;
   if(event.target?.closest?.(".tm-portion-sheet-close"))return;
   gesture={y:event.clientY,height:sheet.getBoundingClientRect().height,
     moved:false,viaHandle:event.currentTarget===handle};
   event.currentTarget?.setPointerCapture?.(event.pointerId);
  }
  function move(event){
   if(!gesture)return;
   const dy=gesture.y-event.clientY;
   if(!gesture.moved&&Math.abs(dy)<7)return;
   gesture.moved=true;
   const minHeight=viewHeight()*0.50,maxHeight=viewHeight()*0.94;
   const height=Math.max(minHeight,Math.min(maxHeight,gesture.height+dy));
   sheet.classList.add("is-dragging");
   sheet.style.height=Math.round(height)+"px";
   event.preventDefault();
  }
  function end(event){
   if(!gesture)return;
   const dy=gesture.y-event.clientY;
   if(gesture.moved){
    // Swipe downward to dismiss (not simply shrink). Short movements snap
    // back, while upward drag expands and retains internal photo scrolling.
    if(dy< -50){
     gesture=null;
     close();
     return;
    }
    if(dy>18)expanded=true;
    else expanded=sheet.getBoundingClientRect().height>viewHeight()*0.78;
    if(gesture.viaHandle)ignoreHandleClickUntil=Date.now()+450;
   }
   gesture=null;
   snap();
  }
  for(const target of [handle,header]){
   target.addEventListener("pointerdown",start);
   target.addEventListener("pointermove",move);
   target.addEventListener("pointerup",end);
   target.addEventListener("pointercancel",end);
  }
  handle.addEventListener("click",()=>{
   if(Date.now()<ignoreHandleClickUntil){ignoreHandleClickUntil=0;return;}
   expanded=!expanded;snap();
  });
  snap();
 }
 function show(date,mealTitle,option){
  close();
  if(!option||!(option.groups||[]).some(group=>(group.alternatives||[]).some(ref=>ref.photo_id)))return;
  const previousFocus=document.activeElement;
  const overlay=document.createElement("div");overlay.className="tm-portion-overlay";
  const sheet=document.createElement("section");sheet.className="tm-portion-sheet";
  sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
  const resizeHandle=document.createElement("button");resizeHandle.type="button";
  resizeHandle.className="tm-portion-sheet-drag-handle";
  const grip=document.createElement("span");grip.className="tm-portion-sheet-grip";
  grip.setAttribute("aria-hidden","true");resizeHandle.append(grip);
  sheet.append(resizeHandle);
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
  closeButton.setAttribute("aria-label","Fechar porções visuais");
  closeButton.append(icon(["M18 6 6 18","M6 6l12 12"],"tm-portion-close-icon"));
  closeButton.addEventListener("click",close);
  header.append(headCopy,closeButton);sheet.append(header);
  enableSheetResize(sheet,resizeHandle,header);
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
   const carousel=document.createElement("div");carousel.className="tm-portion-photo-grid";
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
  button.append(icon(["m12 3 9 5-9 5-9-5 9-5Z","m3 13 9 5 9-5","m3 18 9 5 9-5"],"tm-portion-action-icon"));
  const label=document.createElement("span");label.textContent="Ver porções";button.append(label);
  button.append(icon(["m9 18 6-6-6-6"],"tm-portion-arrow-icon"));
  button.setAttribute("aria-label","Ver porções de "+(option.title||"Opção "+option.number)+" — "+mealTitle);
  // The button is appended after the option's foods and notes, never inside
  // <summary>. Native <details> hides it until this specific option opens.
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
  card.append(button);
 }
 window.tmVisualPortions={appendAction,close};
})();
