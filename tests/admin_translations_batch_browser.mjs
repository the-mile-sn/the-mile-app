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
    await page.locator("#i18n-results .i18n-inventory-check").first().check();
    await page.getByRole("button",{name:"Rever seleção",exact:true}).click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-bulk-items .i18n-bulk-row").count(),1);
    assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),1);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    assert.equal(writes.length,0);
    await page.locator("#i18n-bulk-close").click();
    await page.locator("#i18n-bulk-open").click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-bulk-items .i18n-bulk-row").count(),2);
    assert.equal(writes.length,0);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-filter").fill("Aveia");
    assert.equal(await page.locator("#i18n-bulk-items .i18n-bulk-row:not([hidden])").count(),1);
    await page.locator("#i18n-bulk-filter").fill("");
    // The new action adds only the next 100 visible, unselected rows.
    assert.equal(await page.locator("#i18n-bulk-select-100").isEnabled(),true);
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),2);
    assert.equal(await page.locator("#i18n-bulk-select-100").isDisabled(),true);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-reviewed").check();
    assert.equal(await page.locator("#i18n-bulk-submit").isEnabled(),true);
    await page.locator("#i18n-bulk-items input[type=checkbox]").first().uncheck();
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-filter").fill("Aveia");
    assert.equal(await page.locator("#i18n-bulk-select-100").isDisabled(),true,
      "Filtered selection must not include rows hidden by search");
    await page.locator("#i18n-bulk-filter").fill("");
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),2);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
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
  // Dishes reuse the same 100-item UI, including legacy English names.
  for(const [device,width,height] of [["desktop",1400,900],["mobile",390,844]]){
    const page=await chromiumBrowser.newPage({viewport:{width,height}});
    const dishes=[
      {entity_id:"dish-legacy",field_path:"name_pt",
        source_text:"Frango com arroz",translated_text:"Chicken and rice",
        review_state:"legacy_review",expected_source_hash:"e".repeat(64),
        expected_candidate_hash:"f".repeat(64)},
      {entity_id:"dish-pending",field_path:"name_pt",
        source_text:"Sopa de legumes",translated_text:"Vegetable soup",
        review_state:"pending",expected_source_hash:"a".repeat(64),
        expected_candidate_hash:"b".repeat(64)},
    ];
    let written=0;
    await page.route("**/api/**",async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;
      if(path==="/api/me")
        return route.fulfill(respond({user:{id:"admin",role:"admin"},csrf:"mock-csrf"}));
      if(path==="/api/v2/admin/i18n/overview")
        return route.fulfill(respond({language:"en",statuses:{...libraryStatus,legacy_review:1},
          libraries}));
      if(path==="/api/v2/admin/i18n/catalog")
        return route.fulfill(respond({library:"dish",total:0,page:1,page_size:25,items:[]}));
      if(path==="/api/v2/admin/i18n/batch/preview"){
        assert.equal(request.method(),"GET");
        assert.equal(url.searchParams.get("entity_kind"),"dish");
        return route.fulfill(respond({entity_kind:"dish",status:"awaiting_review",
          total:2,items:dishes,approved:false}));
      }
      if(path==="/api/v2/admin/i18n/batch/approve"){
        assert.equal(request.method(),"POST");
        assert.equal(request.headers()["x-csrf-token"],"mock-csrf");
        const payload=request.postDataJSON();
        assert.equal(payload.entity_kind,"dish");
        assert.deepEqual(payload.rows.map(x=>x.entity_id),
          ["dish-legacy","dish-pending"]);
        assert.ok(payload.rows.every(x=>x.field_path==="name_pt"&&
          !Object.hasOwn(x,"source_text")&&!Object.hasOwn(x,"translated_text")));
        written++;
        return route.fulfill(respond({approved:2,entity_kind:"dish",status:"approved"}));
      }
      throw Error("Unexpected API "+request.url());
    });
    await page.goto(origin+"/admin-translations.html?entity_kind=dish",
      {waitUntil:"domcontentloaded"});
    await page.locator("#i18n-bulk-tools:not([hidden])").waitFor();
    assert.equal(written,0);
    await page.locator("#i18n-bulk-open").click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    assert.match(await page.locator("#i18n-bulk-title").innerText(),/Pratos/);
    assert.match(await page.locator("#i18n-bulk-all-label").innerText(),/traduções por rever/);
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),2);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    assert.equal(written,0);
    await page.locator("#i18n-bulk-reviewed").check();
    await page.locator("#i18n-bulk-submit").click();
    await page.getByText("2 traduções de pratos aprovadas.",{exact:false}).waitFor();
    assert.equal(written,1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));
    await page.close();
    process.stdout.write("Legacy/pending dish batch review "+device+" passed\n");
  }
  // Regression with a realistic list: select 100, then another 100, then 5.
  // No approval request is sent by the selection controls.
  {
    const page=await chromiumBrowser.newPage({viewport:{width:390,height:844}});
    const large=Array.from({length:205},(_,i)=>({
      ...samples[i%2],entity_id:"food-"+i,
      source_text:"Alimento "+String(i).padStart(3,"0"),
      translated_text:"Food "+String(i).padStart(3,"0"),
    }));
    let postCount=0;
    await page.route("**/api/**",async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(path==="/api/me")return route.fulfill(respond({user:{role:"admin"},csrf:"mock-csrf"}));
      if(path==="/api/v2/admin/i18n/overview")
        return route.fulfill(respond({language:"en",statuses:{...libraryStatus,pending:205},libraries}));
      if(path==="/api/v2/admin/i18n/catalog")
        return route.fulfill(respond({library:"food",total:0,page:1,page_size:25,items:[]}));
      if(path==="/api/v2/admin/i18n/batch/preview")
        return route.fulfill(respond({entity_kind:"food",status:"pending",total:205,items:large,approved:false}));
      if(path==="/api/v2/admin/i18n/batch/approve"){
        postCount++;
        return route.fulfill(respond({error:"no real writes"},409));
      }
      throw Error("Unexpected API path "+path);
    });
    await page.goto(origin+"/admin-translations.html",{waitUntil:"domcontentloaded"});
    await page.locator("#i18n-bulk-tools:not([hidden])").waitFor();
    await page.locator("#i18n-bulk-open").click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    for(const expected of [100,200,205]){
      await page.locator("#i18n-bulk-select-100").click();
      assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),expected);
      assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    }
    assert.equal(await page.locator("#i18n-bulk-select-100").isDisabled(),true);
    await page.locator("#i18n-bulk-select-all").uncheck();
    assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),0);
    await page.locator("#i18n-bulk-filter").fill("Alimento 204");
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator("#i18n-bulk-items input:checked").count(),1);
    assert.equal(await page.locator("#i18n-bulk-items input:checked").first().getAttribute("value"),"food-204");
    assert.equal(postCount,0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));
    await page.close();
  }
  // Recipe review displays all ingredients, units and steps grouped by recipe.
  // Existing picker is not used for bulk review; all data is mocked.
  for(const [device,width,height] of [["desktop",1400,900],["mobile",390,844]]){
    const page=await chromiumBrowser.newPage({viewport:{width,height}});
    const recipeRows=Array.from({length:205},(_,i)=>({
      entity_id:i<120?"recipe-A":"recipe-B",
      record_title:i<120?"Receita A":"Receita B",
      field_label:i%3===0?"Nome do ingrediente":i%3===1?"Preparacao":"Unidade",
      field_path:"steps/"+i,
      source_text:"Texto PT "+i,translated_text:"English text "+i,
      review_state:"pending",
      expected_source_hash:"a".repeat(64),expected_candidate_hash:"b".repeat(64)
    }));
    let posted=0;
    await page.route("**/api/**",async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;
      if(path==="/api/me")
        return route.fulfill(respond({user:{id:"admin",role:"admin"},csrf:"mock-csrf"}));
      if(path==="/api/v2/admin/i18n/overview")
        return route.fulfill(respond({language:"en",statuses:{...libraryStatus,pending:205},libraries}));
      if(path==="/api/v2/admin/i18n/catalog")
        return route.fulfill(respond({language:"en",library:"recipe",total:0,
          page:1,page_size:25,items:[]}));
      if(path==="/api/v2/admin/i18n/batch/preview"){
        assert.equal(url.searchParams.get("entity_kind"),"recipe");
        return route.fulfill(respond({entity_kind:"recipe",status:"pending",
          total:205,items:recipeRows,approved:false}));
      }
      if(path==="/api/v2/admin/i18n/batch/approve"){
        posted++;
        return route.fulfill(respond({error:"mock prevents writes"},409));
      }
      throw Error("Unexpected API "+request.url());
    });
    await page.goto(origin+"/admin-translations.html?entity_kind=recipe",
      {waitUntil:"domcontentloaded"});
    await page.locator("#i18n-bulk-tools:not([hidden])").waitFor();
    await page.locator("#i18n-bulk-open").click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    assert.equal(await page.locator(".i18n-bulk-recipe-group").count(),2);
    assert.equal(await page.locator(".i18n-bulk-row").count(),205);
    assert.equal(await page.locator("#i18n-bulk-select-100").isEnabled(),true);
    await page.locator(".i18n-bulk-recipe-group").first()
      .locator(".i18n-bulk-recipe-header button").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),120);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-select-all").check();
    await page.locator("#i18n-bulk-select-all").uncheck();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),0);
    await page.locator("#i18n-bulk-filter").fill("Receita B");
    assert.equal(await page.locator(".i18n-bulk-recipe-group:not([hidden])").count(),1);
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),85);
    assert.equal(await page.locator("#i18n-bulk-select-100").isDisabled(),true);
    await page.locator("#i18n-bulk-filter").fill("");
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),185);
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),205);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    assert.equal(posted,0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));
    await page.close();
    process.stdout.write("Grouped recipe batch review "+device+" passed\n");
  }
  // Supplement texts are grouped by product; approval remains an explicit action.
  for(const [device,width,height] of [["desktop",1400,900],["mobile",390,844]]){
    const page=await chromiumBrowser.newPage({viewport:{width,height}});
    const entries=Array.from({length:218},(_,i)=>({
      entity_id:i<110?"supplement-A":"supplement-B",
      record_title:i<110?"Creatina":"Eletrólitos",
      field_label:i%2===0?"Nota visível":"Prescrição · instrução de toma",
      field_path:"prescriptions/"+(i<110?i:i-110)+"/note",
      source_text:"Texto de toma "+i,translated_text:"Supplement text "+i,
      review_state:"pending",expected_source_hash:"a".repeat(64),
      expected_candidate_hash:"b".repeat(64)
    }));
    const posted=[];
    await page.route("**/api/**",async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      if(path==="/api/me")
        return route.fulfill(respond({user:{id:"admin",role:"admin"},csrf:"mock-csrf"}));
      if(path==="/api/v2/admin/i18n/overview")
        return route.fulfill(respond({language:"en",statuses:{...libraryStatus,pending:218},libraries}));
      if(path==="/api/v2/admin/i18n/catalog")
        return route.fulfill(respond({language:"en",library:"supplement",total:0,
          page:1,page_size:25,items:[]}));
      if(path==="/api/v2/admin/i18n/batch/preview"){
        assert.equal(req.method(),"GET");
        assert.equal(url.searchParams.get("entity_kind"),"supplement");
        return route.fulfill(respond({entity_kind:"supplement",
          status:"awaiting_review",total:218,items:entries,approved:false}));
      }
      if(path==="/api/v2/admin/i18n/batch/approve"){
        assert.equal(req.method(),"POST");
        assert.equal(req.headers()["x-csrf-token"],"mock-csrf");
        const payload=req.postDataJSON();
        assert.equal(payload.entity_kind,"supplement");
        assert.ok(payload.rows.length>=1&&payload.rows.length<=100);
        assert.ok(payload.rows.every(r=>r.field_path.startsWith("prescriptions/")&&
          !Object.hasOwn(r,"translated_text")&&!Object.hasOwn(r,"source_text")));
        posted.push(payload.rows.length);
        return route.fulfill(respond({approved:payload.rows.length,
          entity_kind:"supplement",status:"approved"}));
      }
      throw Error("Unexpected API "+req.url());
    });
    await page.goto(origin+"/admin-translations.html?entity_kind=supplement",
      {waitUntil:"domcontentloaded"});
    await page.locator("#i18n-bulk-tools:not([hidden])").waitFor();
    await page.locator("#i18n-bulk-open").click();
    await page.locator("#i18n-bulk-review:not([hidden])").waitFor();
    assert.match(await page.locator("#i18n-bulk-title").innerText(),/Suplementação/);
    assert.equal(await page.locator(".i18n-bulk-recipe-group").count(),2);
    assert.equal(await page.locator(".i18n-bulk-row").count(),218);
    assert.equal(posted.length,0);
    await page.locator(".i18n-bulk-recipe-group").first()
      .locator(".i18n-bulk-recipe-header button").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),110);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    await page.locator("#i18n-bulk-select-all").check();
    await page.locator("#i18n-bulk-select-all").uncheck();
    await page.locator("#i18n-bulk-filter").fill("Eletrólitos");
    assert.equal(await page.locator(".i18n-bulk-recipe-group:not([hidden])").count(),1);
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),100);
    await page.locator("#i18n-bulk-filter").fill("");
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),200);
    await page.locator("#i18n-bulk-select-100").click();
    assert.equal(await page.locator(".i18n-bulk-row input:checked").count(),218);
    assert.equal(await page.locator("#i18n-bulk-select-100").isDisabled(),true);
    assert.equal(await page.locator("#i18n-bulk-submit").isDisabled(),true);
    assert.equal(posted.length,0);
    await page.locator("#i18n-bulk-reviewed").check();
    assert.equal(await page.locator("#i18n-bulk-submit").isEnabled(),true);
    await page.locator("#i18n-bulk-submit").click();
    await page.getByText(/218 traduções de suplementos aprovadas/).waitFor();
    assert.deepEqual(posted,[100,100,18]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));
    await page.close();
    process.stdout.write("Grouped supplement batch review "+device+" passed\n");
  }
}finally{
  await chromiumBrowser.close();
}
