/* Mock-data browser QA for the standalone Backoffice translations page.
   It never contacts production, and it does not approve real translations. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:8765";
const browser = await chromium.launch({ headless: true });
const snap = {
  source: "Frango com arroz",
  english: "Chicken and rice",
  status: "legacy_review",
  proposed: null,
  writes: []
};
const fmt = ({ body = {}, status = 200 } = {}) => ({
  status, contentType: "application/json", body: JSON.stringify(body)
});
const stats = {
  language: "en",
  statuses: { missing: 700, legacy_review: 276, pending: 0,
              approved: 0, outdated: 0 },
  libraries: [
    { kind: "food", label: "Alimentos", integrated: true,
      record_count: 700, field_count: 700,
      statuses: { missing: 700, legacy_review: 0, pending: 0,
                  approved: 0, outdated: 0 } },
    { kind: "dish", label: "Pratos", integrated: true,
      record_count: 277, field_count: 277,
      statuses: { missing: 1, legacy_review: 276, pending: 0,
                  approved: 0, outdated: 0 } },
    ...[
      ["recipe", "Receitas"],
      ["recipe_category", "Categorias de receitas"],
      ["supplement", "Suplementos"],
      ["plan", "Planos alimentares publicados"],
    ].map(([kind, label]) => ({
      kind, label, integrated: false, record_count: null,
      field_count: null, statuses: null,
    }))
  ],
};
const catalog = (query) => ({
  library: query.get("entity_kind"),
  page: 1, page_size: 25,
  total: query.get("entity_kind") === "dish" ? 1 : 0,
  items: query.get("entity_kind") === "dish" ?
    [{
      entity_kind: "dish", entity_id: "dish1", field_path: "name_pt",
      fields: [{ field_path: "name_pt", field_label: "Nome do prato", state: snap.status,
        source_text: snap.source, legacy_candidate: snap.status === "legacy_review" ? snap.english : "" }],
      source_text: snap.source, category: "Carne", state: snap.status,
      translation_text: snap.proposed?.text || "",
      legacy_candidate: snap.status === "legacy_review" ? snap.english : "",
    }] : [],
});
const detail = () => ({
  entity_kind: "dish", entity_id: "dish1", field_path: "name_pt",
  language: "en", source_text: snap.source, source_hash: "original-version",
  candidate: snap.proposed && {
    text: snap.proposed.text, status: snap.status,
    candidate_hash: "proposed-version", source_hash: "original-version",
    updated_at: 1, approved_at: null, updated_by: "admin",
  },
  effective: { text: snap.status === "approved" ? snap.english : snap.source,
               language: snap.status === "approved" ? "en" : "pt",
               status: snap.status },
});

async function mockApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  let response;
  if (path === "/api/me") {
    response = { user: { id: "test-admin", role: "admin" }, csrf: "test-csrf" };
  } else if (path === "/api/v2/admin/i18n/overview") {
    response = stats;
  } else if (path === "/api/v2/admin/i18n/catalog") {
    response = catalog(url.searchParams);
  } else if (path === "/api/v2/admin/i18n/history") {
    response = { history: [] };
  } else if (path === "/api/v2/admin/i18n") {
    response = detail();
  } else if (path === "/api/v2/admin/i18n/propose") {
    assert.equal(req.headers()["x-csrf-token"], "test-csrf");
    const body = req.postDataJSON();
    assert.equal(body.entity_id, "dish1");
    assert.equal(body.expected_source_hash, "original-version");
    snap.writes.push("propose");
    snap.proposed = { text: body.translated_text };
    snap.status = "pending";
    response = { status: "pending" };
  } else if (path === "/api/v2/admin/i18n/approve") {
    const body = req.postDataJSON();
    assert.equal(body.expected_candidate_hash, "proposed-version");
    assert.equal(body.expected_source_hash, "original-version");
    snap.writes.push("approve");
    snap.status = "approved";
    response = { status: "approved" };
  } else {
    throw Error("Unexpected URL: " + req.url());
  }
  await route.fulfill(fmt({ body: response }));
}

try {
  for (const [name, width, height] of [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
  ]) {
    snap.status = "legacy_review";
    snap.proposed = null;
    snap.writes = [];
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route("**/api/**", mockApi);
    await page.goto(origin + "/admin-translations.html?entity_kind=dish", {
      waitUntil: "domcontentloaded",
    });
    await page.locator("#i18n-work-panel:not([hidden])").waitFor();
    assert.equal(await page.locator("#i18n-stats .i18n-stat").count(), 5);
    assert.equal(await page.locator("#i18n-libraries .i18n-library").count(), 6);
    assert.match(await page.locator("#i18n-results-count").innerText(), /1 registos/);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    assert.ok(scrollWidth <= width + 2,
      name + " has horizontal overflow: " + scrollWidth + " > " + width);
    await page.locator("#i18n-results .i18n-result-english").first().waitFor();
    assert.equal(await page.locator("#i18n-results .i18n-result-translation").first().innerText(),snap.english);
    await page.locator("#i18n-results .i18n-result").first().click();
    await page.locator("#i18n-review:not([hidden])").waitFor();
    await page.waitForFunction(
      () => document.querySelector("#i18n-source-text")?.textContent === "Frango com arroz",
    );
    assert.equal(await page.locator("#i18n-source-text").innerText(),
      snap.source);
    assert.equal(await page.locator("#i18n-approve").isDisabled(), true);
    assert.equal(await page.locator("#i18n-fields option").count(), 1);
    assert.equal(await page.locator("#i18n-field-picker").isHidden(),true,
      "Do not display a one-option field selector.");
    await page.waitForFunction(
      () => document.querySelector("#i18n-target-text")?.value === "Chicken and rice",
    );
    assert.equal(await page.locator("#i18n-target-text").inputValue(),
      snap.english);
    await page.locator("#i18n-propose").click();
    await page.locator("#i18n-approve:not([disabled])").waitFor();
    await page.locator("#i18n-approve").click();
    await page.getByText("Tradução aprovada.", { exact: true }).waitFor();
    assert.deepEqual(snap.writes, ["propose", "approve"]);
    assert.equal(await page.locator("#i18n-results .i18n-status-pill").first().innerText(), "Aprovada");
    await page.screenshot({
      path: "/tmp/backoffice-translations-" + name + "-MOCK.png",
      fullPage: true,
    });
    await page.close();
  }
  // A grouped record can contain fields with different review states.
  // Validate all newly integrated libraries without touching real content.
  for (const [kind, label, original, secondary] of [
    ["recipe", "Receitas", "Arroz cozido", "Cozer em água"],
    ["recipe_category", "Categorias de receitas", "Refeições", "Categoria"],
    ["supplement", "Suplementação", "Creatina", "Após o almoço"],
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const fields = [
      { field_path: "name", field_label: "Nome", source_text: original,
        state: "approved", legacy_candidate: "", translation_text: "Reviewed" },
      { field_path: "note", field_label: "Texto adicional", source_text: secondary,
        state: "missing", legacy_candidate: "", translation_text: "" },
    ];
    const entry = {
      entity_kind: kind, entity_id: "mock-record", field_path: "name",
      source_text: original, category: label, fields, state: "approved",
      translation_text: "Reviewed", legacy_candidate: "",
    };
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const selected = fields.find(f => f.field_path === url.searchParams.get("field_path")) || fields[0];
      let body;
      if (url.pathname === "/api/me") {
        body = { user: { id: "test-admin", role: "admin" }, csrf: "test-csrf" };
      } else if (url.pathname === "/api/v2/admin/i18n/overview") {
        body = { ...stats, libraries: stats.libraries.map(item =>
          item.kind === kind ? { ...item, integrated: true, record_count: 1,
            field_count: 2, statuses: { missing: 1, legacy_review: 0,
              pending: 0, approved: 1, outdated: 0 } } : item) };
      } else if (url.pathname === "/api/v2/admin/i18n/catalog") {
        body = { library: kind, page: 1, page_size: 25, total: 1, items: [entry] };
      } else if (url.pathname === "/api/v2/admin/i18n/history") {
        body = { history: [] };
      } else if (url.pathname === "/api/v2/admin/i18n") {
        body = { entity_kind: kind, entity_id: "mock-record", field_path: selected.field_path,
          language: "en", source_text: selected.source_text, source_hash: "mock-source",
          candidate: null, effective: { text: selected.source_text, language: "pt" } };
      } else {
        throw Error("Unexpected mock URL " + url.pathname);
      }
      await route.fulfill(fmt({ body }));
    });
    await page.goto(origin + "/admin-translations.html?entity_kind=" + kind,
      { waitUntil: "domcontentloaded" });
    await page.locator("#i18n-results .i18n-result").first().waitFor();
    assert.equal(await page.locator("#i18n-results .i18n-status-pill").innerText(),
      "Vários estados", kind);
    await page.locator("#i18n-results .i18n-result").first().click();
    await page.locator("#i18n-fields option").nth(1).waitFor({ state: "attached" });
    assert.equal(await page.locator("#i18n-fields option").count(), 2, kind);
    assert.equal(await page.locator("#i18n-field-picker").isVisible(),true,
      "Keep field switching when a record has multiple translatable fields.");
    await page.locator("#i18n-fields").selectOption("note");
    await page.waitForFunction(text =>
      document.querySelector("#i18n-source-text")?.textContent === text, secondary);
    assert.equal(await page.locator("#i18n-source-text").innerText(), secondary);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.close();
  }

  // API-free import is opt-in and never approves anything.
  {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const writes=[];
    const entry={
      entity_kind:"food",entity_id:"food-oats",field_path:"display_name",
      source_text:"Aveia",category:"Cereais",state:"missing",
      fields:[{field_path:"display_name",field_label:"Nome do alimento",
               source_text:"Aveia",state:"missing",legacy_candidate:""}]
    };
    await page.route("**/api/**",async route=>{
      const request=route.request();
      const url=new URL(request.url());
      let body;
      if(url.pathname==="/api/me"){
        body={user:{id:"admin",role:"admin"},csrf:"mock-csrf"};
      }else if(url.pathname==="/api/v2/admin/i18n/overview"){
        body=stats;
      }else if(url.pathname==="/api/v2/admin/i18n/catalog"){
        body={library:"food",page:1,page_size:25,total:1,items:[entry]};
      }else if(url.pathname==="/api/v2/admin/i18n/import/preview"){
        assert.equal(request.headers()["x-csrf-token"],"mock-csrf");
        writes.push("preview");
        assert.equal(request.postDataJSON().rows[0].source_text,"Aveia");
        body={eligible:1,rejected:0,errors:[],saved:false,approved:false};
      }else if(url.pathname==="/api/v2/admin/i18n/import/submit"){
        assert.equal(request.headers()["x-csrf-token"],"mock-csrf");
        writes.push("submit");
        body={imported:1,status:"pending",approved:false};
      }else if(url.pathname==="/api/v2/admin/i18n/propose" ||
                url.pathname==="/api/v2/admin/i18n/approve"){
        writes.push("unexpected");
        throw Error("CSV import must never approve translations");
      }else{
        throw Error("Unexpected import mock URL "+url.pathname);
      }
      await route.fulfill(fmt({body}));
    });
    await page.goto(origin+"/admin-translations.html?entity_kind=food",
      {waitUntil:"domcontentloaded"});
    await page.locator("#i18n-work-panel:not([hidden])").waitFor();
    const downloadPromise=page.waitForEvent("download");
    await page.locator("#i18n-export").click();
    const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/the-mile-traducoes-food[.]csv/);
    const csv="entity_kind;entity_id;field_path;source_text;translated_text\n"+
      "food;food-oats;display_name;Aveia;Oats\n";
    await page.locator("#i18n-import-file").setInputFiles({
      name:"translations.csv",mimeType:"text/csv",buffer:Buffer.from(csv)
    });
    await page.locator("#i18n-import-check").click();
    await page.locator("#i18n-import-commit:not([disabled])").waitFor();
    assert.deepEqual(writes,["preview"]);
    await page.locator("#i18n-import-commit").click();
    await page.getByText(/1 propostas importadas e pendentes de aprovação/).waitFor();
    assert.deepEqual(writes,["preview","submit"]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await page.close();
  }
  process.stdout.write("Desktop/mobile dish and grouped library mock-browser flow passed\\n");
} finally {
  await browser.close();
}
