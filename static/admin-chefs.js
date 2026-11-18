"use strict";
/* The Mile | Chef accounts live in Clientes; menu audit stays in Planeamento. */
(() => {
  const menusPanel=document.getElementById("menus-panel");
  const history=document.getElementById("menu-history");
  const clientsPanel=document.getElementById("tm-clients-chefs-panel");
  if(!menusPanel || !history || !clientsPanel) return;
  const section=document.createElement("details");
  section.id="tm-chef-management";section.className="tm-chef-management tm-menu-history-card";
  section.innerHTML=`
    <summary class="tm-chef-summary">Contas Chef</summary>
    <div class="tm-chef-content">
      <div class="tm-chef-head"><h3>Contas Chef</h3><p>Um chef pode planear para um jogador associado. As prescrições nutricionais continuam sob responsabilidade da The Mile.</p></div>
      <form id="tm-chef-create" class="tm-chef-form" novalidate>
        <label>Nome<input name="name" autocomplete="off" maxlength="120" required></label>
        <label>Username<input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" minlength="4" maxlength="40" required></label>
        <label>Palavra-passe inicial<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label>
        <label>Idioma<select name="language"><option value="pt">Português</option><option value="en">Inglês</option></select></label>
        <label>Jogador associado<select name="athlete_id" required><option value="">Selecionar jogador</option></select></label>
        <div class="tm-chef-create-actions"><button class="tm-action-primary" type="submit">Criar conta Chef</button></div>
        <p class="tm-chef-error" id="tm-chef-create-feedback" role="alert"></p>
      </form>
    </div>`;
  clientsPanel.append(section);
  const review=document.createElement("details");
  review.id="tm-chef-menu-review";review.className="tm-chef-management tm-menu-history-card";
  review.innerHTML=`
    <summary class="tm-menu-history-summary">
      <span class="tm-menu-accordion-title">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.7 9.1A8.7 8.7 0 1 1 3.3 13"/><path d="M3 4.4v5.2h5.2M12 6.8V12l3.1 2.1"/></svg>
        Alterações e execução
        <span id="tm-chef-pending" class="tm-chef-count" hidden></span>
      </span>
      <svg class="tm-menu-accordion-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </summary>
    <div class="tm-chef-content tm-menu-history-inner">
      <div id="tm-chef-activity" class="tm-chef-activity"></div>
      <p id="tm-chef-feedback" role="status"></p>
    </div>`;
  history.insertAdjacentElement("afterend",review);
  const $=id=>document.getElementById(id);
  const form=$("tm-chef-create"),feedback=$("tm-chef-feedback"),accountFeedback=$("tm-chef-account-feedback");
  let admins=[],knownPlayers=[],csrf="";
  async function api(path,options={}){
    if(!csrf){
      const m=await fetch("/api/me",{cache:"no-store",credentials:"same-origin"});
      const d=await m.json();if(m.status!==200||d.user?.role!=="admin")throw Error("Sessão de administrador necessária.");
      csrf=d.csrf||"";
    }
    const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options,
      headers:{"Content-Type":"application/json",...(options.method&&options.method!=="GET"?{"X-CSRF-Token":csrf}:{}),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Pedido indisponível");
    return data;
  }
  function node(tag,cls,value){
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(value!==undefined)n.textContent=String(value);
    return n;
  }
  function button(text,handler,cls="tm-action-secondary"){
    const b=node("button",cls,text);b.type="button";b.onclick=handler;return b;
  }
  function option(value,label){
    const o=node("option","",label);o.value=value;return o;
  }
  function noteMessage(error){
    return error?.message==="username_exists"?"Username já utilizado.":error?.message==="invalid_chef"?
      "Verifica os campos: username com 4 a 40 letras minúsculas e palavra-passe com 12 ou mais caracteres.":
      "Não foi possível concluir: "+(error?.message||"erro desconhecido");
  }
  function fillSelect(select,items,emptyLabel){
    select.replaceChildren(option("",emptyLabel));
    for(const item of items)select.append(option(item.id,item.name));
  }
  async function loadPlayers(){
    const data=await api("/api/v2/athletes");
    knownPlayers=data.athletes||[];
    fillSelect(form.elements.athlete_id,knownPlayers,"Selecionar jogador");
  }
  // The chef card opens a profile subpage, like a player card. Account actions
  // live only in that profile; the phone control opens a read-only admin preview.
  let selectedChef=null;
  const chefProfile=$("tm-clients-chef-profile");
  const profileFeedback=$("tm-chef-profile-feedback");
  const passwordForm=$("tm-chef-profile-password-form");
  const passwordOpen=$("tm-chef-profile-password-open");
  const passwordInput=$("tm-chef-profile-new-password");
  function resetChefPasswordEditor(){
    passwordForm.reset();
    passwordForm.hidden=true;
    passwordOpen.setAttribute("aria-expanded","false");
  }
  function paintChefProfile(){
    if(!selectedChef)return;
    const item=selectedChef;
    $("tm-chef-profile-name").textContent=item.name;
    $("tm-chef-profile-subtitle").textContent="@"+item.username;
    $("tm-chef-profile-avatar").textContent=item.name.split(/\s+/).slice(0,2)
      .map(part=>(part[0]||"").toLocaleUpperCase("pt-PT")).join("");
    $("tm-chef-profile-fullname").textContent=item.name;
    $("tm-chef-profile-username").textContent="@"+item.username;
    $("tm-chef-profile-player").textContent=item.athlete_name;
    $("tm-chef-profile-language").textContent=item.language==="en"?"Inglês":"Português";
    const state=$("tm-chef-profile-status");
    state.textContent=item.active?"Ativo":"Inativo";
    state.className="tm-p-status tm-p-"+(item.active?"active":"inactive");
    $("tm-chef-profile-toggle").textContent=item.active?"Bloquear conta":"Ativar conta";
  }
  function openChefProfile(item){
    selectedChef=item;
    profileFeedback.textContent="";
    resetChefPasswordEditor();
    paintChefProfile();
    chefProfile.hidden=false;
    window.tmClientsShowChefProfile?.();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function dismissChefProfile(){
    selectedChef=null;
    resetChefPasswordEditor();
    profileFeedback.textContent="";
    chefProfile.hidden=true;
  }
  window.tmDismissChefProfile=dismissChefProfile;
  $("tm-chef-profile-toggle")?.addEventListener("click",async event=>{
    const item=selectedChef;
    if(!item)return;
    const active=!item.active;
    if(!window.confirm((active?"Ativar":"Bloquear")+" a conta de "+item.name+"?"))return;
    const btn=event.currentTarget;
    btn.disabled=true;
    profileFeedback.textContent="";
    try{
      await api("/api/v2/admin/chefs/"+encodeURIComponent(item.id),{
        method:"PUT",body:JSON.stringify({active})
      });
      item.active=active;
      paintChefProfile();
      profileFeedback.textContent="Estado da conta atualizado.";
      await loadAccounts();
    }catch(error){
      profileFeedback.textContent=noteMessage(error);
    }finally{btn.disabled=false;}
  });
  passwordOpen?.addEventListener("click",()=>{
    passwordForm.hidden=!passwordForm.hidden;
    passwordOpen.setAttribute("aria-expanded",String(!passwordForm.hidden));
  });
  $("tm-chef-profile-password-cancel")?.addEventListener("click",resetChefPasswordEditor);
  passwordForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!selectedChef)return;
    const password=passwordInput.value;
    if(password.length<12||password.length>256){
      profileFeedback.textContent="A palavra-passe deve ter entre 12 e 256 caracteres.";
      return;
    }
    const button=passwordForm.querySelector('button[type="submit"]');
    button.disabled=true;
    profileFeedback.textContent="";
    try{
      await api("/api/v2/admin/chefs/"+encodeURIComponent(selectedChef.id)+"/password-reset",{
        method:"POST",body:JSON.stringify({password})
      });
      resetChefPasswordEditor();
      profileFeedback.textContent="Palavra-passe alterada e sessões anteriores terminadas.";
    }catch(error){profileFeedback.textContent=noteMessage(error);}
    finally{button.disabled=false;}
  });
  async function enterChefApp(item,button){
    const tab=window.open("about:blank","_blank");
    if(!tab){
      accountFeedback.textContent="Permite pop-ups deste site para abrir a app Chef.";
      return;
    }
    tab.document.title="The Mile · Visualização Chef";
    tab.document.body.textContent="A preparar visualização Chef…";
    button.disabled=true;
    accountFeedback.textContent="";
    try{
      const response=await api("/api/admin/chef-preview",{
        method:"POST",body:JSON.stringify({user_id:item.id})
      });
      const url=new URL(response.url);
      if(url.origin!=="https://app.themile.pt"||url.pathname!=="/preview-entry"||
         !url.searchParams.has("token"))throw new Error("Destino de visualização inesperado.");
      tab.location.replace(url.href);
    }catch(error){
      tab.close();
      accountFeedback.textContent="Não foi possível abrir a app Chef: "+noteMessage(error);
    }finally{button.disabled=false;}
  }
  async function loadAccounts(){
    const data=await api("/api/v2/admin/chefs");
    admins=data.chefs||[];
    const host=$("tm-chef-accounts");
    host.replaceChildren();
    if(!admins.length){
      host.append(node("p","tm-p-empty tm-chef-empty","Ainda não existem contas Chef."));
      window.tmFilterChefAccounts?.();
      return;
    }
    for(const item of admins){
      const row=node("article","tm-chef-account tm-client-account-row");
      row.setAttribute("role","listitem");
      row.dataset.search=[item.name,item.username,item.athlete_name].join(" ")
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      row.dataset.access=item.active?"active":"inactive";
      const info=node("div","tm-chef-account-info");
      info.append(node("strong","",item.name),
        node("small","","@"+item.username+" · "+item.athlete_name+" · "+item.language.toUpperCase()));
      info.append(node("span","tm-client-type-pill tm-client-type-pill-mobile tm-client-type-chef","Chef"));
      const typeCell=node("div","tm-client-type-cell");
      typeCell.append(node("span","tm-client-type-pill tm-client-type-chef","Chef"));
      const state=node("div","tm-chef-account-status");
      state.append(node("span","tm-p-status tm-p-"+(item.active?"active":"inactive"),
        item.active?"Ativo":"Inativo"));
      const action=node("div","tm-player-card-actions tm-chef-app-actions");
      const phone=node("button","tm-p-icon-action tm-p-app-action");
      phone.type="button";
      phone.title=item.active?"Entrar na app Chef (visualização)":"Conta Chef inativa";
      phone.setAttribute("aria-label","Entrar na app Chef de "+item.name+" em modo de visualização");
      phone.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>';
      phone.disabled=!item.active;
      phone.addEventListener("click",event=>{
        event.stopPropagation();
        enterChefApp(item,phone);
      });
      action.append(phone);
      // Full-card link is a genuine semantic button; phone remains independent.
      const open=node("button","tm-chef-card-open");
      open.type="button";
      open.setAttribute("aria-label","Abrir perfil Chef de "+item.name);
      open.addEventListener("click",()=>openChefProfile(item));
      row.append(info,typeCell,state,action,open);
      row.addEventListener("pointerdown",event=>{
        if(event.pointerType==="mouse"&&event.button!==0)return;
        if(event.target.closest(".tm-chef-app-actions"))return;
        row.classList.add("is-pressing");
      });
      for(const type of ["pointerup","pointercancel","pointerleave"]){
        row.addEventListener(type,()=>row.classList.remove("is-pressing"));
      }
      host.append(row);
    }
    window.tmFilterChefAccounts?.();
  }
  function filterChefAccounts(){
    const host=$("tm-chef-accounts");
    const query=String($("tm-players-filter")?.value||"").normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const status=$("tm-players-access")?.value||"all";
    const type=$("tm-clients-type-filter")?.value||"all";
    let shown=0;
    for(const row of host.querySelectorAll(".tm-chef-account")){
      const matches=(type==="all"||type==="chef")&&(status==="all"||row.dataset.access===status)&&
        query.split(/\s+/).every(term=>!term||row.dataset.search.includes(term));
      row.hidden=!matches;
      if(matches)shown++;
    }
    host.querySelector(".tm-chef-empty")?.toggleAttribute("hidden",type!=="chef");
    let empty=host.querySelector(".tm-chef-filter-empty");
    if(!shown&&admins.length&&type==="chef"){
      if(!empty){empty=node("p","tm-p-empty tm-chef-filter-empty","Nenhuma conta Chef corresponde aos filtros.");host.append(empty);}
      empty.hidden=false;
    }else if(empty){empty.hidden=true;}
  }
  window.tmFilterChefAccounts=filterChefAccounts;
  window.tmRefreshChefAccounts=loadAccounts;
  function localDate(utc){
    const d=new Date(Number(utc)*1000);
    return Number.isFinite(d.getTime())?
      new Intl.DateTimeFormat("pt-PT",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d):"";
  }
  const stateLabels={served_planned:"Servido conforme planeado",served_changed:"Servido com alterações",ate_out:"Jogador comeu fora",chef_off:"Chef de folga"};
  async function pickerForProposal(entry,container){
    const wrap=node("div","tm-chef-approve");
    const q=node("input","");q.type="search";q.placeholder="Pesquisar prato aprovado";q.maxLength=90;
    const select=node("select","");
    const hint=node("small","tm-chef-muted","Aprova associando a um prato já validado na Biblioteca. Se for novo, cria-o primeiro na Biblioteca de Pratos.");
    const approve=button("Aprovar com prato",async()=>{
      if(!select.value){feedback.textContent="Seleciona primeiro um prato aprovado.";return;}
      try{
        await api("/api/v2/admin/chef-reviews",{method:"POST",
          body:JSON.stringify({id:entry.id,decision:"approved",dish_id:select.value})});
        feedback.textContent="Proposta aprovada e integrada no planeamento.";await loadActivity();
      }catch(e){feedback.textContent=noteMessage(e);}
    },"tm-action-primary");
    wrap.append(q,select,hint,approve);container.append(wrap);
    let t;
    async function load(){
      try{
        const data=await api("/api/v2/admin/chef-dishes?q="+encodeURIComponent(q.value));
        select.replaceChildren(option("","Selecionar prato"));
        for(const dish of data.dishes||[])select.append(option(dish.id,dish.name_pt));
      }catch(e){feedback.textContent=noteMessage(e);}
    }
    q.oninput=()=>{clearTimeout(t);t=setTimeout(load,240);};
    await load();
  }
  let activityRevision=0;
  async function loadActivity(){
    // Use the player already selected at the top of Planeamento; no second picker.
    const athleteId=$("athlete")?.value||"";
    const revision=++activityRevision;
    const host=$("tm-chef-activity");
    if(!athleteId){
      host.replaceChildren(node("p","tm-chef-muted","Seleciona um jogador no topo do Planeamento."));
      $("tm-chef-pending").hidden=true;
      return;
    }
    const path="/api/v2/admin/chef-activity?athlete_id="+encodeURIComponent(athleteId);
    const data=await api(path);
    if(revision!==activityRevision||$("athlete")?.value!==athleteId)return;
    const all=data.activity||[];
    host.replaceChildren();
    const pending=all.filter(a=>a.event_type==="menu"&&["pending_review","pending_validation"].includes(a.status)).length;
    $("tm-chef-pending").hidden=pending===0;
    $("tm-chef-pending").textContent=pending+" pendentes";
    if(!all.length){host.append(node("p","tm-chef-muted","Ainda não existem alterações de chefs ou registos de execução."));return;}
    for(const e of all){
      const card=node("article","tm-chef-activity-card");
      const head=node("div","tm-chef-event-head");
      const meal=e.meal==="lunch"?"Almoço":"Jantar";
      head.append(node("strong","",e.athlete_name+" · "+meal+" · "+e.menu_date));
      head.append(node("small","",localDate(e.created_at)));
      card.append(head);
      card.append(node("p","tm-chef-event-actor","Por "+e.actor_name));
      if(e.event_type==="execution"){
        card.append(node("p","",stateLabels[e.state]||e.state));
        if(e.planned_value)card.append(node("p","tm-chef-muted","Planeado: "+e.planned_value));
        if(e.served_description)card.append(node("p","","Servido: "+e.served_description));
      }else{
        card.append(node("p","tm-chef-muted","Anterior: "+(e.previous_value||"Sem menu")));
        card.append(node("p","",e.action==="dish_proposal"?"Prato proposto: "+e.new_value:
          e.action==="plan_deleted"?"Menu removido":"Novo: "+(e.new_value||"Sem menu")));
        if(e.status==="pending_review")card.append(button("Assinalar como analisado",async()=>{
          try{
            await api("/api/v2/admin/chef-reviews",{method:"POST",body:JSON.stringify({id:e.id,decision:"reviewed"})});
            feedback.textContent="Alteração analisada.";await loadActivity();
          }catch(error){feedback.textContent=noteMessage(error);}
        }));
        if(e.status==="pending_validation"){
          card.append(node("span","tm-chef-pending-note","Pendente de validação nutricional"));
          await pickerForProposal(e,card);
          card.append(button("Rejeitar proposta",async()=>{
            try{
              await api("/api/v2/admin/chef-reviews",{method:"POST",body:JSON.stringify({id:e.id,decision:"rejected"})});
              feedback.textContent="Proposta rejeitada; planeamento preservado.";await loadActivity();
            }catch(error){feedback.textContent=noteMessage(error);}
          }));
        }
        if(e.status==="reviewed"||e.status==="approved"||e.status==="rejected")
          card.append(node("span","tm-chef-muted","Estado: "+e.status));
      }
      if(e.note)card.append(node("p","tm-chef-muted","Observações: "+e.note));
      host.append(card);
    }
  }
  section.addEventListener("toggle",async()=>{
    if(!section.open)return;
    accountFeedback.textContent="";
    try{await loadPlayers();await loadAccounts();}
    catch(e){accountFeedback.textContent=noteMessage(e);}
  });
  review.addEventListener("toggle",async()=>{
    if(!review.open)return;
    feedback.textContent="";
    try{await loadActivity();}
    catch(e){feedback.textContent=noteMessage(e);}
  });
  $("athlete")?.addEventListener("change",()=>{
    if(!review.open)return;
    feedback.textContent="";
    loadActivity().catch(e=>feedback.textContent=noteMessage(e));
  });
  form.onsubmit=async event=>{
    event.preventDefault();
    const err=$("tm-chef-create-feedback");err.textContent="";
    const data=new FormData(form);
    const payload={
      name:String(data.get("name")||"").trim(),
      username:String(data.get("username")||"").trim().toLowerCase(),
      password:String(data.get("password")||""),
      language:String(data.get("language")||"pt"),
      athlete_id:String(data.get("athlete_id")||"")
    };
    if(!/^[a-z]{4,40}$/.test(payload.username)){err.textContent="Username: 4 a 40 letras minúsculas.";return;}
    if(payload.password.length<12){err.textContent="Palavra-passe: mínimo de 12 caracteres.";return;}
    if(!payload.athlete_id){err.textContent="Seleciona um jogador associado.";return;}
    const submit=form.querySelector("button[type=submit]");submit.disabled=true;
    try{
      await api("/api/v2/admin/chefs",{method:"POST",body:JSON.stringify(payload)});
      err.textContent="Conta Chef criada.";
      form.reset();await loadAccounts();
    }catch(e){err.textContent=noteMessage(e);}
    finally{submit.disabled=false;}
  };
})();
