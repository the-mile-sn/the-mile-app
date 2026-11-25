/* The Mile Select — only dropdown implementation for the admin. */
(()=>{'use strict';
const IDS=['tm-players-access','category','tm-portion-category','dish-category-filter','new-dish-category','recipe-filter-category','recipe-filter-type','recipe-filter-status','recipe-category','recipe-type','recipe-pdf-category','library-player-filter','library-type-filter','search-plan-type','plan-player','plan-type','supp-lib-moment','supp-lib-rule','i18n-status','i18n-fields'];
const instances=new Map();
function setup(select){
 if(select.id==='dish-category-filter'&&select.closest('#dish-filter-parking'))return;
 if(instances.has(select)||select.classList.contains('tm-select-native')||select.hidden||select.getAttribute('aria-hidden')==='true'||select.tabIndex===-1||select.closest('.tm-select-shell'))return;
 const shell=document.createElement('span');shell.className='tm-select-shell';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='tm-select-trigger';
 trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const label=document.createElement('span');label.className='tm-select-value';
 const arrow=document.createElement('span');arrow.className='tm-select-chevron';arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
 trigger.append(label,arrow);
 const panel=document.createElement('div');panel.className='tm-select-panel';panel.hidden=true;
 const list=document.createElement('div');list.className='tm-select-options';list.setAttribute('role','listbox');
 panel.append(list);
 const legacy=select.closest('.tm-two-line-select');if(legacy){legacy.classList.add('tm-select-legacy-preserved');legacy.append(shell);shell.append(select,trigger,panel);shell.classList.add('tm-select-preserve-field');}else{select.parentNode.insertBefore(shell,select);shell.append(select,trigger,panel)}
 select.classList.add('tm-select-native');select.style.setProperty('display','none','important');select.style.setProperty('position','absolute','important');select.style.setProperty('width','0px','important');select.style.setProperty('height','0px','important');
 if(['library-player-filter','library-type-filter'].includes(select.id)){shell.classList.add('tm-select-plan-filter');trigger.setAttribute('data-caption',select.id==='library-player-filter'?'Jogador':'Tipo de plano')}
 const state={select,shell,trigger,label,panel,list,search:null};
 instances.set(select,state);
 trigger.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.textContent?.trim()||'Selecionar opção');
 const close=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');shell.classList.remove('tm-select-open')};
 const render=()=>{
  label.textContent=select.selectedOptions[0]?.textContent?.trim()||'Selecionar';
  if(legacy){const existing=legacy.querySelector(':scope > .tm-select-value');if(existing)existing.textContent=label.textContent;}
  trigger.disabled=select.disabled;
  if(panel.hidden)return;
  const current=state.search?.value?.toLocaleLowerCase('pt-PT')||'';
  list.replaceChildren();
  [...select.options].forEach((opt,index)=>{
   if(opt.hidden||!opt.textContent.toLocaleLowerCase('pt-PT').includes(current))return;
   const item=document.createElement('button');item.type='button';item.className='tm-select-option';
   item.setAttribute('role','option');item.setAttribute('aria-selected',String(opt.selected));
   item.disabled=opt.disabled;item.textContent=opt.textContent;
   
   item.addEventListener('click',()=>{select.selectedIndex=index;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));close();render();trigger.focus()});
   list.append(item);
  });
  if(!list.childElementCount){const empty=document.createElement('span');empty.className='tm-select-empty';empty.textContent='Sem resultados';list.append(empty)}
 };
 const open=()=>{
  instances.forEach((other)=>{if(other!==state){other.panel.hidden=true;other.trigger.setAttribute('aria-expanded','false');other.shell.classList.remove('tm-select-open')}});
  panel.hidden=false;trigger.setAttribute('aria-expanded','true');shell.classList.add('tm-select-open');
  if(select.options.length>10&&!state.search&& !['library-player-filter','plan-player'].includes(select.id)){
   const input=document.createElement('input');
   input.className='tm-select-search';
   const category=['category','recipe-filter-category','recipe-category'].includes(select.id);
   input.type=category?'text':'search';
   input.placeholder='Pesquisar...';
   input.setAttribute('aria-label','Pesquisar opções');
   input.autocomplete='off';
   if(category){
    // CSP blocks dynamically injected style elements. Use the served stylesheet.
    input.inputMode='search';
    input.classList.add('tm-select-category-search');
    panel.insertBefore(input,list);
   }else{
    panel.insertBefore(input,list);
    for(const [property,value] of Object.entries({
     display:'block','box-sizing':'border-box',width:'calc(100% - 16px)',
     height:'44px','min-height':'44px',padding:'0 14px',margin:'8px 8px 14px',
     background:'var(--tm-ui-search, #f0f2f5)',border:'1px solid #dbe0e6',
     'border-radius':'11px',font:'400 14px/44px "Inter Tight", Arial, sans-serif'
    }))input.style.setProperty(property,value,'important');
   }
   input.addEventListener('input',render);
   state.search=input;
  }
  if(state.search)state.search.value='';
  render();
  if(!['category','recipe-filter-category','recipe-category'].includes(select.id))
   (state.search||list.querySelector('[aria-selected="true"]')||list.querySelector('button'))?.focus();
 };
 trigger.addEventListener('click',()=>panel.hidden?open():close());
 trigger.addEventListener('keydown',e=>{if(['ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();open()}});
 shell.addEventListener('keydown',e=>{if(e.key==='Escape'){close();trigger.focus()}});
 state.render=render;
 select.addEventListener('change',render);
 select.addEventListener('tm-refresh-select',render);
 const observer=new MutationObserver(()=>{if(!select.isConnected){observer.disconnect();instances.delete(select);return}render()});
 observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','value']});
 render();
}
window.tmRefreshAdminSelect=select=>{if(!instances.has(select)&&IDS.includes(select.id))setup(select);instances.get(select)?.render();};
function init(){IDS.forEach(id=>{const s=document.getElementById(id);if(s&&s.tagName==='SELECT')setup(s)})}
document.addEventListener('pointerdown',e=>{instances.forEach(v=>{if(!v.shell.contains(e.target)){v.panel.hidden=true;v.trigger.setAttribute('aria-expanded','false');v.shell.classList.remove('tm-select-open')}})});
document.addEventListener('DOMContentLoaded',()=>{init();const root=document.getElementById('admin-workspace')||document.body;let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;init()})}).observe(root,{childList:true,subtree:true})});
if(document.readyState!=='loading')init();
})();
