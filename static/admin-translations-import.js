"use strict";
/* API-free import/export of admin translation proposals.
   Relies only on the existing authenticated admin catalog and import routes. */
(()=>{
 const $=id=>document.getElementById(id);
 const columns=["entity_kind","entity_id","field_path","source_text","translated_text"];
 const limit=100, maxRows=2500, maxBytes=1024*1024;
 let checked=[], busy=false, csrf="",lastFile=null;
 const explain={
   invalid_row:"linha inválida",invalid_library:"biblioteca desconhecida",
   duplicate_row:"campo repetido",source_changed:"o português foi alterado",
   existing_english:"já existe inglês no prato",already_reviewed:"já existe uma proposta ou aprovação",
   invalid_field:"campo não traduzível",missing_field:"conteúdo indisponível"
 };
 const feedback=(message,error=false)=>{
   $("i18n-import-feedback").textContent=message||"";
   $("i18n-import-feedback").dataset.error=error?"1":"0";
 };
 const clear=()=>{
   checked=[];$("i18n-import-commit").disabled=true;
   $("i18n-import-preview").replaceChildren();
 };
 const req=async(path,body)=>{
   if(!csrf){
     const session=await fetch("/api/me",{credentials:"same-origin",headers:{"Accept":"application/json"}});
     if(!session.ok)throw Error("sessão de administrador indisponível");
     const data=await session.json();
     if(data?.user?.role!=="admin"||!data.csrf)throw Error("acesso reservado aos administradores");
     csrf=data.csrf;
   }
   const response=await fetch(path,{method:"POST",credentials:"same-origin",
     headers:{"Accept":"application/json","Content-Type":"application/json",
              "X-CSRF-Token":csrf},body:JSON.stringify(body)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"HTTP "+response.status);
   return data;
 };
 const get=async(url)=>{
   const response=await fetch(url,{credentials:"same-origin",headers:{"Accept":"application/json"}});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"HTTP "+response.status);
   return data;
 };
 function parseCsv(text){
   const input=text.replace(/^\uFEFF/,"");
   const header=input.split(/\r?\n/,1)[0];
   const delimiter=header.includes(";")?";":",";
   const rows=[];let row=[],value="",quoted=false,atStart=true;
   const cell=()=>{row.push(value);value="";atStart=true;};
   const end=()=>{cell();if(row.some(x=>x!==""))rows.push(row);row=[];};
   for(let i=0;i<input.length;i++){
     const ch=input[i];
     if(quoted){
       if(ch==='"'&&input[i+1]==='"'){value+='"';i++;}
       else if(ch==='"'){quoted=false;}
       else value+=ch;
     }else if(ch==='"'&&atStart){quoted=true;atStart=false;}
     else if(ch===delimiter){cell();}
     else if(ch==="\n"){end();}
     else if(ch==="\r"&&input[i+1]==="\n"){/* skip CR */}
     else if(ch==='"'){throw Error("Aspas CSV inválidas.");}
     else {value+=ch;atStart=false;}
   }
   if(quoted)throw Error("CSV com aspas por fechar.");
   if(value!==""||row.length)end();
   if(!rows.length||rows[0].join("|")!==columns.join("|"))
     throw Error("Cabeçalho incorreto. Descarrega o modelo CSV desta biblioteca.");
   const data=rows.slice(1);
   if(data.length>maxRows)throw Error("O ficheiro excede 2500 linhas. Divide-o em ficheiros menores.");
   if(data.some(r=>r.length!==columns.length))throw Error("Existem linhas com um número incorreto de colunas.");
   return data.map((r,i)=>({
     ...Object.fromEntries(columns.map((c,j)=>[c,r[j]])),line:i+2
   }));
 }
 const csvCell=(value)=>{
   let text=String(value??"");
   // Spreadsheet formula injection: neutralise formulas in canonical PT fields.
   if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;
   return '"'+text.replaceAll('"','""')+'"';
 };
 const createCSV=(rows)=>"\uFEFF"+[columns,...rows.map(r=>columns.map(c=>r[c]))]
   .map(r=>r.map(csvCell).join(";")).join("\r\n")+"\r\n";
 const exportTemplate=async()=>{
   if(busy)return;
   busy=true;$("i18n-export").disabled=true;
   try{
     const active=document.querySelector("#i18n-tabs button[aria-pressed='true']");
     const kind=new URLSearchParams(window.location.search).get("entity_kind");
     const tabLabels={Alimentos:"food",Pratos:"dish",Receitas:"recipe",
       Categorias:"recipe_category",Suplementação:"supplement"};
     const library=tabLabels[active?.textContent]||kind||"food";
     const items=[];
     for(let page=1;page<=200;page++){
       const params=new URLSearchParams({entity_kind:library,status:"missing",
         page:String(page),page_size:"50"});
       const result=await get("/api/v2/admin/i18n/catalog?"+params);
       for(const entry of result.items||[]){
         for(const field of entry.fields||[]){
           if(field.state!=="missing")continue;
           items.push({entity_kind:entry.entity_kind,entity_id:entry.entity_id,
             field_path:field.field_path,source_text:field.source_text,translated_text:""});
         }
       }
       if(!result.items?.length||page*50>=result.total)break;
     }
     if(!items.length){feedback("Esta biblioteca não tem campos por traduzir.");return;}
     const blob=new Blob([createCSV(items)],{type:"text/csv;charset=utf-8"});
     const url=URL.createObjectURL(blob);
     const link=document.createElement("a");
     link.href=url;link.download="the-mile-traducoes-"+library+".csv";
     document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
     feedback("Modelo descarregado: "+items.length+" textos por traduzir. Preenche apenas a coluna translated_text.");
   }catch(e){feedback("Não foi possível descarregar: "+e.message,true);}
   finally{busy=false;$("i18n-export").disabled=false;}
 };
 const readFile=async()=>{
   clear();
   const file=$("i18n-import-file").files[0];
   $("i18n-import-filename").textContent=file?.name||"Nenhum ficheiro selecionado";
   if(!file){feedback("");return;}
   if(file.size>maxBytes){feedback("O CSV não pode ultrapassar 1 MB.",true);return;}
   try{
     const parsed=parseCsv(await file.text());
     checked=parsed.filter(r=>r.translated_text.trim()).map(r=>{
       const {line,...fields}=r;
       // Restore spreadsheet-safe PT source string if the exported template
       // prefixed an apostrophe; server still verifies original text exactly.
       if(/^'[\s\u0000-\u001f]*[=+\-@]/.test(fields.source_text))
         fields.source_text=fields.source_text.slice(1);
       return {...fields,line};
     });
     if(!checked.length){feedback("Preenche a coluna translated_text no CSV e volta a selecioná-lo.");return;}
     const ignored=parsed.length-checked.length;
     const div=document.createElement("p");
     div.textContent=checked.length+" propostas preenchidas · "+ignored+" linhas sem tradução ignoradas.";
     $("i18n-import-preview").append(div);
     feedback("Ficheiro lido. Clica em «Verificar importação» antes de guardar.");
   }catch(e){clear();feedback("CSV inválido: "+e.message,true);}
 };
 const check=async()=>{
   if(busy||!checked.length)return;
   busy=true;$("i18n-import-check").disabled=true;
   $("i18n-import-commit").disabled=true;
   const errors=[];let eligible=0;
   try{
     for(let i=0;i<checked.length;i+=limit){
       const batch=checked.slice(i,i+limit);
       const rows=batch.map(({line,...fields})=>fields);
       const result=await req("/api/v2/admin/i18n/import/preview",{rows});
       eligible+=result.eligible||0;
       for(const issue of result.errors||[]){
         errors.push({line:batch[issue.row-1]?.line||"?",code:issue.code});
       }
     }
     const panel=$("i18n-import-preview");panel.replaceChildren();
     const summary=document.createElement("p");
     summary.textContent=eligible+" prontas para importar · "+errors.length+" com problemas.";
     panel.append(summary);
     if(errors.length){
       const details=document.createElement("p");
       details.textContent=errors.slice(0,10).map(e=>
         "Linha "+e.line+": "+(explain[e.code]||e.code)).join(" | ");
       panel.append(details);
       feedback("Corrige os problemas no CSV e volta a verificar. Não foi guardado nada.",true);
       return;
     }
     $("i18n-import-commit").disabled=false;
     feedback("Verificação concluída. Confirma «Importar propostas» para guardar como pendentes.");
   }catch(e){feedback("Não foi possível verificar: "+e.message,true);}
   finally{busy=false;$("i18n-import-check").disabled=false;}
 };
 const commit=async()=>{
   if(busy||!checked.length||$("i18n-import-commit").disabled)return;
   busy=true;$("i18n-import-commit").disabled=true;
   $("i18n-import-check").disabled=true;
   let completed=0;
   try{
     for(let i=0;i<checked.length;i+=limit){
       const rows=checked.slice(i,i+limit).map(({line,...fields})=>fields);
       const result=await req("/api/v2/admin/i18n/import/submit",{rows});
       completed+=result.imported||0;
     }
     feedback(completed+" propostas importadas e pendentes de aprovação. Nenhuma foi aprovada automaticamente.");
     clear();$("i18n-import-file").value="";
     $("i18n-import-filename").textContent="Nenhum ficheiro selecionado";
     window.dispatchEvent(new Event("mile:translations-imported"));
   }catch(e){
     feedback("Importação interrompida após "+completed+" propostas. Erro: "+e.message+
       ". Descarrega um modelo atualizado e volta a verificar os restantes.",true);
     clear();
     window.dispatchEvent(new Event("mile:translations-imported"));
   }finally{busy=false;$("i18n-import-check").disabled=false;}
 };
 const init=()=>{
   $("i18n-export").addEventListener("click",exportTemplate);
   $("i18n-import-file").addEventListener("change",readFile);
   $("i18n-import-check").addEventListener("click",check);
   $("i18n-import-commit").addEventListener("click",commit);
 };
 init();
})();