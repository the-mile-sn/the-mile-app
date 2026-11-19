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
        self.assertIn("padding:9px 17px", rules[0])
        self.assertIn("gap:15px", rules[0])
        self.assertIn(".daily-weight-icon{width:40px;height:40px", CSS)
        self.assertIn(".daily-weight-card:has(.daily-weight-panel:not([hidden]))", CSS)

    def test_post_match_header_is_single_normative_family(self):
        base = declarations("#overview #day-details .post-match-inline")
        header = declarations("#overview #day-details .post-match-inline-trigger")
        icon = declarations("#overview #day-details .post-match-inline-icon")
        title = declarations("#overview #day-details .post-match-inline-title")
        self.assertEqual([len(x) for x in (base, header, icon, title)], [1, 1, 1, 1])
        self.assertIn("min-height:61px", base[0])
        self.assertIn("border-radius:13px", base[0])
        self.assertIn("background:#303135", base[0])
        self.assertIn("height:61px", header[0])
        self.assertIn("padding:12px 0 12px 17px", header[0])
        self.assertIn("gap:8px", header[0])
        self.assertIn("37px", icon[0])
        self.assertIn("margin:0 10px 0 0", icon[0])
        self.assertIn("font-size:16px", title[0])
        self.assertIn("font-weight:500", title[0])
        self.assertIn(".post-match-inline-form:not([hidden]))", CSS)
        self.assertIn("border-radius:18px", CSS)
        self.assertNotIn("post-match-inline-trigger>span:nth-child(2)", CSS)

    def test_approved_icon_and_pencil_only_interaction_are_preserved(self):
        self.assertIn('icon.append(mealIcon("football-pitch"))', JS)
        self.assertIn('title.className="post-match-inline-title"', JS)
        self.assertIn("button.disabled=true", JS)
        self.assertIn("action.onclick=()=>", JS)
        self.assertIn('const steps=["Participação e bem-estar","Alimentação","Suplementação"]', JS)
        self.assertIn("Por preencher", JS)
        self.assertIn("Preenchido", JS)

    def test_visual_guide_matches_active_geometry(self):
        self.assertIn("72 px", GUIDE)
        self.assertIn("Questionário pós-jogo — card universal", GUIDE)
        self.assertIn("61 px", GUIDE)
        self.assertIn("55 px", GUIDE)
        self.assertIn("FootballPitchIcon", GUIDE)


if __name__ == "__main__":
    unittest.main()
