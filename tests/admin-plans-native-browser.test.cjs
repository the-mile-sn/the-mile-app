"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright");
const ORIGIN="http://127.0.0.1:8765/admin-microcycles.html";
function respond(route,body,status=200){return route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});}
async function createPage(browser,viewport){
 const context=await browser.newContext({viewport,locale:"pt-PT"});
 const page=await context.newPage(),errors=[],queries=[];
 page.on("pageerror",err=>errors.push(err.message));
 await page.route("**/api/**",route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  queries.push({path,method:request.method()});
  if(path==="/api/me")return respond(route,{user:{id:"demo-admin",name:"Demo",email:"demo@example.invalid",role:"admin",has_photo:false},csrf:"demo-csrf"});
  if(path==="/api/v2/athletes")return respond(route,{athletes:[{id:"athlete-1",user_id:"user-1",name:"Atleta de teste",sex:"M",has_photo:false}]});
  if(path==="/api/v2/food-library")return respond(route,{foods:[{id:"food-1",display_name:"Aveia",base_name:"Aveia",category:"Cereais",variant:"plain",edible_fraction:1,reference_g:100,kcal:370,protein_g:13,carbs_g:61,fat_g:7,notes:""}]});
  if(path==="/api/v2/food-plan-drafts")return respond(route,{drafts:[]});
  if(path==="/api/v2/admin/dashboard")return respond(route,{players:[],events:[],recent:[],today:"2026-11-09",days:["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15"]});
  return respond(route,{});
 });
 await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
 await page.locator("#admin-workspace").waitFor({state:"visible"});
 return {page,context,errors,queries};
}
test("native Planos tab keeps the editor and blocks unsaved navigation",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,context,errors,queries}=await createPage(browser,{width:1440,height:900});
  const url=page.url();
  assert.equal(await page.locator("#tm-plan-page").isVisible(),false);
  assert.equal(queries.some(x=>x.path==="/api/v2/food-plan-drafts"),false,"Planos should load lazily");
  await page.locator("#tm-admin-nav-create-plan").click();
  await page.locator("#tm-plan-page").waitFor({state:"visible"});
  await page.locator("#tm-plan-page #library-plan-rows").getByText("Nenhum plano encontrado.").waitFor({state:"visible",timeout:12000});
  assert.equal(page.url(),url);
  assert.equal(await page.locator("#tm-admin-nav-create-plan").getAttribute("aria-current"),"page");
  assert.ok(queries.some(x=>x.path==="/api/v2/food-plan-drafts"));
  const cssInfo=await page.evaluate(()=>{
   const style=[...document.styleSheets].find(s=>s.href?.includes("admin-plans-native.css"));
   const entry=document.querySelector("#tm-plan-page #plan-entry");
   entry.insertAdjacentHTML("beforeend",'<span class="plan-type-tag" id="plan-icon-regression"><svg class="plan-peri-icon" viewBox="0 0 24 24"></svg></span>');
   const icon=entry.querySelector("#plan-icon-regression svg");
   const list=document.querySelector("#tm-plan-page .plan-library-filters");
   const table=document.querySelector("#tm-plan-page .plan-library-table-wrap");
   return {stylesLoaded:!!style,cssRules:style?.cssRules.length||0,
    layout:getComputedStyle(list).display,columns:getComputedStyle(list).gridTemplateColumns,
    border:getComputedStyle(table).borderTopStyle,
    iconWidth:getComputedStyle(icon).width,iconHeight:getComputedStyle(icon).height};
  });
  assert.equal(cssInfo.stylesLoaded,true);
   assert.match(cssInfo.cssVersion,/admin-plans-native\\.css\\?v=4/);
   assert.equal(cssInfo.countDisplay,"none","Plan list result count should be hidden");
  assert.ok(cssInfo.cssRules>100,JSON.stringify(cssInfo));
  assert.equal(cssInfo.layout,"grid",JSON.stringify(cssInfo));
  assert.equal(cssInfo.columns.split(" ").length,3,JSON.stringify(cssInfo));
  assert.equal(cssInfo.border,"solid");
  assert.equal(cssInfo.iconWidth,"17px","Peri-training icon must not cover the entire table");
  assert.equal(cssInfo.iconHeight,"17px");
  await page.screenshot({path:"plans-native-dark.png",fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.adminTheme="light");
  await page.waitForFunction(()=>document.getElementById("tm-plan-page").dataset.adminTheme==="light");
  await page.screenshot({path:"plans-native-light.png",fullPage:true});
  await page.locator("#tm-plan-page #entry-create").click();
  await page.locator("#tm-plan-page #plan-editor").waitFor({state:"visible"});
  const editorCss=await page.evaluate(()=>{
   const root=document.querySelector("#tm-plan-page");
   const summary=root.querySelector(".stats.four");
   const card=root.querySelector(".stats.four .stat");
   return {display:getComputedStyle(summary).display,
    columns:getComputedStyle(summary).gridTemplateColumns,
    cardPadding:getComputedStyle(card).paddingTop};
  });
  assert.equal(editorCss.display,"grid",JSON.stringify(editorCss));
  assert.equal(editorCss.columns.split(" ").length,4,JSON.stringify(editorCss));
  assert.notEqual(editorCss.cardPadding,"0px",JSON.stringify(editorCss));
  await page.locator("#tm-plan-page #plan-player").selectOption("user-1");
  await page.locator("#tm-plan-page #plan-type").selectOption("Plano azul");
  const athlete=await page.locator("#tm-plan-page #plan-player").inputValue();
  assert.equal(athlete,"user-1");
  page.once("dialog",d=>d.dismiss());
  await page.locator("#tm-admin-nav-dashboard").click();
  assert.equal(await page.locator("#tm-plan-page").isVisible(),true,"Cancelled leave must keep Planos open");
  page.once("dialog",d=>d.accept());
  await page.locator("#tm-admin-nav-dashboard").click();
  await page.locator("#tm-dashboard").waitFor({state:"visible"});
  assert.equal(page.url(),url);
  await page.locator("#tm-admin-nav-create-plan").click();
  await page.locator("#tm-plan-page #plan-editor").waitFor({state:"visible"});
  assert.equal(await page.locator("#tm-plan-page #plan-player").inputValue(),"user-1");
  assert.equal(await page.locator("#tm-plan-page #plan-type").inputValue(),"Plano azul");
  assert.equal(await page.locator("#tm-admin-nav-food-library").getAttribute("href"),null);
  assert.deepEqual(errors,[],"Uncaught error: "+errors.join("; "));
  await context.close();
 }finally{await browser.close();}
});
test("mobile Planos opens via native navigation and retains a single sidebar",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const {page,context,errors}=await createPage(browser,{width:390,height:844});
  const url=page.url();
  await page.locator("#tm-admin-nav-create-plan").click();
  await page.locator("#tm-plan-page").waitFor({state:"visible"});
  await page.locator("#tm-plan-page #library-plan-rows").getByText("Nenhum plano encontrado.").waitFor({state:"visible"});
  assert.equal(page.url(),url);
  assert.equal(await page.locator(".tm-admin-sidebar").count(),1);
  await page.screenshot({path:"plans-native-mobile.png",fullPage:true});
  assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();}
});

