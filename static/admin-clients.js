"use strict";
/* Clientes is a shared account list. Filter the existing underlying account types;
   do not change database roles or create consultation credentials. */
(() => {
  const page=document.getElementById("tm-players-page");
  const selector=document.getElementById("tm-clients-type-filter");
  const value=document.getElementById("tm-clients-type-value");
  const chooser=document.getElementById("tm-clients-create-choice");
  const newButton=document.getElementById("tm-players-new");
  const panel=document.getElementById("tm-players-filter-panel");
  const list=document.getElementById("tm-clients-account-list");
  const players=document.getElementById("tm-players-body");
  const chefsList=document.getElementById("tm-chef-accounts");
  const archive=document.getElementById("tm-players-archived-panel");
  const profile=document.getElementById("tm-players-profile");
  const chefProfile=document.getElementById("tm-clients-chef-profile");
  const heading=page?.querySelector(".tm-players-heading");
  const consultations=document.getElementById("tm-clients-consultations-panel");
  const chefsPanel=document.getElementById("tm-clients-chefs-panel");
  const search=document.getElementById("tm-players-filter");
  const status=document.getElementById("tm-players-access");
  if(!page||!selector||!value||!chooser||!newButton||!panel||!list||!players||!chefsList||!archive||!profile||!chefProfile||!consultations||!chefsPanel||!search||!status)return;

  const validTypes=new Set(["all","acompanhamento","consulta","chef"]);
  let selected="all";
  const detailVisible=()=>!profile.hidden||!chefProfile.hidden;
  window.tmClientsCurrentType=()=>selected;
  const filterChefs=()=>window.tmFilterChefAccounts?.();

  // Mobile Chef creation uses the existing form inside a native modal, not an inline dropdown.
  // Move the DOM node rather than clone it: all API handlers and validation remain attached.
  const mobileCreate=window.matchMedia("(max-width: 830px)");
  const chefModal=document.getElementById("tm-clients-chef-create-dialog");
  const chefSlot=document.getElementById("tm-clients-chef-modal-slot");
  function closeChefModal(){if(chefModal?.open)chefModal.close();}
  function openChefMobileDialog(details){
    if(!chefModal||!chefSlot)return false;
    details.open=true;
    chefSlot.appendChild(details);
    chefModal.showModal();
    return true;
  }
  chefModal?.addEventListener("close",()=>{
    const details=chefSlot.querySelector("#tm-chef-management");
    if(details){
      details.open=false;
      chefsPanel.appendChild(details);
    }
  });
  document.getElementById("tm-clients-chef-close")?.addEventListener("click",closeChefModal);
  document.getElementById("tm-clients-chef-cancel")?.addEventListener("click",closeChefModal);
  chefModal?.addEventListener("click",event=>{
    if(event.target!==chefModal)return;
    const rect=chefModal.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeChefModal();
  });
  mobileCreate.addEventListener("change",()=>{if(!mobileCreate.matches)closeChefModal();});


  function selectType(type){
    if(!validTypes.has(type))return;
    selected=type;
    selector.value=type;
    value.textContent=selector.options[selector.selectedIndex]?.textContent||"Todos";
    const isProfile=detailVisible();
    if(heading)heading.hidden=isProfile;
    panel.hidden=isProfile;
    list.hidden=isProfile||type==="consulta";
    players.hidden=isProfile||(type!=="all"&&type!=="acompanhamento");
    chefsList.hidden=isProfile||(type!=="all"&&type!=="chef");
    archive.hidden=isProfile||(type!=="all"&&type!=="acompanhamento");
    consultations.hidden=isProfile||type!=="consulta";
    chefsPanel.hidden=isProfile||type!=="chef";
    // Actual Chef accounts appear within the same list of cards; management stays in Clientes.
    if(!isProfile&&!page.hidden&&(type==="all"||type==="chef")) {
      Promise.resolve(window.tmRefreshChefAccounts?.()).catch(error=>{
        const feedback=document.getElementById("tm-chef-account-feedback");
        if(feedback)feedback.textContent="Não foi possível carregar as contas Chef: "+error.message;
      });
    }
    window.tmRefreshPlayerCards?.();
    filterChefs();
  }
  selector.addEventListener("change",()=>selectType(selector.value));
  search.addEventListener("input",filterChefs);
  status.addEventListener("change",filterChefs);
  function closeChoice(){if(chooser.open)chooser.close();}
  function openChoice(){if(!chooser.open)chooser.showModal();}
  // Preserve the real athlete creation form and all its field validations.
  newButton.addEventListener("click",event=>{
    event.preventDefault();event.stopImmediatePropagation();openChoice();
  },true);
  document.getElementById("tm-clients-choice-close")?.addEventListener("click",closeChoice);
  chooser.addEventListener("click",event=>{
    if(event.target!==chooser)return;
    const rect=chooser.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeChoice();
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
          if(mobileCreate.matches){
            openChefMobileDialog(details);
          }else{
            details.open=true;
            details.scrollIntoView({behavior:"smooth",block:"nearest"});
          }
        }
      }else if(type==="consulta"){
        consultations.scrollIntoView({behavior:"smooth",block:"nearest"});
      }
    });
  }
  function syncProfileVisibility(){
    if(detailVisible()){
      panel.hidden=true;list.hidden=true;archive.hidden=true;
      chefsPanel.hidden=true;consultations.hidden=true;
      if(heading)heading.hidden=true;
    }else{
      selectType(selected==="consulta"?"all":selected);
    }
  }
  new MutationObserver(syncProfileVisibility).observe(profile,{attributes:true,attributeFilter:["hidden"]});
  new MutationObserver(syncProfileVisibility).observe(chefProfile,{attributes:true,attributeFilter:["hidden"]});
  window.tmClientsShowChefProfile=()=>{
    chefProfile.hidden=false;
    selectType(selected);
  };
  window.tmClientsCloseChefProfile=()=>{
    chefProfile.hidden=true;
    selectType(selected);
  };
  // Re-entering Clientes shows the full client list, not a separate account tab.
  document.getElementById("tm-admin-nav-players")?.addEventListener("click",()=>{
    window.tmDismissChefProfile?.();
    chefProfile.hidden=true;
    selectType("all");
  },true);
  new MutationObserver(()=>{
    if(page.hidden){
      closeChefModal();
      window.tmDismissChefProfile?.();
      chefProfile.hidden=true;
    }
    if(!page.hidden&&!detailVisible())selectType(selected);
  }).observe(page,{attributes:true,attributeFilter:["hidden"]});
  window.tmSelectClientType=selectType;
  selectType("all");
})();