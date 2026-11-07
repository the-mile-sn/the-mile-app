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
 const planning=sidebar.querySelector("#tm-admin-nav-planning");
 const plans=sidebar.querySelector("#tm-admin-nav-create-plan");
 const moving=[...secondary,...(recipes?[recipes]:[]),...(plans?[plans]:[])];
 const markers=new Map();
 for(const node of moving){
  const mark=document.createComment("Original admin navigation position");
  node.parentNode?.insertBefore(mark,node);
  markers.set(node,mark);
 }
 let expanded=false;
 function selectedSecondary(){
  return secondary.some(node=>node.classList.contains("is-active"))||
   !!recipes?.querySelector(".is-active")||
   (standalone&&!!sidebar.querySelector("#tm-admin-nav-food-library.is-active"));
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
  }else{
   collapse();
   for(const [node,mark] of markers)if(mark.parentNode)mark.after(node);
   // Main app updates this state when opening its dish/recipe library.
   if(recipes&& !standalone)recipes.hidden=!recipeLink?.classList.contains("is-active");
   if(recipes&&standalone)recipes.hidden=false;
  }
  paint();
 }
 more.addEventListener("click",event=>{
  if(!mobile())return;
  event.preventDefault();event.stopPropagation();
  const opening=!menu.classList.contains("is-mobile-open");
  collapse();
  if(opening){
   menu.classList.add("is-mobile-open");
   more.setAttribute("aria-expanded","true");
  }
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
  // Preserve active More state for the destination after navigation changes.
  collapse();
  setTimeout(paint,0);
 });
 document.addEventListener("click",event=>{
  if(!sidebar.contains(event.target))collapse();
 });
 document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&menu.classList.contains("is-mobile-open")){collapse();more.focus();}
 });
 window.addEventListener("resize",sync);
 // Main app applies active classes during navigation, after this module loads.
 for(const node of [...secondary,...(recipes?Array.from(recipes.querySelectorAll(".tm-admin-subnav-link")):[])]){
  new MutationObserver(paint).observe(node,{attributes:true,attributeFilter:["class","aria-current"]});
 }
 sync();
})();
