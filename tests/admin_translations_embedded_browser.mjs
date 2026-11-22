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
const stats={language:"en",statuses:zero,libraries:[...libraries,{kind:"plan",label:"Planos alimentares publicados",integrated:true,record_count:1,field_count:1,statuses:{...zero}}]};
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
    const publicRef="a".repeat(64);
    let planApproved=false,planPending=false,planSaveRequests=0,commonApprovals=0;
    const makePlanField=()=>({field_path:"meals/0/options/0/title",
      field_label:"Título da opção",group:"Pequeno almoço · Opção 1",
      sensitive:false,source_text:"Opção 1",source_hash:"b".repeat(64),
      translated_text:planPending?"Option 1":"",
      candidate_hash:planPending?"c".repeat(64):null,
      status:planApproved?"approved":planPending?"pending":"missing",
      suggestion:planPending?null:{text:"Option 1",origin:"approved_exact_title",requires_review:true}});
    const planPublication={publication_ref:publicRef,plan_type:"Plano azul",
      player_label:"Atleta fictício",state:"published",published_at:100,
      field_count:1,linked_food_count:1,
      statuses:{missing:planPending?0:1,pending:planPending&&!planApproved?1:0,
        approved:planApproved?1:0,outdated:0}};
    await page.route("**/api/**",async route=>{
      const url=new URL(route.request().url()),path=url.pathname;
      requests.push(path);
      if(path==="/api/me"){
        await route.fulfill(fmt(authenticated?
          {user:{id:"admin",name:"Admin",role:"admin",email:"admin@example.invalid"},
           csrf:"test-csrf"}:{error:"unauthorized"},authenticated?200:401));
      }else if(path==="/api/v2/admin/i18n/overview"){
        await route.fulfill(fmt(stats));
      }else if(path==="/api/v2/admin/i18n/plans"){
        await route.fulfill(fmt({language:"en",items:[planPublication],total:1,
          reuse_audit:{published_versions:1,visible_text_fields:7,
            repeated_option_title_occurrences:2,approved_library_food_references:1,
            alternative_overrides:1,individual_notes:1,simple_unit_suggestions:1},
          scope:"published_versions_only",csv_export:false}));
      }else if(path==="/api/v2/admin/i18n/plans/common"){
        await route.fulfill(fmt({total_groups:commonApprovals?0:1,
          max_batch:100,items:commonApprovals?[]:[{
            group_id:"d".repeat(64),source_hash:"e".repeat(64),
            expected_group_hash:"f".repeat(64),field_kind:"display_quantity",
            meal_context:"",source_text:"2 un / 120 g",
            occurrences:2,missing_count:2,pending_count:0,approved_count:0,
            outdated_count:0,batch_limit:100,
            suggestion:{text:"2 units / 120 g",origin:"simple_unit_rule",
              requires_review:true}
          }]}));
      }else if(path==="/api/v2/admin/i18n/plans/common/approve"){
        const payload=route.request().postDataJSON();
        assert.equal(payload.acknowledged,true);
        assert.equal(payload.translated_text,"2 units / 120 g");
        assert.equal(route.request().headers()["x-csrf-token"],"test-csrf");
        commonApprovals++;
        await route.fulfill(fmt({approved:2,remaining:0,status:"approved",
          group_id:"d".repeat(64)}));
      }else if(path==="/api/v2/admin/i18n/plans/fields"){
        assert.equal(url.searchParams.get("publication_ref"),publicRef);
        await route.fulfill(fmt({publication:planPublication,fields:[makePlanField()],
          policy:"manual_private_review_no_csv_no_external_api"}));
      }else if(path==="/api/v2/admin/i18n/plans/propose"){
        const payload=route.request().postDataJSON();
        assert.equal(payload.publication_ref,publicRef);
        assert.equal(payload.translated_text,"Option 1");
        assert.equal(route.request().headers()["x-csrf-token"],"test-csrf");
        planPending=true;
        planSaveRequests++;
        await route.fulfill(fmt({status:"pending"},201));
      }else if(path==="/api/v2/admin/i18n/plans/approve"){
        const payload=route.request().postDataJSON();
        assert.equal(payload.expected_candidate_hash,"c".repeat(64));
        assert.equal(route.request().headers()["x-csrf-token"],"test-csrf");
        planApproved=true;
        await route.fulfill(fmt({status:"approved"}));
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
    await page.evaluate((theme)=>{
      localStorage.setItem("tm-admin-theme",theme);
      document.documentElement.dataset.adminTheme=theme;
    },name==="desktop"?"light":"dark");
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
    // Last of the principal work areas: on mobile, account actions are
    // relocated after that section by the existing mobile navigation.
    assert.equal(await nav.evaluate(el=>el.previousElementSibling?.id),
      "tm-admin-nav-appointments","Traduções must follow Agendamentos");
    assert.ok(await page.locator("#tm-i18n-library-plan").count());
    assert.ok(await page.locator("#tm-i18n-library-plan-mobile").count());
    await nav.waitFor({state:"visible",timeout:15000});
    await nav.click();
    const view=page.locator("#tm-admin-translations-page");
    await page.locator("#i18n-library-panel:not([hidden])").waitFor({timeout:15000});
    await page.locator("#i18n-results .i18n-status-pill").first().waitFor({timeout:15000});
    assert.equal(await view.getAttribute("hidden"),null);
    assert.ok((await page.locator("#i18n-work-title").textContent()).includes("Revisão"));
    assert.ok((await page.locator("#i18n-import-title").textContent()).includes("Importar"));
    assert.ok((await page.locator("#i18n-auto-title").textContent()).includes("automáticas"));
    assert.equal(await page.locator("#tm-admin-translations-page .i18n-intro").count(),0);
    assert.equal(await page.locator("#tm-admin-translations-page h1").count(),0);
    assert.equal(await view.getAttribute("aria-label"),"Central de Traduções");
    assert.equal(await page.locator("#tm-admin-translations-page .i18n-intro .i18n-eyebrow").count(),0);
    assert.equal(await page.locator("#i18n-library-panel .i18n-library small").count(),0);
    assert.equal(await page.locator("#i18n-work-help").count(),0);
    assert.equal(await page.locator("#i18n-import-panel .i18n-import-disclaimer").count(),0);
    assert.equal(await page.locator("#tm-admin-translations-page footer").count(),0);
    assert.equal(await page.locator("#i18n-auto-title").count(),1);
    assert.equal(await page.locator("#i18n-auto-title").locator("..").locator("..").locator("p").count(),0);
    const visual=await page.evaluate(()=>{
      const css=(sel)=>getComputedStyle(document.querySelector(sel));
      return {
        mainBg:css("#i18n-library-panel").backgroundColor,
        subBg:css("#i18n-libraries .i18n-library").backgroundColor,
        libraryBorder:css("#i18n-libraries .i18n-library").borderTopWidth,
        sectionBorder:css("#i18n-library-panel").borderTopWidth,
        pillFont:css(".i18n-status-pill").fontSize,
        pillWeight:css(".i18n-status-pill").fontWeight,
        pillHeight:css(".i18n-status-pill").height,
        pillRadius:css(".i18n-status-pill").borderRadius,
        csvInputOpacity:css("#i18n-import-file").opacity,
        statusCustom:!!document.querySelector("#i18n-status + .tm-select-trigger")||
          !!document.querySelector("#i18n-status ~ .tm-select-trigger"),
      };
    });
    assert.notEqual(visual.mainBg,visual.subBg,"Guide: primary card and subcard differ");
    assert.equal(visual.libraryBorder,"0px");
    assert.equal(visual.sectionBorder,"0px");
    assert.equal(visual.pillFont,"11px");
    assert.equal(visual.pillWeight,"400");
    assert.equal(visual.pillHeight,"26px");
    assert.equal(visual.pillRadius,"999px");
    assert.equal(visual.csvInputOpacity,"0");
    assert.ok(visual.statusCustom,"Translation filter must use The Mile Select");
    assert.equal(new URL(page.url()).pathname,"/admin-microcycles.html");
    assert.equal(await page.locator("#tm-dashboard").getAttribute("hidden"),"");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),
      name+" has horizontal overflow");
    const plansCard=page.locator("#i18n-libraries button").filter({hasText:"Planos alimentares publicados"});
    await plansCard.click();
    await page.locator("#i18n-plan-stage:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-import-panel").getAttribute("hidden"),"");
    assert.equal(await page.locator("#i18n-work-panel").getAttribute("hidden"),null);
    assert.equal(await page.locator("#i18n-work-panel").getAttribute("data-plan-mode"),"1");
    assert.equal(await page.locator("#i18n-work-panel #i18n-tabs button").count(),6);
    assert.equal(await page.locator("#i18n-work-title").textContent(),"Planos");
    assert.equal(await page.locator("#i18n-plan-open-library").count(),0);
    await page.locator("#i18n-plan-items .i18n-plan-item").first().waitFor();
    assert.equal(await page.locator("#i18n-plan-items .i18n-plan-item").count(),1);
    await page.locator("#i18n-plan-common-list .i18n-plan-common-item").first().waitFor();
    await page.locator("#i18n-plan-common-list .i18n-plan-common-item").first().click();
    assert.equal(await page.locator(".i18n-plan-common-detail textarea").inputValue(),
      "2 units / 120 g");
    assert.equal(await page.locator(".i18n-plan-common-detail .i18n-primary").isDisabled(),true);
    assert.equal(commonApprovals,0,"Suggestions cannot approve automatically");
    await page.locator(".i18n-plan-common-detail input[type=checkbox]").check();
    await page.locator(".i18n-plan-common-detail .i18n-primary").click();
    await page.getByText("2 ocorrências aprovadas. Grupo concluído.").waitFor();
    assert.equal(commonApprovals,1);
    await page.locator("#i18n-plan-items .i18n-plan-item").click();
    await page.locator("#i18n-plan-detail .i18n-plan-field").first().waitFor();
    assert.ok((await page.locator("#i18n-plan-detail").innerText()).includes("Opção 1"));
    assert.equal(await page.locator("#i18n-plan-detail .i18n-primary").isDisabled(),true);
    assert.match(await page.locator("#i18n-plan-audit").count().then(String),/^0$/);
    assert.equal(await page.locator("#i18n-plan-stage .i18n-plan-audit-stat").count(),6);
    assert.match(await page.locator("#i18n-plan-stage .i18n-plan-audit").innerText(),/Alternativas personalizadas/);
    await page.locator("#i18n-plan-detail .i18n-plan-suggestion button").click();
    assert.equal(planSaveRequests,0,"A suggestion must never submit or approve automatically");
    assert.equal(await page.locator("#i18n-plan-detail textarea").inputValue(),"Option 1");
    await page.locator("#i18n-plan-detail .i18n-plan-field-actions .i18n-secondary").click();
    await page.getByText("Proposta guardada. Falta aprovação.").waitFor();
    assert.equal(planPending,true);
    await page.locator("#i18n-plan-detail .i18n-plan-field-actions input").check();
    await page.locator("#i18n-plan-detail .i18n-primary").click();
    await page.getByText("Tradução aprovada.").waitFor();
    assert.equal(planApproved,true);
    assert.equal(await page.locator("#i18n-plan-stage .i18n-plan-stage-grid").count(),0);
    assert.equal(await page.locator("#i18n-library-link").textContent(),"Abrir Planos");
    assert.equal(requests.filter(p=>p.includes("/api/v2/admin/i18n/import/")).length,0);
    // The global hub still lets us return to an editable library without page navigation.
    await page.locator("#i18n-libraries button").first().click();
    await page.locator("#i18n-work-panel:not([hidden])").waitFor();
    await page.locator("#tm-admin-nav-food-library").click();
    assert.equal(await view.getAttribute("hidden"),"");
    // Geometry of the real Planos action toolbar, in both responsive layouts.
    await page.evaluate(()=>{
      document.getElementById("tm-plan-page").hidden=false;
      document.getElementById("plan-entry").hidden=false;
    });
    const gap=await page.evaluate((mobile)=>{
      const icon=document.getElementById(mobile?
        "tm-i18n-library-plan-mobile":"tm-i18n-library-plan");
      const create=document.getElementById(mobile?
        "entry-create-mobile":"entry-create");
      const a=icon.getBoundingClientRect(),b=create.getBoundingClientRect();
      const navIcon=document.querySelector("#tm-admin-nav-translations .tm-admin-nav-icon svg");
      const quickIcon=icon.querySelector("svg");
      return {
        spacing:b.left-a.right,
        aligned:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),
        visible:!!a.width&&!!a.height,
        sameGlyph:!!navIcon&&!!quickIcon&&
          [...navIcon.querySelectorAll("path")].map(p=>p.getAttribute("d")).join("|")===
          [...quickIcon.querySelectorAll("path")].map(p=>p.getAttribute("d")).join("|"),
        scrollWidth:document.documentElement.scrollWidth,
        width:innerWidth,
      };
    },name==="mobile");
    assert.ok(gap.visible,name+" plan translation icon must be visible");
    assert.ok(gap.spacing>=8&&gap.spacing<=24,name+" gap near Criar novo: "+gap.spacing);
    assert.ok(gap.aligned<=4,name+" plan icons are not vertically centred");
    assert.ok(gap.sameGlyph,name+" must reuse official translation glyph");
    assert.ok(gap.scrollWidth<=gap.width+3,name+" Planos has horizontal overflow");
    await page.close();
    process.stdout.write("Embedded admin translation navigation "+name+" passed\n");
  }
}finally{
  await browser.close();
}
