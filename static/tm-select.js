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
 const arrow=document.createElement('span');arrow.className='tm-select-chevron';arrow.setAttribute('aria-hidden','true');arrow.textContent='⌄';
 trigger.append(label,arrow);
 const panel=document.createElement('div');panel.className='tm-select-panel';panel.hidden=true;
 const list=document.createElement('div');list.className='tm-select-options';list.setAttribute('role','listbox');
 panel.append(list);
 const legacy=select.closest('.tm-two-line-select');if(legacy){legacy.parentNode.insertBefore(shell,legacy);shell.append(select,trigger,panel);legacy.remove()}else{select.parentNode.insertBefore(shell,select);shell.append(select,trigger,panel)}
 select.classList.add('tm-select-native');
 const state={select,shell,trigger,label,panel,list,search:null};
 instances.set(select,state);
 trigger.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.textContent?.trim()||'Selecionar opção');
 const close=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');shell.classList.remove('tm-select-open')};
 const render=()=>{
  label.textContent=select.selectedOptions[0]?.textContent?.trim()||'Selecionar';
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
   const input=document.createElement('input');input.className='tm-select-search';input.type='search';input.placeholder='Pesquisar...';
   // This control is nested in a white dropdown card, so it uses depth two.
   // Set the semantic token on the created control to prevent inherited legacy
   // input rules (some marked !important) from applying the third-depth blue.
   input.style.setProperty('background','var(--tm-ui-subcard)','important');
   input.style.setProperty('background-color','var(--tm-ui-subcard)','important');
   input.style.setProperty('background-image','none','important');input.setAttribute('aria-label','Pesquisar opções');input.addEventListener('input',render);panel.insertBefore(input,list);state.search=input;
  }
  if(state.search)state.search.value='';
  render();(state.search||list.querySelector('[aria-selected="true"]')||list.querySelector('button'))?.focus();
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
