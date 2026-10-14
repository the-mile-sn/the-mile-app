'use strict';

const ui = {
  root: document.getElementById('content'),
  lang: document.getElementById('language'),
  logout: document.getElementById('logout'),
  install: document.getElementById('install')
};

let lang = localStorage.getItem('mile-language') === 'en' ? 'en' : 'pt';
let user = null, csrf = null, selected = null, folder = null, players = [], admins = [], docs = [], mode = '';
let loginMode = 'login';
let activationToken = new URLSearchParams(location.search).get('activate');
let installPrompt = null;
if (activationToken) history.replaceState(null, '', location.pathname);

const words = {
  pt: {
    private:'Área privada', hello:'Olá,', sub:'Os teus documentos, num só lugar.', folders:{nutrition:'Planos nutricionais',menus:'Menus',other:'Outros documentos',anthropometry:'Avaliações antropométricas'},
    document:'documento',documents:'documentos',open:'Abrir',documentTitle:'Título apresentado ao jogador',editTitle:'Editar título',titlePrompt:'Título apresentado ao jogador:',back:'← Voltar',
    players:'Jogadores',management:'Administração',manageSub:'Gere acessos, jogadores e documentos a partir de um único painel.',newPlayer:'+ Criar jogador',manage:'Gerir',upload:'+ Carregar PDF',
    name:'Nome',username:'Username',password:'Palavra-passe',newPassword:'Nova palavra-passe',currentPassword:'Palavra-passe atual',enter:'Entrar',loginSub:'Acede à tua área privada.',create:'Criar conta',
    foot:'Nutrição. Performance. Detalhe.',logout:'Sair',install:'Instalar',save:'Guardar',cancel:'Cancelar',file:'Ficheiro PDF',pdfNote:'PDF até 20 MB.',empty:'Ainda não há documentos nesta pasta.',
    noPlayers:'Ainda não foram criados jogadores.',replace:'Substituir',remove:'Apagar',removeConfirm:'Queres apagar este documento?',inactive:'Desativado',active:'Ativo',
    deactivate:'Desativar',reactivate:'Reativar',statusConfirm:'Alterar o acesso deste jogador?',search:'Procurar jogador',administrators:'Administradores',noMatches:'Nenhum jogador encontrado.',
    adminSub:'Contas com acesso total à administração.',generateLink:'Gerar link',current:'Tu',overview:'Visão geral',totalPlayers:'Jogadores',activePlayers:'Ativos',inactivePlayers:'Desativados',totalDocuments:'Documentos',
    edit:'Editar dados',update:'Guardar alterações',deletePlayer:'Eliminar jogador',deletePlayerConfirm:'Eliminar este jogador e todos os seus documentos? Esta ação não pode ser anulada.',
    playerDetails:'Dados do jogador',birthDate:'Data de nascimento',sex:'Sexo',male:'Masculino',female:'Feminino',height:'Altura (cm)',weight:'Peso atual (kg)',photo:'Foto',planName:'Plano',renewalDate:'Data de renovação',menus:'Menus',anthropometry:'Avaliações antropométricas',
    enabled:'Ativo',disabled:'Inativo',resetPassword:'Alterar password',changePassword:'Alterar palavra-passe',passwordChanged:'Palavra-passe alterada.',profile:'Perfil do jogador',
    registerWeight:'Registar peso',postGame:'Pós-jogo',formsUnavailable:'Formulário ainda não configurado.',forgot:'Esqueci-me da palavra-passe',forgotText:'Contacta Filipe Sousa ou Raquel Gomes para redefinir o acesso.',changeAccess:'Alterar palavra-passe',backToLogin:'Voltar ao início de sessão',
    activate:'Definir palavra-passe',activateSub:'Escolhe uma palavra-passe.',confirm:'Confirmar palavra-passe',
    errors:{credentials:'Username/email ou palavra-passe incorretos.',login_required:'A sessão terminou. Entra novamente.',csrf:'Atualiza a página e tenta novamente.',origin:'Pedido não permitido.',
      password_length:'Usa pelo menos 8 caracteres.',password_change:'Verifica a palavra-passe atual e usa pelo menos 8 caracteres na nova.',activation:'O link expirou ou já foi utilizado.',
      username_exists:'Este username já existe.',photo:'Seleciona uma foto JPG, PNG ou WebP até 3 MB.',pdf_only:'Seleciona um ficheiro PDF válido.',file_size:'O ficheiro ultrapassa o limite permitido.',
      forbidden:'Não tens acesso a este conteúdo.',user_fields:'Verifica os dados do jogador.',rate_limit:'Demasiadas tentativas. Tenta novamente daqui a 15 minutos.',network:'Não foi possível ligar. Tenta novamente.',
      password_mismatch:'As palavras-passe não coincidem.',generic:'Não foi possível concluir. Tenta novamente.'}
  },
  en: {
    private:'Private area', hello:'Hello,', sub:'Your documents, all in one place.', folders:{nutrition:'Nutrition plans',menus:'Menus',other:'Other documents',anthropometry:'Anthropometric assessments'},
    document:'document',documents:'documents',open:'Open',documentTitle:'Title shown to the player',editTitle:'Edit title',titlePrompt:'Title shown to the player:',back:'← Back',
    players:'Players',management:'Administration',manageSub:'Manage access, players and documents from one dashboard.',newPlayer:'+ Add player',manage:'Manage',upload:'+ Upload PDF',
    name:'Name',username:'Username',password:'Password',newPassword:'New password',currentPassword:'Current password',enter:'Sign in',loginSub:'Access your private area.',create:'Create account',
    foot:'Nutrition. Performance. Detail.',logout:'Sign out',install:'Install',save:'Save',cancel:'Cancel',file:'PDF file',pdfNote:'PDF up to 20 MB.',empty:'There are no documents in this folder yet.',
    noPlayers:'No players have been added yet.',replace:'Replace',remove:'Delete',removeConfirm:'Delete this document?',inactive:'Inactive',active:'Active',
    deactivate:'Deactivate',reactivate:'Reactivate',statusConfirm:'Change this player’s access?',search:'Find player',administrators:'Administrators',noMatches:'No players found.',
    adminSub:'Accounts with full administration access.',generateLink:'Generate link',current:'You',overview:'Overview',totalPlayers:'Players',activePlayers:'Active',inactivePlayers:'Inactive',totalDocuments:'Documents',
    edit:'Edit details',update:'Save changes',deletePlayer:'Delete player',deletePlayerConfirm:'Delete this player and all their documents? This cannot be undone.',
    playerDetails:'Player details',birthDate:'Date of birth',sex:'Sex',male:'Male',female:'Female',height:'Height (cm)',weight:'Current weight (kg)',photo:'Photo',planName:'Plan',renewalDate:'Renewal date',menus:'Menus',anthropometry:'Anthropometric assessments',
    enabled:'Enabled',disabled:'Disabled',resetPassword:'Change password',changePassword:'Change password',passwordChanged:'Password changed.',profile:'Player profile',
    registerWeight:'Register weight',postGame:'Post-game',formsUnavailable:'Form not configured yet.',forgot:'Forgot password',forgotText:'Contact Filipe Sousa or Raquel Gomes to reset access.',changeAccess:'Change password',backToLogin:'Back to sign in',
    activate:'Set password',activateSub:'Choose a password.',confirm:'Confirm password',
    errors:{credentials:'Incorrect username/email or password.',login_required:'Your session has ended. Sign in again.',csrf:'Refresh this page and try again.',origin:'Request not allowed.',
      password_length:'Use at least 8 characters.',password_change:'Check the current password and use at least 8 characters for the new one.',activation:'This link has expired or has already been used.',
      username_exists:'This username already exists.',photo:'Select a JPG, PNG or WebP photo up to 3 MB.',pdf_only:'Select a valid PDF file.',file_size:'The file exceeds the permitted size.',
      forbidden:'You do not have access to this content.',user_fields:'Check the player details.',rate_limit:'Too many attempts. Try again in 15 minutes.',network:'Unable to connect. Try again.',
      password_mismatch:'Passwords do not match.',generic:'Unable to complete. Try again.'}
  }
};

