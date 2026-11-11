"use strict";
/* Original approved Excel photographs, opt-in only. No image generation or extra assets. */
(()=>{
 let layer=null;
 function grams(value){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString("pt-PT",{maximumFractionDigits:2})+" g":"—";
 }
 function matched(displayed,index,color,meal){
  const candidates=index?.[color]?.[meal]||[];
  return (displayed||[]).map(option=>{
   const record=candidates.find(row=>row.option_ref===option.option_ref&&
      row.source_draft_id===option.source_draft_id);
   return record?{...record,displayOption:option}:null;
  }).filter(Boolean);
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
 function show(date,mealTitle,options){
  close();
  if(!options.length)return;
  const previousFocus=document.activeElement;
  const overlay=document.createElement("div");overlay.className="tm-portion-overlay";
  const sheet=document.createElement("section");sheet.className="tm-portion-sheet";
  sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
  sheet.setAttribute("aria-label","Porções visuais — "+mealTitle);
  const header=document.createElement("header");header.className="tm-portion-sheet-header";
  const headCopy=document.createElement("div");
  const title=document.createElement("h2");title.textContent="Ver porções";
  const dateText=document.createElement("p");
  dateText.textContent=mealTitle+" · "+new Date(date+"T12:00:00").toLocaleDateString("pt-PT",{day:"numeric",month:"long"});
  headCopy.append(title,dateText);
  const closeButton=document.createElement("button");closeButton.type="button";closeButton.className="tm-portion-sheet-close";
  closeButton.setAttribute("aria-label","Fechar porções visuais");closeButton.textContent="×";
  closeButton.addEventListener("click",close);
  header.append(headCopy,closeButton);sheet.append(header);
  const tabNav=document.createElement("nav");tabNav.className="tm-portion-sheet-tabs";
  tabNav.setAttribute("aria-label","Opções desta refeição");sheet.append(tabNav);
  const content=document.createElement("div");content.className="tm-portion-sheet-content";sheet.append(content);
  const foot=document.createElement("p");foot.className="tm-portion-sheet-foot";
  foot.textContent="Fotografias orientativas. Mantém as quantidades prescritas no teu plano.";
  sheet.append(foot);
  function renderOption(index){
   content.replaceChildren();
   for(const [i,tab] of [...tabNav.children].entries())tab.setAttribute("aria-pressed",String(i===index));
   const option=options[index];
   for(const group of option.groups||[]){
    const photos=(group.alternatives||[]).filter(item=>item.photo_id);
    if(!photos.length)continue;
    const section=document.createElement("section");section.className="tm-portion-photo-group";
    if(group.visual_examples||photos.length>1){
     const heading=document.createElement("h3");
     heading.textContent=group.visual_examples?"Acompanhamentos":"Alternativas alimentares";
     section.append(heading);
    }
    const carousel=document.createElement("div");carousel.className="tm-portion-photo-carousel";
    carousel.setAttribute("aria-label",group.visual_examples?"Referências de acompanhamentos":"Fotografias de alimentos");
    for(const ref of photos){
     const card=document.createElement("article");card.className="tm-portion-photo-tile";
     const photo=document.createElement("img");photo.loading="lazy";photo.decoding="async";
     photo.src="/api/v2/player/visual-portions/image/"+encodeURIComponent(ref.photo_id);
     photo.alt=ref.photo_subject==="Carne branca"
       ?"Fotografia de carne branca como referência para carne ou peixe"
       :"Fotografia de "+ref.category;
     const details=document.createElement("div");details.className="tm-portion-photo-description";
     const category=document.createElement("strong");category.textContent=ref.category;
     const prescribed=document.createElement("span");
     prescribed.textContent=(ref.generic_visual?"Quantidade do acompanhamento: ":"Plano: ")+grams(ref.prescribed_g);
     const reference=document.createElement("span");reference.textContent="Fotografia: "+grams(ref.reference_g);
     details.append(category,prescribed,reference);
     if(ref.reference_rice_g!=null){
      const breakdown=document.createElement("small");
      breakdown.textContent=grams(ref.reference_rice_g)+" arroz + "+grams(ref.reference_potato_g)+" batata";
      details.append(breakdown);
     }
     if(ref.photo_subject==="Carne branca"){
      const note=document.createElement("small");note.textContent="Exemplo com carne branca";
      details.append(note);
     }
     card.append(photo,details);carousel.append(card);
    }
    section.append(carousel);content.append(section);
   }
   if(!content.children.length){
    const note=document.createElement("p");note.className="tm-portion-sheet-empty";
    note.textContent="Não existem fotografias disponíveis para esta opção.";
    content.append(note);
   }
   content.scrollTop=0;
  }
  if(options.length>1){
   options.forEach((option,i)=>{
    const tab=document.createElement("button");tab.type="button";tab.className="tm-portion-sheet-tab";
    tab.textContent=option.title||"Opção "+(option.number||i+1);
    tab.addEventListener("click",()=>renderOption(i));tabNav.append(tab);
   });
  }else tabNav.hidden=true;
  renderOption(0);
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
  document.body.append(overlay);
  document.body.classList.add("visual-portions-open");
  layer=overlay;
  document.addEventListener("keydown",overlay._key);
  closeButton.focus({preventScroll:true});
 }
 function appendAction({card,date,mealTitle,color,meal,displayed,index,refresh}){
  if(!card||!matched(displayed,index,color,meal).length)return;
  const button=document.createElement("button");button.type="button";button.className="tm-daily-portions-action";
  button.textContent="Ver porções";
  button.setAttribute("aria-label","Ver porções de "+mealTitle);
  button.addEventListener("click",async()=>{
   if(button.disabled)return;
   button.disabled=true;
   try{
    // Refresh against current published snapshots before opening the sheet.
    const current=await refresh();
    if(!card.isConnected)return;
    const options=matched(displayed,current?.options_by_color||{},color,meal);
    if(options.length)show(date,mealTitle,options);
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
