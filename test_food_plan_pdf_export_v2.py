"""Representative saved-editor PDF export tests."""
import unittest
from io import BytesIO
from pypdf import PdfReader
from food_plan_pdf_export_v2 import render_editor_pdf, _selected_meals

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
        for term in ("Jogador Teste","Pequeno-almoço","Lanche","70 g","Ou Pão integral","Acompanhar com fruta","Total médio"):
            self.assertIn(term,content)
    def test_shared_groups_default_to_four_meals(self):
        groups=[{"name":"Intermédia","options":[{"foods":[{"id":"food1","grams":100}]}]},
                {"name":"Principal","options":[{"foods":[{"id":"food1","grams":200}]}]}]
        selected=_selected_meals(groups,None)
        self.assertEqual([x[1] for x in selected],["Pequeno almoço","Almoço","Lanche","Jantar"])
        plan={"player_name":"Jogador","plan_type":"Plano amarelo","meals":groups}
        text=" ".join(p.extract_text() for p in PdfReader(BytesIO(render_editor_pdf(MockConnection(),plan))).pages)
        for name in ("Pequeno-almoço","Almoço","Lanche","Jantar","1500 kcal"):
            self.assertIn(name,text)

    def test_selection_excludes_dinner_and_recomputes_energy(self):
        groups=[{"name":"Intermédia","options":[{"foods":[{"id":"food1","grams":100}]}]},
                {"name":"Principal","options":[{"foods":[{"id":"food1","grams":200}]}]}]
        plan={"player_name":"Jogador","meals":groups}
        pdf=render_editor_pdf(MockConnection(),plan,["0:0","1:0","0:1"])
        text=" ".join(p.extract_text() for p in PdfReader(BytesIO(pdf)).pages)
        self.assertNotIn("Jantar",text)
        self.assertIn("1000 kcal",text)
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),plan,["0:0","99:0"])
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),plan,[])

    def test_incomplete_is_rejected(self):
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),{"meals":[]})

if __name__=="__main__":
    unittest.main()