function t(){ return words[lang]; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusLabel(p,w){ return p.active ? w.active : w.inactive; }
function statusClass(p){ return p.active ? 'active' : 'inactive'; }
function boolChecked(v){ return v ? 'checked' : ''; }

function playerIcon(name){
  const icons={
    folder:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l1.7 2H20.5v9.5H3.5z"/><path d="M3.5 7.5V5.5h5l1.5 2"/></svg>',
    document:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h6"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 8A7 7 0 1 0 19 14"/><path d="M18.2 4.5V8h-3.5"/></svg>',
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5.5v14H10"/><path d="M13 8l4 4-4 4M8 12h9"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
  };
  return icons[name]||'';
}
function formatRenewal(value){
  if(!value)return '';
  const p=String(value).split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : value;
}
function playerFolderIcon(folder){
  return folder==='other'||folder==='anthropometry' ? playerIcon('document') : playerIcon('folder');
}

async function api(path,{method='GET',body=null,binary=false}={}){
  const options={method,credentials:'same-origin',headers:{}};
  if(method!=='GET'&&csrf) options.headers['X-CSRF-Token']=csrf;
  if(body!==null){ options.body=binary?body:JSON.stringify(body); options.headers['Content-Type']=binary?'application/pdf':'application/json'; }
  let r; try{ r=await fetch('/api'+path,options); }catch{ throw Error('network'); }
  let data={}; try{ data=await r.json(); }catch{}
  if(!r.ok){ if(r.status===401&&user){user=null;selected=null;folder=null;mode='';render();} throw Error(data.error||'generic'); }
  return data;
}

function notify(title,text){ document.getElementById('notice-title').textContent=title; document.getElementById('notice-text').textContent=text; document.getElementById('notice-link').hidden=true; document.getElementById('copy-link').hidden=true; document.getElementById('notice').showModal(); }
function error(e){ const el=ui.root.querySelector('.error'); const msg=t().errors[e.message]||t().errors.generic; if(el)el.textContent=msg; else notify('The Mile',msg); }
function bind(id,fn){ const el=document.getElementById(id); if(el)el.onclick=()=>Promise.resolve().then(fn).catch(error); }
function submit(fn){ const form=ui.root.querySelector('form'); if(!form)return; form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button[type="submit"]');if(b)b.disabled=true;const er=form.querySelector('.error');if(er)er.textContent='';try{await fn(new FormData(form));}catch(x){error(x);}finally{if(b)b.disabled=false;}}; }

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{ if(!file||!file.size){resolve('');return;} if(file.size>3*1024*1024){reject(Error('photo'));return;} const rd=new FileReader(); rd.onload=()=>resolve(rd.result); rd.onerror=()=>reject(Error('photo')); rd.readAsDataURL(file); });
}

