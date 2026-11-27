'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'static/notification-local-translation-v2.js'),'utf8');
function setup(Translator){
 const ctx={Translator,fetch:()=>{throw Error('network_forbidden');}};
 vm.runInNewContext(source,ctx);
 return ctx.tmNotificationTranslation;
}
const copy={title:' Titulo ',body:' Mensagem '};
test('local provider unavailable: no remote fallback',async()=>{
 const t=setup(undefined);
 assert.equal(t.supported(),false);
 await assert.rejects(t.translate(copy,'pt-PT','en-GB'),/translation_unavailable/);
});
test('title and body are translated independently and model is released',async()=>{
 const calls=[],progress=[];let destroyed=false;
 const t=setup({create:async options=>{
  assert.equal(options.sourceLanguage,'pt');assert.equal(options.targetLanguage,'en');
  options.monitor({addEventListener:(name,fn)=>{assert.equal(name,'downloadprogress');fn({loaded:.5});}});
  return {translate:async text=>{calls.push(text);return 'EN '+text;},destroy(){destroyed=true;}};
 }});
 const result=await t.translate(copy,'pt-PT','en-GB',p=>progress.push(p));
 assert.equal(result.title,'EN Titulo');assert.equal(result.body,'EN Mensagem');
 assert.deepEqual(calls,['Titulo','Mensagem']);assert.deepEqual(progress,[50]);assert.equal(destroyed,true);
});
test('invalid source is rejected before invoking translator',async()=>{
 const t=setup({create:async()=>{throw Error('unexpected_create');}});
 await assert.rejects(t.translate({title:'',body:'hello'},'pt-PT','en-GB'),/invalid_copy/);
 await assert.rejects(t.translate(copy,'pt-PT','pt-PT'),/translation_unavailable/);
});
test('failed or oversized translations are rejected and model is released',async()=>{
 let destroyed=0;
 const t=setup({create:async()=>({translate:async()=> 'x'.repeat(1001),destroy(){destroyed++;}})});
 await assert.rejects(t.translate(copy,'pt-PT','en-GB'),/invalid_copy/);
 assert.equal(destroyed,1);
 const f=setup({create:async()=>({translate:async()=>{throw Error('model_failure');},destroy(){destroyed++;}})});
 await assert.rejects(f.translate(copy,'pt-PT','en-GB'),/model_failure/);
 assert.equal(destroyed,2);
});
