"""Checks PDF preview/commit isolation without writing to player-related tables."""
import base64
import io
import sqlite3
import unittest

import fitz

import recipe_library_v2 as recipes
import recipe_pdf_import_v2 as pdf


class PdfRecipeImportTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        recipes.initialize(self.db)
        self.category = recipes.create_category(self.db, "Bolos de caneca")
        self.db.execute("CREATE TABLE v2_shared_images(image_key TEXT PRIMARY KEY,image_data BLOB)")
        self.db.commit()

    def tearDown(self):
        self.db.close()

    @staticmethod
    def make_pdf():
        document = fitz.open()
        cover = document.new_page(width=595,height=842)
        cover.insert_text((44,90),"Receitas",fontsize=37)
        cover.insert_text((44,145),"Bolos de caneca",fontsize=35)
        page=document.new_page(width=595,height=842)
        page.insert_text((43,90),"Bolo de caneca proteico",fontsize=15)
        page.insert_text((97,148),"Ingredientes",fontsize=11)
        for y,text in [(170,"30 g Farinha de aveia"),(192,"100 g Pudim proteico"),
                       (214,"1 un / 120 g Banana"),(236,"q.b. Canela")]:
            page.insert_text((70,y),text,fontsize=10)
        page.insert_text((97,308),"Modo de preparo",fontsize=11)
        page.insert_text((83,337),"1. Misturar os ingredientes.",fontsize=10)
        page.insert_text((83,363),"2. Cozinhar e servir.",fontsize=10)
        payload=document.tobytes()
        document.close()
        return payload

    def test_ignores_cover_and_preserves_composite_quantities(self):
        result=pdf.preview_pdf(self.make_pdf(),"bolo.pdf")
        self.assertEqual(result["total_pages"],2)
        self.assertEqual(len(result["recipes"]),1)
        self.assertEqual(result["skipped_pages"][0]["page"],1)
        entry=result["recipes"][0]
        self.assertEqual(entry["name"],"Bolo de caneca proteico")
        ingredients=entry["sections"][0]["ingredients"]
        self.assertEqual([i["name"] for i in ingredients],
                         ["Farinha de aveia","Pudim proteico","Banana","Canela"])
        self.assertEqual(ingredients[2]["quantity"],"1 un / 120 g")
        self.assertEqual(ingredients[2]["unit"],"")
        self.assertEqual(entry["steps"],["Misturar os ingredientes.","Cozinhar e servir."])
        self.assertIn("Confirmar manualmente as quantidades compostas",entry["warnings"])

    def test_rejects_invalid_pdf(self):
        for payload in (b"",b"not a pdf",b"%PDF- corrupt"):
            with self.assertRaises(ValueError):
                pdf.preview_pdf(payload,"bad.pdf")

    def test_commit_drafts_is_idempotent_and_never_publishes(self):
        entry=pdf.preview_pdf(self.make_pdf(),"bolo.pdf")["recipes"][0]
        entry["recipe_type"]="adaptable"
        def store(c,key,raw):
            c.execute("INSERT INTO v2_shared_images(image_key,image_data) VALUES(?,?)",(key,raw))
        out=pdf.commit_drafts(self.db,self.category["id"],"bolo.pdf",[entry],store)
        self.assertEqual(len(out["created"]),1)
        created=recipes.get_recipe(self.db,out["created"][0]["id"])
        self.assertEqual(created["status"],"draft")
        self.assertEqual(created["recipe_type"],"adaptable")
        self.assertEqual(created["source_page"],2)
        self.assertEqual(created["source_document"],"bolo.pdf")
        repeated=pdf.commit_drafts(self.db,self.category["id"],"bolo.pdf",[entry],store)
        self.assertEqual(repeated["created"],[])
        self.assertEqual(len(repeated["skipped"]),1)
        self.assertEqual(len(recipes.list_recipes(self.db)),1)

    def test_review_payload_cannot_auto_publish(self):
        entry=pdf.preview_pdf(self.make_pdf(),"bolo.pdf")["recipes"][0]
        entry["status"]="published"
        out=pdf.commit_drafts(self.db,self.category["id"],"bolo.pdf",[entry],lambda *_:None)
        self.assertEqual(recipes.get_recipe(self.db,out["created"][0]["id"])["status"],"draft")

    def test_batch_is_atomic_on_validation_failure(self):
        valid=pdf.preview_pdf(self.make_pdf(),"bolo.pdf")["recipes"][0]
        bad=dict(valid,page=0,name="Inválida")
        with self.assertRaises(ValueError):
            pdf.commit_drafts(self.db,self.category["id"],"bolo.pdf",
                              [valid,bad],lambda *_:None)
        self.assertEqual(recipes.list_recipes(self.db),[])

    def test_composite_and_culinary_quantities(self):
        for text,qty,unit in [
            ("1 un / 120 g Banana","1 un / 120 g",""),
            ("1 c.café Fermento","1 c.café",""),
            ("q.b. Canela","q.b.",""),
            ("20 g Azeite","20","g")
        ]:
            result=pdf.ingredient(text)
            self.assertEqual((result["quantity"],result["unit"]),(qty,unit))


if __name__ == "__main__":
    unittest.main()
