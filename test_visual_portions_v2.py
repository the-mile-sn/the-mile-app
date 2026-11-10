"""Checks for the admin-only visual portion reference module."""
import io
import json
import sqlite3
import unittest
import zipfile

from PIL import Image
import visual_portions_v2 as portions


def photo(color):
    image = Image.new("RGB", (48, 48), color)
    out = io.BytesIO()
    image.save(out, format="WEBP")
    return out.getvalue()


def approved_zip(approved=True, broken_mix=False):
    references = [
        {"linha_excel":2,"categoria_original":"Arroz","categoria":"Arroz",
         "total_g":170,"arroz_g":None,"batata_g":None,"ficheiro":"imagens/image1.webp",
         "estado":"Aprovado","orientativa":True,"observacao":""},
        {"linha_excel":3,"categoria_original":"Arroz + Batata","categoria":"Arroz + Batata",
         "total_g":350,"arroz_g":250,"batata_g":50 if broken_mix else 100,
         "ficheiro":"imagens/image2.webp","estado":"Aprovado","orientativa":True,"observacao":""},
        {"linha_excel":4,"categoria_original":"Carne / Peixe","categoria":"Carne branca",
         "total_g":140,"arroz_g":None,"batata_g":None,"ficheiro":"imagens/image3.webp",
         "estado":"Aprovado","orientativa":True,"observacao":""},
    ]
    out=io.BytesIO()
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json",json.dumps({"metadata":{"approved":approved},"references":references}))
        z.writestr("imagens/image1.webp",photo("white"))
        z.writestr("imagens/image2.webp",photo("yellow"))
        z.writestr("imagens/image3.webp",photo("brown"))
    return out.getvalue()


class VisualPortionsTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        portions.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def test_approved_import_is_idempotent_and_admin_only(self):
        result=portions.import_approved_archive(self.c,approved_zip())
        self.assertEqual(result["imported"],3)
        self.assertFalse(result["published_to_players"])
        self.assertEqual(len(portions.list_references(self.c)),3)
        again=portions.import_approved_archive(self.c,approved_zip())
        self.assertEqual(again["imported"],3)
        self.assertEqual(len(portions.list_references(self.c)),3)
        items=portions.list_references(self.c)
        self.assertIn("Carne branca",[row["category"] for row in items])
        self.assertNotIn("Carne / Peixe",[row["category"] for row in items])
        mix=next(row for row in items if row["category"]=="Arroz + Batata")
        self.assertEqual(mix["rice_g"]+mix["potato_g"],mix["total_g"])
        self.assertTrue(portions.get_image(self.c,mix["id"]).startswith(b"RIFF"))

    def test_deactivate_without_deleting(self):
        portions.import_approved_archive(self.c,approved_zip())
        item=portions.list_references(self.c)[0]
        self.assertFalse(portions.set_active(self.c,item["id"],False))
        self.assertEqual(len(portions.list_references(self.c)),3)
        self.assertTrue(portions.get_image(self.c,item["id"]))
        portions.import_approved_archive(self.c,approved_zip())
        self.assertFalse(next(x for x in portions.list_references(self.c) if x["id"]==item["id"])["active"])

    def test_unapproved_zip_rejected(self):
        with self.assertRaises(ValueError):
            portions.import_approved_archive(self.c,approved_zip(approved=False))
        self.assertEqual(portions.list_references(self.c),[])

    def test_invalid_mix_rejected_before_insert(self):
        with self.assertRaises(ValueError):
            portions.import_approved_archive(self.c,approved_zip(broken_mix=True))
        self.assertEqual(portions.list_references(self.c),[])

    def test_not_a_photo(self):
        with self.assertRaises(ValueError):
            portions._verified_photo(b"not a photo")

if __name__=="__main__":
    unittest.main()
