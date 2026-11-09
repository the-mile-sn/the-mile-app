"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {chromium}=require("playwright");
const BASE="https://the-mile-food-library-test.onrender.com/";

test("live Render preview opens the native Food Library with demo foods only",async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:1380,height:900},locale:"pt-PT"});
 const page=await ctx.newPage();
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  const response=await page.goto(BASE+"?nav=food-library",{waitUntil:"domcontentloaded",timeout:60000});
  assert.equal(response.status(),200);
  await page.locator("#admin-workspace").waitFor({state:"visible",timeout:30000});
  await page.locator("#tm-food-library-page").waitFor({state:"visible",timeout:20000});
  await page.locator("#tm-food-library-page #rows tr").first().waitFor({state:"visible",timeout:20000});
  assert.match(await page.locator("#tm-preview-notice").innerText(),/dados fictícios/i);
  assert.equal(await page.locator(".tm-admin-sidebar").count(),1);
  assert.equal(await page.locator("#tm-admin-nav-food-library").getAttribute("aria-current"),"page");
  assert.equal(await page.locator("#tm-food-library-page #rows tr").count()>=4,true);
  await page.screenshot({path:"native-preview-dark.png",fullPage:true});

  await page.evaluate(()=>{document.documentElement.dataset.adminTheme="light"});
  await page.screenshot({path:"native-preview-light.png",fullPage:true});

  const original=page.url();
  await page.locator("#tm-admin-nav-dashboard").click();
  await page.locator("#tm-dashboard").waitFor({state:"visible"});
  await page.locator("#tm-admin-nav-food-library").click();
  await page.locator("#tm-food-library-page").waitFor({state:"visible"});
  assert.equal(page.url(),original,"Native navigation must not reload the document");

  await page.locator("#tm-food-library-page #search").fill("ban");
  await page.getByText("Banana",{exact:true}).first().waitFor({state:"visible"});
  await page.locator("#tm-food-library-page #search").fill("");
  await page.locator("#tm-food-library-page #new").click();
  const dialog=page.locator("#tm-food-library-page #editor");
  await dialog.waitFor({state:"visible"});
  await dialog.locator('[name="display_name"]').fill("Morango - teste automatizado");
  await dialog.locator('[name="category"]').fill("Fruta");
  await dialog.locator('[name="kcal"]').fill("32");
  await dialog.locator('[name="protein_g"]').fill("0.7");
  await dialog.locator('[name="carbs_g"]').fill("7.7");
  await dialog.locator('[name="fat_g"]').fill("0.3");
  await dialog.getByRole("button",{name:"Guardar"}).click();
  await dialog.waitFor({state:"hidden"});
  const newRow=page.locator("#tm-food-library-page #rows tr").filter({hasText:"Morango - teste automatizado"});
  await newRow.waitFor({state:"visible"});
  const edit=newRow.locator("[data-edit]");
  await edit.click();
  await dialog.waitFor({state:"visible"});
  await dialog.locator('[name="kcal"]').fill("34");
  await dialog.getByRole("button",{name:"Guardar"}).click();
  await dialog.waitFor({state:"hidden"});
  await page.locator("#tm-food-library-page #rows tr").filter({hasText:"Morango - teste automatizado"}).waitFor();
  page.once("dialog",d=>d.accept());
  await page.locator("#tm-food-library-page #rows tr").filter({hasText:"Morango - teste automatizado"}).locator("[data-delete]").click();
  await page.locator("#tm-food-library-page #rows tr").filter({hasText:"Morango - teste automatizado"}).waitFor({state:"detached"});
  assert.deepEqual(errors,[],"Browser JavaScript should not throw");
 }finally{await browser.close();}
});

test("live Render preview opens from mobile More navigation",async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
  await page.goto(BASE,{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#admin-workspace").waitFor({state:"visible",timeout:30000});
  const original=page.url();
  await page.locator(".tm-admin-more-trigger").click();
  await page.locator("#tm-admin-nav-food-library").click();
  await page.locator("#tm-food-library-page").waitFor({state:"visible"});
  await page.locator("#tm-food-library-page #rows tr").first().waitFor({state:"visible",timeout:20000});
  assert.equal(page.url(),original);
  await page.screenshot({path:"native-preview-mobile.png",fullPage:true});
 }finally{await browser.close();}
});
