"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const js=fs.readFileSync("static/jogador-v2.js","utf8");
const html=fs.readFileSync("static/jogador-v2.html","utf8");

test("Recorded consumption controls retain Portuguese and display approved English labels",()=>{
  for(const [pt,en] of [
    [" Registado"," Recorded"],[" Editar"," Edit"],[" Anular"," Undo"],
    ["Registado: ","Recorded: "],["Consumido: ","Consumed: "],
    ["A guardar…","Saving…"],["Adicionar","Add"],["Momento do consumo","Consumption time"],
    ["Selecionar momento do consumo","Select consumption time"],
    ["Adicionado pelo jogador","Added by player"]
  ])assert.ok(js.includes("playerText('"+pt+"','"+en+"')")||js.includes('playerText("'+pt+'","'+en+'")'),pt+" / "+en);
  assert.match(js,/consumptionActionLabel\(registered,'CheckmarkCircle02Icon',playerText\(/);
  assert.match(js,/consumptionActionLabel\(undo,'UndoIcon',playerText\(/);
  assert.match(js,/playerUiLanguage==='en'\?\(periTimingEnglish\[timing\]\|\|label\):label/);
  assert.match(js,/const timing=playerUiLanguage==='en'\?periTimingEnglish\[food.timing\]:periTimingLabels\[food.timing\]/);
});

test("Event-edit labels use existing language preference and preserve event API keys",()=>{
  for(const [pt,en] of [
    ["Data","Date"],["Manhã","Morning"],["Tarde","Afternoon"],
    ["Guardar","Save"],["Editar ","Edit "],["Remover ","Remove "]
  ])assert.ok(js.includes('playerText("'+pt+'","'+en+'")'),pt+" / "+en);
  assert.match(js,/body:JSON.stringify\(\{event_date:date.value,session:session.value,local_date:iso\(new Date\(\)\)\}\)/);
  assert.match(js,/const section=document.createElement\("div"\);section.className=compact\?"weekly-event-card":"daily-event-card/);
  assert.match(html,/jogador-v2\.js\?v=/);
});

test("Existing ingestion/published prescriptions remain separate from presentation",()=>{
  assert.match(js,/selectedTiming,'player-added:'\+selectedTiming,true,dismiss/);
  assert.match(js,/body:JSON.stringify\(\{date,meal,event_id:eventId,timing,option_ref:option.option_ref,status:'all'\}\)/);
  assert.match(js,/function makeRecordedConsumptionTags\(/);
  assert.match(js,/await refreshAfterConsumption\(/);
});
