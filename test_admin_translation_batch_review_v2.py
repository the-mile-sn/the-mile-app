"""Isolated WSGI tests: food-only bulk approval with explicit preview.

No API key, Render deployment or production data is used.
"""
import hashlib
import os
import unittest
from unittest.mock import patch

import test_app
import content_translations_v2 as translations

app=test_app.app
FLAG={"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"1","MILE_APP_TRANSLATIONS_ENABLED":"0"}
ROOT="/api/v2/admin/i18n"


class FoodBatchReviewTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.foods=[
            ("food-bulk-1","Arroz branco","White rice"),
            ("food-bulk-2","Aveia","Oats"),
        ]
        with app.connect() as c:
            translations.initialize(c)
            for ident,portuguese,_ in self.foods:
                c.execute("""INSERT INTO v2_food_library(
                    id,source_key,base_name,display_name,category,notes,variant,
                    edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at
                ) VALUES (?,NULL,?,?,'Cereais','Nota interna', 'plain',
                          1,110,4,20,2,1,1,1)""",(ident,portuguese,portuguese))
            c.commit()

    def propose(self,ident,source,english):
        return self.admin.request(ROOT+"/propose","POST",{
            "entity_kind":"food","entity_id":ident,"field_path":"display_name",
            "language":"en","expected_source_hash":self.digest(source),
            "translated_text":english
        })

    @staticmethod
    def digest(s):
        return hashlib.sha256(s.encode("utf-8")).hexdigest()

    def seed(self):
        with patch.dict(os.environ,FLAG):
            for ident,pt,en in self.foods:
                answer=self.propose(ident,pt,en)
                self.assertEqual(answer["status"],201,answer)

    def preview(self):
        return self.admin.request(ROOT+"/batch/preview")

    def approve(self,rows,**kw):
        return self.admin.request(ROOT+"/batch/approve","POST",{
            "entity_kind":"food","rows":rows},**kw)

    def test_preview_is_read_only_and_excludes_internal_notes(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            response=self.preview()
            self.assertEqual(response["status"],200,response)
            self.assertEqual(response["body"]["total"],2)
            self.assertFalse(response["body"]["approved"])
            entries=response["body"]["items"]
            self.assertEqual([x["source_text"] for x in entries],
                             ["Arroz branco","Aveia"])
            self.assertEqual([x["translated_text"] for x in entries],
                             ["White rice","Oats"])
            self.assertTrue(all(x["field_path"]=="display_name" for x in entries))
            self.assertTrue(all(x["expected_candidate_hash"]==self.digest(x["translated_text"])
                                for x in entries))
            self.assertNotIn("Nota interna",str(entries))
            with app.connect() as c:
                self.assertEqual(c.execute(
                    "SELECT COUNT(*) FROM v2_content_translations WHERE status='approved'"
                ).fetchone()[0],0)

    def test_only_explicitly_selected_rows_are_approved_with_history(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            items=self.preview()["body"]["items"]
            chosen=[{k:v for k,v in items[0].items() if k in (
                "entity_id","field_path","expected_source_hash","expected_candidate_hash")}]
            result=self.approve(chosen)
            self.assertEqual(result["status"],200,result)
            self.assertEqual(result["body"]["approved"],1)
            self.assertEqual(self.approve(chosen)["status"],409)
            with app.connect() as c:
                rows=c.execute("SELECT entity_id,status,approved_by "
                     "FROM v2_content_translations ORDER BY entity_id").fetchall()
                self.assertEqual(rows[0]["status"],"approved")
                self.assertEqual(rows[1]["status"],"pending")
                self.assertTrue(rows[0]["approved_by"])
                count=c.execute("SELECT COUNT(*) FROM v2_content_translation_history "
                     "WHERE action='approved'").fetchone()[0]
                self.assertEqual(count,1)
                original=c.execute("SELECT display_name,notes,kcal "
                     "FROM v2_food_library WHERE id='food-bulk-1'").fetchone()
                self.assertEqual(tuple(original),("Arroz branco","Nota interna",110.0))

    def test_conflict_rolls_back_entire_batch(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            items=self.preview()["body"]["items"]
            chosen=[{k:v for k,v in item.items() if k in (
                "entity_id","field_path","expected_source_hash","expected_candidate_hash")}
                    for item in items]
            with app.connect() as c:
                c.execute("UPDATE v2_food_library SET display_name='Aveia em flocos' "
                          "WHERE id='food-bulk-2'")
                c.commit()
            self.assertEqual(self.approve(chosen)["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations "
                      "WHERE status='approved'").fetchone()[0],0)
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translation_history "
                      "WHERE action='approved'").fetchone()[0],0)

    def test_changed_candidate_is_not_approved(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            items=self.preview()["body"]["items"]
            first={k:v for k,v in items[0].items() if k in (
                "entity_id","field_path","expected_source_hash","expected_candidate_hash")}
            self.assertEqual(self.propose("food-bulk-1","Arroz branco","Cooked white rice")["status"],201)
            self.assertEqual(self.approve([first])["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations "
                     "WHERE status='approved'").fetchone()[0],0)

    def test_invalid_payload_rejected_no_writes(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            item=self.preview()["body"]["items"][0]
            row={k:v for k,v in item.items() if k in (
                "entity_id","field_path","expected_source_hash","expected_candidate_hash")}
            for bad in ([row,row],[{**row,"field_path":"notes"}],
                        [{**row,"expected_source_hash":"invalid"}],
                        [{**row,"source_text":"Arroz branco"}],
                        [row]*101):
                with self.subTest(rows=len(bad)):
                    self.assertEqual(self.approve(bad)["status"],400)
            self.assertEqual(self.approve([])["status"],400)
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations "
                     "WHERE status='approved'").fetchone()[0],0)

    def test_admin_csrf_origin_and_feature_gate(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            item=self.preview()["body"]["items"][0]
            row={k:v for k,v in item.items() if k in (
                "entity_id","field_path","expected_source_hash","expected_candidate_hash")}
            self.assertEqual(self.approve([row],csrf=False)["status"],403)
            self.assertEqual(self.approve([row],origin="https://evil.invalid")["status"],403)
            self.assertEqual(test_app.Client().request(ROOT+"/batch/preview")["status"],401)
            self.assertEqual(test_app.Client().request(ROOT+"/batch/approve",
                 "POST",{"entity_kind":"food","rows":[row]})["status"],401)
        with patch.dict(os.environ,{"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"0"}):
            self.assertEqual(self.preview()["status"],404)
            self.assertEqual(self.approve([row])["status"],404)

    def test_approved_foods_not_in_future_previews(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            entries=self.preview()["body"]["items"]
            rows=[{k:v for k,v in entry.items() if k in (
                "entity_id","field_path","expected_source_hash","expected_candidate_hash")}
                for entry in entries]
            self.assertEqual(self.approve(rows)["body"]["approved"],2)
            self.assertEqual(self.preview()["body"]["total"],0)


if __name__=="__main__":
    unittest.main()
