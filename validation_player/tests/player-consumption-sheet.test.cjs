// Editar consumo (25/11): the editor opens in a sheet from the bottom; Cancelar · refeição · Guardar on top.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('static/jogador-v2.js','utf8');
const css=fs.readFileSync('static/jogador-v2.css','utf8');
test('the editor, colour and option pickers mount in the sheet (a new intra-match moment stays inline)',()=>{
 assert.match(js,/const sheetBody=extraTiming\?null:consumptionSheetMount\(host\);/);
 assert.match(js,/panel\.append\(message\);\(sheetBody\|\|host\)\.append\(panel\);/);
 assert.equal((js.match(/consumptionSheetMount\(host\)\.append\(panel\);/g)||[]).length,2);
});
test('header Guardar uses the editor save; the editor Cancelar/Guardar row is hidden in the sheet',()=>{
 assert.match(js,/save\.onclick=\(\)=>\{const panelSave=body\.querySelector\('\.consumption-editor \.consumption-save'\);if\(panelSave&&!panelSave\.disabled\)panelSave\.click\(\);\};/);
 assert.match(css,/\.consumption-sheet-body \.consumption-actions>\.consumption-save,\n\.consumption-sheet-body \.consumption-actions>\.consumption-cancel-main\{display:none!important\}/);
 assert.match(js,/className='consumption-cancel consumption-cancel-main'/);
});
test('closing asks before discarding changes; saving closes with a confirmation',()=>{
 assert.match(js,/if\(!st\.dirty\)\{closeConsumptionSheet\(\);return;\}/);
 for(const t of ['Guardar alterações','Descartar alterações','Continuar a editar'])assert.ok(js.includes("playerText('"+t+"'"),t);
 assert.match(js,/cancel\.onclick=requestCloseConsumptionSheet;backdrop\.onclick=requestCloseConsumptionSheet;/);
 assert.match(js,/if\(sheetBody&&consumptionSheet\)consumptionSheet\.saved=true;panel\.remove\(\);/);
 assert.match(js,/if\(st\.saved\)consumptionSheetToast\(playerText\('Consumo guardado','Consumption saved'\)\);/);
});
test('the sheet is not trapped by the day swipe containing block and other gestures ignore it',()=>{
 assert.match(css,/#overview #day-details:has\(> \.consumption-sheet\)\{will-change:auto!important;transform:none!important\}/);
 assert.match(js,/\.consumption-editor,\.consumption-sheet'\)\)return;/);
 assert.match(js,/document\.body\.classList\.contains\("consumption-sheet-open"\)\)return;/);
});
test('the grams wheel also ticks with a haptic',()=>{
 assert.match(js,/if\(previous!==null&&previous!==selected\)playerHaptic\(\);/);
});
