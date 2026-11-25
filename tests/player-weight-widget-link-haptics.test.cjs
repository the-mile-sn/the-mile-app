// 25/11: the Peso card always opens the weight screen (only + opens the entry), the weight wheel ticks
// with a haptic, and a match day keeps the ball in the Semana widget even when selected.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('static/jogador-v2.js','utf8');
test('the Peso card opens the weight screen with or without a weight; the + is the only entry control',()=>{
 assert.match(js,/card\.addEventListener\("click",event=>\{if\(event\.target\.closest\("button"\)\)return;if\(!action\.disabled\)openWeightDetail\(date,\(\)=>toggleEditor\(true\)\);\}\);/);
 assert.match(js,/const openToday=\(\)=>openWeightDetail\(iso\(new Date\(\)\),null\);/);
 assert.match(js,/if\(existing&&panel\.hidden\)\{openWeightDetail\(date,\(\)=>toggleEditor\(true\)\);return;\}/);
});
test('the weight wheel plays a haptic tick on each new value',()=>{
 assert.match(js,/function playerHaptic\(\)\{/);
 assert.match(js,/input\.type="checkbox";input\.setAttribute\("switch",""\)/);
 assert.match(js,/if\(next!==index\)\{index=next;playerHaptic\(\);/);
});
test('a match day keeps the ball icon in the Semana widget, also when it is the selected day',()=>{
 assert.match(js,/if\(matchDates\.has\(key\)\)b\.append\(mealIcon\("football"\)\);/);
 assert.doesNotMatch(js,/if\(matchDates\.has\(key\)&&key!==date\)b\.append/);
});
