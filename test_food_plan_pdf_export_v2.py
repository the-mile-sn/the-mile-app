"""Representative saved-editor PDF export tests."""
import unittest
from io import BytesIO
from pypdf import PdfReader
from food_plan_pdf_export_v2 import render_editor_pdf

class MockConnection:
    def execute(self, query, args):
        assert "v2_food_library" in query
        ref={"id":args[0],"display_name":"Pão integral","variant":"plain","edible_fraction":1,
             "kcal":250,"protein_g":9,"carbs_g":45,"fat_g":3}
        class Cursor:
            def fetchone(self): return ref
        return Cursor()

class PlanPdfTests(unittest.TestCase):
    def test_draft_and_alternative(self):
        plan={"player_name":"Jogador Teste","plan_type":"Plano amarelo",
              "meals":[{"name":"Intermédia","options":[{"title":"Pão com ovos",
                "foods":[{"id":"food1","grams":70,"display_quantity":"70 g"},
                         {"id":"food1","grams":80,"alternative_to":0,"display_quantity":"80 g"}],
                "notes":["Acompanhar com fruta"],"order":[{"type":"food","index":0},
                     {"type":"food","index":1},{"type":"note","index":0}]}]}]}
        pdf=render_editor_pdf(MockConnection(),plan)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        content=" ".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
        for term in ("Jogador Teste","Intermédia","70 g","Ou Pão integral","Acompanhar com fruta","Total médio"):
            self.assertIn(term,content)
    def test_incomplete_is_rejected(self):
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),{"meals":[]})

if __name__=="__main__":
    unittest.main()
