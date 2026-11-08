/* The Mile Admin: mobile-only navigation; original desktop elements are restored at wider breakpoints. */
(()=>{
 const sidebar=document.querySelector(".tm-admin-sidebar");
 const track=sidebar?.querySelector(".tm-admin-mobile-nav-track");
 const more=sidebar?.querySelector(".tm-admin-more-trigger");
 const menu=sidebar?.querySelector("#tm-admin-account-actions");
 const recipes=sidebar?.querySelector("#tm-admin-recipes-subnav");
 const recipeLink=sidebar?.querySelector("#tm-admin-nav-menus-recipes");
 if(!sidebar||!track||!more||!menu)return;
 const standalone=!!document.querySelector(".tm-library-layout");
 const mobile=()=>window.matchMedia("(max-width:830px)").matches;
 const ids=["tm-admin-nav-food-library","tm-admin-nav-menus-recipes","tm-admin-nav-assessments","tm-admin-nav-forms"];
 const secondary=ids.map(id=>sidebar.querySelector("#"+id)).filter(Boolean);
 const accountLinks=Array.from(menu.querySelectorAll(".tm-admin-nav-link"));
 const secondaryControls=[...secondary,...accountLinks];
 const selectedAtEntry=secondaryControls.some(node=>node.classList.contains("is-active"));
 const planning=sidebar.querySelector("#tm-admin-nav-planning");
 const plans=sidebar.querySelector("#tm-admin-nav-create-plan");
 const moving=[...secondary,...(recipes?[recipes]:[]),...(plans?[plans]:[])];
 const primaryIds=["tm-admin-nav-dashboard","tm-admin-nav-players","tm-admin-nav-planning","tm-admin-nav-create-plan"];
 const primary=primaryIds.map(id=>sidebar.querySelector("#"+id)).filter(Boolean);
 const markers=new Map();
 for(const node of moving){
  const mark=document.createComment("Original admin navigation position");
  node.parentNode?.insertBefore(mark,node);
  markers.set(node,mark);
 }
 let expanded=false;
 // Keep the selected mobile tab completely visible with a comfortable right inset.
 // Only scroll the horizontal track; never change the page's vertical position.
 function revealActiveTab(animate=false){
  if(!mobile())return;
  const selected=primary.find(node=>node.classList.contains("is-active"));
  if(!selected)return;
  const trackRect=track.getBoundingClientRect();
  const rect=selected.getBoundingClientRect();
  const inset=16;
  const left=trackRect.left+inset;
  const right=trackRect.right-inset;
  let delta=0;
  if(rect.right>right)delta=rect.right-right;
  else if(rect.left<left)delta=rect.left-left;
  if(Math.abs(delta)>1)track.scrollBy({left:delta,behavior:animate?"smooth":"instant"});
 }
 function selectedSecondary(){
  return secondaryControls.some(node=>node.classList.contains("is-active"))||
   !!recipes?.querySelector(".is-active");
 }
 function openMore(){
  if(!mobile())return;
  menu.classList.add("is-mobile-open");
  more.setAttribute("aria-expanded","true");
  paint();
 }
 function paint(){
  more.classList.toggle("is-active",mobile()&&(menu.classList.contains("is-mobile-open")||selectedSecondary()));
 }
 function collapse(){
  menu.classList.remove("is-mobile-open");
  more.setAttribute("aria-expanded","false");
  recipes?.classList.remove("is-mobile-open");
  expanded=false;
  if(recipeLink)recipeLink.setAttribute("aria-expanded","false");
  paint();
 }
 function sync(){
  if(mobile()){
   const first=menu.firstElementChild;
   for(const node of secondary)menu.insertBefore(node,first);
   if(recipes&&recipeLink){
    menu.insertBefore(recipes,recipeLink.nextSibling);
    recipes.classList.toggle("is-mobile-open",expanded);
    recipes.hidden=!expanded;
   }
   if(plans&&planning&&plans.previousElementSibling!==planning)planning.after(plans);
   if(selectedSecondary())openMore();
   if(recipes?.querySelector(".is-active")){
    expanded=true;recipes.hidden=false;recipes.classList.add("is-mobile-open");
    recipeLink?.setAttribute("aria-expanded","true");
   }
  }else{
   collapse();
   for(const [node,mark] of markers)if(mark.parentNode)mark.after(node);
   // Main app updates this state when opening its dish/recipe library.
   if(recipes&& !standalone)recipes.hidden=!recipeLink?.classList.contains("is-active");
   if(recipes&&standalone)recipes.hidden=false;
  }
  paint();
  if(mobile())requestAnimationFrame(()=>revealActiveTab());
 }
 // Choosing a primary destination must collapse More immediately, even if
 // navigation is asynchronous or the previous secondary item is still active.
 for(const node of primary){
  node.addEventListener("click",()=>{
   if(mobile()){
    collapse();
    requestAnimationFrame(()=>revealActiveTab(true));
   }
  },true);
 }
 more.addEventListener("click",event=>{
  if(!mobile())return;
  event.preventDefault();event.stopPropagation();
  const opening=!menu.classList.contains("is-mobile-open");
  collapse();
  if(opening)openMore();
  paint();
 });
 if(recipeLink)recipeLink.addEventListener("click",event=>{
  if(!mobile())return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  expanded=!expanded;
  if(recipes){
   recipes.hidden=!expanded;
   recipes.classList.toggle("is-mobile-open",expanded);
  }
  recipeLink.setAttribute("aria-expanded",String(expanded));
  paint();
 },true);
 menu.addEventListener("click",event=>{
  const target=event.target.closest("a,button");
  if(!target||target===recipeLink)return;
  // Secondary destinations retain the expanded panel when they update in place.
  // Full page destinations initialize open when their active item is found.
  if(mobile()){
   openMore();
   if(recipes?.contains(target))expanded=true;
   requestAnimationFrame(()=>{
    if(selectedSecondary())openMore();
    paint();
   });
  }
 });
 document.addEventListener("click",event=>{
  if(!sidebar.contains(event.target))collapse();
 });
 document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&menu.classList.contains("is-mobile-open")){collapse();more.focus();}
 });
 window.addEventListener("resize",sync);
 // Main app applies active classes during navigation, after this module loads.
 for(const node of [...secondaryControls,...primary,...(recipes?Array.from(recipes.querySelectorAll(".tm-admin-subnav-link")):[])]){
  new MutationObserver(()=>{
   if(!mobile())return;
   // When a main tab becomes active, hide the secondary panel.
   // Its active state can otherwise survive while a previous view is closing.
   if(primary.some(item=>item.classList.contains("is-active"))&&!selectedSecondary()){
    collapse();
   }else if(selectedSecondary()){
    openMore();
   }else{
    paint();
   }
   requestAnimationFrame(()=>revealActiveTab(true));
  }).observe(node,{attributes:true,attributeFilter:["class","aria-current"]});
 }
 sync();
 if(mobile())requestAnimationFrame(()=>revealActiveTab());
 // Entering a standalone secondary page resets the scroll position. Keep "Mais"
 // in view so navigation and sibling destinations remain immediately accessible.
 if(standalone&&mobile()&&selectedAtEntry){
  track.scrollLeft=track.scrollWidth;
 }

})();
