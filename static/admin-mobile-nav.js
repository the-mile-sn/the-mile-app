/* The Mile Admin: complete horizontal mobile navigation.
   Reuses existing destinations, events and desktop sidebar without touching page layouts. */
(()=>{
 const sidebar=document.querySelector(".tm-admin-sidebar");
 const track=sidebar?.querySelector(".tm-admin-mobile-nav-track");
 const main=track?.querySelector(".tm-admin-side-nav");
 const more=track?.querySelector(".tm-admin-more-trigger");
 const account=sidebar?.querySelector("#tm-admin-account-actions");
 const food=sidebar?.querySelector("#tm-admin-food-subnav");
 const foodLink=sidebar?.querySelector("#tm-admin-nav-food-library");
 if(!sidebar||!track||!main||!account)return;
 const mobile=()=>window.matchMedia("(max-width:830px)").matches;
 const foodAnchor=document.createComment("The Mile food subnav desktop location");
 food?.parentNode?.insertBefore(foodAnchor,food);
 const navLinks=Array.from(main.querySelectorAll(":scope > .tm-admin-nav-link"));
 const options=Array.from(account.querySelectorAll(":scope > .tm-admin-nav-link"));
 const accountAnchors=options.map(link=>{
  const marker=document.createComment("Original account navigation position");
  link.parentNode.insertBefore(marker,link);
  return {link,marker};
 });
 const allTabs=[...navLinks,...options];
 const nameFor=link=>link.getAttribute("aria-label")||link.getAttribute("title")||
  link.querySelector("span:not(.tm-admin-nav-icon)")?.textContent?.trim()||"Secção";
 allTabs.forEach(link=>{
  const name=nameFor(link);
  link.setAttribute("aria-label",name);
  link.setAttribute("title",name);
 });

 const hasActive=node=>!!node?.classList.contains("is-active")||node?.getAttribute("aria-current")==="page";
 const currentFood=()=>hasActive(foodLink)||!!food?.querySelector(".is-active,[aria-current='page']");
 const selectedPrimary=()=>currentFood()?foodLink:allTabs.find(hasActive)||allTabs.find(a=>a.getAttribute("href")===window.location.pathname);
 const scrollElementInto=(container,node,animate=false)=>{
  if(!container||!node||!mobile())return;
  const visible=container.getBoundingClientRect(),rect=node.getBoundingClientRect();
  const inset=18;
  let delta=0;
  if(rect.right>visible.right-inset)delta=rect.right-(visible.right-inset);
  else if(rect.left<visible.left+inset)delta=rect.left-(visible.left+inset);
  if(Math.abs(delta)>2)container.scrollBy({left:delta,behavior:animate?"smooth":"instant"});
 };
 let previousPrimary=null;
 function refresh(animate=false){
  if(!mobile())return;
  const selected=selectedPrimary();
  navLinks.forEach(link=>{
   const active=link===selected;
   link.classList.toggle("tm-mobile-current",active);
   if(active)link.setAttribute("data-mobile-active","true");
   else link.removeAttribute("data-mobile-active");
  });
  if(food){
   const visible=currentFood();
   food.hidden=!visible;
   food.classList.toggle("tm-mobile-subnav-open",visible);
   if(visible){
    const sub=food.querySelector(".is-active,[aria-current='page']");
    if(sub)scrollElementInto(food,sub,animate);
   }
  }
  if(selected&&selected!==previousPrimary){
   scrollElementInto(track,selected,animate);
   previousPrimary=selected;
  }
 }
 function sync(){
  if(mobile()){
   sidebar.classList.add("tm-complete-mobile-nav");
   more?.setAttribute("hidden","");
   // Settings stay in a separate compact account control.
   account.classList.remove("is-mobile-open");
   if(food&&food.parentNode!==sidebar)sidebar.insertBefore(food,account);
   // All work areas already exist as main nav links; no IDs or handlers change.
   refresh(false);
  }else{
   sidebar.classList.remove("tm-complete-mobile-nav");
   more?.removeAttribute("hidden");
   if(food&&foodAnchor.parentNode)foodAnchor.after(food);
   food?.classList.remove("tm-mobile-subnav-open");
   if(food)food.hidden=!hasActive(foodLink);
   allTabs.forEach(link=>{link.classList.remove("tm-mobile-current");link.removeAttribute("data-mobile-active");});
   previousPrimary=null;
  }
 }
 // Observes existing application route state; does not override navigation.
 const watch=[...allTabs,...(food?Array.from(food.querySelectorAll("a")):[])];
 for(const node of watch)new MutationObserver(()=>{if(mobile())requestAnimationFrame(()=>refresh(true));})
  .observe(node,{attributes:true,attributeFilter:["class","aria-current"]});
 if(foodLink)foodLink.addEventListener("click",()=>{
  if(mobile())requestAnimationFrame(()=>refresh(true));
 });
 track.addEventListener("keydown",event=>{
  if(!mobile()||!["ArrowLeft","ArrowRight"].includes(event.key))return;
  const focusable=allTabs.filter(link=>!link.hidden);
  const idx=focusable.indexOf(document.activeElement);
  if(idx<0)return;
  const next=focusable[idx+(event.key==="ArrowRight"?1:-1)];
  if(next){event.preventDefault();next.focus();scrollElementInto(track,next,true);}
 });
 window.addEventListener("resize",sync,{passive:true});
 sync();
 requestAnimationFrame(()=>refresh(false));
})();

