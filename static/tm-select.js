/* The Mile Select — progressive enhancement for visible native selects.
 * Keep the real select as the source of truth; dispatch change for existing handlers.
 * Never touch hidden native backing selects used by custom person pickers.
 */
(()=>{'use strict';
const IDS=['tm-players-access','category','tm-portion-category','dish-category-filter','new-dish-category','recipe-filter-category','recipe-filter-type','recipe-filter-status','recipe-category','recipe-type','recipe-pdf-category','library-player-filter','library-type-filter','search-plan-type','plan-player','plan-type','supp-lib-moment','supp-lib-rule'];
const instances=new Map();
function setup(select){
 if(instances.has(select)||select.classList.contains('tm-select-native')||select.hidden||select.getAttribute('aria-hidden')==='true'||select.tabIndex===-1||select.closest('.tm-select-shell'))return;
 const shell=document.createElement('span');shell.className='tm-select-shell';
 const isPlanFilter=select.id==='library-player-filter'||select.id==='library-type-filter';
 if(isPlanFilter){shell.classList.add('tm-select-plan-filter');shell.dataset.caption=select.id==='library-player-filter'?'Jogador':'Tipo de plano';}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='tm-select-trigger';
 trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const label=document.createElement('span');label.className='tm-select-value';
 const arrow=document.createElement('span');arrow.className='tm-select-chevron';arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
 trigger.append(label,arrow);
 const panel=document.createElement('div');panel.className='tm-select-panel';panel.hidden=true;
 const list=document.createElement('div');list.className='tm-select-options';list.setAttribute('role','listbox');
 panel.append(list);
 const legacy=select.closest('.tm-two-line-select');
 const preservePlayer=select.id==='tm-players-access'&&legacy;
 if(preservePlayer){
  legacy.classList.add('tm-select-legacy-preserved');
  shell.classList.add('tm-select-preserve-field');
  legacy.append(shell);
  shell.append(select,trigger,panel);
 }else if(legacy){
  legacy.parentNode.insertBefore(shell,legacy);
  shell.append(select,trigger,panel);
  legacy.remove();
 }else{
  select.parentNode.insertBefore(shell,select);
  shell.append(select,trigger,panel);
 }
 select.classList.add('tm-select-native');
 const state={select,shell,trigger,label,panel,list,search:null};
 instances.set(select,state);
 trigger.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.textContent?.trim()||'Selecionar opção');
 const close=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');shell.classList.remove('tm-select-open')};
 const render=()=>{
  label.textContent=select.selectedOptions[0]?.textContent?.trim()||'Selecionar';
  if(preservePlayer){const visible=legacy.querySelector(':scope > .tm-select-value');if(visible)visible.textContent=label.textContent;}
  trigger.disabled=select.disabled;
  if(panel.hidden)return;
  const current=state.search?.value?.toLocaleLowerCase('pt-PT')||'';
  list.replaceChildren();
  [...select.options].forEach((opt,index)=>{
   if(opt.hidden||!opt.textContent.toLocaleLowerCase('pt-PT').includes(current))return;
   const item=document.createElement('button');item.type='button';item.className='tm-select-option';
   item.setAttribute('role','option');item.setAttribute('aria-selected',String(opt.selected));
   item.disabled=opt.disabled;item.textContent=opt.textContent;
   if(opt.selected){const check=document.createElement('span');check.className='tm-select-check';check.textContent='✓';check.setAttribute('aria-hidden','true');item.append(check)}
   item.addEventListener('click',()=>{select.selectedIndex=index;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));close();render();trigger.focus()});
   list.append(item);
  });
  if(!list.childElementCount){const empty=document.createElement('span');empty.className='tm-select-empty';empty.textContent='Sem resultados';list.append(empty)}
 };
 const open=()=>{
  instances.forEach((other)=>{if(other!==state){other.panel.hidden=true;other.trigger.setAttribute('aria-expanded','false');other.shell.classList.remove('tm-select-open')}});
  panel.hidden=false;trigger.setAttribute('aria-expanded','true');shell.classList.add('tm-select-open');
  if(select.options.length>9&&!state.search){
   const categorySearch=['category','recipe-filter-category','recipe-category'].includes(select.id);
   const input=document.createElement('input');
   input.className='tm-select-search';
   input.type=categorySearch?'text':'search';
   input.placeholder='Pesquisar...';
   input.setAttribute('aria-label','Pesquisar opções');
   input.autocomplete='off';
   if(categorySearch){
    // Isolate category search from legacy form styles (including !important).
    // The input remains a real, accessible input; users can still zoom manually.
    const host=document.createElement('span');
    host.className='tm-category-search-host';
    const shadow=host.attachShadow({mode:'open'});
    const style=document.createElement('style');
    style.textContent=`
      :host{display:block;width:100%;box-sizing:border-box;margin:0 0 10px}
      input{display:block;box-sizing:border-box;width:100%;height:44px;margin:0;
        padding:0 12px;border:0;border-bottom:2px solid transparent;
        border-radius:0;outline:0;box-shadow:none;background:transparent;
        appearance:none;-webkit-appearance:none;color:var(--tm-ui-text,#222);
        caret-color:currentColor;font:400 17px/1.3 "Inter Tight",Arial,sans-serif;
        -webkit-text-size-adjust:100%}
      input::placeholder{color:var(--tm-ui-muted,#82858d);opacity:1}
      input:focus-visible{border-bottom-color:var(--tm-shell-focus,#82a8c9)}
    `;
    input.setAttribute('inputmode','search');
    input.setAttribute('enterkeyhint','search');
    input.spellcheck=false;
    shadow.append(style,input);
    panel.insertBefore(host,list);
   }else{
    panel.insertBefore(input,list);
   }
   input.addEventListener('input',render);
   state.search=input;
  }
  if(state.search)state.search.value='';
  render();
  // Opening a menu must never automatically focus its search input.
  // The user focuses Search explicitly; keyboard navigation still starts
  // from the trigger via ArrowDown, Enter or Space. No Safari zoom-on-open.
 };
 trigger.addEventListener('click',()=>panel.hidden?open():close());
 trigger.addEventListener('keydown',e=>{if(['ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();open()}});
 shell.addEventListener('keydown',e=>{if(e.key==='Escape'){close();trigger.focus()}});
 select.addEventListener('change',render);
 const observer=new MutationObserver(()=>{if(!select.isConnected){observer.disconnect();instances.delete(select);return}render()});
 observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','value']});
 render();
}
function init(){IDS.forEach(id=>{const s=document.getElementById(id);if(s&&s.tagName==='SELECT')setup(s)})}
document.addEventListener('pointerdown',e=>{instances.forEach(v=>{if(!v.shell.contains(e.target)){v.panel.hidden=true;v.trigger.setAttribute('aria-expanded','false');v.shell.classList.remove('tm-select-open')}})});
document.addEventListener('DOMContentLoaded',()=>{init();const root=document.getElementById('admin-workspace')||document.body;let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;init()})}).observe(root,{childList:true,subtree:true})});
if(document.readyState!=='loading')init();
})();
