const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync("static/jogador-v2.js","utf8");
test("future dates avoid rejected weight fetch and remove action button",()=>{
 assert.match(source,/if\(date>iso\(new Date\(\)\)\)\{/);
 assert.match(source,/action\.remove\(\); \/\/ Future dates display the weight card without any action\./);
 assert.doesNotMatch(source,/Disponível no próprio dia/);
 assert.ok(source.indexOf("if(date>iso(new Date()))") < source.indexOf('cachedOverviewRead("/api/v2/player/weight?date="+date)'));
});
test("weight request cannot block meal rendering",()=>{
 assert.match(source,/renderWeightCard\(root,d\)\.catch\(\(\)=>\{\}\);/);
 assert.doesNotMatch(source,/await renderWeightCard\(root,d\)/);
});
test("weekly reference weights and menu data are shared across daily and weekly views",()=>{
 assert.match(source,/\[r,weekMenus,weekWeights\]=await Promise\.all/);
 assert.match(source,/weekWeights\.weights_by_date\?\.\[d\]/);
 assert.match(source,/x\.menu_date===d&&x\.meal===meal/);
});
test("saving weight invalidates cached relative nutrition references",()=>{
 assert.match(source,/overviewReadCache\.clear\(\); \/\/ The reference-weight values can change after saving/);
});
test("days with no published meals still render weight card",()=>{
 assert.match(source,/renderWeightCard\(root,d\)\.catch\(\(\)=>\{\}\);\s*const note=document\.createElement\("p"\)/);
});

test("expanded weight action becomes close X for editor and chart, with accessible state",()=>{
 assert.match(source,/const collapsedIcon=action\.innerHTML,collapsedLabel=action\.getAttribute\("aria-label"\)/);
 assert.match(source,/const closeIcon=.*M6 6l12 12M18 6L6 18/);
 assert.match(source,/action\.innerHTML=expanded\?closeIcon:collapsedIcon/);
 assert.match(source,/action\.setAttribute\("aria-expanded",String\(expanded\)\)/);
 assert.match(source,/if\(expanded\)\{existing\?chart\(\):editor\(\);\}/);
});
test("weekly macro chart typography does not affect the collapsed summary",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview #day-details \.nutrition-weekly-charts:not\(\[hidden\]\) \.macro-chart-heading\{/);
 assert.match(css,/font-size:16px!important;\s*font-weight:650!important/);
 assert.match(css,/#overview #day-details \.nutrition-weekly-charts:not\(\[hidden\]\) \.macro-chart-header\+div>\.nutrition-chart-section>strong\{/);
});

test("daily energy comparison has signed fixed-scale rings and preserves original kg data",()=>{
 assert.match(source,/const weeklyPct|const deviationMean=change\(mean\)/);
 assert.match(source,/let previous=weekDays\.find/);
 assert.match(source,/Math\.min\(180,Math\.abs\(delta\)\/30\*180\)/);
 assert.match(source,/direction=delta>=0\?1:-1/);
 assert.match(source,/className="nutrition-comparison"/);
 assert.match(source,/fmt\(total\[key\]\/weight,1\)\+" g\/kg"/);
 assert.match(source,/renderMacroMode\("g"\)/);
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/\.nutrition-weekly-charts:not\(\[hidden\]\)\) \.nutrition-comparison\{display:none!important\}/);
});

test("Monday prior-day ring uses preceding Sunday across week boundary",()=>{
 assert.match(source,/cachedOverviewRead\("\/api\/v2\/player\/calendar\?start="\+iso\(priorMon\)\+"&end="\+priorSunday\)/);
 assert.match(source,/const priorMon=monday\(yesterday\),priorSunday=iso\(yesterday\)/);
 assert.match(source,/previousCalendar\.meal_color_overrides/);
 assert.match(source,/deviationPrevious=change\(sum\.kcal\)/);
 assert.match(source,/paintRings\(\)/);
});
test("expanded nutrition keeps the dual ring and displays only the original charts beneath it",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/\.nutrition-weekly-charts:not\(\[hidden\]\)\) \.nutrition-comparison\{\s*display:grid!important/);
 assert.match(css,/\.nutrition-donut-summary>\.nutrition-weekly-charts\{/);
 assert.match(css,/bottom:18px!important;right:7px!important/);
 assert.match(source,/expand\.setAttribute\("aria-label",weeklyCharts\.hidden\?"Expandir resumo nutricional":"Fechar gráficos nutricionais"\)/);
});

test("energy label and compact relative amount replace separate kcal unit inside halo",()=>{
 assert.match(source,/heading\.textContent="Energia \(kcal\)"/);
 assert.match(source,/center\.append\(number\)/);
 assert.match(source,/fmt\(total\.kcal\/weight,1\)\+" \/kg"/);
 assert.doesNotMatch(source,/unit\.textContent="kcal";center\.append\(number,unit\)/);
});
test("open and close use same chevron inside persistent halo preview",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(source,/visual\.append\(expand\);summary\.append\(weeklyCharts\)/);
 assert.match(css,/\.nutrition-comparison>\.nutrition-expand\[aria-expanded="true"\]/);
 assert.match(css,/position:absolute!important;top:auto!important;bottom:0!important;right:0!important/);
});
