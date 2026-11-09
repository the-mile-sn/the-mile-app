"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const BASE="https://the-mile-food-library-test.onrender.com/";
test("Real Render demo: Planos list, preview, edit, dark/light and tab navigation",async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},locale:"pt-PT"});
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  const res=await page.goto(BASE+"?nav=create-plan",{waitUntil:"domcontentloaded",timeout:60000});
  assert.equal(res.status(),200);
  await page.locator("#admin-workspace").waitFor({state:"visible",timeout:30000});
  await page.locator("#tm-plan-page").waitFor({state:"visible",timeout:20000});
  await page.locator("#tm-plan-page #library-plan-rows tr").first().waitFor({state:"visible",timeout:20000});
  await page.locator("#tm-plan-page #library-plan-rows").getByText("Jogador Demonstração").first().waitFor({state:"visible",timeout:20000});
  const textRows=await page.locator("#tm-plan-page #library-plan-rows").innerText();
  assert.match(textRows,/Jogador Demonstração/);
  assert.match(await page.locator("#tm-preview-notice").innerText(),/fictícios/i);
  assert.equal(await page.locator("#tm-admin-nav-create-plan").getAttribute("aria-current"),"page");
  assert.equal(await page.locator(".tm-admin-sidebar").count(),1);
  await page.screenshot({path:"planos-live-dark.png",fullPage:true});
  await page.evaluate(()=>{document.documentElement.dataset.adminTheme="light"});
  await page.waitForFunction(()=>document.getElementById("tm-plan-page").dataset.adminTheme==="light");
  await page.screenshot({path:"planos-live-light.png",fullPage:true});
  const unchanged=page.url();
  await page.locator('#tm-plan-page [data-view-id="demo-plan-azul"]').click();
  await page.locator("#tm-plan-page #plan-preview").waitFor({state:"visible",timeout:15000});
  await page.locator("#tm-plan-page #preview-back").click();
  await page.locator("#tm-plan-page #plan-entry").waitFor({state:"visible"});
  await page.locator('#tm-plan-page [data-edit-id="demo-plan-azul"]').click();
  await page.locator("#tm-plan-page #plan-editor").waitFor({state:"visible",timeout:15000});
  assert.match(await page.locator("#tm-plan-page #plan-player").inputValue(),/demo-user-1/);
  await page.locator("#tm-admin-nav-dashboard").click();
  await page.locator("#tm-dashboard").waitFor({state:"visible",timeout:15000});
  await page.locator("#tm-admin-nav-create-plan").click();
  await page.locator("#tm-plan-page #plan-editor").waitFor({state:"visible"});
  assert.equal(page.url(),unchanged);
  assert.deepEqual(errors,[],"Uncaught browser errors: "+errors.join("; "));
 }finally{await browser.close();}
});
test("Real Render demo: mobile Planos access",async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
  await page.goto(BASE,{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#admin-workspace").waitFor({state:"visible",timeout:30000});
  const url=page.url();
  await page.locator("#tm-admin-nav-create-plan").click();
  await page.locator("#tm-plan-page").waitFor({state:"visible",timeout:15000});
  await page.locator("#tm-plan-page #library-plan-rows").getByText("Jogador Demonstração").first().waitFor({state:"visible",timeout:15000});
  await page.screenshot({path:"planos-live-mobile.png",fullPage:true});
  assert.equal(page.url(),url);
 }finally{await browser.close();}
});
