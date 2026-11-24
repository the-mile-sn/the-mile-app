"""End-to-end WSGI regressions of the isolated admin-only translation center.

Uses the project's existing disposable SQLite fixture and real sessions/CSRF.
No Render database or deployed service is accessed.
"""
import os
import unittest
from unittest.mock import patch

import test_app
import content_translations_v2 as translations

app = test_app.app
Client = test_app.Client
FLAG = {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1", "MILE_APP_TRANSLATIONS_ENABLED": "0"}


class AdminTranslationsReleaseTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        with app.connect() as c:
            c.execute("""INSERT INTO v2_food_library
                (id,source_key,base_name,display_name,category,notes,variant,
                 edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at)
                VALUES ('food-test',NULL,'Arroz','Arroz branco','Cereais',
                        'Pesar cozido','plain',1,130,2.7,28.2,0.3,1,1,1)""")
            c.execute("""INSERT INTO v2_dish_library
                (id,category,name_pt,name_en,image_filename,active)
                VALUES ('dish-test','Carne','Frango com arroz',
                        'Chicken and rice','dish-placeholder',1)""")
            c.commit()

    def init_store(self):
        with app.connect() as c:
            translations.initialize(c)
            c.commit()

    def detail(self, kind="food", ident="food-test", field="display_name"):
        return self.admin.request(
            "/api/v2/admin/i18n?entity_kind="+kind+"&entity_id="+ident+
            "&field_path="+field)

    def propose(self, source_hash, english="White rice"):
        return {
            "entity_kind":"food", "entity_id":"food-test",
            "field_path":"display_name", "language":"en",
            "expected_source_hash":source_hash, "translated_text":english,
        }

    def approve(self, source_hash, candidate_hash):
        return {
            "entity_kind":"food", "entity_id":"food-test",
            "field_path":"display_name", "language":"en",
            "expected_source_hash":source_hash,
            "expected_candidate_hash":candidate_hash,
        }

    def test_feature_flag_off_keeps_existing_routes_and_ui(self):
        self.init_store()
        with patch.dict(os.environ, {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"0",
                                     "MILE_APP_TRANSLATIONS_ENABLED":"0"}):
            for path in (
                "/admin-translations", "/api/v2/admin/i18n/overview",
                "/api/v2/admin/i18n/catalog", "/admin-translations.js",
            ):
                with self.subTest(path=path):
                    self.assertEqual(self.admin.request(path)["status"], 404)
            self.assertEqual(self.admin.request("/api/me")["status"], 200)
            self.assertEqual(self.admin.request("/api/v2/food-library")["status"], 200)

    def test_new_assets_private_and_do_not_enable_app_language_endpoints(self):
        self.init_store()
        with patch.dict(os.environ, FLAG):
            self.assertEqual(Client().request("/admin-translations")["status"],401)
            page = self.admin.request("/admin-translations")
            self.assertEqual(page["status"],303,page)
            self.assertEqual(page["headers"]["Location"],"/?nav=translations")
            self.assertEqual(page["headers"]["Cache-Control"],"no-store")
            self.assertEqual(self.admin.request(
                "/admin-translations?entity_kind=food")["headers"]["Location"],
                "/?nav=translations&entity_kind=food")
            self.assertEqual(self.admin.request(
                "/admin-translations?entity_kind=https://evil.invalid")["headers"]["Location"],
                "/?nav=translations")
            for path in ("/admin-translations.js","/admin-translations.css",
                         "/admin-translations-embedded.css"):
                self.assertEqual(self.admin.request(path)["status"],200)
            self.assertIn(self.admin.request("/api/v2/player/language")["status"],(403,404))
            self.assertIn(self.admin.request("/api/v2/chef/language")["status"],(403,404))
            with patch.object(app,"SITE_ROLE","player"):
                self.assertEqual(self.admin.request("/admin-translations")["status"],404)

    def test_missing_schema_fails_closed_and_does_not_create_it(self):
        with patch.dict(os.environ, FLAG):
            self.assertEqual(self.admin.request("/api/v2/admin/i18n/overview")["status"],503)
            with app.connect() as c:
                self.assertIsNone(c.execute(
                    "SELECT name FROM sqlite_master WHERE name='v2_content_translations'").fetchone())

    def test_legacy_english_visible_as_unapproved_review_candidate(self):
        self.init_store()
        with patch.dict(os.environ, FLAG):
            summary = self.admin.request("/api/v2/admin/i18n/overview")
            self.assertEqual(summary["status"],200,summary)
            by_kind={entry["kind"]:entry for entry in summary["body"]["libraries"]}
            self.assertEqual(by_kind["dish"]["statuses"]["legacy_review"],1)
            self.assertEqual(by_kind["plan"]["record_count"],0)
            self.assertTrue(by_kind["plan"]["integrated"])
            catalog=self.admin.request(
                "/api/v2/admin/i18n/catalog?entity_kind=dish&status=legacy_review")
            self.assertEqual(catalog["status"],200,catalog)
            self.assertEqual(catalog["body"]["total"],1)
            self.assertEqual(catalog["body"]["items"][0]["legacy_candidate"],"Chicken and rice")
            detail=self.detail("dish","dish-test","name_pt")
            self.assertEqual(detail["body"]["effective"]["text"],"Frango com arroz")
            self.assertIsNone(detail["body"]["candidate"])

    def test_admin_submit_approve_does_not_write_original(self):
        self.init_store()
        with patch.dict(os.environ, FLAG):
            original=self.detail()["body"]
            proposal=self.propose(original["source_hash"])
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/propose","POST",proposal,csrf=False)["status"],403)
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/propose","POST",proposal,
                origin="https://malicious.invalid")["status"],403)
            created=self.admin.request(
                "/api/v2/admin/i18n/propose","POST",proposal)
            self.assertEqual(created["status"],201,created)
            pending=self.detail()["body"]
            self.assertEqual(pending["effective"]["text"],"Arroz branco")
            approved=self.admin.request("/api/v2/admin/i18n/approve","POST",
                self.approve(original["source_hash"],
                             pending["candidate"]["candidate_hash"]))
            self.assertEqual(approved["status"],200,approved)
            self.assertEqual(self.detail()["body"]["effective"]["text"],"White rice")
            history=self.admin.request(
                "/api/v2/admin/i18n/history?entity_kind=food&entity_id=food-test&field_path=display_name")
            self.assertEqual(history["status"],200,history)
            self.assertEqual([x["action"] for x in history["body"]["history"]],
                             ["approved","submitted"])
            with app.connect() as c:
                row=c.execute(
                    "SELECT display_name,notes,kcal,protein_g,carbs_g,fat_g "
                    "FROM v2_food_library WHERE id='food-test'").fetchone()
                self.assertEqual(tuple(row),
                  ("Arroz branco","Pesar cozido",130,2.7,28.2,0.3))

    def test_conflict_if_original_or_candidate_changes(self):
        self.init_store()
        with patch.dict(os.environ, FLAG):
            original=self.detail()["body"]["source_hash"]
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/propose","POST",
                self.propose(original,"Rice"))["status"],201)
            stale_hash=self.detail()["body"]["candidate"]["candidate_hash"]
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/propose","POST",
                self.propose(original,"White rice"))["status"],201)
            bad=self.admin.request("/api/v2/admin/i18n/approve","POST",
                self.approve(original,stale_hash))
            self.assertEqual(bad["status"],409,bad)
            with app.connect() as c:
                c.execute("UPDATE v2_food_library SET display_name='Arroz integral' WHERE id='food-test'")
                c.commit()
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/propose","POST",
                self.propose(original))["status"],409)

    def test_existing_library_navigation_unchanged_and_shortcuts_exist(self):
        self.init_store()
        with patch.dict(os.environ, FLAG):
            with patch.object(app,"SITE_ROLE","admin"):
                page=self.admin.request("/")
            self.assertEqual(page["status"],200,page)
            self.assertIn(b"admin-translations-shortcuts.js",page["body"])
            self.assertIn(b'id="tm-admin-translations-page"',page["body"])
            # CSV remains a server compatibility path, not a review UI control.
            self.assertNotIn(b'id="i18n-import-file"',page["body"])
            self.assertIn(b'id="i18n-plan-stage"',page["body"])
            self.assertIn(b'id="tm-admin-translations-page"',page["body"])
            shell=self.admin.request("/admin-nav-shell.js")
            self.assertEqual(shell["status"],200,shell)
            shell_text=shell["body"].decode("utf-8")
            self.assertIn(r'class=\"tm-admin-nav-link\" id=\"tm-admin-nav-translations\"',shell_text)
            self.assertNotIn(r'class=\"tm-admin-subnav-link\" id=\"tm-admin-nav-translations\"',shell_text)
            self.assertNotIn(b'/admin-translations.js?v=3"',page["body"])
            self.assertIn(b'/admin-dashboard.js',page["body"])
            self.assertIn(b"admin-translations-shortcuts.css",page["body"])
            self.assertEqual(self.admin.request(
                "/admin-translations-shortcuts.js")["status"],200)
            self.assertEqual(self.admin.request(
                "/admin-translations-shortcuts.css")["status"],200)
            self.assertEqual(self.admin.request("/api/v2/food-library")["status"],200)

    def test_realistic_inventory_700_foods_277_dishes(self):
        self.init_store()
        with app.connect() as c:
            food_template=("INSERT INTO v2_food_library "
                "(id,source_key,base_name,display_name,category,notes,variant,"
                "edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at) "
                "VALUES (?,?,?,?,'Cereais','','plain',1,130,2,20,1,1,1,1)")
            existing_foods=c.execute(
                "SELECT COUNT(*) AS n FROM v2_food_library WHERE active=1"
            ).fetchone()[0]
            for i in range(700-existing_foods):
                name="Arroz "+str(i)
                c.execute(food_template,("food-"+str(i),None,name,name))
            for i in range(276):
                c.execute("""INSERT INTO v2_dish_library
                    (id,category,name_pt,name_en,image_filename,active)
                    VALUES (?,?,?,?,?,1)""",
                    ("dish-"+str(i),"Carne","Prato "+str(i),
                     "Dish "+str(i) if i<275 else "",
                     "placeholder"))
            c.commit()
        with patch.dict(os.environ, FLAG):
            response=self.admin.request("/api/v2/admin/i18n/overview")
            self.assertEqual(response["status"],200,response)
            by_kind={r["kind"]:r for r in response["body"]["libraries"]}
            self.assertEqual(by_kind["food"]["record_count"],700)
            self.assertEqual(by_kind["dish"]["record_count"],277)
            self.assertEqual(by_kind["dish"]["statuses"]["legacy_review"],276)
            self.assertEqual(by_kind["dish"]["statuses"]["missing"],1)
            page=self.admin.request(
                "/api/v2/admin/i18n/catalog?entity_kind=dish&status=legacy_review&page_size=25")
            self.assertEqual(page["status"],200,page)
            self.assertEqual((page["body"]["total"],len(page["body"]["items"])),(276,25))
            self.assertIn(self.admin.request("/api/v2/player/language")["status"],(403,404))


    def test_food_names_only_internal_notes_are_not_translatable(self):
        self.init_store()
        with patch.dict(os.environ, FLAG):
            overview=self.admin.request("/api/v2/admin/i18n/overview")
            self.assertEqual(overview["status"],200,overview)
            food=next(x for x in overview["body"]["libraries"] if x["kind"]=="food")
            self.assertEqual(food["record_count"],food["field_count"])
            catalog=self.admin.request("/api/v2/admin/i18n/catalog?entity_kind=food")
            record=next(x for x in catalog["body"]["items"] if x["entity_id"]=="food-test")
            self.assertEqual([f["field_path"] for f in record["fields"]],["display_name"])
            self.assertEqual(record["source_text"],"Arroz branco")
            self.assertFalse(any(x["field_path"]=="notes" for x in record["fields"]))
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n?entity_kind=food&entity_id=food-test&field_path=notes")["status"],400)

    def test_recipe_category_and_supplement_are_revisable_without_changing_sources(self):
        import json
        self.init_store()
        sectionid="a"*24
        ingredientid="b"*24
        recipeid="c"*24
        catid="d"*24
        supplementid="e"*24
        sections=[{
            "id":sectionid, "title":"Ingredientes principais",
            "ingredients":[{"id":ingredientid,"name":"Arroz branco",
                            "quantity":"100","unit":"g","recipe_ref_id":None}]
        }]
        with app.connect() as c:
            c.execute("INSERT INTO v2_recipe_categories(id,name,created_at) VALUES (?,?,?)",
                      (catid,"Refeições",1))
            c.execute("""INSERT INTO v2_recipe_library
                (id,category_id,name,recipe_type,status,servings,
                 sections_json,steps_json,notes,created_at,updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (recipeid,catid,"Arroz cozido","standard","published",2,
                 json.dumps(sections),json.dumps(["Cozer em água."],ensure_ascii=False),
                 "Servir quente.",1,1))
            c.execute("""INSERT INTO v2_supplement_library
               (id,name,dose,moment,rule,note,timing_text,prescriptions_json)
               VALUES(?,?,?,?,?,?,?,?)""",
               (supplementid,"Creatina","5 g","lunch","daily",
                "Misturar com água","Após o almoço",
                json.dumps([{"dose":"5 g","timing_text":"Antes do treino",
                             "note":"Tomar diariamente"}])))
            c.commit()
        with patch.dict(os.environ,FLAG):
            for kind,ident,field,original,english in [
                ("recipe",recipeid,"name","Arroz cozido","Cooked rice"),
                ("recipe",recipeid,
                 "sections/"+sectionid+"/ingredients/"+ingredientid+"/name",
                 "Arroz branco","White rice"),
                ("recipe",recipeid,"steps/0","Cozer em água.","Boil in water."),
                ("recipe_category",catid,"name","Refeições","Meals"),
                ("supplement",supplementid,"name","Creatina","Creatine"),
                ("supplement",supplementid,"timing_text",
                 "Após o almoço","After lunch"),
                ("supplement",supplementid,"prescriptions/0/note",
                 "Tomar diariamente","Take daily"),
            ]:
                with self.subTest(kind=kind,field=field):
                    detail=self.admin.request(
                        "/api/v2/admin/i18n?entity_kind="+kind+
                        "&entity_id="+ident+"&field_path="+field)
                    self.assertEqual(detail["status"],200,detail)
                    self.assertEqual(detail["body"]["source_text"],original)
                    body={
                        "entity_kind":kind,"entity_id":ident,"field_path":field,
                        "language":"en","expected_source_hash":detail["body"]["source_hash"],
                        "translated_text":english
                    }
                    proposed=self.admin.request("/api/v2/admin/i18n/propose","POST",body)
                    self.assertEqual(proposed["status"],201,proposed)
                    approved=self.admin.request("/api/v2/admin/i18n/approve","POST",{
                        "entity_kind":kind,"entity_id":ident,"field_path":field,
                        "language":"en","expected_source_hash":detail["body"]["source_hash"],
                        "expected_candidate_hash":
                           self.admin.request(
                           "/api/v2/admin/i18n?entity_kind="+kind+
                           "&entity_id="+ident+"&field_path="+field)["body"]["candidate"]["candidate_hash"]
                    })
                    self.assertEqual(approved["status"],200,approved)
            for kind,ident in [
                ("recipe",recipeid),("recipe_category",catid),
                ("supplement",supplementid)
            ]:
                result=self.admin.request("/api/v2/admin/i18n/catalog?entity_kind="+kind)
                self.assertEqual(result["status"],200,result)
                rec=next(x for x in result["body"]["items"] if x["entity_id"]==ident)
                self.assertGreater(len(rec["fields"]),0)
            with app.connect() as c:
                recipe=c.execute("SELECT name,sections_json,steps_json,notes,servings "
                                 "FROM v2_recipe_library WHERE id=?",(recipeid,)).fetchone()
                self.assertEqual(recipe["name"],"Arroz cozido")
                self.assertEqual(recipe["servings"],2)
                self.assertEqual(json.loads(recipe["sections_json"]),sections)
                self.assertEqual(json.loads(recipe["steps_json"]),["Cozer em água."])
                supplement=c.execute("SELECT name,dose,moment,rule,note,timing_text,"
                                    "prescriptions_json FROM v2_supplement_library WHERE id=?",
                                     (supplementid,)).fetchone()
                self.assertEqual(supplement["name"],"Creatina")
                self.assertEqual(supplement["dose"],"5 g")
                self.assertEqual(supplement["moment"],"lunch")
                self.assertEqual(supplement["rule"],"daily")
                self.assertEqual(json.loads(supplement["prescriptions_json"])[0]["dose"],"5 g")


if __name__ == "__main__":
    unittest.main()
