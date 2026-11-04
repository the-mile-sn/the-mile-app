"use strict";
/* Recipe interface is deliberately isolated from the existing player UI. */
(function(){
 const area=document.getElementById("player-recipes-area");
 const menuContent=document.getElementById("menu-content");
 const switcher=document.getElementById("menus-recipe-switch");
 let mode="menus",screen={kind:"categories"},library=null,token=0;
 const photos=new Map();
 let returnScroll=0,categoryScroll=0,listScroll=0,dishListScroll=0;
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
  const img=node("img",large?"recipe-detail-photo":"recipe-thumb");
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
   if(src){img.src=src;img.onerror=()=>large?img.remove():img.replaceWith(placeholder);}
   else if(large)img.remove();
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
  const secondary=["list","detail","dish","dish-detail"].includes(screen.kind);
  switcher.hidden=secondary;
  menuContent.hidden=mode!=="menus"||["dish","dish-detail"].includes(screen.kind);
  area.hidden=mode==="menus"&&!["dish","dish-detail"].includes(screen.kind);
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
 const portions=value=>Number(value)===1?"1 porção":String(value)+" porções";
 // Keep the 1.5px rounded outline style used by the rest of The Mile.
 // Ingredients reuse the app's existing official meal icon.
 function sectionIcon(kind){
  if(kind==="ingredients")return mealIcon("restaurant-02");
  const icon=node("span","recipe-section-icon");
  icon.setAttribute("aria-hidden","true");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("fill","none");
  svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-width","1.5");
  svg.setAttribute("stroke-linecap","round");
  svg.setAttribute("stroke-linejoin","round");
  const strokes=kind==="preparation"
   ?["M6 13.9A4 4 0 0 1 6.5 6a6 6 0 0 1 11 0 4 4 0 0 1 .5 7.9V21H6v-7.1","M6 17h12"]
   :["M9 18h6","M10 21h4","M9 14a6 6 0 1 1 6 0l-1 4h-4l-1-4Z"];
  for(const d of strokes){
   const p=document.createElementNS("http://www.w3.org/2000/svg","path");
   p.setAttribute("d",d);svg.append(p);
  }
  icon.append(svg);
  return icon;
 }
 function sectionTitle(label,kind){
  const h=node("h3","recipe-section-title");
  const tile=node("span","recipe-icon-tile");
  tile.setAttribute("aria-hidden","true");
  tile.append(sectionIcon(kind));
  h.append(tile,node("span","",label));
  return h;
 }
 // A recipe from the independent library has one small photo alongside its name.
 // Menus do not repeat the dish photo, and multi-recipe cards use their summary
 // for the recipe name and portion count.
 function detail(recipe,{includePhoto=true,includeTitle=true,includeServings=true,standalone=true}={}){
  const root=node("div","recipe-detail");
  if(standalone)root.classList.add("recipe-detail-standalone");
  if(includeTitle||includeServings||(includePhoto&&recipe.has_photo)){
   const identity=node("div","recipe-identity");
   const copy=node("div","recipe-identity-copy");
   if(includeTitle)copy.append(node("h2","",recipe.name||""));
   if(includeServings)copy.append(node("div","recipe-servings",portions(recipe.servings)));
   identity.append(copy);
   if(includePhoto&&recipe.has_photo)identity.append(thumb(recipe.id,true));
   root.append(identity);
  }
  const ingredients=node("section","recipe-content-section");
  ingredients.append(sectionTitle("Ingredientes","ingredients"));
  ingredientList(ingredients,recipe.sections);
  root.append(ingredients);
  const preparation=node("section","recipe-content-section");
  preparation.append(sectionTitle("Preparação","preparation"));
  (recipe.steps||[]).forEach((step,i)=>{
   const row=node("div","recipe-step");
   row.append(node("span","recipe-step-number",i+1),node("span","",step));
   preparation.append(row);
  });
  root.append(preparation);
  if(recipe.notes&&recipe.notes.trim()){
   const tips=node("section","recipe-content-section");
   tips.append(sectionTitle("Dicas úteis","tips"));
   tips.append(node("p","recipe-notes",recipe.notes));
   root.append(tips);
  }
  return root;
 }
 async function loadDetail(recipeId,root,shouldRender,options={}){
  const epoch=current();
  try{
   const response=await request("/api/v2/player/recipes/"+encodeURIComponent(recipeId));
   if(epoch!==current()||!shouldRender())return;
   root.replaceChildren(detail(response.recipe,options));
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
 async function openDish(dishId,dishName){
  returnScroll=position();
  mode="menus";screen={kind:"dish",dishId,dishName};
  const render=++token;syncMode();scrollTop();message("A carregar receitas…");
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
    loadDetail(entries[0].id,detailRoot,()=>render===token&&screen.kind==="dish",
     {includePhoto:false});
    return;
   }
   // Multi-recipe dishes use the SAME photo/name/chevron cards as the library.
   // The menu dish photo stays on its menu card; here each recipe photo appears once.
   const list=node("div","recipe-list");
   for(const entry of entries){
    list.append(card(entry.name,"",entry.has_photo?entry.id:null,()=>{
     dishListScroll=position();
     screen={kind:"dish-detail",dishId,dishName,entries,recipeId:entry.id};
     renderDishDetail();
     scrollTop();
    }));
   }
   root.append(list);
   area.replaceChildren(root);
  }catch(err){
   if(render===token&&screen.kind==="dish")message("Não foi possível abrir as receitas deste prato.");
  }
 }
 function renderDishDetail(){
  const render=++token;syncMode();
  const state=screen;
  const root=node("div","");
  root.append(goBack(()=>{
   if(screen.kind!=="dish-detail")return;
   screen={kind:"dish",dishId:state.dishId,dishName:state.dishName,entries:state.entries};
   renderDishList(state.entries);
   restoreScroll(dishListScroll);
  }));
  const content=node("div","");
  content.append(node("p","recipe-message","A carregar receita…"));
  root.append(content);area.replaceChildren(root);
  loadDetail(state.recipeId,content,()=>render===token&&screen.kind==="dish-detail"&&screen.recipeId===state.recipeId,
   {includePhoto:false});
 }
 function renderDishList(entries){
  ++token;syncMode();
  const state=screen;
  const root=node("div","");
  root.append(goBack(closeDish));
  const list=node("div","recipe-list");
  for(const entry of entries){
   list.append(card(entry.name,"",entry.has_photo?entry.id:null,()=>{
    dishListScroll=position();
    screen={kind:"dish-detail",dishId:state.dishId,dishName:state.dishName,entries,recipeId:entry.id};
    renderDishDetail();scrollTop();
   }));
  }
  root.append(list);area.replaceChildren(root);
 }
 function closeDish(){
  const wasDish=screen.kind==="dish"||screen.kind==="dish-detail";
  ++token;screen={kind:"categories"};mode="menus";syncMode();
  area.replaceChildren();
  if(wasDish)restoreScroll(returnScroll);
 }
 function reset(){
  ++token;mode="menus";screen={kind:"categories"};library=null;
  returnScroll=0;categoryScroll=0;listScroll=0;dishListScroll=0;
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
  if(event.touches.length!==1||!["list","detail","dish","dish-detail"].includes(screen.kind)){
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
