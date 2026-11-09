"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
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
   return {stylesLoaded:!!style,cssRules:style?.cssRules.length||0,scopedRule:style?.cssRules[0]?.constructor.name||"",panelColor:getComputedStyle(document.getElementById("tm-plan-page")).color};
  });
  assert.equal(cssInfo.stylesLoaded,true);
  assert.ok(cssInfo.cssRules>2,JSON.stringify(cssInfo));
  assert.match(cssInfo.scopedRule,/ScopeRule/);
  await page.screenshot({path:"plans-native-dark.png",fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.adminTheme="light");
  await page.waitForFunction(()=>document.getElementById("tm-plan-page").dataset.adminTheme==="light");
  await page.screenshot({path:"plans-native-light.png",fullPage:true});
  await page.locator("#tm-plan-page #entry-create").click();
  await page.locator("#tm-plan-page #plan-editor").waitFor({state:"visible"});
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
