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
    row.append(button("×",()=>{section.ingredients.splice(ii,1);paintSections();},"recipe-remove"));
    box.append(row);
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
   sections:current.sections.map(s=>({id:s.id,title:s.title,ingredients:s.ingredients.map(i=>({id:i.id,name:i.name,quantity:i.quantity,unit:i.unit}))})),
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
  }catch(error){editorMessage("Não foi possível guardar: "+error.message);}
  finally{busy=false;$("recipe-save").disabled=false;}
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
