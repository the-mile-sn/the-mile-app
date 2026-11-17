"""Small tests for read-only PDF export of stored plan data."""
import unittest
from pypdf import PdfReader
from io import BytesIO
from plan_export_pdf_v2 import render_plan_pdf

class PlanPdfExportTests(unittest.TestCase):
    def test_renders_saved_food_quantities_and_totals(self):
        draft={"color":"yellow","extracted":{"groups":[{"heading":"Pequeno-almoço / Lanche",
          "meals":["breakfast","snack"],"options":[{"number":1,"title":"Pão com ovos",
          "items":[{"kind":"food","quantity":"70 g","name":"Pão integral",
                    "nutrients":{"kcal":"179","protein_g":"5,6","carbs_g":"33,6","fat_g":"1,4"}},
                   {"kind":"instruction","text":"Acompanhar com fruta"}],
          "totals":{"kcal":"579","protein_g":"24","carbs_g":"75","fat_g":"15"}}]}]}}
        content=render_plan_pdf(draft,{"name":"Jogador Exemplo","weight_kg":75})
        self.assertTrue(content.startswith(b"%PDF-"))
        text=" ".join(page.extract_text() for page in PdfReader(BytesIO(content)).pages)
        for expected in ("Jogador Exemplo","Pequeno-almoço","70 g","Pão integral","579"):
            self.assertIn(expected,text)

    def test_long_plan_paginates_without_losing_rows(self):
        # A realistic long plan must paginate without dropping foods or notes.
        foods=[{"kind":"food","quantity":"150 g","name":"Alimento de teste %03d"%i,
                "nutrients":{"kcal":"99","protein_g":"5","carbs_g":"12","fat_g":"2"}}
               for i in range(80)]
        draft={"color":"yellow","extracted":{"groups":[{"heading":"Almoço / Jantar",
            "meals":["lunch","dinner"],"options":[{"number":1,"title":"Opção longa",
            "items":foods+[{"kind":"instruction","text":"Nota final para o atleta"}],
            "totals":{"kcal":"999","protein_g":"50","carbs_g":"120","fat_g":"20"}}]}]}}
        document=PdfReader(BytesIO(render_plan_pdf(draft,{"name":"Jogador"})))
        self.assertGreater(len(document.pages),1)
        all_text=" ".join(p.extract_text() for p in document.pages)
        self.assertIn("Alimento de teste 000",all_text)
        self.assertIn("Alimento de teste 079",all_text)
        self.assertIn("Nota final para o atleta",all_text)

    def test_markup_in_food_is_escaped(self):
        draft={"color":"blue","extracted":{"groups":[{"heading":"Lanche","options":[{
            "items":[{"kind":"food","quantity":"1 un","name":"Pão & <queijo>",
                      "nutrients":{}}]}]}]}}
        text=" ".join(p.extract_text() for p in PdfReader(BytesIO(render_plan_pdf(draft,{"name":"A & B"}))).pages)
        self.assertIn("Pão & <queijo>",text)

    def test_empty_plan_is_valid(self):
        content=render_plan_pdf({"color":"green","extracted":{"groups":[]}},{"name":"Exemplo"})
        self.assertTrue(content.startswith(b"%PDF-"))

if __name__=="__main__":
    unittest.main()
