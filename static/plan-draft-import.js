"use strict";
(async function(){
 const root=document.createElement("section");root.style.cssText="margin:20px;padding:18px;border:1px solid #8886;border-radius:12px";
 root.innerHTML='<h3>Importar planos (rascunhos)</h3><p>Importação JSON de planos preparados. Não publica nem substitui planos.</p><label>Jogador <select id="tm-import-player"><option value="">Selecionar</option></select></label> <input id="tm-import-json" type="file" accept=".json,application/json"> <button id="tm-import-preview">Validar ficheiro</button><div id="tm-import-result" role="status"></div><button id="tm-import-confirm" disabled>Guardar rascunhos</button>';
 const entry=document.getElementById("plan-entry");if(!entry)return;entry.append(root);
 const $=id=>document.getElementById(id),request=async(url,options)=>{const r=await fetch(url,{credentials:"same-origin",...options});if(!r.ok)throw Error("HTTP "+r.status);return r.json()};
 let prepared=null,players=[];
 try{const data=await request("/api/players");players=data.players||[];for(const p of players){const el=document.createElement("option");el.value=p.id;el.textContent=p.name;$("tm-import-player").append(el)}}catch(e){$("tm-import-result").textContent="Não foi possível carregar jogadores."}
 $("tm-import-preview").onclick=async()=>{prepared=null;$("tm-import-confirm").disabled=true;try{
  const file=$("tm-import-json").files[0];if(!file)throw Error("Seleciona um ficheiro JSON.");
  const data=JSON.parse(await file.text());const list=Array.isArray(data)?data:Array.isArray(data.plans)?data.plans:Object.values(data.plans||{});
  if(!list.length||list.length>20)throw Error("Ficheiro sem planos válidos.");
  const library=(await request("/api/v2/food-library")).foods||[],ids=new Set(library.map(f=>f.id));
  for(const p of list){if(!p.plan_type||!Array.isArray(p.meals)||!p.meals.length)throw Error("Plano sem tipo ou refeições.");
   for(const m of p.meals)for(const o of m.options||[])for(const f of o.foods||[]){if(f.kind!=="supplement"&&!ids.has(f.id))throw Error("Alimento não encontrado: "+f.id)}
  }
  prepared=list;$("tm-import-result").textContent=list.length+" planos validados. Seleciona o jogador e confirma.";$("tm-import-confirm").disabled=false;
 }catch(e){$("tm-import-result").textContent="Validação falhou: "+e.message}};
 $("tm-import-confirm").onclick=async()=>{const player=players.find(p=>String(p.id)===$("tm-import-player").value);if(!prepared||!player){$("tm-import-result").textContent="Seleciona o jogador.";return}
  $("tm-import-confirm").disabled=true;try{
   const existing=(await request("/api/v2/food-plan-drafts")).drafts||[];
   for(const p of prepared)if(existing.some(d=>String(d.player_id)===String(player.id)&&d.plan_type===p.plan_type))throw Error("Já existe rascunho "+p.plan_type+". Não foram feitas alterações.");
   if(!confirm("Criar "+prepared.length+" rascunhos para "+player.name+"?"))return;
   const csrf=(await request("/api/me")).csrf||"";let count=0;
   for(const p of prepared){const body={...p,id:"",player_id:player.id,player_name:player.name};const saved=await request("/api/v2/food-plan-drafts",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify(body)});const check=await request("/api/v2/food-plan-drafts/"+encodeURIComponent(saved.id));if(check.draft?.meals?.length!==p.meals.length)throw Error("Falha na confirmação de "+p.plan_type);count++;$("tm-import-result").textContent=count+" rascunhos confirmados."}
   $("tm-import-result").textContent="Concluído: "+count+" rascunhos não publicados. Atualiza a página para os consultar.";prepared=null;
  }catch(e){$("tm-import-result").textContent="Interrompido: "+e.message+" Confirma os rascunhos antes de repetir."}finally{$("tm-import-confirm").disabled=!prepared}
 };
})();