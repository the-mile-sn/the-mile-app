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
    assert.equal(await page.locator("#i18n-stats .i18n-stat").count(), 4);
    assert.equal(await page.locator("#i18n-libraries .i18n-library").count(), 6);
    assert.match(await page.locator("#i18n-results-count").innerText(), /1 registos/);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    assert.ok(scrollWidth <= width + 2,
      name + " has horizontal overflow: " + scrollWidth + " > " + width);
    await page.locator("#i18n-results .i18n-result-english").first().waitFor();
    assert.equal(await page.locator("#i18n-results .i18n-result-translation").first().innerText(),snap.english);
    assert.equal(await page.locator("#i18n-results .i18n-result-arrow").count(),0);
    assert.equal(await page.locator("#i18n-results .i18n-inline-edit svg path").first().getAttribute("d"),"M15.5 5.5 18.5 8.5M4 20l4.3-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20Z");
    await page.getByRole("button",{name:"Editar tradução de "+snap.source,exact:true}).click();
    await page.locator("#i18n-review-dialog[open] #i18n-review:not([hidden])").waitFor();
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
    await page.locator("#i18n-target-text").fill("Grilled chicken and rice");
    await page.locator("#i18n-propose").click();
    await page.locator("#i18n-approve:not([disabled])").waitFor();
    await page.locator("#i18n-approve").click();
    await page.getByText("Tradução aprovada.", { exact: true }).waitFor();
    assert.deepEqual(snap.writes, ["propose", "approve"]);
    assert.equal(await page.locator("#i18n-history-panel summary svg path").getAttribute("d"),"m6 9 6 6 6-6");
    assert.equal(await page.locator("#i18n-review-dialog").evaluate(el=>el.scrollWidth<=el.clientWidth+3),true);
    assert.equal(snap.proposed.text,"Grilled chicken and rice");
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
    assert.equal(await page.locator("#i18n-results .i18n-result .i18n-status-pill").innerText(),
      "Vários estados", kind);
    assert.equal(await page.locator(".i18n-record-field").count(),2);
    if(["recipe","supplement"].includes(kind)){
      const toggle=page.locator(".i18n-record-toggle");
      assert.equal(await toggle.getAttribute("aria-expanded"),"false");
      assert.equal(await page.locator(".i18n-record-fields").isHidden(),true);
      await toggle.click();
      assert.equal(await toggle.getAttribute("aria-expanded"),"true");
      assert.equal(await page.locator(".i18n-record-fields").isVisible(),true);
      await toggle.click();
      assert.equal(await page.locator(".i18n-record-fields").isHidden(),true);
      await toggle.click();
    }
    assert.match(await page.locator(".i18n-record-fields").innerText(),/Reviewed/);
    await page.locator("#i18n-results .i18n-inline-edit").first().click();
    await page.locator("#i18n-fields option").nth(1).waitFor({ state: "attached" });
    assert.equal(await page.locator("#i18n-fields option").count(), 2, kind);
    assert.equal(await page.locator("#i18n-field-picker").isVisible(),true,
      "Keep field switching when a record has multiple translatable fields.");
    await page.locator("#i18n-close").click();
    await page.getByRole("button",{name:"Rever Texto adicional de "+original,exact:true}).click();
    await page.locator("#i18n-review-dialog[open] #i18n-review:not([hidden])").waitFor();
    await page.waitForFunction(text =>
      document.querySelector("#i18n-source-text")?.textContent === text, secondary);
    assert.equal(await page.locator("#i18n-source-text").innerText(), secondary);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.close();
  }

  // CSV controls are no longer exposed by the translation manager.
  {
    const page=await browser.newPage();
    await page.route("**/api/**",mockApi);
    await page.goto(origin+"/admin-translations.html?entity_kind=dish");
    await page.locator("#i18n-results .i18n-result").first().waitFor();
    assert.equal(await page.locator("#i18n-import-panel, #i18n-export, input[type=file]").count(),0);
    await page.close();
  }
  process.stdout.write("Desktop/mobile dish and grouped library mock-browser flow passed\\n");
} finally {
  await browser.close();
}
