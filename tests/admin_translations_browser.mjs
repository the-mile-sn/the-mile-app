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
    assert.match(await page.locator("#i18n-results-count").innerText(), /1 campos/);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    assert.ok(scrollWidth <= width + 2,
      name + " has horizontal overflow: " + scrollWidth + " > " + width);
    await page.locator("#i18n-results .i18n-result").first().click();
    await page.locator("#i18n-review:not([hidden])").waitFor();
    await page.waitForFunction(
      () => document.querySelector("#i18n-source-text")?.textContent === "Frango com arroz",
    );
    assert.equal(await page.locator("#i18n-source-text").innerText(),
      snap.source);
    assert.equal(await page.locator("#i18n-approve").isDisabled(), true);
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
    await page.screenshot({
      path: "/tmp/backoffice-translations-" + name + "-MOCK.png",
      fullPage: true,
    });
    await page.close();
  }
  process.stdout.write("Desktop/mobile mock-browser flow passed\n");
} finally {
  await browser.close();
}
