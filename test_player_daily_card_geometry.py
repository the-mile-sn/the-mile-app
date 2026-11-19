"""Read-only guardrails for the approved player daily-card geometry.

Checks source contracts only, not Safari/iPhone pixel rendering.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent
CSS = (ROOT / "static" / "jogador-v2.css").read_text(encoding="utf-8")
JS = (ROOT / "static" / "jogador-v2.js").read_text(encoding="utf-8")
GUIDE = (ROOT / "docs" / "GUIA_VISUAL_APP_JOGADORES.md").read_text(encoding="utf-8")


def declarations(selector):
    escaped = re.escape(selector)
    return re.findall(r"(?m)^" + escaped + r"\s*\{([^{}]*)\}", CSS)


class DailyCardGeometryTests(unittest.TestCase):
    def test_meal_reference_remains_61_closed_55_open(self):
        self.assertIn(".daily-meal:not([open])", CSS)
        self.assertIn("height:61px!important", CSS)
        self.assertIn(".daily-meal[open]>.daily-meal-head{height:55px", CSS)
        self.assertIn("padding:12px 17px 6px", CSS)

    def test_weight_title_matches_the_meal_title_column(self):
        rules = declarations(".daily-weight-header")
        self.assertEqual(len(rules), 1)
        self.assertIn("height:61px", rules[0])
        self.assertIn("padding-block:9px", rules[0])
        self.assertIn("daily-weight-header tm-day-header", JS)
        self.assertIn("daily-weight-icon tm-day-icon", JS)
        self.assertNotIn(".daily-weight-icon{width:40px;height:40px", CSS)
        self.assertIn(".daily-weight-card:has(.daily-weight-panel:not([hidden]))", CSS)

    def test_post_match_header_is_single_normative_family(self):
        base = declarations("#overview #day-details .post-match-inline")
        header = declarations("#overview #day-details .post-match-inline-trigger")
        self.assertEqual([len(x) for x in (base, header)], [1, 1])
        self.assertIn("min-height:61px", base[0])
        self.assertIn("border-radius:13px", base[0])
        self.assertIn("background:#303135", base[0])
        self.assertIn("height:61px", header[0])
        self.assertIn("padding-top:12px", header[0])
        self.assertIn("post-match-inline-icon tm-day-icon", JS)
        self.assertIn("post-match-inline-title tm-day-title", JS)
        self.assertIn(".post-match-inline-form:not([hidden]))", CSS)
        self.assertIn("border-radius:18px", CSS)
        self.assertNotIn("post-match-inline-trigger>span:nth-child(2)", CSS)

    def test_approved_icon_and_pencil_only_interaction_are_preserved(self):
        self.assertIn('icon.append(mealIcon("football-pitch"))', JS)
        self.assertIn('title.className="post-match-inline-title tm-day-title"', JS)
        self.assertIn("button.disabled=true", JS)
        self.assertIn("action.onclick=()=>", JS)
        self.assertIn('const steps=["Participação e bem-estar","Alimentação","Suplementação"]', JS)
        self.assertIn("Por preencher", JS)
        self.assertIn("Preenchido", JS)

    def test_shared_icon_and_typography_contract(self):
        for prop in ("--day-icon-box:37px", "--day-icon-glyph:24px",
                     "--day-icon-radius:11px", "--day-header-inset:17px",
                     "--day-header-gap:8px", "--day-icon-space:10px",
                     "--day-title-size:16px", "--day-title-weight:500",
                     "--day-kcal-size:11px", "--day-kcal-weight:500"):
            self.assertEqual(CSS.count(prop), 1, prop)
        for cls in ("tm-day-header", "tm-day-icon", "tm-day-title"):
            self.assertIn(cls, CSS)
            self.assertIn(cls, JS)
        for key in ("meal-leading-icon tm-day-icon", "daily-weight-icon tm-day-icon",
                    "post-match-inline-icon tm-day-icon",
                    "meal-leading-icon supplement-leading-icon tm-day-icon"):
            self.assertIn(key, JS)
        self.assertIn('mealIcon("football")', JS)
        self.assertIn('mealIcon("football-pitch")', JS)
        self.assertIn('"soft-drink-01"', JS)
        self.assertIn(".tm-day-header .meal-average-inline .macro>.kcal", CSS)
        self.assertNotIn("#overview #day-details .daily-meal>.daily-meal-head>strong,", CSS)
        self.assertNotIn("font-weight:400!important;color:rgba(255,255,255,.85)", CSS)
        self.assertNotRegex(CSS, r"(?s)#overview #day-details \.peri-meal[^{}]*\{[^{}]*translateX")

    def test_day_right_edge_alignment_contract(self):
        self.assertEqual(CSS.count("--day-chevron-size:9px"), 1)
        self.assertEqual(CSS.count("--post-match-edit-inset:7px"), 1)
        self.assertIn("width:var(--day-chevron-size,9px)!important;height:var(--day-chevron-size,9px)!important", CSS)
        base = declarations(".daily-weight-header .daily-weight-action")
        self.assertEqual(len(base), 1)
        self.assertIn("width:32px;height:32px", base[0])
        self.assertIn("margin:0 -11.5px 0 0", base[0])
        chevron = declarations(".daily-weight-header .daily-weight-chevron-action::after")
        self.assertEqual(len(chevron), 1)
        self.assertIn("width:var(--day-chevron-size,9px)", chevron[0])
        self.assertIn("height:var(--day-chevron-size,9px)", chevron[0])
        self.assertNotIn(".daily-weight-action{width:41px", CSS)
        self.assertNotIn(".daily-weight-action{width:31px", CSS)
        self.assertNotIn("#overview .daily-weight-action[aria-controls]", CSS)
        self.assertNotIn("#overview .daily-weight-header .daily-weight-chevron-action{", CSS)
        event = declarations("#overview #day-details .daily-event-card")
        self.assertEqual(len(event), 1)
        self.assertNotIn("padding-right:", event[0])
        postmatch = declarations("#overview #day-details .post-match-edit")
        self.assertEqual(len(postmatch), 1)
        self.assertIn("margin:0 calc(10px + var(--post-match-edit-inset)) 0 3px", postmatch[0])
        self.assertIn("Alinhamento direito", GUIDE)
        self.assertIn("7 px para a direita", GUIDE)

    def test_change_color_buttons_use_shared_hue_matched_text(self):
        base = declarations("#overview .consumption-editor .consumption-color-option")
        self.assertEqual(len(base), 1)
        self.assertIn("color:var(--consumption-option-ink,#18231d)!important", base[0])
        for key, background, ink in (
            ("orange", "#e6ad7d", "#763500"),
            ("yellow", "#e5c66b", "#614800"),
            ("blue", "#a4c9e9", "#174F7B"),
            ("green", "#a8dfc1", "#175E39"),
            ("red", "#e9a6a3", "#78242A"),
            ("vp", "var(--meal-vp)", "var(--meal-vp-text)"),
        ):
            with self.subTest(color=key):
                rules = declarations("#overview .consumption-editor .consumption-color-" + key)
                self.assertEqual(len(rules), 1)
                self.assertIn("background:" + background + "!important", rules[0])
                self.assertIn("--consumption-option-ink:" + ink, rules[0])
        self.assertIn("--meal-vp:#10251A", CSS)
        self.assertIn("--meal-vp-text:#4E996B", CSS)
        self.assertIn("Alterar cor", GUIDE)
        self.assertIn("#A8DFC1", GUIDE)

    def test_registered_actions_and_universal_food_search(self):
        from pathlib import Path
        sheet=(Path(__file__).resolve().parent/"static"/"player-consumption.css").read_text(encoding="utf-8")
        self.assertIn("function makeRecordedConsumptionTags(", JS)
        self.assertEqual(JS.count("makeRecordedConsumptionTags({"), 4)
        self.assertIn("consumptionActionLabel(edit,'Edit02Icon',' Editar')", JS)
        self.assertIn("consumptionActionLabel(undo,'UndoIcon',' Anular')", JS)
        self.assertIn("JSON.stringify({date,meal,event_id:eventId})", JS)
        self.assertIn("if(optionCard&&options.length===1)target.prepend(tags)", JS)
        self.assertIn("const otherColor=", JS)
        self.assertIn("consumption-actions consumption-actions--recorded", JS)
        self.assertIn("action-pill action-pill--registered", JS)
        self.assertEqual(JS.count("action-pill action-pill--secondary"), 2)
        self.assertIn("--consumption-status-bg:rgba(154,224,191,.20)", CSS)
        self.assertIn("--consumption-status-bg:rgba(154,224,191,.45)", CSS)
        self.assertIn("--consumption-status-ink:#176044", CSS)
        self.assertIn("background:var(--consumption-status-bg)", CSS)
        self.assertIn("background:var(--consumption-secondary-bg)", CSS)
        self.assertNotIn(".meal-consumption-tags", CSS)
        self.assertNotIn(".meal-edit-consumption-tag", CSS)
        self.assertNotIn(".meal-undo-consumption-tag", CSS)
        self.assertNotIn("feedback.textContent='Consumo registado.'", JS)
        self.assertIn("consumption-feedback", JS)
        self.assertIn(".consumption-feedback:empty{display:none!important}", CSS)
        self.assertIn("componente único aprovado", GUIDE)
        self.assertIn("sem borda", GUIDE)
        self.assertIn(".consumption-search-wrap input:is(:focus,:focus-visible)", sheet)
        self.assertIn("box-shadow:inset 0 0 0 1.5px rgba(239,239,241,.42)!important", sheet)
        self.assertIn(".consumption-food-sheet .consumption-search-wrap{", sheet)
        self.assertIn("display:flex!important;align-items:center!important;gap:0", sheet)
        self.assertIn(".consumption-food-sheet .consumption-search-wrap:focus-within{box-shadow:inset 0 0 0 1.5px rgba(239,239,241,.42)!important}", sheet)
        self.assertIn(".consumption-food-sheet .consumption-search-symbol{", sheet)
        self.assertIn("width:48px;height:48px;min-height:48px", sheet)
        self.assertIn("searchWrap.append(search,searchIcon)", JS)
        self.assertIn("searchIcon.className='consumption-search-symbol'", JS)
        self.assertNotIn("background-image:url(\"data:image/svg+xml,", sheet)
        self.assertNotIn("background-position:right 14px center", sheet)
        self.assertNotIn("search.style.borderRadius=", JS)
        self.assertNotIn("search.style.setProperty('background'", JS)
        self.assertIn("único componente flexível", GUIDE)
        self.assertIn("gap:8px;max-height:38dvh", sheet)
        self.assertIn("background:transparent!important;border:0!important;border-radius:0!important", sheet)
        self.assertIn("background:var(--food-card-surface)!important", sheet)
        self.assertIn("border-radius:13px!important", sheet)
        self.assertNotIn("background:var(--food-list-surface)!important", sheet)
        self.assertNotIn(".consumption-food-sheet .consumption-suggestions button:last-child{border-bottom:0}", sheet)
        self.assertIn("cards individuais", GUIDE)

    def test_visual_guide_matches_active_geometry(self):
        self.assertIn("72 px", GUIDE)
        self.assertIn("Questionário pós-jogo — card universal", GUIDE)
        self.assertIn("61 px", GUIDE)
        self.assertIn("55 px", GUIDE)
        self.assertIn("FootballPitchIcon", GUIDE)
        self.assertIn("tm-day-header", GUIDE)


if __name__ == "__main__":
    unittest.main()
