"use strict";
/* Recipe interface is deliberately isolated from the existing player UI. */
(function(){
 const area=document.getElementById("player-recipes-area");
 const menuContent=document.getElementById("menu-content");
 const switcher=document.getElementById("menus-recipe-switch");
 let mode="menus",screen={kind:"categories"},library=null,token=0;
 const photos=new Map();
 let returnScroll=0,categoryScroll=0,listScroll=0;
 const position=()=>Math.max(0,window.scrollY||0);
 const scrollTop=()=>window.scrollTo({top:0,behavior:"instant"});
 const restoreScroll=y=>window.requestAnimationFrame(()=>window.scrollTo({top:y,behavior:"instant"}));
 const node=(tag,cls,content)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(content!==undefined)el.textContent=String(content);
  return el;
 };
 const current=()=>window.playerSessionEpoch===undefined?playerSessionEpoch:window.playerSessionEpoch;
 const request=path=>api(path);
 function message(text){area.replaceChildren(node("p","recipe-message",text));}
 function thumb(id,large=false){
  const placeholder=node("span","recipe-thumb-placeholder","•");
  if(!id)return placeholder;
  const img=node("img",large?"recipe-hero":"recipe-thumb");
  img.alt="";img.loading="lazy";img.decoding="async";
  const epoch=current();
  const key=String(id);
  if(!photos.has(key)){
   const pending=fetch("/api/v2/player/recipe-photo/"+encodeURIComponent(key),
    {credentials:"same-origin",cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("photo");return r.blob();})
    .then(blob=>URL.createObjectURL(blob)).catch(()=>null);
   photos.set(key,pending);
  }
  photos.get(key).then(src=>{
   if(epoch!==current()||!img.isConnected)return;
   if(src){img.src=src;img.onerror=()=>img.replaceWith(placeholder);}
   else img.replaceWith(placeholder);
  });
  return img;
 }
 function goBack(callback){
  const header=node("div","recipe-topline");
  const back=node("button","recipe-back","‹");back.type="button";
  back.setAttribute("aria-label","Voltar");back.onclick=callback;
  header.append(back);return header;
 }
 function card(name,small,photoId,callback){
  const button=node("button","recipe-item");button.type="button";button.onclick=callback;
  button.append(thumb(photoId));
  const info=node("div","recipe-item-body");
  info.append(node("strong","",name));
  if(small)info.append(node("small","",small));
  button.append(info,node("span","recipe-chevron","›"));
  return button;
 }
 function startLibrary(){
  library=null;
  mode="recipes";screen={kind:"categories"};
  scrollTop();
  syncMode();renderCategories();
 }
 function syncMode(){
  for(const btn of switcher.querySelectorAll("button")){
   btn.setAttribute("aria-pressed",String(btn.dataset.menuMode===mode));
  }
  const secondary=screen.kind==="list"||screen.kind==="detail"||screen.kind==="dish";
  switcher.hidden=secondary;
  menuContent.hidden=mode!=="menus"||screen.kind==="dish";
  area.hidden=mode==="menus"&&screen.kind!=="dish";
 }
 async function getLibrary(){
  if(!library)library=request("/api/v2/player/recipes")
     .then(x=>x.recipes||[]).catch(e=>{library=null;throw e;});
  return library;
 }
 async function renderCategories(){
  const render=++token;
  syncMode();message("A carregar receitas…");
  try{
   const recipes=await getLibrary();
   if(render!==token||mode!=="recipes"||screen.kind!=="categories")return;
   const groups=new Map();
   for(const recipe of recipes){
    if(!groups.has(recipe.category_id))groups.set(recipe.category_id,{id:recipe.category_id,name:recipe.category,items:[]});
    groups.get(recipe.category_id).items.push(recipe);
   }
   const root=node("div","recipe-list");
   if(!groups.size){message("Ainda não existem receitas publicadas nas categorias disponíveis.");return;}
   for(const group of groups.values()){
    const representative=group.items.find(x=>x.has_photo);
    root.append(card(group.name,
     group.items.length===1?"1 receita":group.items.length+" receitas",
     representative?.id,()=>{
      categoryScroll=position();
      screen={kind:"list",group};renderList();scrollTop();
     }));
   }
   area.replaceChildren(root);
  }catch(err){
   if(render!==token)return;
   message("Não foi possível carregar as receitas. Tenta novamente.");
  }
 }
 function renderList(){
  ++token;syncMode();
  const group=screen.group;
  const root=node("div","");
  root.append(goBack(()=>{
   screen={kind:"categories"};renderCategories().then(()=>restoreScroll(categoryScroll));
  }));
  const list=node("div","recipe-list");
  for(const r of group.items){
   list.append(card(r.name,"",r.has_photo?r.id:null,()=>{
    listScroll=position();
    screen={kind:"detail",recipeId:r.id,group};renderDetail();scrollTop();
   }));
  }
  root.append(list);area.replaceChildren(root);
 }
 function ingredientList(parent,sections){
  for(const section of sections||[]){
   if(section.title)parent.append(node("h4","recipe-section-heading",section.title));
   const ingredients=node("div","");
   for(const entry of section.ingredients||[]){
    const line=node("div","recipe-ingredient");
    line.append(node("span","recipe-ingredient-name",entry.name||""));
    const amount=[entry.quantity,entry.unit].filter(Boolean).join(" ");
    line.append(node("span","recipe-ingredient-quantity",amount));
    ingredients.append(line);
   }
   parent.append(ingredients);
  }
 }
 function detail(recipe,includePhoto=true){
  const root=node("div","recipe-detail");
  if(includePhoto&&recipe.has_photo)root.append(thumb(recipe.id,true));
  root.append(node("h2","",recipe.name||""));
  root.append(node("div","recipe-servings",
   Number(recipe.servings)===1?"1 porção":String(recipe.servings)+" porções"));
  root.append(node("h3","","Ingredientes"));
  ingredientList(root,recipe.sections);
  root.append(node("h3","","Preparação"));
  (recipe.steps||[]).forEach((step,i)=>{
   const row=node("div","recipe-step");
   row.append(node("span","recipe-step-number",i+1),node("span","",step));
   root.append(row);
  });
  if(recipe.notes&&recipe.notes.trim()){
   root.append(node("h3","","Dicas e observações"));
   root.append(node("p","recipe-notes",recipe.notes));
  }
  return root;
 }
 async function loadDetail(recipeId,root,shouldRender){
  const epoch=current();
  try{
   const response=await request("/api/v2/player/recipes/"+encodeURIComponent(recipeId));
   if(epoch!==current()||!shouldRender())return;
   root.replaceChildren(detail(response.recipe));
  }catch(err){
   if(epoch===current()&&shouldRender())root.replaceChildren(node("p","recipe-message","Receita indisponível."));
  }
 }
 function renderDetail(){
  const render=++token;syncMode();
  const r=screen;
  const root=node("div","");
  root.append(goBack(()=>{
   screen={kind:"list",group:r.group};renderList();restoreScroll(listScroll);
  }));
  const content=node("div","");
  content.append(node("p","recipe-message","A carregar receita…"));
  root.append(content);area.replaceChildren(root);
  loadDetail(r.recipeId,content,()=>render===token&&screen.kind==="detail");
 }
 async function openDish(dishId,dishName,dishPhotoUrl){
  returnScroll=position();
  mode="menus";screen={kind:"dish",dishId,dishName};
  const render=++token;syncMode();message("A carregar receitas…");
  try{
   const data=await request("/api/v2/player/dish-recipes/"+encodeURIComponent(dishId));
   if(render!==token||screen.kind!=="dish")return;
   const entries=data.recipes||[];
   if(!entries.length){closeDish();return;}
   const root=node("div","");
   root.append(goBack(closeDish));
   if(entries.length===1){
    const detailRoot=node("div","");
    root.append(detailRoot);
    area.replaceChildren(root);
    loadDetail(entries[0].id,detailRoot,()=>render===token&&screen.kind==="dish");
    return;
   }
   // Multi-recipe presentation reuses the existing expandable-card pattern.
   if(dishPhotoUrl){
    const photo=node("img","recipe-hero");photo.alt=dishName;photo.src=dishPhotoUrl;
    root.append(photo);
   }
   for(const entry of entries){
    const section=node("details","recipe-accordion");
    const summary=node("summary","",entry.name);
    const body=node("div","");
    section.append(summary,body);
    section.addEventListener("toggle",()=>{
     if(!section.open||section.dataset.loaded)return;
     section.dataset.loaded="true";
     body.append(node("p","recipe-message","A carregar receita…"));
     loadDetail(entry.id,body,()=>render===token&&section.isConnected);
    });
    root.append(section);
   }
   area.replaceChildren(root);
  }catch(err){
   if(render===token&&screen.kind==="dish")message("Não foi possível abrir as receitas deste prato.");
  }
 }
 function closeDish(){
  const wasDish=screen.kind==="dish";
  ++token;screen={kind:"categories"};mode="menus";syncMode();
  area.replaceChildren();
  if(wasDish)restoreScroll(returnScroll);
 }
 function reset(){
  ++token;mode="menus";screen={kind:"categories"};library=null;
  returnScroll=0;categoryScroll=0;listScroll=0;
  for(const pending of photos.values())pending.then(src=>{if(src)URL.revokeObjectURL(src);});
  photos.clear();area.replaceChildren();syncMode();
 }
 for(const button of switcher.querySelectorAll("button")){
  button.addEventListener("click",()=>{
   if(button.dataset.menuMode==="menus"){closeDish();return;}
   if(mode==="recipes"&&screen.kind!=="dish")return;
   startLibrary();
  });
 }
 // Optional edge-swipe back for recipe subpages; ignore normal vertical scroll.
 let touchStart=null;
 area.addEventListener("touchstart",event=>{
  if(event.touches.length!==1||!["list","detail","dish"].includes(screen.kind)){
   touchStart=null;return;
  }
  const p=event.touches[0];
  touchStart=p.clientX<=38?{x:p.clientX,y:p.clientY,kind:screen.kind}:null;
 },{passive:true});
 area.addEventListener("touchend",event=>{
  if(!touchStart||event.changedTouches.length!==1)return;
  const p=event.changedTouches[0],start=touchStart;touchStart=null;
  if(start.kind!==screen.kind||p.clientX-start.x<90||
    Math.abs(p.clientY-start.y)>65)return;
  const back=area.querySelector(".recipe-topline .recipe-back");
  if(back)back.click();
 },{passive:true});
 area.addEventListener("touchcancel",()=>{touchStart=null;},{passive:true});
 window.themileRecipes={mode:()=>mode,openDish,reset,onShow:syncMode};
})();
