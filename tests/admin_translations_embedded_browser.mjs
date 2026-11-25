/* Browser regression: PT/EN Central must be part of the native Admin shell.
   Fake login, fake content, no connection to any production service. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
    const clinicalWrites=[];
    const editorDraft={id:"editor-draft-test",athlete_id:"athlete-test",
      player_id:"player-test",player_name:"Atleta fictício",name:"Atleta fictício - Plano azul",
      plan_type:"Plano azul",publication:{state:"published",pending_changes:false,published_at:100},
      meals:[{name:"Pequeno almoço",options:[{title:"Opção 1",foods:[],notes:[],order:[]}]}]};
    const publicRef="a".repeat(64);
    const privateRef="d".repeat(64);
    let planApproved=false,planPending=false,planSaveRequests=0,commonApprovals=0;
    let commonImported=true,importApprovals=0,importRequests=0;
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
    const privatePublication={publication_ref:privateRef,
      plan_type:"Plano amarelo",player_label:"Atleta fictício reservado",
      state:"published",published_at:100,field_count:2,linked_food_count:0,
      statuses:{missing:2,pending:0,approved:0,outdated:0}};
    const privateFields=[
      {field_path:"meals/0/options/0/foods/0/display_name",
        field_kind:"alternative_override",field_label:"Alternativa personalizada",
        group:"Almoço · Opção 1",sensitive:true,source_text:"Pão ralado",
        source_hash:"b".repeat(64),translated_text:"",
        candidate_hash:null,status:"missing",suggestion:null},
      {field_path:"meals/0/options/0/foods/1/label",
        field_kind:"supplement_label",field_label:"Suplemento · texto 2",
        group:"Almoço · Opção 1",sensitive:true,source_text:"Suplemento A",
        source_hash:"c".repeat(64),translated_text:"",
        candidate_hash:null,status:"missing",suggestion:null}
    ];
    await page.route("**/api/**",async route=>{
      const url=new URL(route.request().url()),path=url.pathname;
      requests.push(path);
      if(path==="/api/me"){
        await route.fulfill(fmt(authenticated?
          {user:{id:"admin",name:"Admin",role:"admin",email:"admin@example.invalid"},
           csrf:"test-csrf"}:{error:"unauthorized"},authenticated?200:401));
      }else if(path==="/api/v2/athletes"){
        await route.fulfill(fmt({athletes:[{id:"athlete-test",user_id:"player-test",name:"Atleta fictício"}]}));
      }else if(path==="/api/v2/food-library"){
        await route.fulfill(fmt({foods:[]}));
      }else if(path.startsWith("/api/v2/food-plan-drafts")){
        if(route.request().method()!=="GET"){
          clinicalWrites.push(path);
          await route.fulfill(fmt({error:"unexpected_write"},409));
        }else if(path==="/api/v2/food-plan-drafts"){
          await route.fulfill(fmt({drafts:[editorDraft]}));
        }else if(path==="/api/v2/food-plan-drafts/editor-draft-test"){
          await route.fulfill(fmt({draft:editorDraft}));
        }else await route.fulfill(fmt({error:"not_found"},404));
      }else if(path==="/api/v2/admin/i18n/overview"){
        await route.fulfill(fmt(stats));
      }else if(path==="/api/v2/admin/i18n/plans"){
        await route.fulfill(fmt({language:"en",
          items:[planPublication,privatePublication],total:2,
          reuse_audit:{published_versions:1,visible_text_fields:7,
            repeated_option_title_occurrences:2,approved_library_food_references:1,
            alternative_overrides:1,individual_notes:1,simple_unit_suggestions:1,
            coverage_totals:{approved:1,pending:1,missing:5,outdated:0},
            coverage_by_kind:{
              option_title:{approved:0,pending:0,missing:1,outdated:0},
              individual_note:{approved:0,pending:0,missing:1,outdated:0},
              display_quantity:{approved:1,pending:1,missing:1,outdated:0},
              alternative_override:{approved:0,pending:0,missing:1,outdated:0},
              food_override:{approved:0,pending:0,missing:0,outdated:0},
              supplement_label:{approved:0,pending:0,missing:1,outdated:0}
            }},
          scope:"published_versions_only",csv_export:false}));
      }else if(path==="/api/v2/admin/i18n/plans/recovery"){
        const ref=url.searchParams.get("publication_ref");
        assert.ok([publicRef,privateRef].includes(ref));
        const candidates=(ref===publicRef&&!planPending)?[{
          field_path:"meals/0/options/0/title",
          group:"Pequeno almoço · Opção 1",field_label:"Título da opção",
          field_kind:"option_title",sensitive:false,source_text:"Opção 1",
          translated_text:"Option 1",expected_source_hash:"b".repeat(64),
          candidate_hash:"c".repeat(64),origin:"approved_same_path"
        }]:[];
        await route.fulfill(fmt({publication_ref:ref,
          publication:ref===publicRef?planPublication:privatePublication,
          candidates,conflicts:0,policy:"explicit_admin_field_review"}));
      }else if(path==="/api/v2/admin/i18n/plans/common"){
        const unit={
          group_id:"d".repeat(64),source_hash:"e".repeat(64),
          expected_group_hash:"f".repeat(64),expected_stage_hash:"",
          field_kind:"display_quantity",meal_context:"",source_text:"2 un / 120 g",
          occurrences:2,missing_count:2,pending_count:0,approved_count:0,
          outdated_count:0,batch_limit:100,csv_eligible:true,
          imported_status:null,imported_text:null,
          suggestion:{text:"2 units / 120 g",origin:"simple_unit_rule",
            requires_review:true}
        };
        const title={
          group_id:"a".repeat(64),source_hash:"b".repeat(64),
          expected_group_hash:"c".repeat(64),
          expected_stage_hash:commonImported?"f".repeat(64):"",
          field_kind:"option_title",meal_context:"Pequeno almoço / lanche",
          source_text:"Bowl de iogurte",occurrences:2,missing_count:2,
          pending_count:0,approved_count:0,outdated_count:0,batch_limit:100,
          csv_eligible:true,
          imported_status:commonImported?"pending":null,
          imported_text:commonImported?"Yoghurt bowl":null,
          suggestion:{text:"Yoghurt bowl",origin:"approved_exact_title",
            requires_review:true}
        };
        const single={
          group_id:"9".repeat(64),source_hash:"8".repeat(64),
          expected_group_hash:"7".repeat(64),expected_stage_hash:"",
          field_kind:"option_title",meal_context:"Pequeno almoço / lanche",
          source_text:"Panquecas caseiras",occurrences:1,missing_count:1,
          pending_count:0,approved_count:0,outdated_count:0,batch_limit:100,
          csv_eligible:true,single_title_candidate:true,
          imported_status:null,imported_text:null,suggestion:null
        };
        const note={
          group_id:"6".repeat(64),source_hash:"5".repeat(64),
          expected_group_hash:"4".repeat(64),expected_stage_hash:"",
          field_kind:"individual_note",meal_context:"Pequeno almoço / lanche",
          source_text:"Podes aquecer o pão antes de servir.",
          occurrences:1,missing_count:1,pending_count:0,approved_count:0,
          outdated_count:0,batch_limit:100,csv_eligible:true,
          plan_note_candidate:true,single_title_candidate:false,
          imported_status:null,imported_text:null,suggestion:null
        };
        const quantity={
          group_id:"3".repeat(64),source_hash:"2".repeat(64),
          expected_group_hash:"1".repeat(64),expected_stage_hash:"",
          field_kind:"display_quantity",meal_context:"",
          source_text:"100 g",occurrences:3,missing_count:3,
          pending_count:0,approved_count:0,outdated_count:0,batch_limit:100,
          csv_eligible:true,quantity_candidate:true,quantity_neutral:true,
          imported_status:null,imported_text:null,
          suggestion:{text:"100 g",origin:"language_neutral_quantity",
            requires_review:true}
        };
        const food={
          group_id:"a".repeat(32)+"5".repeat(32),
          source_hash:"b".repeat(64),expected_group_hash:"c".repeat(64),
          expected_stage_hash:"",field_kind:"food_override",
          meal_context:"",source_text:"Arroz branco cozido",
          occurrences:2,missing_count:2,pending_count:0,
          approved_count:0,outdated_count:0,batch_limit:100,
          csv_eligible:true,food_override_candidate:true,
          imported_status:null,imported_text:null,
          suggestion:{text:"Cooked white rice",origin:"approved_exact_food_name",
            requires_review:true}
        };
        const items=!commonApprovals?[unit]:!importApprovals?[title]:
          [single,note,quantity,food];
        await route.fulfill(fmt({total_groups:items.length,max_batch:100,items}));
      }else if(path==="/api/v2/admin/i18n/plans/common/import"){
        const payload=route.request().postDataJSON();
        assert.equal(route.request().headers()["x-csrf-token"],"test-csrf");
        assert.equal(payload.rows.length,1);
        assert.equal(payload.rows[0].group_id,"a".repeat(64));
        assert.equal(payload.rows[0].translated_text,"Yoghurt bowl");
        assert.equal(payload.rows[0].expected_stage_hash,"");
        commonImported=true;importRequests++;
        await route.fulfill(fmt({imported:1,unchanged:0,approved:0,status:"pending"},201));
      }else if(path==="/api/v2/admin/i18n/plans/common/approve"){
        const payload=route.request().postDataJSON();
        assert.equal(payload.acknowledged,true);
        assert.equal(route.request().headers()["x-csrf-token"],"test-csrf");
        if(payload.group_id==="d".repeat(64)){
          assert.equal(payload.translated_text,"2 units / 120 g");
          commonApprovals++;
        }else{
          assert.equal(payload.group_id,"a".repeat(64));
          assert.equal(payload.translated_text,"Yoghurt bowl");
          assert.equal(commonImported,true);
          importApprovals++;
        }
        await route.fulfill(fmt({approved:2,remaining:0,status:"approved",
          group_id:payload.group_id}));
      }else if(path==="/api/v2/admin/i18n/plans/preview"){
        assert.equal(url.searchParams.get("draft_id"),editorDraft.id);
        const meals=JSON.parse(JSON.stringify(editorDraft.meals));
        meals[0].options[0].title="Option 1";
        await route.fulfill(fmt({draft_id:editorDraft.id,publication_ref:publicRef,plan_type:editorDraft.plan_type,source_meals:editorDraft.meals,meals,food_names:{}}));
      }else if(path==="/api/v2/admin/i18n/plans/fields"){
        const draft=url.searchParams.get("draft_id");
        if(draft)assert.equal(draft,"editor-draft-test");
        const ref=draft?publicRef:url.searchParams.get("publication_ref");
        assert.ok([publicRef,privateRef].includes(ref));
        await route.fulfill(fmt({
          publication:ref===publicRef?planPublication:privatePublication,
          fields:ref===publicRef?[makePlanField()]:privateFields,
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
    assert.equal(await page.locator("#i18n-work-title").textContent(),"Alimentos");
    assert.equal(await page.locator("#i18n-libraries progress").count(),6);
    assert.equal(await page.locator("#i18n-import-panel").count(),0);
    assert.equal(await page.locator("#i18n-auto-title").count(),0);
    assert.equal(await page.locator("#tm-admin-translations-page .i18n-intro").count(),0);
    assert.equal(await page.locator("#tm-admin-translations-page h1").count(),0);
    assert.equal(await view.getAttribute("aria-label"),"Central de Traduções");
    assert.equal(await page.locator("#tm-admin-translations-page .i18n-intro .i18n-eyebrow").count(),0);
    assert.equal(await page.locator("#i18n-library-panel .i18n-library small").count(),0);
    assert.equal(await page.locator("#i18n-work-help").count(),0);
    assert.equal(await page.locator("#i18n-import-panel .i18n-import-disclaimer").count(),0);
    assert.equal(await page.locator("#tm-admin-translations-page footer").count(),0);
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
    assert.ok(visual.statusCustom,"Translation filter must use The Mile Select");
    assert.equal(new URL(page.url()).pathname,"/admin-microcycles.html");
    assert.equal(await page.locator("#tm-dashboard").getAttribute("hidden"),"");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),
      name+" has horizontal overflow");
    const plansCard=page.locator("#i18n-libraries button").filter({hasText:"Planos"});
    await plansCard.click();
    await page.locator("#i18n-plan-stage:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-import-panel").count(),0);
    assert.equal(await page.locator("#i18n-work-panel").getAttribute("hidden"),null);
    assert.equal(await page.locator("#i18n-work-panel").getAttribute("data-plan-mode"),"1");
    assert.equal(await page.locator("#i18n-tabs").count(),0);
    assert.equal(await page.locator("#i18n-libraries button[aria-pressed=true]").count(),1);
    assert.equal(await page.locator("#i18n-work-title").textContent(),"Planos");
    assert.equal(await page.locator("#i18n-plan-open-library").count(),0);
    const coverage=page.locator(".i18n-plan-audit");
    await coverage.locator(".i18n-plan-coverage-table").waitFor();
    assert.equal(await coverage.locator(".i18n-plan-coverage-stat").count(),4);
    assert.match(await coverage.locator(".i18n-plan-coverage-intro").first().innerText(),
      /Total: 7 campos próprios/);
    assert.match(await coverage.locator(".i18n-plan-coverage-table").innerText(),
      /Notas de consumo dos planos/);
    assert.match(await coverage.locator(".i18n-plan-coverage-table").innerText(),
      /Textos de suplementos/);
    assert.equal(await coverage.locator(".i18n-plan-coverage-table tbody tr").count(),7);
    assert.equal(await coverage.locator(".i18n-plan-reuse-details").isVisible(),true);
    assert.equal(await coverage.locator(".i18n-plan-coverage-head button").isEnabled(),true);
    await coverage.locator(".i18n-plan-coverage-head button").click();
    await coverage.locator(".i18n-plan-coverage-table").waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));
    await page.locator("#i18n-plan-items .i18n-plan-item").first().waitFor();
    assert.equal(await page.locator("#i18n-plan-items .i18n-plan-item").count(),2);
    await page.locator(".i18n-plan-common-list .i18n-plan-common-item").first().waitFor();
    await page.locator(".i18n-plan-common-list .i18n-plan-common-item").first().click();
    assert.equal(await page.locator(".i18n-plan-common-detail textarea").inputValue(),
      "2 units / 120 g");
    assert.equal(await page.locator(".i18n-plan-common-detail .i18n-primary").isDisabled(),true);
    assert.equal(commonApprovals,0,"Suggestions cannot approve automatically");
    await page.locator(".i18n-plan-common-detail input[type=checkbox]").check();
    await page.locator(".i18n-plan-common-detail .i18n-primary").click();
    await page.getByText("2 ocorrências aprovadas. Grupo concluído.").waitFor();
    assert.equal(commonApprovals,1);
    await page.locator(".i18n-plan-common-list .i18n-plan-common-item").first().waitFor();
    assert.equal(await page.locator("#i18n-plan-stage input[type=file], .i18n-plan-csv-tools").count(),0);
    assert.equal(importRequests,0);
    const approval=page.locator(".i18n-plan-bulk-approval");
    const approvalButton=approval.locator("button.i18n-primary");
    assert.equal(await approval.locator("strong").innerText(),"Aprovação em massa");
    assert.match(await approval.locator(".i18n-plan-bulk-count").innerText(),
      /1 expressões guardadas prontas/);
    assert.match(await approvalButton.innerText(),/Aprovar em massa/);
    assert.equal(await approvalButton.isDisabled(),true,
      "Approval must require explicit review acknowledgement");
    assert.match(await approval.locator(".i18n-plan-bulk-hint").innerText(),
      /Assinala a confirmação/);
    await approval.locator(".i18n-bulk-attestation input").check();
    assert.equal(await approvalButton.isEnabled(),true);
    await approvalButton.click();
    await page.getByText(/Aprovadas 2 ocorrências de 1 expressões/).waitFor();
    assert.equal(importApprovals,1);
    for(const source of ["Panquecas caseiras","Podes aquecer o pão","100 g","Arroz branco cozido"]){
      await page.locator(".i18n-plan-common-item").filter({hasText:source}).click();
      assert.match(await page.locator(".i18n-plan-common-detail .i18n-plan-pt").innerText(),new RegExp(source));
      assert.equal(await page.locator(".i18n-plan-common-detail .i18n-primary").isDisabled(),true);
    }
    assert.equal(importRequests,0);
    const privateQueue=page.locator(".i18n-plan-private-queue");
    await privateQueue.locator("button").waitFor();
    assert.match(await privateQueue.locator("button").innerText(),
      /Abrir revisão privada · 2 textos/);
    assert.equal(await privateQueue.locator(".i18n-plan-field").count(),0,
      "Private texts should load only after the administrator opens the queue");
    const proposalsBefore=planSaveRequests;
    await privateQueue.locator("button").click();
    await privateQueue.locator(".i18n-plan-field").first().waitFor();
    assert.equal(await privateQueue.locator(".i18n-plan-field").count(),2);
    assert.match(await privateQueue.innerText(),/Alternativa personalizada/);
    assert.match(await privateQueue.innerText(),/Suplemento · texto 2/);
    assert.equal(await privateQueue.locator(".i18n-plan-field-actions .i18n-primary")
      .first().isDisabled(),true);
    assert.equal(planSaveRequests,proposalsBefore,
      "Opening the final queue must not save or approve anything");
    assert.equal(await privateQueue.locator("a[download]").count(),0);
    assert.equal(await privateQueue.locator('input[type="file"]').count(),0);
    await page.locator("#i18n-plan-items .i18n-plan-item").first().click();
    await page.locator("#i18n-plan-detail .i18n-plan-field").first().waitFor();
    assert.ok((await page.locator("#i18n-plan-detail").innerText()).includes("Opção 1"));
    const recovery=page.locator("#i18n-plan-detail .i18n-plan-option").first();
    assert.match(await recovery.innerText(),/Recuperar traduções já aprovadas/);
    assert.match(await recovery.innerText(),/Option 1/);
    assert.equal(await recovery.locator("button.i18n-primary").isDisabled(),true,
      "Historical approvals require explicit review");
    assert.equal(await page.locator("#i18n-plan-detail .i18n-plan-field-actions .i18n-primary").isDisabled(),true);
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
    await page.locator("#i18n-plan-detail .i18n-plan-field-actions .i18n-primary").click();
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
    // Toggle the same published preview, preserving expansion and clinical writes.
    await page.locator("#tm-admin-nav-create-plan").click();
    await page.locator("[data-plan-open-id='editor-draft-test']:visible").first().click({position:{x:10,y:10}});
    const preview=page.locator("#plan-preview");
    await preview.waitFor({state:"visible"});
    await preview.locator(".plan-preview-meal > summary").click();
    const toggle=preview.locator("#tm-plan-preview-language");
    assert.equal(await toggle.locator("span").textContent(),"EN");
    await toggle.click();
    await preview.getByText("Breakfast",{exact:true}).waitFor();
    assert.equal(await preview.locator(".plan-preview-option-heading strong").first().textContent(),"Option 1");
    assert.equal(await toggle.getAttribute("aria-pressed"),"true");
    assert.equal(await toggle.locator("span").textContent(),"PT");
    assert.equal(await preview.locator(".plan-preview-meal").first().getAttribute("open"),"");
    await toggle.click();
    await preview.getByText("Pequeno almoço",{exact:true}).waitFor();
    assert.equal(await preview.locator(".plan-preview-option-heading strong").first().textContent(),"Opção 1");
    assert.equal(await toggle.getAttribute("aria-pressed"),"false");
    assert.equal(await toggle.locator("span").textContent(),"EN");
    // The existing desktop header replaces the lower back button; mobile keeps its own.
    await page.locator('#tm-dashboard-return-button:visible, #plan-preview #preview-back:visible').first().click();
    await page.locator("#plan-entry").waitFor({state:"visible"});
    assert.equal(await preview.isVisible(),false);
    assert.deepEqual(clinicalWrites,[]);
    // Exercise the actual editor with a published fixture and an unsaved title.
    const edit=page.locator("[data-edit-id='editor-draft-test']:visible").first();
    await edit.waitFor();
    await edit.click();
    const planEditor=page.locator("#tm-plan-page #plan-editor");
    await planEditor.waitFor({state:"visible"});
    await planEditor.locator("[data-toggle='0']").click();
    const clinicalTitle=planEditor.locator("[data-option-title]");
    await clinicalTitle.fill("Título clínico por guardar");
    assert.equal(await page.locator("#plan-state-chip").getAttribute("data-state"),"dirty");
    assert.equal(await page.evaluate(()=>window.tmCurrentPlanTranslationDraft()),"editor-draft-test");
    const editorButton=page.locator("#tm-plan-editor-translation");
    await editorButton.waitFor({state:"visible"});
    const savesBefore=planSaveRequests;
    await editorButton.click();
    const dialog=page.locator("#tm-plan-translation-dialog");
    await dialog.locator(".i18n-plan-field").waitFor();
    assert.match(await dialog.innerText(),/Atleta fictício/);
    assert.equal(await dialog.locator("textarea").inputValue(),"Option 1");
    assert.equal(await dialog.getByRole("button",{name:"Guardar e aprovar",exact:true}).isDisabled(),true);
    assert.equal(await dialog.getByText("Revisei esta tradução").count(),0);
    assert.equal(await dialog.locator("summary > svg path").first().getAttribute("d"),"m6 9 6 6 6-6");
    assert.equal(await dialog.locator('[data-status="approved"] svg path').first().getAttribute("d"),"M5 12l4 4L19 6");
    assert.equal(await dialog.locator(".tm-plan-review-footer").evaluate(el=>getComputedStyle(el).justifyContent),"flex-end");
    assert.equal(await dialog.locator("input[type=file]").count(),0);
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+3),true);
    await dialog.getByRole("button",{name:"Fechar",exact:true}).click();
    await dialog.waitFor({state:"detached"});
    assert.equal(await page.locator("#plan-editor").isVisible(),true);
    assert.equal(await clinicalTitle.inputValue(),"Título clínico por guardar");
    assert.equal(await page.locator("#plan-state-chip").getAttribute("data-state"),"dirty");
    assert.deepEqual(clinicalWrites,[],"Review must not write or publish a clinical draft");
    assert.equal(planSaveRequests,savesBefore,"Opening and closing must not save translations");
    await page.close();
    process.stdout.write("Embedded admin translation navigation "+name+" passed\n");
  }
}finally{
  await browser.close();
}