async function refresh(){
  const session=await api('/me'); user=session.user; csrf=session.csrf;
  if(user){ if(user.role==='admin'){const [p,a]=await Promise.all([api('/players'),api('/admins')]);players=p.players;admins=a.admins;} else docs=(await api('/documents')).documents; }
  render();
}
async function openPlayer(id){ selected=players.find(p=>p.id===id); docs=(await api('/documents?player='+encodeURIComponent(id))).documents; folder=null;mode='';render(); }

function playerForm(w,p=null){
  return `<form class="inline-form">
    <label>${w.name}</label><input name="name" maxlength="120" value="${esc(p?.name||'')}" required>
    <label>${w.username}</label><input name="username" pattern="[a-z]+" autocomplete="off" value="${esc(p?.username||'')}" required>
    <label>${p?w.newPassword:w.password}</label><input name="password" type="password" minlength="8" maxlength="256" ${p?'':'required'}>
    <label>${w.photo}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${p?'':'required'}>
    <label>${w.birthDate}</label><input name="birth_date" type="date" value="${esc(p?.birth_date||'')}" required>
    <label>${w.sex}</label><select name="sex" required><option value="M" ${p?.sex==='M'?'selected':''}>${w.male}</option><option value="F" ${p?.sex==='F'?'selected':''}>${w.female}</option></select>
    <label>${w.height}</label><input name="height" type="number" min="50" max="250" step="0.1" value="${esc(p?.height??'')}" required>
    <label>${w.weight}</label><input name="weight" type="number" min="20" max="300" step="0.1" value="${esc(p?.weight??'')}" required>
    <label>${w.planName}</label><input name="plan_name" maxlength="80" value="${esc(p?.plan_name||'')}" required>
    <label>${w.renewalDate}</label><input name="renewal_date" type="date" value="${esc(p?.renewal_date||'')}" required>
    <label><input name="menus_enabled" type="checkbox" style="width:auto" ${boolChecked(p?.menus_enabled)}> ${w.menus}</label>
    <label><input name="anthropometry_enabled" type="checkbox" style="width:auto" ${boolChecked(p?.anthropometry_enabled)}> ${w.anthropometry}</label>
    <p class="error" role="alert"></p><div class="actions"><button class="primary" type="submit">${p?w.update:w.create}</button><button class="secondary" type="button" id="cancel">${w.cancel}</button></div>
  </form>`;
}
async function payloadFromForm(f){
  return {name:f.get('name'),username:String(f.get('username')||'').toLowerCase(),password:f.get('password')||'',photo:await fileToDataURL(f.get('photo')),
    birth_date:f.get('birth_date'),sex:f.get('sex'),height:Number(f.get('height')),weight:Number(f.get('weight')),plan_name:f.get('plan_name'),renewal_date:f.get('renewal_date'),
    menus_enabled:f.get('menus_enabled')==='on',anthropometry_enabled:f.get('anthropometry_enabled')==='on'};
}

