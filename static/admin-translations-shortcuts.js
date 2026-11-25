"use strict";
/* Backoffice library shortcuts only when i18n management is explicitly active.
   Existing library controls, forms, event handlers and data remain untouched. */
(()=>{
  const workspace=document.getElementById("admin-workspace");
  if(!workspace)return;
  let checked=false;
  const add=(id,kind,label)=>{
    const target=document.getElementById(id);
    const slot=kind==="plan"&&id==="entry-create-mobile"?"plan-mobile":kind;
    if(!target || document.getElementById("tm-i18n-library-"+slot))return;
    const a=document.createElement("a");
    a.id="tm-i18n-library-"+slot;
    a.className="tm-i18n-library-link tm-action-secondary";
    a.href="/?nav=translations&entity_kind="+encodeURIComponent(kind);
    a.addEventListener("click",event=>{
      if(typeof window.tmOpenAdminTranslations!=="function")return;
      event.preventDefault();
      window.tmOpenAdminTranslations(kind);
    });
    // Use exactly the translation icon already rendered in the Admin sidebar.
    // Avoid maintaining a second, slightly different hand-drawn SVG.
    const navGlyph=document.querySelector("#tm-admin-nav-translations .tm-admin-nav-icon svg");
    if(navGlyph){
      const glyph=navGlyph.cloneNode(true);
      glyph.setAttribute("width","18");
      glyph.setAttribute("height","18");
      glyph.setAttribute("aria-hidden","true");
      a.append(glyph);
    }else{
      const fallback=document.createElement("span");
      fallback.textContent="EN";
      fallback.setAttribute("aria-hidden","true");
      a.append(fallback);
    }
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
      add("entry-create-mobile","plan","Traduções · Planos");
      const edit=document.querySelector("#tm-plan-page #preview-edit");
      if(edit&&!document.getElementById("tm-plan-preview-language")){
        const button=document.createElement("button");
        button.type="button";button.id="tm-plan-preview-language";
        button.className="tm-i18n-library-link tm-action-secondary";
        button.title="Ver plano em inglês";
        button.setAttribute("aria-label",button.title);
        button.setAttribute("aria-pressed","false");
        const glyph=nav?.querySelector(".tm-admin-nav-icon svg");
        if(glyph){const copy=glyph.cloneNode(true);copy.setAttribute("aria-hidden","true");button.append(copy);}
        const label=document.createElement("span");label.textContent="EN";button.append(label);
        button.addEventListener("click",async()=>{
          button.disabled=true;
          try{await window.tmTogglePlanPreviewLanguage();}
          catch(_){alert("Não foi possível visualizar esta versão em inglês. Confirma se o plano está publicado e atualizado.");}
          finally{button.disabled=false;}
        });
        const actions=document.createElement("span");actions.className="tm-plan-preview-actions";
        edit.before(actions);actions.append(button,edit);
      }
      const newPlan=document.querySelector("#tm-plan-page #new-plan");
      if(newPlan&&!document.getElementById("tm-plan-editor-translation")){
        const button=document.createElement("button");
        button.type="button";button.id="tm-plan-editor-translation";
        button.className="tm-i18n-library-link tm-action-secondary";
        button.title="Traduções da versão publicada";
        button.setAttribute("aria-label",button.title);
        const glyph=nav?.querySelector(".tm-admin-nav-icon svg");
        if(glyph){const copy=glyph.cloneNode(true);copy.setAttribute("width","18");copy.setAttribute("height","18");copy.setAttribute("aria-hidden","true");button.append(copy);}
        else button.textContent="EN";
        button.addEventListener("click",async()=>{
          const id=window.tmCurrentPlanTranslationDraft?.();
          if(!id){alert("Guarda o plano antes de rever as traduções da versão publicada.");return;}
          button.disabled=true;
          try{await window.tmOpenPlanTranslationReview(id);}
          catch(_){alert("Não foi possível abrir as traduções.");}
          finally{button.disabled=false;}
        });
        const actions=document.createElement("span");
        actions.className="tm-plan-editor-actions";
        newPlan.before(actions);
        actions.append(button,newPlan);
      }
    }catch(_){/* An unavailable opt-in service must not change current UI. */}
  };
  new MutationObserver(activate).observe(workspace,{attributes:true,attributeFilter:["hidden"]});
  activate();
})();
