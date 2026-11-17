"""Regression checks for branded Planos PDF without touching saved data."""
import unittest
from io import BytesIO
from pypdf import PdfReader
from food_plan_pdf_export_v2 import render_editor_pdf, _selected_meals, _macro_ring_shares

class MockConnection:
    def execute(self, query, args):
        assert "v2_food_library" in query
        ref={"id":args[0],"display_name":"Pão integral","variant":"plain","edible_fraction":1,
             "kcal":250,"protein_g":9,"carbs_g":45,"fat_g":3}
        class Cursor:
            def fetchone(self): return ref
        return Cursor()

class PlanPdfTests(unittest.TestCase):
    def plan(self):
        return {"player_name":"Jogador Teste","plan_type":"Plano amarelo",
            "meals":[{"name":"Intermédia","options":[{"title":"Pão com ovos",
              "foods":[{"id":"food1","grams":70,"display_quantity":"70 g"},
                       {"id":"food1","grams":80,"alternative_to":0,"display_quantity":"80 g"}],
              "notes":["Acompanhar com fruta"],"order":[{"type":"food","index":0},
                 {"type":"food","index":1},{"type":"note","index":0}]}]}]}

    def test_cover_summary_and_option_contents(self):
        pages=PdfReader(BytesIO(render_editor_pdf(MockConnection(),self.plan()))).pages
        self.assertGreaterEqual(len(pages),3)
        cover=pages[0].extract_text()
        summary=pages[1].extract_text()
        detail=" ".join(p.extract_text() for p in pages[2:])
        self.assertIn("Plano alimentar",cover)
        self.assertIn("Jogador Teste",cover)
        self.assertNotIn("Hidratos médios",cover)
        self.assertIn("Resumo nutricional",summary)
        self.assertNotIn("Distribuição do anel",summary)
        for term in ("Pequeno-almoço","Lanche","70 g","Ou Pão integral","Acompanhar com fruta"):
            self.assertIn(term,detail)
        self.assertNotIn("Total médio",detail)
        self.assertIn("g HC",detail)
        self.assertIn("g P",detail)
        self.assertNotIn("Alimento / notas",detail)
        self.assertNotIn("Qtd.",detail)
        self.assertNotIn("P (g)",detail)
        self.assertNotIn("HC (g)",detail)
        self.assertGreaterEqual(len(pages[0].images),1)
        self.assertIn("www.themile.pt",pages[-1].extract_text())
        self.assertIn("Plano alimentar - Jogador Teste",pages[1].extract_text())
        self.assertIn("www.themile.pt",pages[1].extract_text())
        self.assertIn("Opção 1",detail)

    def test_shared_groups_default_to_four_meals(self):
        groups=[{"name":"Intermédia","options":[{"foods":[{"id":"food1","grams":100}]}]},
                {"name":"Principal","options":[{"foods":[{"id":"food1","grams":200}]}]}]
        selected=_selected_meals(groups,None)
        self.assertEqual([x[1] for x in selected],["Pequeno almoço","Almoço","Lanche","Jantar"])
        plan={"player_name":"Jogador","plan_type":"Plano amarelo","meals":groups}
        pages=PdfReader(BytesIO(render_editor_pdf(MockConnection(),plan))).pages
        text=" ".join(p.extract_text() for p in pages)
        for name in ("Pequeno-almoço","Almoço","Lanche","Jantar","1500 kcal"):
            self.assertIn(name,text)

    def test_selection_excludes_dinner_and_recomputes_energy(self):
        groups=[{"name":"Intermédia","options":[{"foods":[{"id":"food1","grams":100}]}]},
                {"name":"Principal","options":[{"foods":[{"id":"food1","grams":200}]}]}]
        plan={"player_name":"Jogador","meals":groups}
        pages=PdfReader(BytesIO(render_editor_pdf(MockConnection(),plan,["0:0","1:0","0:1"]))).pages
        text=" ".join(p.extract_text() for p in pages)
        self.assertNotIn("Jantar",text)
        self.assertIn("1000 kcal",text)
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),plan,["0:0","99:0"])
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),plan,[])

    def test_meal_heading_always_accompanies_first_option(self):
        plan=self.plan()
        opts=plan["meals"][0]["options"]
        opts[:]=[dict(opts[0],title="Batido %02d" % i) for i in range(8)]
        pages=PdfReader(BytesIO(render_editor_pdf(MockConnection(),plan))).pages
        for page in pages[2:]:
            content=page.extract_text()
            if "Lanche" in content:
                self.assertIn("Opção 1",content)
            if "Pequeno-almoço" in content:
                self.assertIn("Opção 1",content)

    def test_option_kept_on_one_page_if_it_fits(self):
        plan=self.plan()
        opts=plan["meals"][0]["options"]
        opts[:]=[dict(opts[0],title="Batido %02d"%i) for i in range(7)]
        pages=PdfReader(BytesIO(render_editor_pdf(MockConnection(),plan))).pages
        for i in range(7):
            label="Batido %02d"%i
            containing=[n for n,p in enumerate(pages) if label in p.extract_text()]
            self.assertEqual(len(containing),2) # once for breakfast and once for snack

    def test_visual_summary_calculations_and_selected_meals(self):
        from food_plan_pdf_export_v2 import _meal_shares, _share, NutritionDailyOverview, NutritionMealOverview
        vals=[500,25,50,20]
        self.assertAlmostEqual(_meal_shares(vals)[0],20.0)
        self.assertAlmostEqual(_meal_shares(vals)[1],40.0)
        self.assertAlmostEqual(_meal_shares(vals)[2],36.0)
        self.assertAlmostEqual(_share(250,1000),25.0)
        self.assertEqual(_share(100,0),0.0)
        self.assertEqual(NutritionDailyOverview(vals,None,400).height,190)
        self.assertEqual(NutritionMealOverview("Almoço",vals,2000,400).height,75)
        pdf=render_editor_pdf(MockConnection(),self.plan(),["0:0"])
        pages=PdfReader(BytesIO(pdf)).pages
        self.assertIn("Resumo nutricional",pages[1].extract_text())
        all_text=" ".join(page.extract_text() for page in pages)
        self.assertNotIn("Lanche",all_text)
        self.assertIn("Proteínas",all_text)
        self.assertIn("Hidratos",all_text)
        self.assertIn("Gorduras",all_text)

    def test_macro_ring_has_no_empty_sector(self):
        values=[2576,131.5,346.5,57.7]
        shares=_macro_ring_shares(values)
        self.assertAlmostEqual(sum(shares),1.0,places=12)
        self.assertAlmostEqual(shares[0],526/(526+1386+519.3),places=5)
        self.assertAlmostEqual(shares[1],1386/(526+1386+519.3),places=5)
        self.assertEqual(_macro_ring_shares([0,0,0,0]),[0.0,0.0,0.0])

    def test_four_meal_summary_stays_on_second_page(self):
        groups=[{"name":"Intermédia","options":[{"foods":[{"id":"food1","grams":100}]}]},
                {"name":"Principal","options":[{"foods":[{"id":"food1","grams":200}]}]}]
        plan={"player_name":"Jogador","plan_type":"Plano amarelo","meals":groups}
        pages=PdfReader(BytesIO(render_editor_pdf(MockConnection(),plan))).pages
        summary=pages[1].extract_text()
        for meal in ("Pequeno-almoço","Almoço","Lanche","Jantar"):
            self.assertIn(meal,summary)
        self.assertNotIn("Distribuição do anel",summary)
        self.assertNotIn("Jantar",pages[2].extract_text().split("Opção 1")[0])

    def test_cover_uses_linked_player_photo(self):
        from PIL import Image
        picture = BytesIO()
        Image.new("RGB",(120,80),"#C99F31").save(picture,format="PNG")
        class PhotoConnection(MockConnection):
            def execute(self,query,args):
                if "v2_player_links" in query:
                    class Cursor:
                        def fetchone(self):
                            return {"photo":picture.getvalue()}
                    return Cursor()
                if "v2_daily_weighins" in query or "v2_body_assessments" in query:
                    class EmptyCursor:
                        def fetchall(self):
                            return []
                        def fetchone(self):
                            return None
                    return EmptyCursor()
                return super().execute(query,args)
        plan=self.plan()
        plan["athlete_id"]="athlete-001"
        data=render_editor_pdf(PhotoConnection(),plan)
        pages=PdfReader(BytesIO(data)).pages
        self.assertGreaterEqual(len(pages[0].images),2)
        self.assertNotIn("Distribuição do anel",pages[1].extract_text())

    def test_incomplete_is_rejected(self):
        with self.assertRaises(ValueError):
            render_editor_pdf(MockConnection(),{"meals":[]})

if __name__=="__main__":
    unittest.main()
