"""Isolated WSGI tests: food-only bulk approval with explicit preview.

No API key, Render deployment or production data is used.
"""
import hashlib
import json
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



class DishBatchReviewTests(unittest.TestCase):
    """Legacy dish English can enter the approved translation store only on POST."""

    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.dishes=[
            ("dish-bulk-1","Arroz com frango","Chicken and rice"),
            ("dish-bulk-2","Sopa de legumes","Vegetable soup"),
            ("dish-bulk-3","Peixe grelhado","Grilled fish"),
        ]
        with app.connect() as c:
            translations.initialize(c)
            for ident,pt,en in self.dishes:
                c.execute("""INSERT INTO v2_dish_library
                    (id,category,name_pt,name_en,image_filename,active)
                    VALUES (?,'Refeições',?,?, 'placeholder',1)""",(ident,pt,en))
            c.commit()

    def preview(self):
        return self.admin.request(ROOT+"/batch/preview?entity_kind=dish")

    def post(self,rows,**kw):
        return self.admin.request(ROOT+"/batch/approve","POST",
            {"entity_kind":"dish","rows":rows},**kw)

    @staticmethod
    def rows(items):
        return [{k:item[k] for k in ("entity_id","field_path",
                     "expected_source_hash","expected_candidate_hash")}
                for item in items]

    def test_legacy_preview_is_read_only_without_extra_fields(self):
        with patch.dict(os.environ,FLAG):
            response=self.preview()
            self.assertEqual(response["status"],200,response)
            self.assertEqual(response["body"]["entity_kind"],"dish")
            self.assertEqual(response["body"]["total"],3)
            entries=response["body"]["items"]
            self.assertTrue(all(e["review_state"]=="legacy_review" for e in entries))
            self.assertTrue(all(e["field_path"]=="name_pt" for e in entries))
            self.assertEqual(entries[0]["translated_text"],"Chicken and rice")
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations"
                         ).fetchone()[0],0)
            self.assertEqual(self.admin.request(
                ROOT+"/batch/preview?entity_kind=recipe_category")["status"],400)
            self.assertEqual(self.admin.request(
                ROOT+"/batch/preview?entity_kind=dish&extra=1")["status"],400)

    def test_explicitly_approved_legacy_and_pending_have_history(self):
        with patch.dict(os.environ,FLAG):
            # Dish 2 already has a pending proposal edited by the reviewer.
            proposed=self.admin.request(ROOT+"/propose","POST",{
                "entity_kind":"dish","entity_id":"dish-bulk-2",
                "field_path":"name_pt","language":"en",
                "expected_source_hash":self.digest("Sopa de legumes"),
                "translated_text":"Mixed vegetable soup"})
            self.assertEqual(proposed["status"],201,proposed)
            entries=self.preview()["body"]["items"]
            self.assertEqual(len(entries),3)
            self.assertEqual([e["review_state"] for e in entries],
                             ["legacy_review","legacy_review","pending"])
            self.assertEqual(entries[2]["translated_text"],"Mixed vegetable soup")
            selected=self.rows(entries[:1]+entries[2:])
            answer=self.post(selected)
            self.assertEqual(answer["status"],200,answer)
            self.assertEqual(answer["body"]["approved"],2)
            with app.connect() as c:
                stored=c.execute("""SELECT entity_id, translated_text, status
                    FROM v2_content_translations ORDER BY entity_id""").fetchall()
                self.assertEqual([tuple(r) for r in stored],[
                    ("dish-bulk-1","Chicken and rice","approved"),
                    ("dish-bulk-2","Mixed vegetable soup","approved"),
                ])
                history=c.execute("""SELECT entity_id, action
                    FROM v2_content_translation_history ORDER BY entity_id,action
                    """).fetchall()
                self.assertEqual([tuple(row) for row in history],[
                    ("dish-bulk-1","approved"),("dish-bulk-1","submitted"),
                    ("dish-bulk-2","approved"),("dish-bulk-2","submitted"),
                ])
                originals=c.execute("""SELECT name_pt,name_en FROM v2_dish_library
                    WHERE id='dish-bulk-2'""").fetchone()
                self.assertEqual(tuple(originals),
                                 ("Sopa de legumes","Vegetable soup"))
            # Approved records disappear from the next batch; the third remains.
            self.assertEqual(self.preview()["body"]["total"],1)
            self.assertEqual(self.post(selected)["status"],409)

    def test_changed_legacy_candidate_rolls_back_whole_batch(self):
        with patch.dict(os.environ,FLAG):
            entries=self.preview()["body"]["items"]
            chosen=self.rows(entries)
            with app.connect() as c:
                c.execute("UPDATE v2_dish_library SET name_en='Grilled sea fish' "
                          "WHERE id='dish-bulk-3'")
                c.commit()
            self.assertEqual(self.post(chosen)["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations"
                    ).fetchone()[0],0)
                self.assertEqual(c.execute(
                    "SELECT COUNT(*) FROM v2_content_translation_history"
                    ).fetchone()[0],0)

    def test_wrong_fields_duplicate_rows_and_permissions_fail_closed(self):
        with patch.dict(os.environ,FLAG):
            row=self.rows(self.preview()["body"]["items"])[0]
            for rows in ([{**row,"field_path":"display_name"}],
                         [{**row,"expected_candidate_hash":"0"*64}],
                         [row,row],[row]*101):
                with self.subTest(size=len(rows)):
                    self.assertIn(self.post(rows)["status"],(400,409))
            self.assertEqual(self.post([row],csrf=False)["status"],403)
            self.assertEqual(self.post([row],origin="https://invalid.example")["status"],403)
            self.assertEqual(test_app.Client().request(
                ROOT+"/batch/preview?entity_kind=dish")["status"],401)
            self.assertEqual(self.admin.request(ROOT+"/batch/approve","POST",
                {"entity_kind":"recipe","rows":[row]})["status"],400)
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations"
                    ).fetchone()[0],0)

    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode("utf-8")).hexdigest()




