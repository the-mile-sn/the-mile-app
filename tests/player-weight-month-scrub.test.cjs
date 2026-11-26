// Peso em jejum, Mês (26/11): sliding a finger along the chart runs through the entries.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('static/jogador-v2.js','utf8'),css=fs.readFileSync('static/jogador-v2.css','utf8');
const block=(a,b)=>js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));
test('the month chart (only) gets finger scrubbing; marker taps keep working',()=>{
 assert.match(js,/if\(days===30\)weightDetailScrub\(svg,points,detail,\{top,bottom\}\);/);
 assert.match(js,/touch\.addEventListener\("click",show\);touch\.addEventListener\("focus",show\);/);
});
test('scrubbing follows the nearest entry with a guide, a ring, the label and a haptic tick',()=>{
 const fn=block('function weightDetailScrub(','// Haptic tick for wheels');
 assert.match(fn,/svg\.addEventListener\("pointermove",event=>\{if\(active===event\.pointerId\)pick\(event\.clientX\);\}\)/);
 assert.match(fn,/Math\.abs\(points\[i\]\.cx-x\)<Math\.abs\(points\[best\]\.cx-x\)/);
 assert.match(fn,/if\(current>=0\)playerHaptic\(\);/);
 assert.match(fn,/detail\.textContent=p\.label;/);
 assert.match(css,/\.weight-detail-chart svg\.weight-detail-scrubbable\{touch-action:pan-y;/);
});
