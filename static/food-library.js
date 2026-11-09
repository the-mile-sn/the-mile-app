"use strict";(()=>{
const embeddedRoot=document.getElementById("tm-food-library-page");
const $=id=>embeddedRoot?embeddedRoot.querySelector('[id="'+id+'"]'):document.getElementById(id);
let foods=[],editing=null,page=1,pages=1,total=0,revision=0,searchTimer=null,csrf="";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>Number(n||0).toLocaleString("pt-PT",{maximumFractionDigits:1});
function updatePager(){
 let nav=$("food-pagination");
 if(!nav){
  nav=document.createElement("nav");nav.id="food-pagination";nav.className="tm-library-pagination tm-food-pagination";
  nav.setAttribute("aria-label","Paginação da biblioteca alimentar");
  $("empty").closest(".panel").insertAdjacentElement("afterend",nav);
 }
 nav.replaceChildren();nav.hidden=pages<=1;
 if(pages<=1)return;
 const back=document.createElement("button");back.type="button";back.textContent="Anterior";back.disabled=page<=1;
 back.addEventListener("click",()=>load(page-1));
 const current=document.createElement("span");current.textContent="Página "+page+" de "+pages;
 const next=document.createElement("button");next.type="button";next.textContent="Seguinte";next.disabled=page>=pages;
 next.addEventListener("click",()=>load(page+1));
 nav.append(back,current,next);
}
function draw(){
 $("rows").innerHTML=foods.map(f=>'<tr><td class="food-category">'+esc(f.category||"—")+'</td><td class="food-name"><strong>'+esc(f.display_name)+'</strong></td><td class="food-notes">'+esc(f.notes||"—")+'</td>'+["kcal","protein_g","carbs_g","fat_g"].map(k=>'<td class="num">'+fmt(f[k])+'</td>').join("")+'<td class="food-edit-cell"><button type="button" class="food-edit-icon" data-edit="'+esc(f.id)+'" aria-label="Editar '+esc(f.display_name)+'" title="Editar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg></button><button type="button" class="food-edit-icon food-delete-icon" data-delete="'+esc(f.id)+'" aria-label="Eliminar '+esc(f.display_name)+'" title="Eliminar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg></button></td></tr>').join("");
 $("empty").hidden=foods.length!==0;
 $("feedback").textContent="";
 updatePager();
}
async function load(target=1){
 const token=++revision;
 const query=new URLSearchParams({paged:"1",page:String(target)});
 const search=$("search").value.trim(),cat=$("category").value;
 if(search)query.set("q",search);
 if(cat)query.set("category",cat);
 $("feedback").textContent="A carregar…";
 try{
  const response=await fetch("/api/v2/food-library?"+query.toString(),{credentials:"same-origin"});
  if(!response.ok)throw Error("Sem acesso à biblioteca ("+response.status+").");
  const data=await response.json();
  if(token!==revision)return;
  foods=data.foods||[];page=data.page||1;pages=data.pages||1;total=data.total||0;
  const select=$("category"),selected=select.value;
  select.replaceChildren();
  const all=document.createElement("option");all.value="";all.textContent="Todas as categorias";select.append(all);
  for(const name of data.categories||[]){
   const option=document.createElement("option");option.value=name;option.textContent=name;select.append(option);
  }
  select.value=selected;
  draw();
 }catch(error){
  if(token!==revision)return;
  $("feedback").textContent="Não foi possível carregar a biblioteca: "+error.message;
 }
}
$("search").addEventListener("input",()=>{
 clearTimeout(searchTimer);
 searchTimer=setTimeout(()=>load(1),250);
});
$("category").addEventListener("change",()=>load(1));
$("rows").addEventListener("click",event=>{
 const editButton=event.target.closest("[data-edit]");
 if(editButton){open(foods.find(f=>f.id===editButton.dataset.edit));return;}
 const deleteButton=event.target.closest("[data-delete]");
 if(deleteButton)archiveFood(deleteButton.dataset.delete);
});
async function archiveFood(id){
 const food=foods.find(item=>item.id===id);
 if(!food)return;
 if(!confirm("Eliminar o alimento \""+food.display_name+"\" da Biblioteca Alimentar?\n\nNão será possível se estiver associado a um plano."))return;
 const button=[...$("rows").querySelectorAll("[data-delete]")].find(item=>item.dataset.delete===id);
 if(button)button.disabled=true;
 try{
  const response=await fetch("/api/v2/food-library/"+encodeURIComponent(id),{
   method:"DELETE",headers:{"X-CSRF-Token":csrf||""},
   credentials:"same-origin"
  });
  if(response.status===409){
   alert("Não é possível eliminar este alimento porque está associado a um plano guardado ou publicado.");
   return;
  }
  if(!response.ok)throw Error("O servidor devolveu o erro "+response.status+".");
  await load(page);
 }catch(error){
  alert("Não foi possível eliminar o alimento: "+error.message);
 }finally{if(button)button.disabled=false;}
}
function open(food){
 editing=food||null;$("food-form").reset();
 $("editor-title").textContent=food?"Editar alimento":"Novo alimento";
 if(food)for(const [key,value] of Object.entries(food)){
  const input=$("food-form").elements.namedItem(key);
  if(input)input.value=value??"";
 }
 $("form-feedback").textContent="";$("editor").showModal();
}
$("new").addEventListener("click",()=>open(null));
$("cancel").addEventListener("click",()=>$("editor").close());
$("food-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const data=Object.fromEntries(new FormData(event.target));
 if(editing)data.id=editing.id;
 data.base_name=editing?.base_name||data.display_name;
 try{
  const response=await fetch("/api/v2/food-library",{
   method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf||""},
   credentials:"same-origin",body:JSON.stringify(data)
  });
  if(!response.ok)throw Error("Não foi possível guardar ("+response.status+").");
  $("editor").close();await load(page);
 }catch(error){$("form-feedback").textContent=error.message;}
});
// Load on entry in the main Backoffice; keep standalone page behavior.
let activation=null;
function activate(){
 if(activation)return activation;
 activation=(async()=>{
  const response=await fetch("/api/me",{credentials:"same-origin"});
  if(!response.ok)throw Error("Sessão de administração indisponível.");
  const data=await response.json();
  if(embeddedRoot&&data.user?.role!=="admin")throw Error("Acesso não autorizado.");
  csrf=data.csrf||"";
  await load(page);
 })().finally(()=>{activation=null});
 return activation;
}
if(embeddedRoot)window.tmEnsureAdminFoodLibrary=activate;
else activate().catch(()=>load());
})();

