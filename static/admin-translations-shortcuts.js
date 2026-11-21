"use strict";
/* Backoffice library shortcuts only when i18n management is explicitly active.
   Existing library controls, forms, event handlers and data remain untouched. */
(()=>{
  const workspace=document.getElementById("admin-workspace");
  if(!workspace)return;
  let checked=false;
  const add=(id,kind,label)=>{
    const target=document.getElementById(id);
    if(!target || document.getElementById("tm-i18n-library-"+kind))return;
    const a=document.createElement("a");
    a.id="tm-i18n-library-"+kind;
    a.className="tm-i18n-library-link tm-action-secondary";
    a.href="/admin-translations?entity_kind="+encodeURIComponent(kind);
    a.textContent=label;
    a.setAttribute("aria-label","Gerir traduções da biblioteca de "+(kind==="food"?"alimentos":"pratos"));
    target.parentElement.insertBefore(a,target);
  };
  const activate=async()=>{
    if(workspace.hidden || checked)return;
    checked=true;
    try{
      const response=await fetch("/api/v2/admin/i18n/overview",{
        credentials:"same-origin",headers:{"Accept":"application/json"}});
      if(!response.ok)return; // Missing schema, disabled flag or lack of permission: inert.
      add("new","food","Traduções");
      add("dish-add-toggle","dish","Traduções");
    }catch(_){/* An unavailable opt-in service must not change current UI. */}
  };
  new MutationObserver(activate).observe(workspace,{attributes:true,attributeFilter:["hidden"]});
  activate();
})();
