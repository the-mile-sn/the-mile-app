'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'static/sw.js'),'utf8');
function setup(){
 const handlers={},notifications=[],windows=[];
 const self={location:{origin:'https://example.invalid'},addEventListener:(name,fn)=>{handlers[name]=fn;},registration:{showNotification:async(title,options)=>{notifications.push({title,options});}},clients:{matchAll:async()=>[],openWindow:async url=>{windows.push(url);}}};
 vm.runInNewContext(src,{self,URL});
 function push(payload){handlers.push({data:{json:()=>payload},waitUntil:()=>{}});}
 return {handlers,notifications,windows,push};
}
test('v2 hides title and body and uses locale',()=>{
 const t=setup();const id='a'.repeat(32);
 t.push({version:2,id,language:'en-GB',title:'Private',body:'Sensitive'});
 assert.equal(t.notifications.length,1);assert.equal(t.notifications[0].title,'The Mile');
 assert.equal(t.notifications[0].options.body,'You have a new notification.');
 assert.equal(t.notifications[0].options.data.notificationId,id);
});
test('malformed v2 never falls back to legacy',()=>{
 const t=setup();for(const id of [null,'bad',42,['a'.repeat(32)]])t.push({version:2,id,title:'Private',body:'Sensitive'});
 t.push(null);assert.equal(t.notifications.length,0);
});
test('legacy handling remains unchanged',()=>{
 const t=setup();t.push({title:'Legacy',body:'Legacy message'});
 assert.equal(t.notifications[0].title,'Legacy');assert.equal(t.notifications[0].options.body,'Legacy message');
});
test('v2 click accepts only own-origin identifier link',async()=>{
 const t=setup(),id='b'.repeat(32);let pending;
 t.handlers.notificationclick({notification:{close(){},data:{notificationId:id,url:'https://other.invalid/'}},waitUntil(p){pending=p;}});
 await pending;assert.deepEqual(t.windows,['https://example.invalid/?notification='+id]);
});
