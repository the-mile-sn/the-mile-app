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
    a.href="/?nav=translations&entity_kind="+encodeURIComponent(kind);
    a.addEventListener("click",event=>{
      if(typeof window.tmOpenAdminTranslations!=="function")return;
      event.preventDefault();
      window.tmOpenAdminTranslations(kind);
    });
    // Reuse one translation glyph across libraries and Planos.
    // Native SVG, no new icon dependency or duplicate action handlers.
    a.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h12M7 2v3M4 9l7 7M5 15l6-6M12 21l5-11 5 11M14 17h6"/></svg>';
    a.setAttribute("aria-label","Abrir Traduções · "+({food:"Alimentos",dish:"Pratos",recipe:"Receitas",supplement:"Suplementação",plan:"Planos"}[kind]||"Conteúdos"));
    a.title=label;
    target.parentElement.insertBefore(a,target);
  };
  const activate=async()=>{
    if(workspace.hidden || checked)return;
    checked=true;
    try{
      const response=await fetch("/api/v2/admin/i18n/overview",{
        credentials:"same-origin",headers:{"Accept":"application/json"}});
      if(!response.ok)return; // Missing schema, disabled flag or lack of permission: inert.
      const nav=document.getElementById("tm-admin-nav-translations");
      if(nav)nav.hidden=false;
      add("new","food","Traduções");
      add("dish-add-toggle","dish","Traduções");
      add("recipe-add","recipe","Traduções");
      add("supp-library-new","supplement","Traduções · Suplementação");
      add("entry-create","plan","Traduções · Planos");
    }catch(_){/* An unavailable opt-in service must not change current UI. */}
  };
  new MutationObserver(activate).observe(workspace,{attributes:true,attributeFilter:["hidden"]});
  activate();
})();