/* Standalone-only dropdown decoration. The main backoffice manages its controls. */
(()=>{
 if(document.getElementById("tm-food-library-page"))return;
 const skip=el=>el.hidden||el.getAttribute("aria-hidden")==="true"||el.tabIndex===-1||el.classList.contains("tm-planning-native-select")||el.classList.contains("tm-clinical-native-select")||["draft-list","supp-lib-select","category"].includes(el.id);
 const getTitle=el=>{const lbl=el.closest("label");let raw="";if(lbl){raw=[...lbl.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(" ").trim();if(!raw){const span=lbl.querySelector(":scope > span");if(span&&!span.classList.contains("sr-only"))raw=span.textContent.trim()}}return (raw||el.getAttribute("aria-label")||el.getAttribute("name")||el.id.replace(/[-_]/g," ")).replace(/\*/g,"").replace(/^(Filtrar |Selecionar )/i,"").trim()||"Selecionar"};
 const update=el=>{const w=el.parentElement;if(!w?.classList.contains("tm-two-line-select"))return;const selected=el.selectedOptions?.[0];const first=[...el.options].find(o=>o.value&&!o.disabled);const isAll=/^(todas?|todos?\s+as?|all)(\s|$)/i.test((selected?.textContent||"").trim());const text=selected?.value||isAll?selected?.textContent:(first?.textContent||selected?.textContent||"Selecionar");w.querySelector(".tm-select-value").textContent=text.trim();w.classList.toggle("tm-select-disabled",el.disabled)};
 const setup=el=>{if(skip(el)||el.closest(".tm-two-line-select"))return;const parentLabel=el.closest("label");if(parentLabel&&parentLabel.querySelectorAll("select").length===1&&parentLabel.querySelectorAll("input,textarea").length===0)parentLabel.classList.add("tm-select-label-container");const w=document.createElement("span");w.className="tm-two-line-select";const caption=document.createElement("span");caption.className="tm-select-caption";caption.textContent=getTitle(el);const value=document.createElement("span");value.className="tm-select-value";const arrow=document.createElement("span");arrow.className="tm-select-arrow";arrow.setAttribute("aria-hidden","true");arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';el.parentNode.insertBefore(w,el);w.append(caption,value,arrow,el);el.addEventListener("change",()=>update(el));el.addEventListener("input",()=>update(el));new MutationObserver(()=>update(el)).observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled","selected"]});update(el)};
 const scan=()=>document.querySelectorAll("select").forEach(setup);scan();new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.("select")||n.querySelector?.("select")))))scan()}).observe(document.documentElement,{childList:true,subtree:true});
})();