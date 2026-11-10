"use strict";
/* Embedded in the existing Biblioteca Alimentar navigation, never a stand-alone page. */
(()=>{
 const root=document.getElementById("tm-food-library-page");
 if(!root)return;
 const get=id=>document.getElementById(id);
 const foods=get("tm-food-main"),portions=get("tm-visual-portions-page");
 const tabFoods=get("tm-food-tab-foods"),tabPortions=get("tm-food-tab-portions");
 const input=get("tm-portion-file"),feedback=get("tm-portion-feedback");
 const grid=get("tm-portion-grid"),count=get("tm-portion-count");
 const search=get("tm-portion-search"),category=get("tm-portion-category");
 let references=[],loaded=false,loading=false;
 const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 function mode(which){
  const visual=which==="portions";
  foods.hidden=visual;portions.hidden=!visual;
  tabFoods.classList.toggle("is-current",!visual);
  tabPortions.classList.toggle("is-current",visual);
  tabFoods.setAttribute("aria-pressed",String(!visual));
  tabPortions.setAttribute("aria-pressed",String(visual));
  if(visual&&!loaded&&!loading)load();
 }
 tabFoods.addEventListener("click",()=>mode("foods"));
 tabPortions.addEventListener("click",()=>mode("portions"));
 function draw(){
  const categories=[...new Set(references.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,"pt"));
  const selected=category.value;
  category.replaceChildren();
  const blank=document.createElement("option");blank.value="";blank.textContent="Todas as categorias";category.append(blank);
  for(const name of categories){const item=document.createElement("option");item.value=name;item.textContent=name;category.append(item);}
  category.value=categories.includes(selected)?selected:"";
  const term=normalize(search.value);
  const filtered=references.filter(ref=>{
   if(category.value&&ref.category!==category.value)return false;
   const display=ref.category+" "+ref.total_g+" g "+(ref.rice_g?"arroz "+ref.rice_g+" g batata "+ref.potato_g+" g":"");
   return !term||normalize(display).includes(term);
  });
  count.textContent=filtered.length+" de "+references.length+" referências";
  grid.replaceChildren();
  if(!filtered.length){const empty=document.createElement("p");empty.textContent=references.length?"Nenhuma referência corresponde aos filtros.":"Ainda não foram importadas fotografias de porções.";grid.append(empty);return;}
  for(const ref of filtered){
   const card=document.createElement("article");card.className="tm-portion-card";
   const image=document.createElement("img");image.loading="lazy";image.decoding="async";image.src="/api/v2/visual-portions/image/"+encodeURIComponent(ref.id);
   image.alt=ref.photo_subject==="Carne branca"?"Fotografia de carne branca usada como exemplo para carne ou peixe, "+ref.total_g+" g":"Fotografia de "+ref.category+", "+ref.total_g+" g";
   const info=document.createElement("div");info.className="tm-portion-info";
   const label=document.createElement("strong");label.textContent=ref.category;
   const grams=document.createElement("span");grams.className="tm-portion-grams";
   grams.textContent=ref.total_g+" g";
   info.append(label,grams);
   if(ref.rice_g!==null&&ref.rice_g!==undefined){
    const breakdown=document.createElement("small");breakdown.className="tm-portion-breakdown";
    breakdown.textContent=ref.rice_g+" g arroz + "+ref.potato_g+" g batata";
    info.append(breakdown);
   }
   const toggle=document.createElement("button");toggle.type="button";toggle.className="tm-portion-toggle";toggle.setAttribute("aria-pressed",String(!!ref.active));
   toggle.textContent=ref.active?"Ativa":"Inativa";
   toggle.addEventListener("click",async()=>{
    toggle.disabled=true;
    try{const res=await request("/api/v2/visual-portions/"+encodeURIComponent(ref.id),{method:"PUT",body:JSON.stringify({active:!ref.active})});ref.active=!!res.active;draw();}
    catch(e){feedback.textContent="Não foi possível alterar a referência: "+e.message;toggle.disabled=false;}
   });
   card.append(image,info,toggle);grid.append(card);
  }
 }
 async function load(){
  loading=true;feedback.textContent="A carregar referências visuais…";
  try{
   const result=await request("/api/v2/visual-portions");
   references=result.references||[];loaded=true;
   feedback.textContent=references.length?"":"Importa o pacote aprovado para adicionar as fotografias.";
   draw();
  }catch(error){feedback.textContent="Não foi possível carregar as fotografias: "+error.message;}
  finally{loading=false;}
 }
 search.addEventListener("input",draw);
 category.addEventListener("change",draw);
 input.addEventListener("change",async()=>{
  const file=input.files&&input.files[0];if(!file)return;
  if(!file.name.toLowerCase().endsWith(".zip")||file.size>5*1024*1024){feedback.textContent="Seleciona o pacote ZIP aprovado (até 5 MB).";input.value="";return;}
  if(!window.confirm("Importar as referências aprovadas para a biblioteca interna do Backoffice? Isto não as publica na app dos jogadores.")){input.value="";return;}
  input.disabled=true;feedback.textContent="A importar fotografias…";
  try{
   const res=await fetch("/api/v2/visual-portions/import",{method:"POST",credentials:"same-origin",headers:{"Accept":"application/json","Content-Type":"application/zip","X-CSRF-Token":csrf},body:file});
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||"Não foi possível importar.");
   await load();
   feedback.textContent=result.imported+" referências importadas, com "+result.photos+" fotografias distintas.";
  }catch(error){feedback.textContent="Erro na importação: "+error.message;}
  finally{input.disabled=false;input.value="";}
 });
 window.tmOpenAdminVisualPortions=()=>{if(typeof window.tmOpenAdminFoodLibrary==="function")window.tmOpenAdminFoodLibrary();mode("portions");};
})();