function renderDashboard(w){
  if(mode==='create'){
    ui.root.innerHTML=`<button class="back" id="back">${w.back}</button><p class="eyebrow">${w.management}</p><h1>${w.newPlayer.slice(2)}</h1>${playerForm(w)}`;
    bind('back',()=>{mode='';render();}); bind('cancel',()=>{mode='';render();});
    submit(async f=>{await api('/players',{method:'POST',body:await payloadFromForm(f)});mode='';await refresh();});
    return;
  }
  const active=players.filter(p=>p.active).length,inactive=players.length-active,totalDocs=players.reduce((n,p)=>n+Number(p.documents||0),0);
  ui.root.innerHTML=`<p class="eyebrow">${w.management} · ${esc(user.name)}</p>
    <div class="topline"><div><h1>${w.players}</h1><p class="subtitle compact">${w.manageSub}</p></div><button class="primary" id="create">${w.newPlayer}</button></div>
    <section class="overview"><div class="metric"><strong>${players.length}</strong><span>${w.totalPlayers}</span></div><div class="metric"><strong>${active}</strong><span>${w.activePlayers}</span></div><div class="metric"><strong>${inactive}</strong><span>${w.inactivePlayers}</span></div><div class="metric"><strong>${totalDocs}</strong><span>${w.totalDocuments}</span></div></section>
    <section class="panel-section"><h2>${w.players}</h2>${players.length?`<label>${w.search}</label><input id="search" type="search"><div id="player-list"></div>`:`<p class="empty">${w.noPlayers}</p>`}</section>
    <section class="panel-section administrators"><h2>${w.administrators}</h2><div>${admins.map(a=>`<div class="row"><div><strong>${esc(a.name)}</strong><p>${esc(a.email)}</p></div></div>`).join('')}</div></section>`;
  bind('create',()=>{mode='create';render();});
  if(players.length){
    const list=document.getElementById('player-list');
    const show=(q='')=>{const f=players.filter(p=>(p.name+' '+p.username).toLowerCase().includes(q.toLowerCase()));list.innerHTML=f.map(p=>`<div class="row player-row"><div><strong>${esc(p.name)}</strong><p>@${esc(p.username)}</p><div class="row-meta"><span class="badge ${statusClass(p)}">${statusLabel(p,w)}</span><span>${p.documents} ${w.documents}</span></div></div><button class="secondary" data-player="${p.id}">${w.manage}</button></div>`).join('')||`<p class="empty">${w.noMatches}</p>`;list.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>openPlayer(b.dataset.player).catch(error));};
    show();document.getElementById('search').oninput=e=>show(e.target.value);
  }
}

