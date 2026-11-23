"""Synthetic-only PT/EN browser smoke: screenshots are never taken from real accounts."""
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright

BASE = os.getenv("MILE_I18N_TEST_URL", "http://127.0.0.1:8941").rstrip("/")
OUTPUT = Path("artifacts/i18n-visual")
PASSWORD = os.environ.get("MILE_I18N_VALIDATION_PASSWORD")
SIZES = {"mobile": {"width": 390, "height": 844},
         "desktop": {"width": 1280, "height": 800}}


def check(condition, message):
    if not condition:
        raise AssertionError(message)


async def authenticate(context, username):
    response = await context.request.post(
        BASE + "/api/login", data={"identifier": username, "password": PASSWORD})
    check(response.status == 200, f"Synthetic login failed for {username}: {response.status}")


async def capture(page, key):
    await page.screenshot(path=str(OUTPUT / (key + ".png")),
                          full_page=False, animations="disabled")


async def check_mode_buttons(page, scope, expected):
    buttons = page.locator(scope + " [data-view]")
    labels = [s.strip() for s in await buttons.all_text_contents()]
    check(labels == expected, f"Wrong mode labels: {labels} vs {expected}")
    check(await buttons.count() == 2, "Existing mode controls were modified")
    values = [await buttons.nth(i).get_attribute("aria-pressed") for i in range(2)]
    check(values.count("true") == 1, f"Mode selection invalid: {values}")
    # Layout checks are non-invasive: no dimension or style is ever changed.
    for i in range(2):
        b = await buttons.nth(i).bounding_box()
        check(b and b["width"] > 0 and b["height"] > 0, "Mode button clipped or missing")


async def player_case(browser, size, language):
    ctx = await browser.new_context(viewport=SIZES[size], device_scale_factor=1,
                                    locale="en-GB" if language == "en" else "pt-PT",
                                    is_mobile=size == "mobile", has_touch=size == "mobile")
    try:
        await authenticate(ctx, "mileendemo" if language == "en" else "mileptdemo")
        page = await ctx.new_page()
        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.locator("#player-panel").wait_for(state="visible", timeout=30000)
        await page.locator("#overview-loading").wait_for(state="hidden", timeout=30000)
        check(await page.locator("html").get_attribute("lang") ==
              ("en-GB" if language == "en" else "pt-PT"), "Player document language incorrect")
        await check_mode_buttons(page, "#overview-mode",
                                 ["Day", "Week"] if language == "en" else ["Dia", "Semana"])
        await capture(page, f"{size}-{language}-player-day")
        await page.locator("#overview-mode [data-view='week']").click()
        await page.locator("#weekly-view").wait_for(state="visible", timeout=30000)
        await page.locator(".weekly-day-header").first.wait_for(timeout=30000)
        week = await page.locator("#weekly-view").inner_text()
        check(("Breakfast" if language == "en" else "Peq Alm.") in week,
              "Breakfast not localised in weekly view")
        check(("Protein" if language == "en" else "Proteína") in week,
              "Nutrition labels not localised in weekly view")
        check("1,244" not in week, "kcal thousands grouping reappeared")
        await capture(page, f"{size}-{language}-player-week")
        print(f"PASS Player {size} {language} day/week, locale, ungrouped energy")
        await page.close()
    finally:
        await ctx.close()


async def chef_case(browser, size):
    ctx = await browser.new_context(viewport=SIZES[size], device_scale_factor=1,
                                    locale="en-GB", is_mobile=size == "mobile",
                                    has_touch=size == "mobile")
    try:
        await authenticate(ctx, "milechefdemo")
        page = await ctx.new_page()
        await page.goto(BASE + "/chef", wait_until="domcontentloaded")
        await page.locator("#chef-view").wait_for(state="visible", timeout=30000)
        await check_mode_buttons(page, "#chef-view-mode", ["Day", "Week"])
        check(await page.evaluate('chefDishCategoryLabel("Peixe")') == "Fish",
              "Chef category Peixe is not displayed as Fish")
        await capture(page, f"{size}-en-chef-day")
        await page.locator('#chef-view-mode [data-view="week"]').click()
        await check_mode_buttons(page, "#chef-view-mode", ["Day", "Week"])
        await page.locator(".chef-week-grid").wait_for(state="visible", timeout=30000)
        await capture(page, f"{size}-en-chef-week")
        print(f"PASS Chef {size} EN day/week, category labels")
        await page.close()
    finally:
        await ctx.close()


async def main():
    check(PASSWORD and len(PASSWORD) >= 20, "Missing synthetic validation password")
    check(os.environ.get("MILE_I18N_SYNTHETIC_DATA") == "1",
          "Browser test must run against synthetic data only")
    check(not os.environ.get("DATABASE_URL"), "Production database must not be present")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            for size in SIZES:
                for language in ("pt", "en"):
                    await player_case(browser, size, language)
                await chef_case(browser, size)
        finally:
            await browser.close()
    (OUTPUT / "summary.json").write_text(json.dumps({
        "data": "synthetic only", "roles": ["player", "chef"],
        "languages": ["pt-PT", "en-GB"], "sizes": SIZES,
        "checks": ["mode controls", "weekly headings", "kcal", "chef categories"],
        "limitation": "Does not validate production DB access or manual visual parity",
    }, indent=2), encoding="utf-8")
    print("PASS All synthetic browser views and screenshots captured")


if __name__ == "__main__":
    asyncio.run(main())
