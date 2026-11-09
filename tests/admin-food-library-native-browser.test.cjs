"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {chromium}=require("playwright");

test("Food Library operates inside the admin shell without changing URL or live data",async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:950},locale:"pt-PT"});
 const page=await context.newPage();
 let foods=[{
  id:"mock-aveia",display_name:"Aveia",base_name:"Aveia",category:"Cereais",
  variant:"plain",notes:"Flocos",edible_fraction:1,reference_g:100,
  kcal:370,protein_g:13,carbs_g:61,fat_g:7
 }];
 const posts=[],deletes=[],errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 const json=(route,obj,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(obj)});
 await page.route("**/api/**",async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==="/api/me")return json(route,{user:{id:"test",name:"Test Admin",email:"test@localhost",role:"admin",has_photo:false},csrf:"test-csrf"});
  if(path==="/api/v2/athletes")return json(route,{athletes:[]});
  if(path==="/api/v2/admin/dashboard")return json(route,{
   today:"2026-11-09",players:[],events:[],recent:[],
   days:["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15"]
  });
  if(path==="/api/v2/food-library"&&req.method()==="GET"){
   const term=(url.searchParams.get("q")||"").toLowerCase(),cat=url.searchParams.get("category")||"";
   const filtered=foods.filter(f=>(!term||f.display_name.toLowerCase().includes(term))&&(!cat||f.category===cat));
   return json(route,{foods:filtered,page:1,pages:1,total:filtered.length,categories:["Cereais","Fruta"]});
  }
  if(path==="/api/v2/food-library"&&req.method()==="POST"){
   assert.equal(req.headers()["x-csrf-token"],"test-csrf","writes must retain CSRF");
   const body=JSON.parse(req.postData());posts.push(body);
   if(body.id)foods=foods.map(f=>f.id===body.id?{...f,...body}:f);
   else foods.push({...body,id:"mock-new",variant:body.variant||"plain"});
   return json(route,{id:body.id||"mock-new"});
  }
  if(path.startsWith("/api/v2/food-library/")&&req.method()==="DELETE"){
   assert.equal(req.headers()["x-csrf-token"],"test-csrf","deletes must retain CSRF");
   const id=decodeURIComponent(path.split("/").pop());deletes.push(id);
   foods=foods.filter(f=>f.id!==id);return json(route,{archived:true});
  }
  return json(route,{});
 });
 try{
  const response=await page.goto("http://127.0.0.1:8765/admin-microcycles.html",{waitUntil:"domcontentloaded"});
  assert.equal(response.status(),200);
  await page.locator("#admin-workspace").waitFor({state:"visible"});
  const startUrl=page.url();
  assert.equal(await page.locator("#tm-food-library-page").isVisible(),false);
  await page.locator("#tm-admin-nav-food-library").click();
  await page.locator("#tm-food-library-page").waitFor({state:"visible"});
  await page.locator("#tm-food-library-page #rows").getByText("Aveia").waitFor({state:"visible"});
  assert.equal(page.url(),startUrl,"the module must navigate without full-page reload");
  assert.equal(await page.locator(".tm-admin-sidebar").count(),1,"the page must have only one sidebar");
  assert.equal(await page.locator("#tm-admin-nav-food-library").getAttribute("aria-current"),"page");
  assert.equal(await page.locator('a#tm-admin-nav-create-plan[href="/create-plan"]').count(),1,"Planos must remain a standalone destination");

  await page.screenshot({path:"food-library-native-dark.png",fullPage:true});
  await page.evaluate(()=>{document.documentElement.dataset.adminTheme="light"});
  await page.screenshot({path:"food-library-native-light.png",fullPage:true});
  assert.equal(await page.locator("#tm-food-library-page").isVisible(),true);

  await page.locator("#tm-food-library-page #search").fill("zz-not-found");
  await page.locator("#tm-food-library-page #empty").waitFor({state:"visible"});
  await page.locator("#tm-food-library-page #search").fill("");
  await page.locator("#tm-food-library-page #rows").getByText("Aveia").waitFor({state:"visible"});

  await page.locator("#tm-admin-nav-dashboard").click();
  await page.locator("#tm-dashboard").waitFor({state:"visible"});
  assert.equal(await page.locator("#tm-food-library-page").isVisible(),false);
  await page.locator("#tm-admin-nav-food-library").click();
  await page.locator("#tm-food-library-page").waitFor({state:"visible"});
  assert.equal(page.url(),startUrl);

  await page.locator("#tm-food-library-page #new").click();
  const dialog=page.locator("#tm-food-library-page #editor");
  await dialog.waitFor({state:"visible"});
  await dialog.locator('[name="display_name"]').fill("Banana");
  await dialog.locator('[name="category"]').fill("Fruta");
  await dialog.locator('[name="reference_g"]').fill("100");
  await dialog.locator('[name="kcal"]').fill("89");
  await dialog.locator('[name="protein_g"]').fill("1.1");
  await dialog.locator('[name="carbs_g"]').fill("23");
  await dialog.locator('[name="fat_g"]').fill("0.3");
  await dialog.getByRole("button",{name:"Guardar"}).click();
  await dialog.waitFor({state:"hidden"});
  await page.locator("#tm-food-library-page #rows").getByText("Banana").waitFor({state:"visible"});
  assert.equal(posts.length,1,"creating a food must reuse the existing API");

  await page.locator('#tm-food-library-page [data-edit="mock-new"]').click();
  await dialog.waitFor({state:"visible"});
  await dialog.locator('[name="kcal"]').fill("91");
  await dialog.getByRole("button",{name:"Guardar"}).click();
  await dialog.waitFor({state:"hidden"});
  assert.equal(posts.length,2);
  assert.equal(posts[1].id,"mock-new");
  assert.equal(posts[1].kcal,"91");

  page.once("dialog",dlg=>dlg.accept());
  await page.locator('#tm-food-library-page [data-delete="mock-new"]').click();
  await page.waitForFunction(()=>!document.querySelector('#tm-food-library-page [data-delete="mock-new"]'));
  assert.deepEqual(deletes,["mock-new"]);
  assert.equal(await page.locator("#tm-food-library-page #rows").getByText("Aveia").isVisible(),true);
  assert.deepEqual(errors,[],"no uncaught browser script errors");
 }finally{
  await browser.close();
 }
});