test("WebKit/Safari-style engine renders Planos cards, macros and small Peri-treino icons",async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  const {page,context,errors}=await createPage(browser,{width:1365,height:850});
  await page.evaluate(()=>{document.documentElement.dataset.adminTheme="light"});
  await page.locator("#tm-admin-nav-create-plan").click();
  await page.locator("#tm-plan-page").waitFor({state:"visible"});
  await page.locator("#tm-plan-page #library-plan-rows").getByText("Nenhum plano encontrado.").waitFor({state:"visible",timeout:12000});
  const listCss=await page.evaluate(()=>{
   const root=document.getElementById("tm-plan-page");
   const filters=root.querySelector(".plan-library-filters");
   const table=root.querySelector(".plan-library-table-wrap");
   const probe=document.createElement("span");
   probe.className="plan-type-tag";
   probe.innerHTML='<svg class="plan-peri-icon" viewBox="0 0 24 24"></svg>';
   root.querySelector("#plan-entry").append(probe);
   const icon=probe.querySelector("svg");
   return {layout:getComputedStyle(filters).display,columns:getComputedStyle(filters).gridTemplateColumns,
    border:getComputedStyle(table).borderTopStyle,iconWidth:getComputedStyle(icon).width,
    iconHeight:getComputedStyle(icon).height};
  });
  assert.equal(listCss.layout,"grid",JSON.stringify(listCss));
  assert.equal(listCss.columns.split(" ").length,3,JSON.stringify(listCss));
  assert.equal(listCss.border,"solid");
  assert.equal(listCss.iconWidth,"17px",JSON.stringify(listCss));
  assert.equal(listCss.iconHeight,"17px");
  await page.screenshot({path:"plans-native-webkit-list.png",fullPage:true});
  await page.locator("#tm-plan-page #entry-create").click();
  await page.locator("#tm-plan-page #plan-editor").waitFor({state:"visible"});
  const cardCss=await page.evaluate(()=>{
   const root=document.getElementById("tm-plan-page");
   const stats=root.querySelector(".stats.four");
   const first=stats.querySelector(".stat");
   return {display:getComputedStyle(stats).display,columns:getComputedStyle(stats).gridTemplateColumns,
    pad:getComputedStyle(first).paddingTop,background:getComputedStyle(first).backgroundColor};
  });
  assert.equal(cardCss.display,"grid",JSON.stringify(cardCss));
  assert.equal(cardCss.columns.split(" ").length,4,JSON.stringify(cardCss));
  assert.notEqual(cardCss.pad,"0px");
  await page.screenshot({path:"plans-native-webkit-editor.png",fullPage:true});
  assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();}
});