/* The Mile: shared clear-search action, on desktop and mobile.
   Works for static and dynamically created search inputs; the original search
   handlers remain responsible for applying filters and dropdown results. */
(()=>{
 const searchSelector='input[type="search"]:not([data-tm-no-clear])';
 const attached=new WeakSet();
 const controls=new Map();
 let scheduled=false;

 function place(input,button){
  if(!input.isConnected||!button.isConnected)return;
  const parent=input.parentElement;
  if(!parent)return;
  const r=input.getBoundingClientRect();
  const p=parent.getBoundingClientRect();
  // Buttons are positioned against the input, not against result dropdowns.
  button.style.left=Math.round(r.right-p.left-parent.clientLeft-38)+"px";
  button.style.top=Math.round(r.top-p.top-parent.clientTop+(r.height-32)/2)+"px";
 }
 function update(input){
  const button=controls.get(input);
  if(!button)return;
  const hasValue=Boolean(input.value)&&!input.disabled&&!input.readOnly;
  button.hidden=!hasValue;
  if(hasValue)place(input,button);
 }
 function refresh(){
  scheduled=false;
  for(const [input,button] of controls){
   if(!input.isConnected){
    button.remove();
    controls.delete(input);
   }else update(input);
  }
 }
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(refresh);
 }
 function attach(input){
  if(attached.has(input))return;
  const parent=input.parentElement;
  if(!parent)return;
  attached.add(input);
  // Keep the existing input and all its listeners in place.
  if(getComputedStyle(parent).position==="static")parent.style.position="relative";
  const clear=document.createElement("button");
  clear.type="button";
  clear.className="tm-search-clear";
  clear.setAttribute("aria-label","Limpar pesquisa");
  clear.title="Limpar pesquisa";
  clear.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  clear.hidden=true;
  input.insertAdjacentElement("afterend",clear);
  input.classList.add("tm-has-search-clear");
  controls.set(input,clear);
  clear.addEventListener("pointerdown",event=>event.preventDefault());
  clear.addEventListener("click",event=>{
   event.preventDefault();
   event.stopPropagation();
   if(!input.value)return;
   input.value="";
   update(input);
   input.dispatchEvent(new Event("input",{bubbles:true}));
   input.dispatchEvent(new Event("change",{bubbles:true}));
  });
  input.addEventListener("input",()=>update(input));
  input.addEventListener("change",()=>update(input));
  input.addEventListener("focus",()=>update(input));
  update(input);
 }
 function discover(root){
  if(root.nodeType!==1&&root.nodeType!==9)return;
  if(root.matches?.(searchSelector))attach(root);
  root.querySelectorAll?.(searchSelector).forEach(attach);
 }
 discover(document);
 new MutationObserver(records=>{
  for(const record of records){
   for(const node of record.addedNodes)discover(node);
   for(const node of record.removedNodes){
    if(node.nodeType===1&&node.matches?.(searchSelector))schedule();
   }
  }
  schedule();
 }).observe(document.body,{childList:true,subtree:true});
 window.addEventListener("resize",schedule,{passive:true});
 window.addEventListener("orientationchange",schedule,{passive:true});
 document.addEventListener("focusin",event=>{
  if(event.target.matches?.(searchSelector))update(event.target);
 });
})();
