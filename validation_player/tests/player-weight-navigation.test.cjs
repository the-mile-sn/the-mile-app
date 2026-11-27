const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync("static/jogador-v2.js","utf8");
test("future dates avoid rejected weight fetch and remove action button",()=>{
 assert.match(source,/if\(date>iso\(new Date\(\)\)\)\{/);
 assert.match(source,/action\.remove\(\); \/\/ Future dates have no entry action; the card still opens the weight screen \(up to today\)\./);
 assert.doesNotMatch(source,/Disponível no próprio dia/);
 assert.ok(source.indexOf("if(date>iso(new Date()))") < source.indexOf('cachedOverviewRead("/api/v2/player/weight?date="+date)'));
});
test("weight request cannot block meal rendering",()=>{
 assert.match(source,/renderWeightCard\(root,d,r\)\.catch\(\(\)=>\{\}\);/);
 assert.doesNotMatch(source,/await renderWeightCard\(root,d/);
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
 assert.match(source,/renderWeightCard\(root,d,r\)\.catch\(\(\)=>\{\}\);\s*const note=document\.createElement\("p"\)/);
});

test("weight widget opens the entry form with a close X, or the weight screen when a weight exists",()=>{
 assert.match(source,/const collapsedIcon=action\.innerHTML,collapsedLabel=action\.getAttribute\("aria-label"\)/);
 assert.match(source,/const closeIcon=.*M6 6l12 12M18 6L6 18/);
 assert.match(source,/action\.innerHTML=open\?closeIcon:collapsedIcon/);
 assert.match(source,/action\.setAttribute\("aria-expanded",String\(open\)\)/);
 assert.match(source,/if\(existing&&panel\.hidden\)\{openWeightDetail\(date,\(\)=>toggleEditor\(true\)\);return;\}/);
 assert.match(source,/event\?\.stopPropagation\(\);/);
});
test("weekly macro chart typography does not affect the collapsed summary",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview #weekly-view \.nutrition-weekly-charts \.macro-chart-heading\{/);
 assert.match(css,/font-size:16px!important;\s*font-weight:var\(--mile-type-semibold,600\)!important/);
 assert.match(css,/font-size:12px!important;\s*font-weight:var\(--mile-type-regular,400\)!important/);
 assert.match(css,/#overview #weekly-view \.nutrition-weekly-charts \.macro-chart-header\+div>\.nutrition-chart-section>strong\{/);
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
 assert.doesNotMatch(css,/:has\(\.nutrition-weekly-charts/,"the Dia ring card has no expanded state any more");
});

test("Monday prior-day ring uses preceding Sunday across week boundary",()=>{
 assert.match(source,/cachedOverviewRead\("\/api\/v2\/player\/calendar\?start="\+iso\(priorMon\)\+"&end="\+priorSunday\)/);
 assert.match(source,/const priorMon=monday\(yesterday\),priorSunday=iso\(yesterday\)/);
 assert.match(source,/previousCalendar\.meal_color_overrides/);
 assert.match(source,/deviationPrevious=change\(sum\.kcal\)/);
 assert.match(source,/paintRings\(\)/);
});
test("weekly calories and macros moved from the Dia ring card to the Semana view (planned values)",()=>{
 assert.match(source,/function buildWeeklyNutritionCharts\(weekDays,referenceWeights=\{\}\)/);
 assert.match(source,/root\.append\(buildWeeklyNutritionCharts\(chartDays,weeklyWeights\)\)/);
 assert.match(source,/const chartDays=dates\.map\(key=>\{const total=dayNutritionTotal\(/);
 assert.doesNotMatch(source,/className="nutrition-expand"/);
 assert.doesNotMatch(source,/consumption-concentric-footer/);
});
test("energy label and compact relative amount replace separate kcal unit inside halo",()=>{
 assert.match(source,/heading\.textContent=playerText\("Energia \(kcal\)","Energy \(kcal\)"\)/);
 assert.match(source,/center\.append\(number\)/);
 assert.match(source,/fmtKcal\(total\.kcal\/weight\)\+" \/kg"/);
 assert.doesNotMatch(source,/unit\.textContent="kcal";center\.append\(number,unit\)/);
});
test("the ring card keeps its g/kg switch visible without the old expand control",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(source,/visual\.append\(rings,figures,mode\);/);
 assert.doesNotMatch(css,/\.nutrition-expand/);
 assert.match(css,/#overview #day-details \.nutrition-comparison\.consumption-concentric>\.consumption-concentric-unit-switch\{\s*position:absolute!important;top:-12px!important/);
});
test("all player calendars use horizontal swipe navigation without arrow controls",()=>{
 const html=fs.readFileSync("static/jogador-v2.html","utf8");
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(source,/function enableWeekSwipe\(element,onShift\)/);
 assert.match(source,/Math\.abs\(dx\)<55\|\|Math\.abs\(dx\)<Math\.abs\(dy\)\*1\.4/);
 assert.match(source,/enableOverviewDaySwipe\(\$\("overview"\)\)/);
 assert.match(source,/enableWeekSwipe\(\$\("menu-week-strip"\),offset=>/);
 assert.doesNotMatch(source,/className="week-arrow"/);
 assert.doesNotMatch(source,/className="weekly-date-nav"/);
 assert.doesNotMatch(html,/id="menu-prev"|id="menu-next"/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
});
test("week navigation always selects Sunday backward and Monday forward",()=>{
 assert.match(source,/function swipeWeekBoundary\(current,offset\)/);
 assert.match(source,/start\.setDate\(start\.getDate\(\)\+\(offset<0\?-1:7\)\)/);
 assert.match(source,/enableWeekSwipe\(\$\("menu-week-strip"\),offset=>\{menuWeek=swipeWeekBoundary\(menuWeek,offset\)/);
 assert.match(source,/menuSelectedDate=iso\(menuWeek\)/);
 assert.match(source,/function shiftOverviewDay\(offset\)/);
 assert.match(source,/next\.setDate\(next\.getDate\(\)\+offset\)/);
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
test("Início has no Dia/Semana selector: Semana opens from its widget",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.doesNotMatch(css,/#overview-mode/);
 assert.match(source,/open\.onclick=\(\)=>\{weekReturnDay=date;overviewMode="week";/);
});

test("match with intra and training cells have the same 42px height",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#weekly-view \.weekly-event-slot>\.weekly-event-card\.weekly-match-with-intra/);
 assert.match(css,/min-height:42px!important;\s*height:42px!important;/);
});

test("kcal per kg and daily comparison percentages use whole units while macros remain at one decimal",()=>{
 assert.match(source,/key==="kcal"\?fmtKcal\(relativeMeans\[key\]\):fmt\(relativeMeans\[key\],1\)/);
 assert.match(source,/fmtKcal\(total\.kcal\/weight\)\+" kcal\/kg"/);
 assert.match(source,/fmtKcal\(total\.kcal\/weight\)\+" \/kg"/);
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
 assert.match(css,/--mile-type-regular:400;--mile-type-card-title:400;--mile-type-medium:500;--mile-type-semibold:600;--mile-type-bold:700/);
 assert.doesNotMatch(css,/\.plan-overview-meal:not\(\[open\]\)>\.daily-meal-head \.meal-average-inline \.macro>\.kcal,\s*#plans/);
 assert.match(css,/\.plan-overview-meal:is\(\.tone-orange,\.tone-yellow,\.tone-green,\.tone-blue\)>\.daily-meal-head \.meal-average-inline \.macro>\.kcal/);
 assert.match(css,/color:var\(--meal-ink\)!important/);
});

test("expanded food lists use whitespace rather than dividing lines",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview \.daily-meal \.foods,[\s\S]*?#weekly-view \.weekly-option-card \.foods\{\s*border-bottom:0!important;\s*border-top:0!important/);
});
test("raw accompaniments keep newline formatting with more comfortable line spacing",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview \.meal-collapsible-note>\.meal-note-body,[\s\S]*?#weekly-view \.meal-collapsible-note>\.meal-note-body\{\s*white-space:pre-wrap!important;\s*line-height:1\.75!important/);
 assert.match(css,/margin-top:6px!important/);
});

test("all color plan options have compact divider-free food rows while raw notes keep spacing",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview \.daily-meal:is\(\.tone-orange,\.tone-yellow,\.tone-green,\.tone-blue\) \.foods/);
 assert.match(css,/#plans #plan-detail :is\(\.plan-meal,\.plan-overview-meal\):is\(\.tone-orange,\.tone-yellow,\.tone-green,\.tone-blue\) \.foods/);
 assert.match(css,/#weekly-view \.weekly-color-detail:is\(\.tone-orange,\.tone-yellow,\.tone-green,\.tone-blue\) \.foods/);
 assert.match(css,/border-bottom:0!important;\s*box-shadow:none!important;\s*padding-top:5px!important;\s*padding-bottom:5px!important/);
 assert.match(css,/\.meal-collapsible-note>\.meal-note-body\{line-height:1\.75!important\}/);
});

test("daily meal option foods have no separators, including single option and multi option",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview #day-details \.daily-meal:not\(\.peri-meal\) \.single-meal-option \.foods/);
 assert.match(css,/#overview #day-details \.daily-meal:not\(\.peri-meal\) \.player-meal-option-subcard \.foods/);
 assert.match(css,/border-bottom:0!important;\s*box-shadow:none!important;\s*padding-top:5px!important/);
});
test("raw accompaniment font size matches normal ingredient font, retaining line spacing",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview \.meal-collapsible-note>\.meal-note-body,[\s\S]*?#weekly-view \.meal-collapsible-note>\.meal-note-body\{\s*font-size:14px!important;/);
 assert.match(css,/font-weight:var\(--mile-type-regular\)!important;\s*line-height:1\.75!important/);
});

test("weekly coloured meal kcal and macro strips have no tinted background",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#weekly-view \.weekly-color-detail:is\(\.tone-orange,\.tone-yellow,\.tone-green,\.tone-blue\)>\.weekly-meal-average/);
 assert.match(css,/\.weekly-option-card \.option-expanded-macros,[\s\S]*?background:transparent!important;\s*background-color:transparent!important;\s*background-image:none!important/);
});

test("Daily, Weekly detail and Plans share approved 16px/400 meal title and medium option hierarchy",()=>{
 const css=fs.readFileSync("static/jogador-v2.css","utf8");
 assert.match(css,/#overview \.daily-meal>\.daily-meal-head>strong/);
 assert.match(css,/#plans #plan-detail \.plan-overview-meal>\.daily-meal-head>strong/);
 assert.match(css,/#weekly-view \.weekly-color-meal-head>strong/);
 assert.match(css,/font-weight:var\(--mile-type-card-title\)!important/);
 assert.match(css,/--day-title-size:16px;--day-title-weight:var\(--mile-type-card-title\)/);
 assert.match(css,/\.tm-day-title\{font-family:inherit!important;font-size:var\(--day-title-size\)!important;font-weight:var\(--day-title-weight\)!important/);
 assert.match(css,/#overview \.daily-meal \.plan-option-label>strong/);
 assert.match(css,/font-weight:var\(--mile-type-medium\)!important/);
});
test("female weight trend only marks affirmative menstrual days, without changing weight values",()=>{
 const player=fs.readFileSync("static/jogador-v2.js","utf8");
 const page=fs.readFileSync("static/jogador-v2.html","utf8");
 assert.match(player,/const female=String\(me\?\.sex\|\|""\)\.toUpperCase\(\)==="F"/);
 assert.match(player,/const flagged=female&&\(x\.menstruating===1\|\|x\.menstruating===true\)/);
 assert.match(player,/if\(flagged\)el\("circle",\{cx,cy:cy\+10,r:2\.5,fill:"#d6a7bc","aria-hidden":"true"\}\)/);
 assert.match(player,/touch\.addEventListener\("click",show\)/);
 assert.match(player,/weight-detail-point/);
 assert.match(page,/jogador-v2\.js\?v=[^"\s]+/);
});
