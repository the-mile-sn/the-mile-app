"use strict";
/* Backoffice culinary recipes: isolated from meal prescriptions and player views. */
(()=>{
 const $=id=>document.getElementById(id);
 const blank=()=>({id:"",name:"",category_id:"",recipe_type:"standard",status:"draft",servings:1,sections:[{title:"",ingredients:[{name:"",quantity:"",unit:""}]}],steps:[""],notes:"",photo_key:null});
 let categories=[],recipes=[],current=null,openedId=null,busy=false,loaded=false;
 const alertMessage=(message)=>{$("recipe-status-message").textContent=message;};
 const editorMessage=(message)=>{$("recipe-editor-feedback").textContent=message;};
 const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT");
 function node(tag,cls,content){
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(content!==undefined)el.textContent=content;
  return el;
 }
 function button(label,handler,cls=""){
  const el=node("button",cls,label);el.type="button";el.addEventListener("click",handler);return el;
 }
 function updateSelect(id,options,emptyLabel){
  const input=$(id),before=input.value;
  input.replaceChildren();
  const placeholder=node("option","",emptyLabel);placeholder.value="";input.append(placeholder);
  for(const item of options){const opt=node("option","",item.name);opt.value=item.id;input.append(opt);}
  if(options.some(x=>x.id===before))input.value=before;
 }
 function paintCategoryOptions(){
  updateSelect("recipe-category",categories,"Selecionar categoria");
  updateSelect("recipe-filter-category",categories,"Todas as categorias");
  const host=$("recipe-categories");host.replaceChildren();
  for(const entry of categories){host.append(node("span","recipe-category-pill",entry.name));}
 }
 function matchesRecipe(r){
  const q=norm($("recipe-search").value.trim());
  const category=$("recipe-filter-category").value,type=$("recipe-filter-type").value;
  return (!q||norm([r.name,r.category].join(" ")).includes(q))&&(!category||category===r.category_id)&&(!type||type===r.recipe_type);
 }
 function paintList(){
  const host=$("recipe-list");host.replaceChildren();
  const visible=recipes.filter(matchesRecipe);
  if(!visible.length){
   host.append(node("p","recipe-empty",recipes.length?"Nenhuma receita corresponde aos filtros.":"A biblioteca está vazia. Adiciona a primeira receita ou cria uma categoria."));
   return;
  }
  const table=node("table","recipe-table"),thead=node("thead"),head=node("tr");
  for(const label of ["Fotografia","Receita","Categoria","Tipo","Estado",""]){head.append(node("th","",label));}
  thead.append(head);table.append(thead);
  const tbody=node("tbody");
  for(const r of visible){
   const tr=node("tr");const photoCell=node("td");
   if(r.photo_key){const photo=node("img","recipe-thumb");photo.src="/api/v2/recipes/image/"+encodeURIComponent(r.id);photo.loading="lazy";photo.alt="";photoCell.append(photo);}
   else photoCell.append(node("div","recipe-thumb recipe-thumb-empty","—"));
   tr.append(photoCell);
   for(const [value,cls] of [[r.name,"recipe-name"],[r.category,""],[r.recipe_type==="adaptable"?"Adaptável":"Padrão",""],[r.status==="draft"?"Rascunho":"Aprovada",""]]){
    tr.append(node("td",cls,value));
   }
   const actions=node("td","recipe-row-actions");
   actions.append(button("Editar",()=>openRecipe(r.id)));
   const remove=button("Eliminar",()=>deleteRecipe(r),"recipe-delete");
   remove.setAttribute("aria-label","Eliminar receita "+r.name);
   actions.append(remove);
   tr.append(actions);tbody.append(tr);
  }
  table.append(tbody);const scroll=node("div","recipe-table-scroll");scroll.append(table);host.append(scroll);
 }
 function labelledInput(label,value,onChange,placeholder){
  const wrap=node("label","recipe-entry-field");
  wrap.append(node("span","",label));
  const input=node("input");input.value=value||"";input.placeholder=placeholder||"";input.maxLength=180;
  input.addEventListener("input",()=>onChange(input.value));
  wrap.append(input);return wrap;
 }
 function paintRecipeLink(ingredient,options={}){
  // Link selection is explicit; text like "ver receita anterior" is never
  // assumed to identify the correct recipe.
  const wrap=node("details","recipe-reference");
  const summary=node("summary","recipe-reference-summary","Associar receita (opcional)");
  wrap.append(summary);
  const label=node("label","recipe-reference-heading");
  label.append(node("span","","Receita associada (opcional)"));
  const search=node("input");search.type="search";search.placeholder="Pesquisar receita da biblioteca";
  search.setAttribute("aria-label","Pesquisar receita associada");
  if(/ver receita|receita anterior/i.test(ingredient.name||"")){
   search.value=String(ingredient.name||"").replace(/\([^)]*ver receita[^)]*\)/ig,"").replace(/\bver receita anterior\b/ig,"").trim();
  }
  const picker=node("select");
  picker.setAttribute("aria-label","Associar a uma receita");
  label.append(search,picker);wrap.append(label);
  const hint=node("span","recipe-reference-hint");
  wrap.append(hint);
  const sourcePage=options.pdfRecipe?.page;
  const buildOptions=()=>{
   const searchText=norm(search.value.trim());
   const candidates=[
    ...recipes.filter(r=>r.id!==options.ownerId).map(r=>({
      value:"id:"+r.id,label:r.name+" · "+r.category
    })),
    ...(options.pdfRecipe && pdfPreview ? pdfPreview.recipes.filter(r=>
      r.page!==sourcePage && r.selected && r.name.trim()
    ).map(r=>({value:"page:"+r.page,label:r.name+" · PDF página "+r.page})):[])
   ];
   const selected=ingredient.recipe_ref_page!=null?"page:"+ingredient.recipe_ref_page:
    ingredient.recipe_ref_id?"id:"+ingredient.recipe_ref_id:"";
   const filtered=candidates.filter(c=>!searchText||norm(c.label).includes(searchText)||c.value===selected);
   picker.replaceChildren();
   const empty=node("option","","Sem receita associada");empty.value="";picker.append(empty);
   for(const item of filtered){
    const opt=node("option","",item.label);opt.value=item.value;picker.append(opt);
   }
   if(selected&&!filtered.some(c=>c.value===selected)){
    const missing=node("option","","Referência indisponível — rever");missing.value=selected;
    picker.append(missing);
   }
   picker.value=selected;
   const chosen=candidates.find(c=>c.value===selected);
   summary.textContent=selected?"Receita associada: "+(chosen?.label||"verificar ligação"):
    "Associar receita (opcional)";
   hint.textContent=selected?
    "A associação utiliza o identificador da receita, não a posição no documento.":
    "Pesquisa e seleciona apenas se este alimento remeter para outra receita.";
  };
  search.addEventListener("input",buildOptions);
  picker.addEventListener("change",()=>{
   const value=picker.value;
   delete ingredient.recipe_ref_id;delete ingredient.recipe_ref_page;
   if(value.startsWith("id:"))ingredient.recipe_ref_id=value.slice(3);
   if(value.startsWith("page:"))ingredient.recipe_ref_page=Number(value.slice(5));
   buildOptions();
  });
  buildOptions();
  return wrap;
 }
 let recipeLinkActionCount=0;
 function inlineRecipeLink(ingredient,options={}){
  const panel=paintRecipeLink(ingredient,options);
  panel.id="recipe-link-panel-"+(++recipeLinkActionCount);
  const trigger=node("button","recipe-link-toggle");
  trigger.type="button";
  trigger.setAttribute("aria-controls",panel.id);
  trigger.setAttribute("aria-expanded","false");
  const icon=document.createElementNS("http://www.w3.org/2000/svg","svg");
  icon.setAttribute("viewBox","0 0 24 24");
  icon.setAttribute("width","18");icon.setAttribute("height","18");
  icon.setAttribute("fill","none");icon.setAttribute("stroke","currentColor");
  icon.setAttribute("stroke-width","1.7");
  icon.setAttribute("stroke-linecap","round");icon.setAttribute("stroke-linejoin","round");
  icon.setAttribute("aria-hidden","true");
  const path=document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d","M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71");
  icon.append(path);trigger.append(icon);
  const update=()=>{
   const linked=!!(ingredient.recipe_ref_id||ingredient.recipe_ref_page!=null);
   const description=linked?panel.querySelector("summary").textContent:"Associar receita";
   trigger.classList.toggle("is-linked",linked);
   trigger.title=description;
   trigger.setAttribute("aria-label",linked?"Alterar "+description:
    "Associar receita ao alimento "+(ingredient.name||""));
   trigger.setAttribute("aria-expanded",String(panel.open));
  };
  trigger.addEventListener("click",()=>{
   panel.open=!panel.open;
   update();
   if(panel.open)panel.querySelector('input[type="search"]').focus();
  });
  panel.querySelector("select").addEventListener("change",()=>{
   panel.open=false;update();trigger.focus();
  });
  update();
  return {button:trigger,panel};
 }
 function paintSections(){
  const host=$("recipe-sections");host.replaceChildren();
  current.sections.forEach((section,si)=>{
   const box=node("div","recipe-section"),head=node("div","recipe-section-head");
   const title=labelledInput("Título do bloco (opcional)",section.title,value=>{section.title=value;},"Ex.: Para o molho");
   head.append(title,button("Remover bloco",()=>{current.sections.splice(si,1);paintSections();}));
   box.append(head);
   const columns=node("div","recipe-ingredients-head");
   for(const name of ["Quantidade","Unidade","Alimento",""]){columns.append(node("span","",name));}
   box.append(columns);
   section.ingredients.forEach((ingredient,ii)=>{
    const row=node("div","recipe-ingredient-row");
    for(const [key,placeholder] of [["quantity","Ex.: 10, q.b. ou 1 un / 120 g"],["unit","Ex.: g, ml, un"],["name","Ex.: Azeite"]]){
     const input=node("input");
     input.value=ingredient[key]||"";input.placeholder=placeholder;
     input.maxLength=key==="name"?180:45;
     input.setAttribute("aria-label",key==="name"?"Ingrediente":key==="quantity"?"Quantidade":"Unidade");
     input.addEventListener("input",()=>{ingredient[key]=input.value;});
     row.append(input);
    }
    const link=inlineRecipeLink(ingredient,{ownerId:current.id});
    const actions=node("div","recipe-ingredient-actions");
    actions.append(link.button,button("×",()=>{section.ingredients.splice(ii,1);paintSections();},"recipe-remove"));
    row.append(actions);box.append(row,link.panel);
   });
   box.append(button("+ Ingrediente",()=>{section.ingredients.push({name:"",quantity:"",unit:""});paintSections();},"recipe-inline-add"));
   host.append(box);
  });
 }
 function paintSteps(){
  const host=$("recipe-steps");host.replaceChildren();
  current.steps.forEach((step,i)=>{
   const row=node("div","recipe-step-row");
   row.append(node("span","recipe-step-number",String(i+1)));
   const area=node("textarea");area.rows=2;area.value=step;area.placeholder="Descreve o procedimento.";
   area.maxLength=2000;area.setAttribute("aria-label","Passo "+(i+1));area.addEventListener("input",()=>{current.steps[i]=area.value;});
   row.append(area,button("×",()=>{current.steps.splice(i,1);paintSteps();},"recipe-remove"));host.append(row);
  });
 }
 function closeEditor(){
  $("recipe-editor-panel").hidden=true;openedId=null;current=null;
  $("recipe-photo-file").value="";editorMessage("");
 }
 function paintEditor(){
  $("recipe-editor-panel").hidden=false;
  $("recipe-editor-heading").textContent=current.id?"Editar receita":"Adicionar nova receita";
  $("recipe-name").value=current.name;
  $("recipe-category").value=current.category_id;
  $("recipe-type").value=current.recipe_type;
  $("recipe-publication").value=current.status;
  $("recipe-servings").value=current.servings;
  $("recipe-notes").value=current.notes;
  $("recipe-photo-file").value="";
  const photo=$("recipe-photo-preview");photo.hidden=!current.photo_key;
  if(current.photo_key)photo.src="/api/v2/recipes/image/"+encodeURIComponent(current.id)+"?v="+Date.now();
  else photo.removeAttribute("src");
  paintSections();paintSteps();editorMessage("");
  $("recipe-editor-panel").scrollIntoView({behavior:"smooth",block:"start"});
 }
 async function openRecipe(id){
  if(busy)return;
  if(!id){current=blank();openedId=null;paintEditor();return;}
  alertMessage("A carregar receita…");
  try{const result=await request("/api/v2/recipes/"+encodeURIComponent(id));current=result.recipe;openedId=id;paintEditor();alertMessage("");}
  catch(error){alertMessage("Não foi possível abrir a receita: "+error.message);}
 }
 function payload(){
  return {
   name:$("recipe-name").value.trim(),category_id:$("recipe-category").value,
   recipe_type:$("recipe-type").value,status:$("recipe-publication").value,
   servings:Number($("recipe-servings").value),
   sections:current.sections.map(s=>({id:s.id,title:s.title,ingredients:s.ingredients.map(i=>({id:i.id,name:i.name,quantity:i.quantity,unit:i.unit,recipe_ref_id:i.recipe_ref_id||null}))})),
   steps:current.steps.filter(step=>step.trim()),notes:$("recipe-notes").value.trim()
  };
 }
 function validate(data){
  if(!data.name)return "Indica o nome da receita.";
  if(!data.category_id)return "Seleciona uma categoria.";
  if(!Number.isInteger(data.servings)||data.servings<1||data.servings>100)return "Indica um número de doses entre 1 e 100.";
  if(data.status==="published"&&(!data.steps.length||!data.sections.some(s=>s.ingredients.some(i=>i.name.trim())))){
   return "Para aprovar a receita, preenche os ingredientes e a preparação.";
  }
  return "";
 }
 function imageBase64(file){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
   reader.onerror=()=>reject(Error("Não foi possível ler a fotografia."));
   reader.readAsDataURL(file);
  });
 }
 async function uploadPhoto(id,file){
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>3*1024*1024)
   throw Error("Seleciona uma fotografia JPG, PNG ou WebP até 3 MB.");
  const image=await imageBase64(file);
  await request("/api/v2/recipes/photo/"+encodeURIComponent(id),{method:"POST",body:JSON.stringify({image})});
 }
 async function saveRecipe(){
  if(!current||busy)return;
  const data=payload(),error=validate(data);
  if(error){editorMessage(error);return;}
  const file=$("recipe-photo-file").files?.[0];
  busy=true;$("recipe-save").disabled=true;editorMessage("A guardar receita…");
  try{
   const path=current.id?"/api/v2/recipes/"+encodeURIComponent(current.id):"/api/v2/recipes";
   const method=current.id?"PUT":"POST";
   const saved=await request(path,{method,body:JSON.stringify(data)});
   current=saved.recipe;openedId=current.id;
   if(file){
    try{await uploadPhoto(current.id,file);}
    catch(photoError){editorMessage("Receita guardada, mas a fotografia não foi carregada: "+photoError.message);await loadLibrary();return;}
   }
   await loadLibrary();
   const result=await request("/api/v2/recipes/"+encodeURIComponent(current.id));
   current=result.recipe;
   editorMessage("Receita guardada com sucesso.");
   $("recipe-photo-file").value="";
   const photo=$("recipe-photo-preview");photo.hidden=!current.photo_key;
   if(current.photo_key)photo.src="/api/v2/recipes/image/"+encodeURIComponent(current.id)+"?v="+Date.now();
  }catch(error){
   editorMessage(error.message==="cyclic_recipe_reference"?
    "Esta associação criaria uma referência circular entre receitas.":
    error.message==="invalid_recipe_reference"?
    "A receita associada não existe ou deixou de estar disponível.":
    "Não foi possível guardar: "+error.message);
  }
  finally{busy=false;$("recipe-save").disabled=false;}
 }
 async function deleteRecipe(recipe){
  if(busy)return;
  if(!window.confirm("Eliminar definitivamente a receita «"+recipe.name+"» e a respetiva fotografia? Esta ação não pode ser desfeita."))return;
  busy=true;alertMessage("A eliminar receita…");
  try{
   await request("/api/v2/recipes/"+encodeURIComponent(recipe.id),{method:"DELETE"});
   if(openedId===recipe.id)closeEditor();
   await loadLibrary();
   alertMessage("Receita eliminada.");
  }catch(error){
   alertMessage(error.message==="recipe_in_use"?
    "Esta receita está associada a outra receita. Remove primeiro essa associação.":
    "Não foi possível eliminar a receita: "+error.message);
  }
  finally{busy=false;}
 }
 async function loadLibrary(){
  const [cat,data]=await Promise.all([request("/api/v2/recipes/categories"),request("/api/v2/recipes")]);
  categories=cat.categories||[];recipes=data.recipes||[];
  paintCategoryOptions();paintList();loaded=true;
 }
 async function addCategory(){
  const input=$("recipe-new-category"),name=input.value.trim(),output=$("recipe-category-feedback");
  if(!name){output.textContent="Indica o nome da categoria.";return;}
  const action=$("recipe-create-category");action.disabled=true;output.textContent="A guardar categoria…";
  try{
   const result=await request("/api/v2/recipes/categories",{method:"POST",body:JSON.stringify({name})});
   const desired=result.category.id;input.value="";
   const oldSelected=current?.category_id||"";
   await loadLibrary();
   if(current){current.category_id=oldSelected||desired;$("recipe-category").value=current.category_id;}
   output.textContent="Categoria disponível na biblioteca.";
  }catch(error){output.textContent="Erro: "+error.message;}
  finally{action.disabled=false;}
 }

 // PDF previews are deliberately ephemeral: never write anything until the
 // administrator reviews individual drafts and confirms import.
 let pdfPreview=null, pdfBusy=false;
 function togglePdfPanel(open){
  $("recipe-pdf-panel").hidden=!open;
  $("recipe-pdf-toggle").setAttribute("aria-expanded",String(open));
  if(open){
   updateSelect("recipe-pdf-category",categories,"Selecionar categoria");
   $("recipe-pdf-category").value=$("recipe-filter-category").value||"";
  }
 }
 function resetPdfPreview(){
  pdfPreview=null;
  $("recipe-pdf-results").replaceChildren();
  $("recipe-pdf-actions").hidden=true;
  $("recipe-pdf-feedback").textContent="";
 }
 function pdfField(label,value,change,maxLength=180){
  const wrap=node("label","recipe-pdf-field");
  wrap.append(node("span","",label));
  const input=node("input");input.value=value||"";input.maxLength=maxLength;
  input.addEventListener("input",()=>change(input.value));
  wrap.append(input);return wrap;
 }
 function preparePdfReview(recipe){
  // Provide the same editable fields even when the PDF has missing data.
  if(!Array.isArray(recipe.sections))recipe.sections=[];
  if(!recipe.sections.length)recipe.sections.push({title:"",ingredients:[{quantity:"",unit:"",name:""}]});
  for(const section of recipe.sections){
   section.title=String(section.title||"");
   if(!Array.isArray(section.ingredients))section.ingredients=[];
   if(!section.ingredients.length)section.ingredients.push({quantity:"",unit:"",name:""});
   for(const ingredient of section.ingredients){
    for(const key of ["quantity","unit","name"])ingredient[key]=String(ingredient[key]||"");
   }
  }
  if(!Array.isArray(recipe.steps))recipe.steps=[];
  if(!recipe.steps.length)recipe.steps.push("");
  if(!Number.isInteger(recipe.servings)||recipe.servings<1||recipe.servings>100)recipe.servings=1;
  recipe.notes=typeof recipe.notes==="string"?recipe.notes:"";
  recipe.reviewTips=recipe.notes.split(/\r?\n/).map(tip=>tip.trim()).filter(Boolean);
 }
 function syncPdfTips(recipe){
  recipe.notes=recipe.reviewTips.map(tip=>tip.trim()).filter(Boolean).join("\n");
 }
 function pdfReviewLimit(message){
  $("recipe-pdf-feedback").textContent=message;
 }
 function paintPdfDetail(recipe,detail){
  const opened=detail.open;
  detail.replaceChildren(node("summary","","Rever ingredientes, preparação e dicas"));
  detail.open=opened;

  const ingredientsHeader=node("div","recipe-pdf-section-header");
  ingredientsHeader.append(node("h4","","Ingredientes"),button("+ Adicionar bloco",()=>{
   if(recipe.sections.length>=20){pdfReviewLimit("Cada receita permite até 20 blocos de ingredientes.");return;}
   recipe.sections.push({title:"",ingredients:[{quantity:"",unit:"",name:""}]});
   paintPdfDetail(recipe,detail);
  },"recipe-pdf-add"));
  detail.append(ingredientsHeader);
  recipe.sections.forEach((section,si)=>{
   const block=node("div","recipe-pdf-block");
   const head=node("div","recipe-pdf-block-head");
   head.append(pdfField("Bloco "+(si+1)+" · Título (opcional)",section.title,value=>{section.title=value;},100));
   head.append(button("Remover bloco",()=>{
    recipe.sections.splice(si,1);paintPdfDetail(recipe,detail);
   },"recipe-pdf-remove"));
   block.append(head);
   section.ingredients.forEach((ingredient,ii)=>{
    const row=node("div","recipe-pdf-ingredient");
    for(const [key,label,maxLength] of [["quantity","Quantidade",45],["unit","Unidade",45],["name","Alimento",180]]){
     row.append(pdfField(label,ingredient[key],value=>{ingredient[key]=value;},maxLength));
    }
    const remove=button("Remover",()=>{
     section.ingredients.splice(ii,1);paintPdfDetail(recipe,detail);
    },"recipe-pdf-remove");
    remove.setAttribute("aria-label","Remover alimento "+(ii+1)+" do bloco "+(si+1));
    const link=inlineRecipeLink(ingredient,{pdfRecipe:recipe});
    const actions=node("div","recipe-ingredient-actions");
    actions.append(link.button,remove);
    row.append(actions);block.append(row,link.panel);
   });
   block.append(button("+ Adicionar alimento",()=>{
    if(section.ingredients.length>=45){pdfReviewLimit("Cada bloco permite até 45 alimentos.");return;}
    section.ingredients.push({quantity:"",unit:"",name:""});
    paintPdfDetail(recipe,detail);
   },"recipe-pdf-add"));
   detail.append(block);
  });

  const stepsHeader=node("div","recipe-pdf-section-header");
  stepsHeader.append(node("h4","","Preparação"),button("+ Adicionar passo",()=>{
   if(recipe.steps.length>=60){pdfReviewLimit("Cada receita permite até 60 passos.");return;}
   recipe.steps.push("");paintPdfDetail(recipe,detail);
  },"recipe-pdf-add"));
  detail.append(stepsHeader);
  recipe.steps.forEach((step,si)=>{
   const row=node("div","recipe-pdf-text-row");
   const label=node("label","recipe-pdf-field");label.append(node("span","","Passo "+(si+1)));
   const field=node("textarea");field.value=step;field.rows=3;field.maxLength=2000;
   field.addEventListener("input",()=>{recipe.steps[si]=field.value;});
   label.append(field);row.append(label);
   row.append(button("Remover",()=>{
    recipe.steps.splice(si,1);paintPdfDetail(recipe,detail);
   },"recipe-pdf-remove"));
   detail.append(row);
  });

  const tipsHeader=node("div","recipe-pdf-section-header");
  tipsHeader.append(node("h4","","Dicas e observações"),button("+ Adicionar dica",()=>{
   recipe.reviewTips.push("");syncPdfTips(recipe);paintPdfDetail(recipe,detail);
  },"recipe-pdf-add"));
  detail.append(tipsHeader);
  recipe.reviewTips.forEach((tip,ti)=>{
   const row=node("div","recipe-pdf-text-row");
   const label=node("label","recipe-pdf-field");label.append(node("span","","Dica "+(ti+1)));
   const field=node("textarea");field.value=tip;field.rows=3;field.maxLength=6000;
   field.addEventListener("input",()=>{recipe.reviewTips[ti]=field.value;syncPdfTips(recipe);});
   label.append(field);row.append(label);
   row.append(button("Remover",()=>{
    recipe.reviewTips.splice(ti,1);syncPdfTips(recipe);paintPdfDetail(recipe,detail);
   },"recipe-pdf-remove"));
   detail.append(row);
  });
 }
 async function pdfPhotoWebp(file){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>3*1024*1024||!file.size)
   throw Error("Seleciona uma fotografia JPG, PNG ou WebP até 3 MB.");
  const url=URL.createObjectURL(file);
  try{
   const image=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(Error("Não foi possível ler a fotografia."));
    img.src=url;
   });
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>32000000)
    throw Error("As dimensões da fotografia não são suportadas.");
   for(const size of [850,700,550,450]){
    const scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext("2d");
    if(!context)throw Error("Não foi possível otimizar a fotografia.");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [0.78,0.65,0.52,0.4]){
     const data=canvas.toDataURL("image/webp",quality);
     if(!data.startsWith("data:image/webp;base64,"))
      throw Error("O navegador não suporta a otimização de fotografias.");
     const encoded=data.slice("data:image/webp;base64,".length);
     if(encoded.length<=240000)return encoded;
    }
   }
   throw Error("A fotografia é demasiado grande para a importação.");
  }finally{URL.revokeObjectURL(url);}
 }
 function paintPdfPreview(){
  const host=$("recipe-pdf-results");host.replaceChildren();
  $("recipe-pdf-actions").hidden=!pdfPreview?.recipes?.length;
  if(!pdfPreview)return;
  const info=node("p","recipe-pdf-result-summary",pdfPreview.recipes.length+
   " receitas identificadas em "+pdfPreview.total_pages+" páginas.");
  host.append(info);
  if(pdfPreview.skipped_pages?.length){
   const skipped=node("p","recipe-pdf-skipped","Páginas ignoradas: "+
    pdfPreview.skipped_pages.map(x=>x.page+" ("+x.reason+")").join("; "));
   host.append(skipped);
  }
  pdfPreview.recipes.forEach((recipe,ri)=>{
   const duplicate=recipes.some(existing=>norm(existing.name)===norm(recipe.name)&&existing.category_id===$("recipe-pdf-category").value);
   const card=node("div","recipe-pdf-result"),header=node("div","recipe-pdf-result-head");
   const checkbox=node("input");checkbox.type="checkbox";checkbox.checked=!!recipe.selected&&!duplicate;
   checkbox.disabled=duplicate;recipe.selected=checkbox.checked;
   checkbox.setAttribute("aria-label","Importar "+recipe.name);
   checkbox.addEventListener("change",()=>{recipe.selected=checkbox.checked;paintPdfPreview();});
   const heading=node("strong","",recipe.name);
   header.append(checkbox,heading,node("span","recipe-pdf-page","Página "+recipe.page));
   card.append(header);
   if(duplicate)card.append(node("p","recipe-pdf-warning","Já existe uma receita com este nome na categoria; não será duplicada."));
   const warnings=recipe.warnings||[];
   for(const warn of warnings)card.append(node("p","recipe-pdf-warning",warn));
   // Same header hierarchy as the manual "Adicionar nova receita" editor.
   const fields=node("div","recipe-editor-grid recipe-pdf-edit-fields");
   const nameField=pdfField("Nome da receita",recipe.name,v=>{recipe.name=v;heading.textContent=v||"Receita sem nome";});
   nameField.classList.add("recipe-wide");fields.append(nameField);
   const categoryLabel=node("label","recipe-pdf-field");
   categoryLabel.append(node("span","","Categoria"));
   const categorySelect=node("select");
   const chosenCategory=categories.find(c=>c.id===$("recipe-pdf-category").value);
   const categoryOption=node("option","",chosenCategory?.name||"Selecionar categoria");
   categoryOption.value=chosenCategory?.id||"";
   categorySelect.append(categoryOption);
   categorySelect.disabled=true;
   categorySelect.title="Altera a categoria de destino no início da importação.";
   categoryLabel.append(categorySelect);fields.append(categoryLabel);
   const typeLabel=node("label","recipe-pdf-field");
   typeLabel.append(node("span","","Tipo"));
   const type=node("select");
   for(const [value,label] of [["standard","Receita padrão"],["adaptable","Adaptável ao plano"]]){
    const opt=node("option","",label);opt.value=value;type.append(opt);
   }
   type.value=recipe.recipe_type||"standard";
   type.addEventListener("change",()=>{recipe.recipe_type=type.value;});
   typeLabel.append(type);fields.append(typeLabel);
   const servingsLabel=node("label","recipe-pdf-field");
   servingsLabel.append(node("span","","Doses"));
   const servings=node("input");servings.type="number";servings.min="1";servings.max="100";servings.step="1";
   servings.value=String(recipe.servings);
   servings.addEventListener("input",()=>{recipe.servings=Number(servings.value);});
   servingsLabel.append(servings);fields.append(servingsLabel);
   const stateLabel=node("label","recipe-pdf-field");
   stateLabel.append(node("span","","Estado"));
   const state=node("select"),draft=node("option","","Rascunho");
   draft.value="draft";state.append(draft);state.disabled=true;
   state.title="As receitas importadas são sempre guardadas como rascunho.";
   stateLabel.append(state);fields.append(stateLabel);
   card.append(fields);
   const photoBox=node("div","recipe-edit-photo recipe-pdf-photo");
   if(recipe.photo_webp){
    const photo=node("img","recipe-pdf-thumb");
    photo.alt="Fotografia da receita";
    photo.src="data:image/webp;base64,"+recipe.photo_webp;
    photoBox.append(photo);
   }else{
    photoBox.append(node("div","recipe-pdf-thumb recipe-pdf-thumb-empty","Sem fotografia"));
   }
   const photoLabel=node("label","recipe-pdf-field");
   photoLabel.append(node("span","","Fotografia da receita (vista de cima)"));
   const photoFile=node("input");photoFile.type="file";photoFile.accept="image/jpeg,image/png,image/webp";
   photoFile.setAttribute("aria-label","Fotografia da receita "+recipe.name);
   photoFile.addEventListener("change",async()=>{
    const file=photoFile.files?.[0];
    if(!file)return;
    if(pdfBusy){photoFile.value="";pdfReviewLimit("Conclui primeiro a operação em curso.");return;}
    pdfBusy=true;photoFile.disabled=true;$("recipe-pdf-save").disabled=true;
    try{
     const converted=await pdfPhotoWebp(file);
     recipe.photo_webp=converted;
     paintPdfPreview();
     pdfReviewLimit("Fotografia atualizada na pré-visualização.");
    }catch(error){
     photoFile.value="";
     pdfReviewLimit("Não foi possível carregar a fotografia: "+error.message);
    }finally{
     pdfBusy=false;$("recipe-pdf-save").disabled=false;
    }
   });
   photoLabel.append(photoFile);photoBox.append(photoLabel);
   if(recipe.photo_webp){
    photoBox.append(button("Remover fotografia",()=>{
     recipe.photo_webp=null;paintPdfPreview();
    },"recipe-pdf-remove"));
   }
   card.append(photoBox);
   const detail=node("details","recipe-pdf-details");detail.open=true;
   paintPdfDetail(recipe,detail);
   card.append(detail);host.append(card);
  });
 }
 async function analyzePdf(){
  if(pdfBusy)return;
  const file=$("recipe-pdf-file").files?.[0],category=$("recipe-pdf-category").value;
  const feedback=$("recipe-pdf-feedback");
  if(!category){feedback.textContent="Seleciona primeiro a categoria de destino.";return;}
  if(!file){feedback.textContent="Seleciona um PDF.";return;}
  if(file.size>20*1024*1024||file.size<5){feedback.textContent="O PDF deve ter menos de 20 MB. Divide os documentos maiores.";return;}
  if(!file.name.toLowerCase().endsWith(".pdf")){feedback.textContent="Seleciona um ficheiro PDF.";return;}
  pdfBusy=true;$("recipe-pdf-analyze").disabled=true;
  resetPdfPreview();feedback.textContent="A analisar o documento…";
  try{
   const res=await fetch("/api/v2/recipes/pdf/preview",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/pdf","X-CSRF-Token":csrf,
             "X-Recipe-Filename":encodeURIComponent(file.name).slice(0,160)},
    body:file
   });
   const result=await res.json();
   if(!res.ok)throw Error(result.error||"Não foi possível analisar o documento.");
   pdfPreview=result;
   pdfPreview.filename=file.name.slice(0,180);
   for(const recipe of pdfPreview.recipes){
    recipe.selected=true;recipe.recipe_type="standard";
    preparePdfReview(recipe);
   }
   paintPdfPreview();
   feedback.textContent=pdfPreview.recipes.length?
    "Revê cada receita, confirma os ingredientes e seleciona as que pretendes importar.":
    "Não foram encontradas receitas. O PDF pode precisar de revisão manual.";
  }catch(error){feedback.textContent="Erro: "+error.message;}
  finally{pdfBusy=false;$("recipe-pdf-analyze").disabled=false;}
 }
 async function savePdfDrafts(){
  if(!pdfPreview||pdfBusy)return;
  const category_id=$("recipe-pdf-category").value;
  if(!category_id){$("recipe-pdf-feedback").textContent="Seleciona a categoria.";return;}
  const selected=pdfPreview.recipes.filter(x=>x.selected);
  if(!selected.length){$("recipe-pdf-feedback").textContent="Seleciona pelo menos uma receita.";return;}
  if(selected.length>12){$("recipe-pdf-feedback").textContent="Importa no máximo 12 receitas de cada vez.";return;}
  if(selected.some(x=>!x.name.trim())){$("recipe-pdf-feedback").textContent="Confirma os nomes das receitas.";return;}
  if(selected.some(x=>!Number.isInteger(x.servings)||x.servings<1||x.servings>100)){
   $("recipe-pdf-feedback").textContent="Indica um número de doses entre 1 e 100 em cada receita.";return;
  }
  if(selected.some(x=>(x.reviewTips||[]).map(tip=>tip.trim()).filter(Boolean).join("\n").length>6000)){
   $("recipe-pdf-feedback").textContent="As dicas de uma receita ultrapassam 6000 caracteres.";return;
  }
  for(const recipe of selected)syncPdfTips(recipe);
  pdfBusy=true;$("recipe-pdf-save").disabled=true;
  $("recipe-pdf-feedback").textContent="A guardar rascunhos…";
  try{
   const result=await request("/api/v2/recipes/pdf/import",{method:"POST",
    body:JSON.stringify({category_id,filename:pdfPreview.filename,
     recipes:selected.map(x=>({page:x.page,name:x.name,recipe_type:x.recipe_type,
       servings:x.servings,sections:x.sections,steps:x.steps,
       notes:x.notes||"",photo_webp:x.photo_webp}))})});
   await loadLibrary();
   resetPdfPreview();
   $("recipe-pdf-file").value="";
   $("recipe-pdf-feedback").textContent=result.created.length+
    " receitas guardadas como rascunho."+
    (result.skipped.length?" "+result.skipped.length+" duplicadas ignoradas.":"");
  }catch(error){
   $("recipe-pdf-feedback").textContent=error.message==="invalid_recipe_reference"?
    "Verifica as receitas associadas: todas as referências do mesmo PDF têm de estar selecionadas para importar.":
    error.message==="cyclic_recipe_reference"?
    "Existem referências circulares entre receitas. Corrige as associações antes de guardar.":
    "Não foi possível guardar: "+error.message;
  }
  finally{pdfBusy=false;$("recipe-pdf-save").disabled=false;}
 }
 $("recipe-pdf-toggle").addEventListener("click",()=>togglePdfPanel($("recipe-pdf-panel").hidden));
 $("recipe-pdf-close").addEventListener("click",()=>togglePdfPanel(false));
 $("recipe-pdf-analyze").addEventListener("click",analyzePdf);
 $("recipe-pdf-cancel").addEventListener("click",resetPdfPreview);
 $("recipe-pdf-save").addEventListener("click",savePdfDrafts);
 $("recipe-pdf-category").addEventListener("change",()=>{if(pdfPreview)paintPdfPreview();});
 $("recipe-search").addEventListener("input",paintList);
 $("recipe-filter-category").addEventListener("change",paintList);
 $("recipe-filter-type").addEventListener("change",paintList);
 $("recipe-add").addEventListener("click",()=>openRecipe(null));
 function setRecipeCategoriesOpen(open){
  $("recipe-category-manage").hidden=!open;
  $("recipe-category-toggle").setAttribute("aria-expanded",String(open));
  if(open)$("recipe-new-category").focus();
 }
 $("recipe-category-toggle").addEventListener("click",()=>setRecipeCategoriesOpen($("recipe-category-manage").hidden));
 $("recipe-category-close").addEventListener("click",()=>setRecipeCategoriesOpen(false));
 $("recipe-close").addEventListener("click",closeEditor);
 $("recipe-cancel").addEventListener("click",closeEditor);
 $("recipe-save").addEventListener("click",saveRecipe);
 $("recipe-create-category").addEventListener("click",addCategory);
 $("recipe-add-section").addEventListener("click",()=>{if(!current)return;current.sections.push({title:"",ingredients:[{name:"",quantity:"",unit:""}]});paintSections();});
 $("recipe-add-step").addEventListener("click",()=>{if(!current)return;current.steps.push("");paintSteps();});
 window.tmLoadRecipeLibrary=async()=>{
  if(!loaded)alertMessage("A carregar biblioteca…");
  try{await loadLibrary();alertMessage("");}
  catch(error){alertMessage("Não foi possível carregar as receitas: "+error.message);}
 };
})();