class RecipeBatchReviewTests(unittest.TestCase):
    """Review all visible fields of published recipes, not clinical or numeric data."""

    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.recipe_id="c"*24
        self.category_id="d"*24
        self.section_id="a"*24
        self.ingredient_id="b"*24
        self.sections=[{
            "id":self.section_id,"title":"Ingredientes principais",
            "ingredients":[{
                "id":self.ingredient_id,"name":"Arroz branco",
                "quantity":"100","unit":"g","recipe_ref_id":None}]
        }]
        self.steps=["Cozer em agua.","Servir quente."]
        with app.connect() as c:
            translations.initialize(c)
            c.execute("INSERT INTO v2_recipe_categories(id,name,created_at) VALUES (?,?,?)",
                      (self.category_id,"Refeicoes",1))
            c.execute("""INSERT INTO v2_recipe_library
                (id,category_id,name,recipe_type,status,servings,
                 sections_json,steps_json,notes,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)""",(
                    self.recipe_id,self.category_id,"Arroz cozido","standard",
                    "published",2,json.dumps(self.sections),json.dumps(self.steps),
                    "Servir de imediato.",1,1))
            c.commit()

    def preview(self):
        return self.admin.request(ROOT+"/batch/preview?entity_kind=recipe")

    def propose(self,field_path,text,english):
        return self.admin.request(ROOT+"/propose","POST",{
            "entity_kind":"recipe","entity_id":self.recipe_id,
            "field_path":field_path,"language":"en",
            "expected_source_hash":self.digest(text),
            "translated_text":english
        })

    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def rows(entries):
        return [{k:e[k] for k in ("entity_id","field_path",
                   "expected_source_hash","expected_candidate_hash")}
                for e in entries]

    def seed(self):
        self.translations={
            "name":("Arroz cozido","Cooked rice"),
            "notes":("Servir de imediato.","Serve immediately."),
            "sections/"+self.section_id+"/title":
                ("Ingredientes principais","Main ingredients"),
            "sections/"+self.section_id+"/ingredients/"+self.ingredient_id+"/name":
                ("Arroz branco","White rice"),
            "sections/"+self.section_id+"/ingredients/"+self.ingredient_id+"/unit":
                ("g","g"),
            "steps/0":("Cozer em agua.","Boil in water."),
            "steps/1":("Servir quente.","Serve hot."),
        }
        with patch.dict(os.environ,FLAG):
            for path,(pt,en) in self.translations.items():
                result=self.propose(path,pt,en)
                self.assertEqual(result["status"],201,result)

    def test_preview_groups_recipe_fields_without_writing(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            result=self.preview()
            self.assertEqual(result["status"],200,result)
            self.assertEqual(result["body"]["entity_kind"],"recipe")
            self.assertEqual(result["body"]["total"],7)
            entries=result["body"]["items"]
            self.assertEqual([e["field_path"] for e in entries],
                list(self.translations))
            self.assertTrue(all(e["record_title"]=="Arroz cozido" for e in entries))
            self.assertTrue(all(e["field_label"] for e in entries))
            self.assertTrue(all(e["review_state"]=="pending" for e in entries))
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                   v2_content_translations WHERE status='approved'""").fetchone()[0],0)

    def test_approve_group_with_history_and_unchanged_canonical_recipe(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            entries=self.preview()["body"]["items"]
            selected=self.rows(entries)
            answer=self.admin.request(ROOT+"/batch/approve","POST",{
                "entity_kind":"recipe","rows":selected})
            self.assertEqual(answer["status"],200,answer)
            self.assertEqual(answer["body"]["approved"],7)
            self.assertEqual(self.preview()["body"]["total"],0)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translations WHERE status='approved'""").fetchone()[0],7)
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translation_history WHERE action='approved'""").fetchone()[0],7)
                original=c.execute("""SELECT name,notes,servings,sections_json,steps_json
                   FROM v2_recipe_library WHERE id=?""",(self.recipe_id,)).fetchone()
                self.assertEqual(original["name"],"Arroz cozido")
                self.assertEqual(original["notes"],"Servir de imediato.")
                self.assertEqual(original["servings"],2)
                self.assertEqual(json.loads(original["sections_json"]),self.sections)
                self.assertEqual(json.loads(original["steps_json"]),self.steps)

    def test_source_change_rolls_back_whole_recipe_group(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            selected=self.rows(self.preview()["body"]["items"])
            with app.connect() as c:
                c.execute("UPDATE v2_recipe_library SET steps_json=? WHERE id=?",
                     (json.dumps(["Boil in water?","Servir quente."]),self.recipe_id))
                c.commit()
            result=self.admin.request(ROOT+"/batch/approve","POST",{
                "entity_kind":"recipe","rows":selected})
            self.assertEqual(result["status"],409,result)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translations WHERE status='approved'""").fetchone()[0],0)

    def test_reject_numeric_fields_invalid_hashes_and_permission_errors(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            first=self.rows(self.preview()["body"]["items"])[0]
            for row in [
                {**first,"field_path":"servings"},
                {**first,"field_path":"sections/"+self.section_id+
                     "/ingredients/"+self.ingredient_id+"/quantity"},
                {**first,"expected_candidate_hash":"bad"},
                {**first,"translated_text":"Untrusted browser input"},
            ]:
                result=self.admin.request(ROOT+"/batch/approve","POST",{
                    "entity_kind":"recipe","rows":[row]})
                self.assertEqual(result["status"],400,result)
            self.assertEqual(self.admin.request(ROOT+"/batch/approve","POST",{
                "entity_kind":"recipe","rows":[first,first]})["status"],400)
            self.assertEqual(self.admin.request(ROOT+"/batch/approve","POST",{
                "entity_kind":"recipe","rows":[first]},csrf=False)["status"],403)
            self.assertEqual(test_app.Client().request(
                ROOT+"/batch/preview?entity_kind=recipe")["status"],401)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translations WHERE status='approved'""").fetchone()[0],0)




class SupplementBatchReviewTests(unittest.TestCase):
    """Only pending, user-visible supplement text can be approved in a batch."""

    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.ident="supp-bulk-1"
        self.prescriptions=[{"dose":"5 g","timing_text":"Antes do treino",
                             "note":"Tomar diariamente","quantity":3}]
        with app.connect() as c:
            translations.initialize(c)
            c.execute("""INSERT INTO v2_supplement_library
                (id,name,dose,moment,rule,note,timing_text,prescriptions_json)
                VALUES(?,?,?,?,?,?,?,?)""",
                (self.ident,"Creatina","5 g","lunch","daily",
                 "Misturar com água","Após o almoço",
                 json.dumps(self.prescriptions,ensure_ascii=False)))
            c.commit()
        self.fields={
            "name":("Creatina","Creatine"),
            "dose":("5 g","5 g"),
            "note":("Misturar com água","Mix with water"),
            "timing_text":("Após o almoço","After lunch"),
            "prescriptions/0/dose":("5 g","5 g"),
            "prescriptions/0/timing_text":("Antes do treino","Before training"),
            "prescriptions/0/note":("Tomar diariamente","Take daily"),
        }

    @staticmethod
    def digest(text):
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def seed(self):
        with patch.dict(os.environ,FLAG):
            for path,(pt,en) in self.fields.items():
                result=self.admin.request(ROOT+"/propose","POST",{
                    "entity_kind":"supplement","entity_id":self.ident,
                    "field_path":path,"language":"en",
                    "expected_source_hash":self.digest(pt),
                    "translated_text":en})
                self.assertEqual(result["status"],201,result)

    def preview(self):
        return self.admin.request(ROOT+"/batch/preview?entity_kind=supplement")

    @staticmethod
    def rows(items):
        return [{k:item[k] for k in ("entity_id","field_path",
                   "expected_source_hash","expected_candidate_hash")}
                for item in items]

    def approve(self,rows,**kw):
        return self.admin.request(ROOT+"/batch/approve","POST",
            {"entity_kind":"supplement","rows":rows},**kw)

    def test_preview_shows_named_supplement_fields_without_writes(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            response=self.preview()
            self.assertEqual(response["status"],200,response)
            self.assertEqual(response["body"]["entity_kind"],"supplement")
            self.assertEqual(response["body"]["total"],7)
            entries=response["body"]["items"]
            self.assertEqual([row["field_path"] for row in entries],list(self.fields))
            self.assertTrue(all(row["record_title"]=="Creatina" for row in entries))
            self.assertTrue(all(row["field_label"] for row in entries))
            self.assertTrue(all(row["review_state"]=="pending" for row in entries))
            self.assertNotIn("quantity",str(entries))
            with app.connect() as c:
                count=c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE status='approved'""").fetchone()[0]
                self.assertEqual(count,0)

    def test_approve_selected_fields_preserves_prescription_rules_and_values(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            rows=self.rows(self.preview()["body"]["items"])
            result=self.approve(rows)
            self.assertEqual(result["status"],200,result)
            self.assertEqual(result["body"]["approved"],7)
            self.assertEqual(self.preview()["body"]["total"],0)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translation_history WHERE action='approved'
                    """).fetchone()[0],7)
                original=c.execute("""SELECT name,dose,moment,rule,note,timing_text,
                       prescriptions_json FROM v2_supplement_library WHERE id=?""",
                       (self.ident,)).fetchone()
                self.assertEqual(tuple(original)[:6],("Creatina","5 g","lunch",
                     "daily","Misturar com água","Após o almoço"))
                self.assertEqual(json.loads(original["prescriptions_json"]),
                                 self.prescriptions)

    def test_changed_source_candidate_and_duplicates_fail_closed(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            rows=self.rows(self.preview()["body"]["items"])
            for invalid in (
                [{**rows[0],"field_path":"rule"}],
                [{**rows[0],"field_path":"moment"}],
                [{**rows[0],"field_path":"prescriptions/0/quantity"}],
                [{**rows[0],"expected_candidate_hash":"invalid"}],
                [rows[0],rows[0]],
                [rows[0]]*101,
            ):
                self.assertEqual(self.approve(invalid)["status"],400)
            with app.connect() as c:
                c.execute("""UPDATE v2_supplement_library SET timing_text=?
                    WHERE id=?""",("De manhã",self.ident))
                c.commit()
            self.assertEqual(self.approve(rows)["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                     WHERE status='approved'""").fetchone()[0],0)
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translation_history
                     WHERE action='approved'""").fetchone()[0],0)

    def test_pending_changed_during_review_and_admin_authority(self):
        self.seed()
        with patch.dict(os.environ,FLAG):
            rows=self.rows(self.preview()["body"]["items"])
            edited=self.admin.request(ROOT+"/propose","POST",{
                "entity_kind":"supplement","entity_id":self.ident,
                "field_path":"note","language":"en",
                "expected_source_hash":self.digest("Misturar com água"),
                "translated_text":"Mix thoroughly with water"})
            self.assertEqual(edited["status"],201,edited)
            self.assertEqual(self.approve(rows)["status"],409)
            self.assertEqual(self.approve([rows[0]],csrf=False)["status"],403)
            self.assertEqual(self.approve([rows[0]],origin="https://evil.invalid")["status"],403)
            self.assertEqual(test_app.Client().request(
                ROOT+"/batch/preview?entity_kind=supplement")["status"],401)
            self.assertEqual(self.admin.request(ROOT+"/batch/approve","POST",{
                "entity_kind":"recipe_category","rows":rows[:1]})["status"],400)



if __name__=="__main__":
    unittest.main()
