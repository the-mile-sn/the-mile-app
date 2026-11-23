"""Read-only approved content translation tests. No production data."""
import copy
import hashlib
import json
import os
import sqlite3
import unittest
from unittest.mock import patch

import app_content_i18n_v2 as i18n
import food_plan_player_v2 as plans_api


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class PresentationTranslationTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.execute("""CREATE TABLE v2_content_translations(
            entity_kind TEXT, entity_id TEXT, field_path TEXT, language TEXT,
            source_hash TEXT, translated_text TEXT, status TEXT)""")
        self.plan = {
            "meals":[{"name":"Almoço","options":[{
                "title":"Arroz com peixe",
                "notes":["Podes aquecer antes de servir."],
                "foods":[
                    {"kind":"food","id":"food-1","display_name":"Arroz branco",
                     "display_quantity":"100 g","grams":100},
                    {"kind":"food","id":"food-1","display_name":"Arroz com salsa",
                     "display_quantity":"2 unidades","grams":100,
                     "alternative_to":0},
                    {"kind":"supplement","label":"Suplemento de teste"}]
            }]}]
        }
        self.raw = json.dumps(self.plan,ensure_ascii=False,separators=(",",":"))
        self.library = {"food-1":{"display_name":"Arroz branco",
                         "grams":100,"protein_g":1.5,"kcal":100}}
        self.plans = {"Plano azul":{"content":copy.deepcopy(self.plan),
            "published_at":123,"draft_id":"draft-1","snapshot_json":self.raw}}
        self.ref = "pub:" + digest("draft-1\0" + self.raw)
        self._put("food","food-1","display_name","Arroz branco","White rice")
        self._put("plan",self.ref,"meals/0/options/0/title",
                  "Arroz com peixe","Rice with fish")
        self._put("plan",self.ref,"meals/0/options/0/notes/0",
                  "Podes aquecer antes de servir.","You can heat before serving.")
        self._put("plan",self.ref,"meals/0/options/0/foods/0/display_quantity",
                  "100 g","100 g")
        self._put("plan",self.ref,"meals/0/options/0/foods/1/display_name",
                  "Arroz com salsa","Rice with parsley")
        self._put("plan",self.ref,"meals/0/options/0/foods/1/display_quantity",
                  "2 unidades","2 units")
        self._put("plan",self.ref,"meals/0/options/0/foods/2/label",
                  "Suplemento de teste","Test supplement")
        self.c.commit()

    def tearDown(self):
        self.c.close()

    def _put(self,kind,entity_id,path,source,target,status="approved"):
        self.c.execute("""INSERT INTO v2_content_translations
                VALUES (?,?,?,?,?,?,?)""",
                (kind,entity_id,path,"en",digest(source),target,status))

    def _translated(self):
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            return i18n.localise_published_plans(
                self.c,self.plans,self.library,language="en")

    def test_flag_off_and_portuguese_are_identity_and_never_query(self):
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"0"}):
            p,l=i18n.localise_published_plans(
                self.c,self.plans,self.library,language="en")
            self.assertIs(p,self.plans)
            self.assertIs(l,self.library)
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            p,l=i18n.localise_published_plans(
                self.c,self.plans,self.library,language="pt")
            self.assertIs(p,self.plans)
            self.assertIs(l,self.library)

    def test_all_approved_fields_are_display_only(self):
        before=copy.deepcopy(self.plans)
        translated, library=self._translated()
        option=translated["Plano azul"]["content"]["meals"][0]["options"][0]
        self.assertEqual(option["title"],"Rice with fish")
        self.assertEqual(option["notes"],["You can heat before serving."])
        self.assertEqual(option["foods"][0]["display_name"],"White rice")
        self.assertEqual(option["foods"][0]["display_quantity"],"100 g")
        self.assertEqual(option["foods"][1]["display_name"],"Rice with parsley")
        self.assertEqual(option["foods"][1]["display_quantity"],"2 units")
        self.assertEqual(option["foods"][2]["label"],"Test supplement")
        self.assertEqual(option["foods"][1]["alternative_to"],0)
        self.assertEqual(option["foods"][0]["grams"],100)
        self.assertEqual(library["food-1"]["display_name"],"White rice")
        self.assertEqual(library["food-1"]["protein_g"],1.5)
        self.assertEqual(self.plans,before,"Original snapshot must never mutate")
        self.assertEqual(self.library["food-1"]["display_name"],"Arroz branco")
        self.assertEqual(translated["Plano azul"]["snapshot_json"],self.raw)

    def test_pending_and_stale_cannot_leak(self):
        self.c.execute("""UPDATE v2_content_translations SET status='pending'
            WHERE field_path='meals/0/options/0/title'""")
        self.c.execute("""UPDATE v2_content_translations SET source_hash=?
            WHERE field_path='meals/0/options/0/notes/0'""",
            (digest("previous text"),))
        translated,_=self._translated()
        option=translated["Plano azul"]["content"]["meals"][0]["options"][0]
        self.assertEqual(option["title"],"Arroz com peixe")
        self.assertEqual(option["notes"],["Podes aquecer antes de servir."])

    def test_new_publication_cannot_reuse_old_version(self):
        latest=copy.deepcopy(self.plans)
        # Even a metadata-only republish changes the snapshot ref.
        modified=json.loads(self.raw)
        modified["version_note"]="updated"
        latest["Plano azul"]["snapshot_json"]=json.dumps(
            modified,ensure_ascii=False,separators=(",",":"))
        latest["Plano azul"]["content"]=modified
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            result,lib=i18n.localise_published_plans(
                self.c,latest,self.library,language="en")
        option=result["Plano azul"]["content"]["meals"][0]["options"][0]
        self.assertEqual(option["title"],"Arroz com peixe")
        self.assertEqual(option["notes"],["Podes aquecer antes de servir."])
        # Food library translations are independent of a publication version.
        self.assertEqual(option["foods"][0]["display_name"],"White rice")
        self.assertEqual(lib["food-1"]["display_name"],"White rice")

    def test_missing_translation_table_fails_to_original(self):
        self.c.execute("DROP TABLE v2_content_translations")
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            result,lib=i18n.localise_published_plans(
                self.c,self.plans,self.library,language="en")
        self.assertIs(result,self.plans)
        self.assertIs(lib,self.library)

    def test_food_plan_reader_is_compatible_with_old_default(self):
        from unittest.mock import patch as mocked
        with mocked.object(plans_api,"_approved",return_value=self.plans), \
             mocked.object(plans_api,"_library",return_value=self.library), \
             mocked.object(plans_api,"_colors",side_effect=lambda p,l:(p,l)), \
             mocked.object(plans_api,"_peri_plans",return_value={}), \
             patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            pt=plans_api.player_plans(self.c,"assigned-athlete")
            en=plans_api.player_plans(self.c,"assigned-athlete",language="en")
        self.assertEqual(pt["options_by_color"][0]["Plano azul"]["content"]
                          ["meals"][0]["options"][0]["title"],"Arroz com peixe")
        self.assertEqual(en["options_by_color"][0]["Plano azul"]["content"]
                          ["meals"][0]["options"][0]["title"],"Rice with fish")


if __name__=="__main__":
    unittest.main()
