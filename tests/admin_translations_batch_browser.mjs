/* Pure mock-data browser test: explicit food batch review and human confirmation.
   No paid API, Render or production data. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin="http://127.0.0.1:8765";
const chromiumBrowser=await chromium.launch({headless:true});
const respond=(body,status=200)=>({status,contentType:"application/json",body:JSON.stringify(body)});
const samples=[
 {entity_id:"food1",field_path:"display_name",source_text:"Arroz branco",
  translated_text:"White rice",expected_source_hash:"a".repeat(64),
  expected_candidate_hash:"b".repeat(64)},
 {entity_id:"food2",field_path:"display_name",source_text:"Aveia",
  translated_text:"Oats",expected_source_hash:"c".repeat(64),
  expected_candidate_hash:"d".repeat(64)},
];
const libraryStatus={missing:0,legacy_review:0,pending:2,approved:0,outdated:0};
const libraries=["food","dish","recipe","recipe_category","supplement"].map(kind=>({
 kind,label:kind,integrated:true,record_count:2,field_count:2,statuses:libraryStatus
}));
let approvals=0;
try{
  for(const [device,width,height] of [["desktop",1400,900],["mobile",390,844]]){
    const page=await chromiumBrowser.newPage({viewport:{width,height}});
    const writes=[];
    await page.route("**/api/**",async route=>{
      const request=route.request();
      const path=new URL(request.url()).pathname;
      if(path==="/api/me"){
        return route.fulfill(respond({user:{id:"admin",role:"admin"},csrf:"mock-csrf"}));
      }
      if(path==="/api/v2/admin/i18n/overview"){
        return route.fulfill(respond({language:"en",statuses:libraryStatus,libraries}));
      }
      if(path==="/api/v2/admin/i18n/catalog"){
        return route.fulfill(respond({language:"en",library:"food",total:2,
          page:1,page_size:25,items:samples.map(entry=>({
            ...entry,category:"Cereais",state:"pending",
            fields:[{field_path:"display_name",state:"pending",
             source_text:entry.source_text,field_label:"Nome do alimento"}]
          }))}));
      }
      if(path==="/api/v2/admin/i18n/batch/preview"){
        assert.equal(request.method(),"GET");
        return route.fulfill(respond({entity_kind:"food",status:"pending",
          total:2,items:samples,approved:false}));
      }
      if(path==="/api/v2/admin/i18n/batch/approve"){
        assert.equal(request.method(),"POST");
        assert.equal(request.headers()["x-csrf-token"],"mock-csrf");
        const data=request.postDataJSON();
        assert.equal(data.entity_kind,"food");
        assert.equal(data.rows.length,2);
        assert.equal(data.rows.every(x=>!Object.hasOwn(x,"source_text")&&
          !Object.hasOwn(x,"translated_text")),true);
        writes.push("approved");
        approvals+=2;
        return route.fulfill(respond({approved:2,status:"approved",entity_kind:"food"}));
      }
      throw Error("Unexpected API path "+path);
    });
    await page.goto(origin+"/admin-translations.html",{waitUntil:"domcontentloaded"});
    await page.locator("#i18n-bulk-tools:not([hidden])").waitFor();
    assert.equal(writes.length,0);
    await page.locator("#i18n-bulk-open").click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-bulk-items .i18n-bulk-row").count(),2);
    assert.equal(writes.length,0);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-filter").fill("Aveia");
    assert.equal(await page.locator("#i18n-bulk-items .i18n-bulk-row:not([hidden])").count(),1);
    await page.locator("#i18n-bulk-filter").fill("");
    await page.locator("#i18n-bulk-select-all").check();
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-reviewed").check();
    assert.equal(await page.locator("#i18n-bulk-submit").isEnabled(),true);
    await page.locator("#i18n-bulk-items input[type=checkbox]").first().uncheck();
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true,
      "Changing the selection must clear the reviewer acknowledgement.");
    await page.locator("#i18n-bulk-select-all").check();
    await page.locator("#i18n-bulk-reviewed").check();
    await page.locator("#i18n-bulk-submit").click();
    await page.getByText(/2 traduções de alimentos aprovadas/).waitFor();
    assert.deepEqual(writes,["approved"]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));
    await page.close();
    process.stdout.write("Explicit food batch approval "+device+" passed\n");
  }
  assert.equal(approvals,4);
}finally{
  await chromiumBrowser.close();
}
