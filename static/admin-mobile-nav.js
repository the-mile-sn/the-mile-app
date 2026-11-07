/* The Mile Admin: CSP-compatible mobile navigation for the main and standalone pages. */
/* Mobile navigation: menus stay outside the horizontally scrolling tab strip. */
(()=>{
 const sidebar=document.querySelector(".tm-admin-sidebar");
 const track=sidebar?.querySelector(".tm-admin-mobile-nav-track");
 const more=sidebar?.querySelector(".tm-admin-more-trigger");
 const account=sidebar?.querySelector("#tm-admin-account-actions");
 const recipes=sidebar?.querySelector("#tm-admin-recipes-subnav");
 const recipesLink=sidebar?.querySelector("#tm-admin-nav-menus-recipes");
 if(!sidebar||!track||!more||!account)return;
 const originalParent=recipes?.parentNode;
 const originalAfter=recipes?.nextSibling;
 const standalone=!!document.querySelector(".tm-library-layout");
 let recipeExpanded=false;
 const mobile=()=>window.matchMedia("(max-width:830px)").matches;
 function closeAccount(){more.setAttribute("aria-expanded","false");account.classList.remove("is-mobile-open");more.classList.remove("is-active");}
 function closeRecipes(){
  if(standalone){recipeExpanded=false;recipes?.classList.remove("is-mobile-open");}
 }
 function sync(){
  if(!recipes)return;
  if(mobile()){
   if(recipes.parentNode!==sidebar)sidebar.insertBefore(recipes,account);
   if(standalone){
    recipes.classList.toggle("is-mobile-open",recipeExpanded);
    recipesLink?.setAttribute("aria-expanded",String(recipeExpanded));
   }else{
    recipes.classList.add("is-mobile-layout");
   }
  }else{
   closeAccount();closeRecipes();
   recipes.classList.remove("is-mobile-layout");
   if(recipes.parentNode!==originalParent)originalParent?.insertBefore(recipes,originalAfter);
   if(standalone)recipesLink?.removeAttribute("aria-expanded");
  }
 }
 more.addEventListener("click",e=>{
  e.stopPropagation();
  if(!mobile())return;
  const open=more.getAttribute("aria-expanded")!=="true";
  closeAccount();closeRecipes();
  if(open){account.classList.add("is-mobile-open");more.setAttribute("aria-expanded","true");more.classList.add("is-active");}
 });
 if(standalone&&recipes&&recipesLink){
  recipesLink.addEventListener("click",e=>{
   if(!mobile())return;
   e.preventDefault();e.stopPropagation();
   closeAccount();recipeExpanded=!recipeExpanded;
   recipes.classList.toggle("is-mobile-open",recipeExpanded);
   recipesLink.setAttribute("aria-expanded",String(recipeExpanded));
  });
 }
 recipes?.addEventListener("click",e=>{if(e.target.closest("a,button")){closeAccount();if(standalone)closeRecipes();}});
 account.addEventListener("click",e=>{if(e.target.closest("a,button"))closeAccount();});
 document.addEventListener("click",e=>{
  if(!sidebar.contains(e.target)){closeAccount();if(standalone)closeRecipes();}
 });
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAccount();if(standalone)closeRecipes();more.focus();}});
 window.addEventListener("resize",sync);
 sync();
})();
