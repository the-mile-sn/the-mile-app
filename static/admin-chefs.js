"use strict";
/* The Mile | Chef management inside Planning > Menus.
   No duplicated menu store or athlete editor. Admin-only API, checked by server. */
(() => {
  const menusPanel=document.getElementById("menus-panel");
  const history=document.getElementById("menu-history");
  if(!menusPanel || !history) return;
  const section=document.createElement("details");
  section.id="tm-chef-management";section.className="tm-chef-management tm-menu-history-card";
  section.innerHTML=`
    <summary class="tm-chef-summary">Chefs <span id="tm-chef-pending" class="tm-chef-count" hidden></span></summary>
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
      <div id="tm-chef-accounts" class="tm-chef-accounts"></div>
      <div class="tm-chef-divider"></div>
      <div class="tm-chef-head"><h3>Alterações e execução</h3><p>Histórico de quem alterou o planeamento e do que foi efetivamente servido. Os registos de execução não apagam os menus planeados.</p></div>
      <label class="tm-chef-filter">Jogador<select id="tm-chef-filter-player"><option value="">Todos os jogadores</option></select></label>
      <div id="tm-chef-activity" class="tm-chef-activity"></div>
      <p id="tm-chef-feedback" role="status"></p>
    </div>`;
  history.insertAdjacentElement("afterend",section);
  const $=id=>document.getElementById(id);
  const form=$("tm-chef-create"),feedback=$("tm-chef-feedback");
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
    fillSelect($("tm-chef-filter-player"),knownPlayers,"Todos os jogadores");
  }
  async function loadAccounts(){
    const data=await api("/api/v2/admin/chefs");
    admins=data.chefs||[];
    const host=$("tm-chef-accounts");host.replaceChildren();
    if(!admins.length){host.append(node("p","tm-chef-muted","Ainda não existem contas Chef."));return;}
    for(const chef of admins){
      const row=node("div","tm-chef-account");
      const info=node("div","tm-chef-account-info");
      info.append(node("strong","",chef.name),node("small","",chef.username+" · "+chef.athlete_name+" · "+chef.language.toUpperCase()));
      const controls=node("div","tm-chef-account-actions");
      controls.append(node("span","tm-chef-state"+(chef.active?"":" is-off"),chef.active?"Ativo":"Inativo"));
      controls.append(button(chef.active?"Bloquear":"Ativar",async()=>{
        const active=!chef.active;
        if(!window.confirm((active?"Ativar":"Bloquear")+" a conta de "+chef.name+"?"))return;
        try{
          await api("/api/v2/admin/chefs/"+encodeURIComponent(chef.id),{
            method:"PUT",body:JSON.stringify({active})
          });
          feedback.textContent="Estado da conta atualizado.";await loadAccounts();
        }catch(e){feedback.textContent=noteMessage(e);}
      }));
      controls.append(button("Alterar passe",async()=>{
        const password=window.prompt("Nova palavra-passe (mínimo 12 caracteres) para "+chef.name+":");
        if(password===null)return;
        if(password.length<12){feedback.textContent="A palavra-passe deve ter 12 ou mais caracteres.";return;}
        try{
          await api("/api/v2/admin/chefs/"+encodeURIComponent(chef.id)+"/password-reset",{
            method:"POST",body:JSON.stringify({password})
          });
          feedback.textContent="Palavra-passe alterada e sessões anteriores terminadas.";
        }catch(e){feedback.textContent=noteMessage(e);}
      }));
      row.append(info,controls);host.append(row);
    }
  }
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
  async function loadActivity(){
    const athlete_id=$("tm-chef-filter-player").value;
    const path="/api/v2/admin/chef-activity"+(athlete_id?"?athlete_id="+encodeURIComponent(athlete_id):"");
    const data=await api(path);
    const all=data.activity||[],host=$("tm-chef-activity");
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
    feedback.textContent="";
    try{await loadPlayers();await Promise.all([loadAccounts(),loadActivity()]);}
    catch(e){feedback.textContent=noteMessage(e);}
  });
  $("tm-chef-filter-player").onchange=()=>loadActivity().catch(e=>feedback.textContent=noteMessage(e));
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
