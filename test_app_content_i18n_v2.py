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

    def test_supplement_daily_text_is_current_and_prescriptions_are_unchanged(self):
        self.c.execute("""CREATE TABLE v2_supplement_library (
            id TEXT,name TEXT,dose TEXT,timing_text TEXT,note TEXT)""")
        self.c.execute("INSERT INTO v2_supplement_library VALUES (?,?,?,?,?)",
                       ("supp-1","Creatina","5 g","Após o treino","Com água"))
        self._put("supplement","supp-1","name","Creatina","Creatine")
        self._put("supplement","supp-1","dose","5 g","5 g")
        self._put("supplement","supp-1","timing_text",
                  "Após o treino","After training")
        self._put("supplement","supp-1","note","Com água","With water")
        source={"2026-11-23":[
            {"library_id":"supp-1","name":"Creatina","dose":"5 g",
             "moment":"post_training","timing_text":"Após o treino",
             "display_moment":"Após o treino","note":"Com água","rule":"daily"},
            {"library_id":"supp-1","name":"Creatina","dose":"10 g",
             "moment":"lunch_or_dinner","timing_text":"",
             "display_moment":"Almoço ou jantar","note":"Nota individual",
             "rule":"match"},
            {"library_id":"","name":"Outro suplemento","dose":"2 cápsulas",
             "moment":"lunch","display_moment":"","rule":"daily"}]}
        original=copy.deepcopy(source)
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            en=i18n.localise_supplement_days(self.c,source,language="en")
            daily,custom,unlinked=en["2026-11-23"]
            self.assertEqual(daily["name"],"Creatine")
            self.assertEqual(daily["dose"],"5 g")
            self.assertEqual(daily["timing_text"],"After training")
            self.assertEqual(daily["display_moment"],"After training")
            self.assertEqual(daily["note"],"With water")
            self.assertEqual(custom["dose"],"10 g")
            self.assertEqual(custom["note"],"Nota individual")
            self.assertEqual(custom["display_moment"],"Lunch or dinner")
            self.assertEqual(custom["rule"],"match")
            self.assertEqual(unlinked["name"],"Outro suplemento")
            self.assertEqual(source,original)
            self.assertIs(i18n.localise_supplement_days(
                self.c,source,language="pt"),source)
            self.c.execute("""UPDATE v2_content_translations
                SET status='pending'
                WHERE entity_kind='supplement' AND field_path='name'""")
            self.assertEqual(i18n.localise_supplement_days(
                self.c,source,language="en")["2026-11-23"][0]["name"],"Creatina")

    def test_recipe_catalogue_and_detail_translate_text_only(self):
        recipe={
            "id":"recipe-a","name":"Panquecas de aveia",
            "category_id":"category-a","category":"Pequeno-almoço",
            "notes":"Servir quente.","servings":4,
            "photo_key":"private-photo","has_photo":True,
            "sections":[{"id":"section-a","title":"Massa",
                "ingredients":[{"id":"ingredient-a","name":"Farinha de aveia",
                                 "unit":"colher de sopa","quantity":2,
                                 "food_id":"food-1"}]}],
            "steps":["Misturar os ingredientes.","Cozer numa frigideira."]
        }
        before=copy.deepcopy(recipe)
        self._put("recipe","recipe-a","name",
                  "Panquecas de aveia","Oat pancakes")
        self._put("recipe","recipe-a","notes",
                  "Servir quente.","Serve warm.")
        self._put("recipe","recipe-a","sections/section-a/title",
                  "Massa","Batter")
        self._put("recipe","recipe-a",
                  "sections/section-a/ingredients/ingredient-a/name",
                  "Farinha de aveia","Oat flour")
        self._put("recipe","recipe-a",
                  "sections/section-a/ingredients/ingredient-a/unit",
                  "colher de sopa","tablespoon")
        self._put("recipe","recipe-a","steps/0",
                  "Misturar os ingredientes.","Mix the ingredients.")
        self._put("recipe","recipe-a","steps/1",
                  "Cozer numa frigideira.","Cook in a frying pan.")
        self._put("recipe_category","category-a","name",
                  "Pequeno-almoço","Breakfast")
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            result=i18n.localise_recipe_detail(self.c,recipe,language="en")
            self.assertEqual(result["name"],"Oat pancakes")
            self.assertEqual(result["category"],"Breakfast")
            self.assertEqual(result["notes"],"Serve warm.")
            self.assertEqual(result["sections"][0]["title"],"Batter")
            ingredient=result["sections"][0]["ingredients"][0]
            self.assertEqual(ingredient["name"],"Oat flour")
            self.assertEqual(ingredient["unit"],"tablespoon")
            self.assertEqual(ingredient["quantity"],2)
            self.assertEqual(ingredient["food_id"],"food-1")
            self.assertEqual(result["steps"],[
                "Mix the ingredients.","Cook in a frying pan."])
            self.assertEqual(result["photo_key"],"private-photo")
            self.assertEqual(result["servings"],4)
            self.assertEqual(recipe,before,"Canonical PT recipe must not mutate")
            summary=i18n.localise_recipe_summaries(self.c,[{
                "id":"recipe-a","name":"Panquecas de aveia",
                "category_id":"category-a","category":"Pequeno-almoço",
                "servings":4}],language="en")
            self.assertEqual(summary[0]["name"],"Oat pancakes")
            self.assertEqual(summary[0]["category"],"Breakfast")
            self.c.execute("""UPDATE v2_content_translations
                SET status='pending' WHERE entity_kind='recipe'
                  AND field_path='steps/1'""")
            self.assertEqual(i18n.localise_recipe_detail(
                self.c,recipe,language="en")["steps"][1],
                "Cozer numa frigideira.")
            self.c.execute("""UPDATE v2_content_translations
                SET source_hash=? WHERE entity_kind='recipe'
                  AND field_path='name'""",(digest("revised"),))
            self.assertEqual(i18n.localise_recipe_detail(
                self.c,recipe,language="en")["name"],"Panquecas de aveia")
            self.assertIs(i18n.localise_recipe_detail(
                self.c,recipe,language="pt"),recipe)

    def test_dish_summaries_keep_canonical_names_for_legacy_menu_links(self):
        self._put("dish","dish-old","name_pt",
                  "Salmão grelhado","Grilled salmon")
        original=[{"id":"dish-old","name_pt":"Salmão grelhado",
                   "recipe_count":2}]
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            result=i18n.localise_dish_summaries(
                self.c,original,language="en")
            self.assertEqual(result[0]["name_pt"],"Salmão grelhado")
            self.assertEqual(result[0]["display_name"],"Grilled salmon")
            self.assertEqual(result[0]["recipe_count"],2)
            self.assertNotIn("display_name",original[0])
            self.assertIs(i18n.localise_dish_summaries(
                self.c,original,language="pt"),original)

    def test_dish_menu_names_follow_approved_content_without_mutation(self):
        self.c.execute("""CREATE TABLE v2_dish_library (
            id TEXT PRIMARY KEY,name_pt TEXT,active INTEGER)""")
        self.c.execute("INSERT INTO v2_dish_library VALUES(?,?,?)",
                       ("dish-1","Salmão grelhado",1))
        self._put("dish","dish-1","name_pt",
                  "Salmão grelhado","Grilled salmon")
        menus=[
            {"kind":"dish","dish_id":"dish-1","value":"Salmão grelhado",
             "menu_date":"2026-11-23","meal":"lunch"},
            {"kind":"text","dish_id":None,"value":"Salmão grelhado",
             "menu_date":"2026-11-23","meal":"dinner"},
            {"kind":"dish","dish_id":"absent","value":"Peixe",
             "menu_date":"2026-11-24","meal":"lunch"}]
        before=copy.deepcopy(menus)
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"0"}):
            self.assertIs(i18n.localise_dish_menus(
                self.c,menus,language="en"),menus)
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            local=i18n.localise_dish_menus(self.c,menus,language="en")
            self.assertEqual(local[0]["value"],"Grilled salmon")
            self.assertEqual(local[1]["value"],"Salmão grelhado")
            self.assertEqual(local[2]["value"],"Peixe")
            self.assertEqual([x["meal"] for x in local],
                             [x["meal"] for x in menus])
            self.assertEqual(menus,before)
            self.assertEqual(i18n.localise_dish_menus(
                self.c,menus,language="pt"),menus)
            self.c.execute("""UPDATE v2_content_translations
                SET status='pending' WHERE entity_kind='dish'""")
            self.assertEqual(i18n.localise_dish_menus(
                self.c,menus,language="en")[0]["value"],"Salmão grelhado")
            self.c.execute("""UPDATE v2_content_translations
                SET status='approved',source_hash=?
                WHERE entity_kind='dish'""",(digest("outdated"),))
            self.assertEqual(i18n.localise_dish_menus(
                self.c,menus,language="en")[0]["value"],"Salmão grelhado")

    def test_library_hashes_are_exact_but_plan_hashes_trim_source(self):
        library={"source_hash":digest(" Arroz branco "),
                 "translated_text":"White rice"}
        plan={"source_hash":digest("Arroz branco"),
              "translated_text":"White rice"}
        self.assertEqual(i18n._current_english(
            library," Arroz branco "),"White rice")
        self.assertEqual(i18n._current_english(
            plan," Arroz branco ")," Arroz branco ")
        self.assertEqual(i18n._current_english(
            plan," Arroz branco ",trim_source=True),"White rice")

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

    def test_option_ref_never_changes_with_language(self):
        from meal_option_selection_v2 import option_ref
        translated,english_library=self._translated()
        original=self.plans["Plano azul"]["content"]["meals"][0]["options"][0]
        english=translated["Plano azul"]["content"]["meals"][0]["options"][0]
        self.assertEqual(english["__tm_canonical_option_ref"],option_ref(original))
        self.assertNotEqual(option_ref(original),option_ref(english))
        with patch.object(plans_api,"_option_totals",return_value={
                "kcal":200,"protein_g":2,"carbs_g":4,"fat_g":1}), \
             patch.object(plans_api,"_option_items",return_value=[]):
            portuguese_view=plans_api._options(self.plan["meals"][0],self.library)
            english_view=plans_api._options(
                translated["Plano azul"]["content"]["meals"][0],english_library,
                language="en")
        self.assertEqual(portuguese_view[0]["option_ref"],
                         english_view[0]["option_ref"])
        self.assertEqual(portuguese_view[0]["option_ref"],option_ref(original))
        self.assertEqual(english_view[0]["title"],"Rice with fish")
        self.assertEqual(portuguese_view[0]["title"],"Arroz com peixe")
        self.assertNotIn("__tm_canonical_option_ref",english_view[0])

    def test_alternative_notes_are_localised_but_prescription_is_not(self):
        translated,library=self._translated()
        option=translated["Plano azul"]["content"]["meals"][0]["options"][0]
        with patch.object(plans_api,"_option_totals",return_value={}):
            english=plans_api._options(
                translated["Plano azul"]["content"]["meals"][0],
                library,language="en")
            portuguese=plans_api._options(
                self.plan["meals"][0],self.library,language="pt")
        self.assertEqual(english[0]["option_ref"],portuguese[0]["option_ref"])
        self.assertTrue(any(item.get("text","").startswith("or ")
                            for item in english[0]["items"]))
        self.assertTrue(any(item.get("text","").startswith("ou ")
                            for item in portuguese[0]["items"]))
        self.assertEqual(english[0]["number"],portuguese[0]["number"])
        self.assertEqual(english[0]["totals"],portuguese[0]["totals"])
        self.assertEqual(option["foods"][1]["alternative_to"],0)
        self.assertEqual(plans_api._split_display_quantity(
            "uma colher de sopa",{"grams":30},0.5,"en"),"50% of uma colher de sopa")
        self.assertEqual(plans_api._split_display_quantity(
            "uma colher de sopa",{"grams":30},0.5,"pt"),"50% de uma colher de sopa")

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
             mocked.object(plans_api,"_colors",side_effect=lambda p,l,language:(p,l)), \
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
