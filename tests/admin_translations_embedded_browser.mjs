/* Browser regression: PT/EN Central must be part of the native Admin shell.
   Fake login, fake content, no connection to any production service. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin="http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const fmt=(body,status=200)=>({status,contentType:"application/json",body:JSON.stringify(body)});
const zero={missing:1,legacy_review:0,pending:0,approved:0,outdated:0};
const libraries=["food","dish","recipe","recipe_category","supplement"].map((kind)=>({
  kind,label:kind,integrated:true,record_count:1,field_count:1,statuses:zero,
}));
const stats={language:"en",statuses:zero,libraries:[...libraries,{kind:"plan",label:"Planos alimentares publicados",integrated:false,record_count:9,field_count:null,statuses:null}]};
const single=(kind)=>({
  entity_kind:kind,entity_id:"food1",field_path:"display_name",
  source_text:"Arroz branco",category:"Cereais",state:"missing",
  fields:[{field_path:"display_name",field_label:"Nome do alimento",
    state:"missing",source_text:"Arroz branco",legacy_candidate:""}],
});

try{
  for(const [name,width,height] of [["desktop",1440,900],["mobile",390,844]]){
    const page=await browser.newPage({viewport:{width,height},acceptDownloads:true});
    let authenticated=false;
    const requests=[];
    await page.route("**/api/**",async route=>{
      const url=new URL(route.request().url()),path=url.pathname;
      requests.push(path);
      if(path==="/api/me"){
        await route.fulfill(fmt(authenticated?
          {user:{id:"admin",name:"Admin",role:"admin",email:"admin@example.invalid"},
           csrf:"test-csrf"}:{error:"unauthorized"},authenticated?200:401));
      }else if(path==="/api/v2/admin/i18n/overview"){
        await route.fulfill(fmt(stats));
      }else if(path==="/api/v2/admin/i18n/catalog"){
        const kind=url.searchParams.get("entity_kind")||"food";
        await route.fulfill(fmt({library:kind,total:1,page:1,page_size:25,
          items:[single(kind)]}));
      }else{
        await route.fulfill(fmt({error:"not_found"},404));
      }
    });
    const startup=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/me");
    await page.goto(origin+"/admin-microcycles.html",{waitUntil:"domcontentloaded"});
    await startup;
    authenticated=true;
    await page.evaluate(()=>{
      document.getElementById("admin-workspace").hidden=false;
      document.getElementById("admin-login-panel").hidden=true;
    });
    const nav=page.locator("#tm-admin-nav-translations");
    await page.waitForFunction(()=>{
      const button=document.getElementById("tm-admin-nav-translations");
      return !!button&&!button.hidden;
    },null,{timeout:15000});
    // Traduções must be a PRIMARY destination, never inside Biblioteca.
    assert.equal(await nav.evaluate(el=>!!el.closest("#tm-admin-food-subnav")),false);
    assert.equal(await nav.evaluate(el=>!!el.closest(".tm-admin-side-nav")),true);
    await nav.waitFor({state:"visible",timeout:15000});
    await nav.click();
    const view=page.locator("#tm-admin-translations-page");
    await page.locator("#i18n-library-panel:not([hidden])").waitFor({timeout:15000});
    assert.equal(await view.getAttribute("hidden"),null);
    assert.ok((await page.locator("#i18n-work-title").textContent()).includes("Revisão"));
    assert.ok((await page.locator("#i18n-import-title").textContent()).includes("Importar"));
    assert.ok((await page.locator("#i18n-auto-title").textContent()).includes("automáticas"));
    assert.equal(new URL(page.url()).pathname,"/admin-microcycles.html");
    assert.equal(await page.locator("#tm-dashboard").getAttribute("hidden"),"");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),
      name+" has horizontal overflow");
    const plansCard=page.locator("#i18n-libraries button").filter({hasText:"Planos alimentares publicados"});
    await plansCard.click();
    await page.locator("#i18n-plan-stage:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-import-panel").getAttribute("hidden"),"");
    assert.equal(await page.locator("#i18n-work-panel").getAttribute("hidden"),"");
    // The global hub still lets us return to an editable library without page navigation.
    await page.locator("#i18n-libraries button").first().click();
    await page.locator("#i18n-work-panel:not([hidden])").waitFor();
    await page.locator("#tm-admin-nav-food-library").click();
    assert.equal(await view.getAttribute("hidden"),"");
    await page.close();
    process.stdout.write("Embedded admin translation navigation "+name+" passed\n");
  }
}finally{
  await browser.close();
}
