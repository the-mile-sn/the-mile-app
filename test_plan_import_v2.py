"""Regression tests for the isolated, unpublished PDF plan draft importer."""
import unittest
from unittest.mock import patch
import plan_import_v2


class FakePage:
    def __init__(self, text):
        self.text = text

    def extract_text(self, extraction_mode=None):
        return self.text


class FakeReader:
    pages = [
        FakePage("Resumo do plano alimentar\nPrincipal\nIntermédia"),
        FakePage("""
Pequeno almoço / Lanche
Opção 1         464 34,8 43,0 13,6
- Pão com ovos mexidos
60 g Pão  154 4,8 28,8 1,2
Numa taça juntar e mexer:
Ceia
Opção 1         405 34,8 49,7 4,9
1 un YoPro Danone  179 30,4 11,5 0,3
"""),
        FakePage("""
Almoço / Jantar
- Opção 1         771 46,9 83,7 22,9
130 g Carne ou peixe 173 33,4 0,0 4,3
"""),
    ]


class PlanImportTests(unittest.TestCase):
    def test_group_mapping_and_review_lines(self):
        with patch.object(plan_import_v2, "PdfReader", return_value=FakeReader()):
            plan = plan_import_v2.extract_plan(b"%PDF-test")
        self.assertEqual([group["meals"] for group in plan["groups"]],
                         [["breakfast", "snack"], ["supper"], ["lunch", "dinner"]])
        self.assertEqual(plan["groups"][0]["options"][0]["totals"]["kcal"], "464")
        self.assertIn("Numa taça juntar e mexer:", plan["groups"][0]["options"][0]["lines"])
        self.assertGreater(len(plan["warnings"]), 0)

    def test_color_allowlist(self):
        self.assertNotIn("purple", plan_import_v2.ALLOWED_COLORS)


if __name__ == "__main__":
    unittest.main()