function availableFolders(owner){
  const f=['nutrition','other']; if(owner.menus_enabled)f.splice(1,0,'menus'); if(owner.anthropometry_enabled)f.push('anthropometry'); return f;
}

function renderPlayer(w){
  const isAdmin=user.role==='admin',owner=isAdmin?selected:user;

  if(!isAdmin){
    if(mode==='password'){
      ui.root.innerHTML=`<section class="player-shell player-password"><button class="player-back" id="back">${playerIcon('arrow')}<span>${w.back.replace('← ','')}</span></button><h1>${w.changePassword}</h1><form class="player-password-form"><label>${w.currentPassword}</label><input name="current_password" type="password" required><label>${w.newPassword}</label><input name="new_password" type="password" minlength="8" required><p class="error"></p><button class="player-solid" type="submit">${w.save}</button></form></section>`;
      bind('back',()=>{mode='';render();});
      submit(async f=>{await api('/password',{method:'POST',body:{current_password:f.get('current_password'),new_password:f.get('new_password')}});mode='';notify('The Mile',w.passwordChanged);render();});
      return;
    }

    if(folder!==null){
      const items=docs.filter(d=>d.folder===folder);
      ui.root.innerHTML=`<section class="player-shell"><button class="player-back" id="back">${playerIcon('arrow')}<span>${w.back.replace('← ','')}</span></button><h1 class="player-folder-title">${esc(w.folders[folder])}</h1><div class="player-list-card">${items.length?items.map(d=>`<a class="player-doc-row" href="/api/documents/${d.id}"><span class="player-row-icon">${playerIcon('document')}</span><span class="player-row-copy"><strong>${esc(d.title)}</strong><small>PDF</small></span><span class="player-chevron">${playerIcon('chevron')}</span></a>`).join(''):`<p class="player-empty">${w.empty}</p>`}</div></section>`;
      bind('back',()=>{folder=null;render();});
      return;
    }

    const af=availableFolders(owner);
    ui.root.innerHTML=`<section class="player-shell">
      <div class="player-profile">
        ${owner.has_photo?`<img class="player-avatar" src="/api/players/${owner.id}/photo" alt="">`:''}
        <h1>${esc(owner.name)}</h1>
      </div>

      <div class="player-form-actions">
        <button id="weight-form" type="button">${w.registerWeight}</button>
        <button id="game-form" type="button">${w.postGame}</button>
      </div>

      <section class="player-plan-card">
        <span class="player-plan-icon">${playerIcon('refresh')}</span>
        <div><strong>${esc(owner.plan_name||'')}</strong><small>${lang==='pt'?'Renova a ':'Renews on '}${esc(formatRenewal(owner.renewal_date))}</small></div>
      </section>

      <section class="player-list-card">
        ${af.map(f=>{const count=docs.filter(d=>d.folder===f).length;return `<button class="player-menu-row" data-folder="${f}"><span class="player-row-icon">${playerFolderIcon(f)}</span><span class="player-row-copy"><strong>${esc(w.folders[f])}</strong><small>${count} ${count===1?w.document:w.documents}</small></span><span class="player-chevron">${playerIcon('chevron')}</span></button>`;}).join('')}
      </section>

      <button class="player-logout-card" id="player-logout" type="button"><span class="player-row-icon">${playerIcon('logout')}</span><span>${lang==='pt'?'Terminar sessão':'Sign out'}</span><span class="player-chevron">${playerIcon('chevron')}</span></button>

      <button class="player-password-link" id="change-password" type="button">${w.changePassword}</button>
    </section>`;

    ui.root.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{folder=b.dataset.folder;render();});
    bind('weight-form',()=>{if(user.weight_form_url)window.open(user.weight_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
    bind('game-form',()=>{if(user.game_form_url)window.open(user.game_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
    bind('change-password',()=>{mode='password';render();});
    bind('player-logout',async()=>{await api('/logout',{method:'POST',body:{}});user=null;csrf=null;folder=null;mode='';docs=[];render();});
    return;
  }
  if(isAdmin&&mode==='edit'){
    ui.root.innerHTML=`<button class="back" id="back">${w.back}</button><p class="eyebrow">${w.playerDetails}</p><h1>${esc(owner.name)}</h1>${playerForm(w,owner)}`;
    bind('back',()=>{mode='';render();});bind('cancel',()=>{mode='';render();});
    submit(async f=>{await api('/players/'+owner.id,{method:'PUT',body:await payloadFromForm(f)});selected=null;mode='';await refresh();});return;
  }
  if(mode==='password'){
    ui.root.innerHTML=`<button class="back" id="back">${w.back}</button><h1>${w.changePassword}</h1><form class="inline-form">${isAdmin?'':`<label>${w.currentPassword}</label><input name="current_password" type="password" required>`}<label>${w.newPassword}</label><input name="new_password" type="password" minlength="8" required><p class="error"></p><div class="actions"><button class="primary" type="submit">${w.save}</button><button class="secondary" type="button" id="cancel">${w.cancel}</button></div></form>`;
    bind('back',()=>{mode='';render();});bind('cancel',()=>{mode='';render();});
    submit(async f=>{if(isAdmin)await api('/players/'+owner.id+'/password',{method:'POST',body:{password:f.get('new_password')}});else await api('/password',{method:'POST',body:{current_password:f.get('current_password'),new_password:f.get('new_password')}});mode='';notify('The Mile',w.passwordChanged);render();});return;
  }

  const af=availableFolders(owner);
  const title=folder===null?(isAdmin?owner.name:w.hello+' '+owner.name.split(' ')[0]+'.'):w.folders[folder];
  ui.root.innerHTML=`${isAdmin||folder!==null?'<button class="back" id="back">'+w.back+'</button>':''}
    ${folder===null?`<p class="eyebrow">${isAdmin?'@'+esc(owner.username):w.private}</p>`:''}
    <div class="topline"><h1>${esc(title)}</h1>${isAdmin&&folder!==null&&mode!=='upload'?'<button class="primary" id="upload">'+w.upload+'</button>':''}</div>
    ${folder===null?`
      <section class="profile-card">${owner.has_photo?`<img src="/api/players/${owner.id}/photo" alt="">`:''}<div><strong>${esc(owner.name)}</strong><p>@${esc(owner.username)}</p></div></section>
      ${!isAdmin?`<div class="quick-actions"><button class="secondary" id="weight-form">${w.registerWeight}</button><button class="secondary" id="game-form">${w.postGame}</button></div>`:''}
      <p class="subtitle">${w.sub}</p><div class="folders">${af.map(f=>{const c=docs.filter(d=>d.folder===f).length;return `<button class="folder" data-folder="${f}"><span class="folder-icon"></span><div><strong>${w.folders[f]}</strong><small>${c} ${c===1?w.document:w.documents}</small></div></button>`;}).join('')}</div>
      ${isAdmin?`<div class="player-control"><div><span class="badge ${statusClass(owner)}">${statusLabel(owner,w)}</span><p>${w.birthDate}: ${esc(owner.birth_date)} · ${w.sex}: ${owner.sex==='M'?w.male:w.female} · ${w.height}: ${esc(owner.height)} · ${w.weight}: ${esc(owner.weight)} · ${w.planName}: ${esc(owner.plan_name)} · ${w.renewalDate}: ${esc(owner.renewal_date)}</p></div><div class="actions player-actions"><button class="secondary" id="edit">${w.edit}</button><button class="secondary" id="change-password">${w.resetPassword}</button><button class="secondary" id="status">${owner.active?w.deactivate:w.reactivate}</button><button class="secondary danger" id="delete-player">${w.deletePlayer}</button></div></div>`:''}
    `:
    mode==='upload'?`<form class="inline-form"><label>${w.documentTitle}</label><input name="title" maxlength="180" required><label>${w.file}</label><input name="pdf" type="file" accept="application/pdf,.pdf" required><p class="note">${w.pdfNote}</p><p class="error"></p><div class="actions"><button class="primary" type="submit">${w.save}</button><button class="secondary" id="cancel" type="button">${w.cancel}</button></div></form>`:
    docs.filter(d=>d.folder===folder).map(d=>`<div class="row"><div><strong>${esc(d.title)}</strong><p>PDF · ${new Intl.DateTimeFormat(lang==='pt'?'pt-PT':'en-GB').format(new Date(d.updated*1000))}</p></div><div class="actions"><a class="primary download" href="/api/documents/${d.id}">${w.open}</a>${isAdmin?`<button class="secondary" data-title="${d.id}">${w.editTitle}</button><button class="secondary" data-replace="${d.id}">${w.replace}</button><button class="secondary danger" data-delete="${d.id}">${w.remove}</button>`:''}</div></div>`).join('')||`<p class="empty">${w.empty}</p>`}`;

  bind('back',async()=>{if(mode){mode='';render();}else if(folder!==null){folder=null;render();}else{selected=null;await refresh();}});
  ui.root.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{folder=b.dataset.folder;mode='';render();});
  bind('upload',()=>{mode='upload';render();});bind('cancel',()=>{mode='';render();});bind('edit',()=>{mode='edit';render();});if(isAdmin)bind('change-password',()=>{mode='password';render();});
  bind('status',async()=>{if(!confirm(w.statusConfirm))return;await api('/players/'+owner.id+'/status',{method:'POST',body:{active:!owner.active}});selected=null;await refresh();});
  bind('delete-player',async()=>{if(!confirm(w.deletePlayerConfirm))return;await api('/players/'+owner.id,{method:'DELETE'});selected=null;folder=null;await refresh();});
  bind('weight-form',()=>{if(user.weight_form_url)window.open(user.weight_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
  bind('game-form',()=>{if(user.game_form_url)window.open(user.game_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});

  if(mode==='upload')submit(async f=>{const file=f.get('pdf');if(!file||!file.size)throw Error('pdf_only');if(file.size>20*1024*1024)throw Error('file_size');await api('/documents?player='+encodeURIComponent(owner.id)+'&folder='+folder+'&title='+encodeURIComponent(String(f.get('title')||'').trim()),{method:'POST',body:file,binary:true});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;mode='';render();});
  ui.root.querySelectorAll('[data-title]').forEach(b=>b.onclick=async()=>{const d=docs.find(x=>x.id===b.dataset.title),title=prompt(w.titlePrompt,d?.title||'');if(title===null||!title.trim())return;await api('/documents/'+b.dataset.title,{method:'PATCH',body:{title:title.trim()}});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;render();});
  ui.root.querySelectorAll('[data-replace]').forEach(b=>b.onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='application/pdf,.pdf';i.onchange=async()=>{const f=i.files[0];if(!f)return;await api('/documents/'+b.dataset.replace,{method:'PUT',body:f,binary:true});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;render();};i.click();});
  ui.root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm(w.removeConfirm))return;await api('/documents/'+b.dataset.delete,{method:'DELETE'});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;render();});
}

function render(){
  const w=t();document.documentElement.lang=lang==='pt'?'pt-PT':'en';document.body.classList.toggle('player-theme',!!user&&user.role==='player');ui.lang.textContent=(user&&user.role==='player')?(lang==='pt'?'PT':'EN'):(lang==='pt'?'EN':'PT');ui.logout.hidden=!user||user.role==='player';ui.logout.textContent=w.logout;ui.install.textContent=w.install;document.getElementById('tagline').textContent=w.foot;
  if(!user||activationToken){
    const activating=!!activationToken;
    if(!activating && loginMode==='change'){
      ui.root.innerHTML=`<div class="login"><p class="eyebrow">The Mile</p><h1>${w.changeAccess}</h1><p class="subtitle">${w.loginSub}</p><form><label>${w.username}</label><input name="identifier" autocomplete="username" required><label>${w.currentPassword}</label><input name="current_password" type="password" autocomplete="current-password" required><label>${w.newPassword}</label><input name="new_password" type="password" minlength="8" maxlength="256" required><p class="error"></p><button class="primary" type="submit">${w.save}</button></form><button id="back-login" class="subtle">${w.backToLogin}</button></div>`;
      submit(async f=>{await api('/change-password',{method:'POST',body:{identifier:f.get('identifier'),current_password:f.get('current_password'),new_password:f.get('new_password')}});loginMode='login';notify('The Mile',w.passwordChanged);render();});
      bind('back-login',()=>{loginMode='login';render();});
      return;
    }
    ui.root.innerHTML=`<div class="login"><p class="eyebrow">The Mile</p><h1>${activating?w.activate:w.enter}</h1><p class="subtitle">${activating?w.activateSub:w.loginSub}</p><form>${!activating?`<label>${w.username}</label><input name="identifier" autocomplete="username" required>`:''}<label>${w.password}</label><input name="password" type="password" autocomplete="${activating?'new-password':'current-password'}" minlength="${activating?12:1}" required>${activating?`<label>${w.confirm}</label><input name="confirm" type="password" minlength="12" required>`:''}<p class="error"></p><button class="primary" type="submit">${activating?w.save:w.enter}</button></form>${!activating?`<div class="login-links"><button id="change-access" class="subtle">${w.changeAccess}</button><button id="forgot" class="subtle">${w.forgot}</button></div>`:''}</div>`;
    submit(async f=>{if(activating&&f.get('password')!==f.get('confirm'))throw Error('password_mismatch');await api(activating?'/activate':'/login',{method:'POST',body:{identifier:f.get('identifier'),password:f.get('password'),token:activationToken}});activationToken=null;await refresh();});
    bind('change-access',()=>{loginMode='change';render();});bind('forgot',()=>notify('The Mile',w.forgotText));return;
  }
  if(user.role==='admin'&&!selected){renderDashboard(w);return;} renderPlayer(w);
}

ui.lang.onclick=()=>{lang=lang==='pt'?'en':'pt';localStorage.setItem('mile-language',lang);render();};
ui.logout.onclick=async()=>{await api('/logout',{method:'POST',body:{}});user=null;csrf=null;selected=null;folder=null;mode='';players=[];admins=[];docs=[];render();};
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function updateInstallButton(){ui.install.hidden=isStandalone()||(!installPrompt&&!isiOS());}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;updateInstallButton();});
ui.install.onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;updateInstallButton();}else notify('The Mile',lang==='pt'?'No iPhone, usa Partilhar → Adicionar ao ecrã principal.':'On iPhone, use Share → Add to Home Screen.');};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v=40').catch(()=>{}));
updateInstallButton();refresh().catch(e=>{render();error(e);});
