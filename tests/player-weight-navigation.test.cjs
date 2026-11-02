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
 assert.match(source,/fmt\(total\.kcal\/weight,0\)\+" \/kg"/);
 assert.doesNotMatch(source,/unit\.textContent="kcal";center\.append\(number,unit\)/);
});
test("open and close use same chevron inside persistent halo preview",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(source,/visual\.append\(expand\);summary\.append\(weeklyCharts\)/);
 assert.match(css,/\.nutrition-comparison>\.nutrition-expand\[aria-expanded="true"\]/);
 assert.match(css,/position:absolute!important;top:auto!important;bottom:0!important;right:0!important/);
});

test("all player calendars use horizontal swipe navigation without arrow controls",()=>{
 const html=fs.readFileSync("static/jogador-v2.html","utf8");
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(source,/function enableWeekSwipe\(element,onShift\)/);
 assert.match(source,/Math\.abs\(dx\)<55\|\|Math\.abs\(dx\)<Math\.abs\(dy\)\*1\.4/);
 assert.match(source,/enableWeekSwipe\(root,offset=>\{day=swipeWeekBoundary/);
 assert.match(source,/enableWeekSwipe\(strip,offset=>\{day=swipeWeekBoundary/);
 assert.match(source,/enableWeekSwipe\(\$\("menu-week-strip"\),offset=>/);
 assert.doesNotMatch(source,/className="week-arrow"/);
 assert.doesNotMatch(source,/className="weekly-date-nav"/);
 assert.doesNotMatch(html,/id="menu-prev"|id="menu-next"/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
});

test("week navigation always selects Sunday backward and Monday forward",()=>{
 assert.match(source,/function swipeWeekBoundary\(current,offset\)/);
 assert.match(source,/start\.setDate\(start\.getDate\(\)\+\(offset<0\?-1:7\)\)/);
 assert.match(source,/enableWeekSwipe\(root,offset=>\{day=swipeWeekBoundary\(day,offset\)/);
 assert.match(source,/enableWeekSwipe\(strip,offset=>\{day=swipeWeekBoundary\(day,offset\)/);
 assert.match(source,/menuWeek=swipeWeekBoundary\(menuWeek,offset\);menuSelectedDate=iso\(menuWeek\)/);
});
test("weekly day chips match daily and energy visually outranks macro totals",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(source,/header\.className="weekly-day-header week-day"/);
 assert.match(source,/\["day-number",String\(dt\.getDate\(\)\)\]/);
 assert.match(css,/#weekly-view \.weekly-day-header\.week-day\.selected \.day-number/);
 assert.match(css,/#weekly-view \.weekly-day-total \.weekly-total-kcal/);
 assert.match(css,/#weekly-view \.weekly-day-total \.weekly-total-macros/);
});

test("weekly selected day is highlighted without requiring expanded meal",()=>{
 assert.match(source,/const selectedWeeklyDate=weeklySelection\?\.date\|\|iso\(day\)/);
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#weekly-view \.weekly-calendar-grid\.has-weekly-selection::before/);
 assert.match(css,/background:rgba\(255,255,255,\.04\)!important/);
});
test("compact weekly styles keep seven columns and separate energy from macros",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
 assert.match(css,/#weekly-view \.weekly-meal,[\s\S]*?#weekly-view \.weekly-peri-card\{/);
 assert.match(css,/#weekly-view \.weekly-day-total \.weekly-total-kcal\{/);
 assert.match(css,/#weekly-view \.weekly-day-total \.weekly-total-macros\{/);
 assert.match(css,/column-gap:3px!important;row-gap:5px!important/);
});

test("weekly training and match corners equal nine-pixel meal card corners",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#weekly-view \.weekly-event-slot>\.weekly-event-card,[\s\S]*?#weekly-view \.weekly-match-with-intra\{\s*border-radius:9px!important/);
});
test("daily and weekly selector keeps equal full-height Screen Time-style segments",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview #overview-mode\{[\s\S]*?min-height:54px!important/);
 assert.match(css,/#overview #overview-mode button\[aria-pressed="true"\]\{[\s\S]*?min-height:48px!important/);
 assert.match(css,/#overview #overview-mode button\[aria-pressed="true"\]\{background:#55555b!important/);
});

test("match with intra and training cells have the same 42px height",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#weekly-view \.weekly-event-slot>\.weekly-event-card\.weekly-match-with-intra/);
 assert.match(css,/min-height:42px!important;\s*height:42px!important;/);
});
test("Day and Week selector uses compact 38px iPhone proportions",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview #overview-mode\{\s*min-height:38px!important;\s*height:38px!important/);
 assert.match(css,/height:32px!important;\s*padding:4px 8px!important;\s*font-size:13px!important/);
});

test("kcal per kg and daily comparison percentages use whole units while macros remain at one decimal",()=>{
 assert.match(source,/fmt\(relativeMeans\[key\],key==="kcal"\?0:1\)/);
 assert.match(source,/fmt\(total\.kcal\/weight,0\)\+" kcal\/kg"/);
 assert.match(source,/fmt\(total\.kcal\/weight,0\)\+" \/kg"/);
 assert.match(source,/fmt\(delta,0\)\+"%"/);
 assert.match(source,/fmt\(deviationPrevious,0\)\+"%"/);
 assert.match(source,/fmt\(total\[key\]\/weight,1\)\+" g\/kg"/);
});

test("approved palette B is shared by daily, weekly and plan meal views",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 for(const [token,hex] of [["orange","#54281B"],["yellow","#493713"],["green","#174631"],["blue","#193F60"]]){
  assert.match(css,new RegExp("--meal-"+token+":"+hex,"i"));
 }
 for(const [token,hex] of [["orange","#FFA078"],["yellow","#FFD76F"],["green","#77E3A4"],["blue","#8DD0FF"]]){
  assert.match(css,new RegExp("--meal-"+token+"-text:"+hex,"i"));
 }
 assert.match(css,/#weekly-view \.weekly-meal:is\(/);
 assert.match(css,/#plans #plan-detail \.plan-overview-meal:is\(/);
 assert.match(css,/#overview \.daily-meal:is\(/);
 for(const inner of ["#623324","#57451E","#24543E","#284D6C"])assert.ok(css.includes("--meal-inner:"+inner));
 assert.match(css,/\.weekly-event-card\.weekly-match-with-intra\{\s*background:#F2F2F4!important/);
});

test("tone-on-tone meal options keep palette B and remove harsh white option texts",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 for(const hex of ["#623324","#57451E","#24543E","#284D6C"])assert.ok(css.includes(hex));
 assert.match(css,/--option-label:color-mix/);
 assert.match(css,/--option-body:color-mix/);
 assert.match(css,/--option-divider:color-mix/);
 assert.match(css,/#plans #plan-detail :is\(\.plan-meal,\.plan-overview-meal\)/);
 assert.match(css,/#weekly-view \.weekly-color-detail:is\(/);
 assert.match(css,/\.daily-event-card\.match-intra-card :is\(\.meal-average-inline \.kcal/);
});

test("shared typography tokens and Plans meal kcal colour replace legacy neutral override",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/--mile-type-regular:400;--mile-type-medium:500;--mile-type-semibold:600;--mile-type-bold:700/);
 assert.doesNotMatch(css,/\.plan-overview-meal:not\(\[open\]\)>\.daily-meal-head \.meal-average-inline \.macro>\.kcal,\s*#plans/);
 assert.match(css,/\.plan-overview-meal:is\(\.tone-orange,\.tone-yellow,\.tone-green,\.tone-blue\)>\.daily-meal-head \.meal-average-inline \.macro>\.kcal/);
 assert.match(css,/color:var\(--meal-ink\)!important/);
});
