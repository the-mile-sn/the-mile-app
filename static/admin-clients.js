"use strict";
/* Clientes is the single account-management entry. Underlying athlete and
   Chef security models remain separate: never relabel database roles. */
(() => {
  const page=document.getElementById("tm-players-page");
  const tabs=document.getElementById("tm-clients-types");
  const chooser=document.getElementById("tm-clients-create-choice");
  const newButton=document.getElementById("tm-players-new");
  const inlineButton=document.getElementById("tm-clients-new-inline");
  const inlineWrap=document.getElementById("tm-clients-create-shortcut");
  const athleteList=page?.querySelector(".tm-players-list-surface");
  const archive=document.getElementById("tm-players-archived-panel");
  const profile=document.getElementById("tm-players-profile");
  const profileNav=document.getElementById("tm-players-profile-nav");
  const consultations=document.getElementById("tm-clients-consultations-panel");
  const chefs=document.getElementById("tm-clients-chefs-panel");
  if(!page||!tabs||!chooser||!newButton||!athleteList||!archive||!profile||!consultations||!chefs)return;

  const validTypes=new Set(["acompanhamento","consulta","chef"]);
  let selected="acompanhamento";
  const detailVisible=()=>!profile.hidden;
  const typeButtons=[...tabs.querySelectorAll("[data-client-type]")];

  function selectType(type,focus=false){
    if(!validTypes.has(type))return;
    selected=type;
    const isProfile=detailVisible();
    tabs.hidden=isProfile;
    for(const button of typeButtons){
      const active=button.dataset.clientType===type;
      button.setAttribute("aria-selected",String(active));
      button.tabIndex=active?0:-1;
      if(active&&focus)button.focus();
    }
    athleteList.hidden=isProfile||type!=="acompanhamento";
    archive.hidden=isProfile||type!=="acompanhamento";
    consultations.hidden=isProfile||type!=="consulta";
    chefs.hidden=isProfile||type!=="chef";
    inlineWrap.hidden=isProfile||type==="acompanhamento";
    if(type==="chef"&&!isProfile){
      // Opening this existing native <details> loads the authorized linked
      // accounts, without moving the menus review panel away from Planning.
      const details=document.getElementById("tm-chef-management");
      if(details)details.open=true;
    }
  }
  for(const button of typeButtons){
    button.addEventListener("click",()=>selectType(button.dataset.clientType));
    button.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      event.preventDefault();
      const index=typeButtons.indexOf(button);
      const next=event.key==="Home"?0:event.key==="End"?typeButtons.length-1:
        (index+(event.key==="ArrowRight"?1:-1)+typeButtons.length)%typeButtons.length;
      selectType(typeButtons[next].dataset.clientType,true);
    });
  }
  function closeChoice(){
    if(chooser.open)chooser.close();
  }
  function openChoice(){
    if(!chooser.open)chooser.showModal();
  }
  // The existing athlete-create handler lives in admin-dashboard.js.
  // Intercept only the top-level account chooser and preserve the real
  // athlete dialog and its per-field validations.
  newButton.addEventListener("click",event=>{
    event.preventDefault();event.stopImmediatePropagation();openChoice();
  },true);
  inlineButton.addEventListener("click",openChoice);
  document.getElementById("tm-clients-choice-close").addEventListener("click",closeChoice);
  chooser.addEventListener("click",event=>{
    if(event.target!==chooser)return;
    const r=chooser.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeChoice();
  });
  for(const button of chooser.querySelectorAll("[data-new-client-type]")){
    button.addEventListener("click",()=>{
      const type=button.dataset.newClientType;
      closeChoice();
      selectType(type);
      if(type==="acompanhamento"){
        if(typeof window.tmOpenPlayerCreate==="function")window.tmOpenPlayerCreate();
      }else if(type==="chef"){
        const details=document.getElementById("tm-chef-management");
        if(details){
          details.open=true;
          details.scrollIntoView({behavior:"smooth",block:"start"});
          const first=details.querySelector("input[name=name]");
          if(first)first.focus({preventScroll:true});
        }
      }else if(type==="consulta"){
        consultations.scrollIntoView({behavior:"smooth",block:"nearest"});
      }
    });
  }
  // A player profile is a subpage of Acompanhamentos. Hide the account-type
  // tabs while inside that existing screen, then restore on return.
  const observer=new MutationObserver(()=>{
    if(detailVisible()){
      selected="acompanhamento";
      tabs.hidden=true;
      chefs.hidden=true;
      consultations.hidden=true;
      inlineWrap.hidden=true;
    }else{
      selectType(selected);
    }
  });
  observer.observe(profile,{attributes:true,attributeFilter:["hidden"]});
  if(profileNav)observer.observe(profileNav,{attributes:true,attributeFilter:["hidden"]});
  // Re-entering Clientes from the main navigation always shows its default
  // list, just as the previous Jogadores navigation did.
  document.getElementById("tm-admin-nav-players")?.addEventListener("click",
    ()=>selectType("acompanhamento"),true);
  // Optional internal entry point for future workspace navigation.
  window.tmSelectClientType=selectType;
  selectType(selected);
})();
