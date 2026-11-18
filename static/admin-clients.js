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
  const consultations=document.getElementById("tm-clients-consultations-panel");
  const chefsPanel=document.getElementById("tm-clients-chefs-panel");
  const search=document.getElementById("tm-players-filter");
  const status=document.getElementById("tm-players-access");
  if(!page||!selector||!value||!chooser||!newButton||!panel||!list||!players||!chefsList||!archive||!profile||!consultations||!chefsPanel||!search||!status)return;

  const validTypes=new Set(["all","acompanhamento","consulta","chef"]);
  let selected="all";
  const detailVisible=()=>!profile.hidden;
  window.tmClientsCurrentType=()=>selected;
  const filterChefs=()=>window.tmFilterChefAccounts?.();

  function selectType(type){
    if(!validTypes.has(type))return;
    selected=type;
    selector.value=type;
    value.textContent=selector.options[selector.selectedIndex]?.textContent||"Todos";
    const isProfile=detailVisible();
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
          details.open=true;
          details.scrollIntoView({behavior:"smooth",block:"nearest"});
          // No autofocus: do not force the iPhone keyboard open.
        }
      }else if(type==="consulta"){
        consultations.scrollIntoView({behavior:"smooth",block:"nearest"});
      }
    });
  }
  new MutationObserver(()=>{
    if(detailVisible()){
      panel.hidden=true;list.hidden=true;archive.hidden=true;
      chefsPanel.hidden=true;consultations.hidden=true;
    }else{
      selectType(selected==="consulta"?"all":selected);
    }
  }).observe(profile,{attributes:true,attributeFilter:["hidden"]});
  // Re-entering Clientes shows the full client list, not a separate account tab.
  document.getElementById("tm-admin-nav-players")?.addEventListener("click",
    ()=>selectType("all"),true);
  new MutationObserver(()=>{
    if(!page.hidden&&!detailVisible())selectType(selected);
  }).observe(page,{attributes:true,attributeFilter:["hidden"]});
  window.tmSelectClientType=selectType;
  selectType("all");
})();