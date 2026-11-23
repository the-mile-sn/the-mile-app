"""Staged Player EN preflight tests. Synthetic data, no network or production DB."""
import copy
import hashlib
import json
import os
import sqlite3
import unittest
from unittest.mock import patch

from tools import player_i18n_rollout_preflight as gate


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class RolloutPreflightTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.execute("""CREATE TABLE v2_content_translations(
          entity_kind TEXT, entity_id TEXT, field_path TEXT, language TEXT,
          source_hash TEXT, translated_text TEXT, status TEXT)""")
        self.snapshot = {
            "meals": [{"name":"Pequeno-almoço / Lanche",
                       "options":[{"title":"Panquecas + Quark",
                                   "notes":["Bebe 250 ml de agua."],
                                   "foods":[
                                       {"kind":"food","id":"quark","display_name":"Quark",
                                        "display_quantity":"125 g"},
                                       {"kind":"supplement","label":"Produto especial"}]}]}]
        }
        self.raw = json.dumps(self.snapshot,ensure_ascii=False)
        self.plan = {"draft_id":"d1","snapshot_json":self.raw,
                     "content":copy.deepcopy(self.snapshot)}
        self.ref = "pub:" + digest("d1\0" + self.raw)
        self.library = {"quark":{"display_name":"Quark"}}

    def tearDown(self):
        self.c.close()

    def approve(self,kind,entity_id,path,source,english,status="approved"):
        self.c.execute("""INSERT INTO v2_content_translations
            VALUES(?,?,?,?,?,?,?)""",
            (kind,entity_id,path,"en",digest(source),english,status))

    def test_missing_and_pending_never_count_as_approved(self):
        self.approve("plan",self.ref,"meals/0/options/0/title",
                     "Panquecas + Quark","Pancakes + Quark","pending")
        result=gate.coverage(self.c,{"yellow":self.plan},self.library)
        self.assertEqual(result["option_titles"],{"fields":1,"approved":0,"missing":1})
        self.assertEqual(result["option_notes"]["missing"],1)
        self.assertEqual(result["food_names"]["missing"],1)
        self.assertEqual(result["quantities"]["missing"],1)
        self.assertEqual(result["supplement_labels"]["missing"],1)

    def test_current_approved_matches_cover_all_fields_without_mutation(self):
        self.approve("plan",self.ref,"meals/0/options/0/title",
                     "Panquecas + Quark","Pancakes + Quark")
        self.approve("plan",self.ref,"meals/0/options/0/notes/0",
                     "Bebe 250 ml de agua.","Drink 250 ml of water.")
        self.approve("plan",self.ref,"meals/0/options/0/foods/0/display_quantity",
                     "125 g","125 g")
        self.approve("food","quark","display_name","Quark","Quark")
        self.approve("plan",self.ref,"meals/0/options/0/foods/1/label",
                     "Produto especial","Special product")
        original=copy.deepcopy(self.plan)
        result=gate.coverage(self.c,{"yellow":self.plan},self.library)
        self.assertTrue(all(v["approved"]==v["fields"]==1
                            for v in result.values()),result)
        self.assertEqual(self.plan,original)
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_content_translations").fetchone()[0],5)

    def test_republished_version_cannot_reuse_old_approval(self):
        self.approve("plan",self.ref,"meals/0/options/0/title",
                     "Panquecas + Quark","Pancakes + Quark")
        revised=copy.deepcopy(self.plan)
        revised["snapshot_json"] += " "
        result=gate.coverage(self.c,{"yellow":revised},self.library)
        self.assertEqual(result["option_titles"]["missing"],1)

    def test_stale_food_name_and_hash_are_never_counted(self):
        self.approve("food","quark","display_name","Quark antigo","Quark")
        result=gate.coverage(self.c,{"yellow":self.plan},self.library)
        self.assertEqual(result["food_names"]["approved"],0)

    def test_pilot_configuration_ignores_empty_and_whitespace_names(self):
        env={"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"1",
             "MILE_APP_TRANSLATIONS_ENABLED":"1",
             "MILE_PLAYER_I18N_PILOT_USERNAMES":" AnaMarkovic, , second, "}
        state,names=gate.flags(env)
        self.assertTrue(state["explicit_pilot_allowlist"])
        self.assertEqual(names,{"anamarkovic","second"})
        self.assertEqual(state["allowlist_size"],2)
        state,_=gate.flags({**env,"MILE_PLAYER_I18N_PILOT_USERNAMES":" "})
        self.assertFalse(state["explicit_pilot_allowlist"])
        state,_=gate.flags({**env,"MILE_APP_TRANSLATIONS_ENABLED":"0"})
        self.assertFalse(state["translation_flags_enabled"])
        state,_=gate.flags({key:value for key,value in env.items()
                            if key!="MILE_PLAYER_I18N_PILOT_USERNAMES"})
        self.assertFalse(state["explicit_pilot_allowlist"])

    def test_disabled_preflight_never_queries_sensitive_data(self):
        class ForbiddenConnection:
            def execute(self,*args,**kwargs):
                raise AssertionError("DB query should never run with flags disabled")
        result=gate.inspect(ForbiddenConnection(),{})
        self.assertEqual(result["status"],"gate_not_ready")

    def test_enabled_preflight_reports_counts_without_names_or_clinical_text(self):
        self.c.executescript("""
            CREATE TABLE users (id TEXT, username TEXT, role TEXT, active INTEGER);
            CREATE TABLE v2_player_links (user_id TEXT,athlete_id TEXT);
            CREATE TABLE v2_athletes (id TEXT,archived_at TEXT);
            INSERT INTO users VALUES ('user-1','anamarkovic','player',1);
            INSERT INTO v2_player_links VALUES ('user-1','a1');
            INSERT INTO v2_athletes VALUES ('a1',NULL);
        """)
        env={"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"1",
             "MILE_APP_TRANSLATIONS_ENABLED":"1",
             "MILE_PLAYER_I18N_PILOT_USERNAMES":"anamarkovic"}
        with patch("app_content_i18n_v2.translation_store_available",return_value=True),\
             patch("food_plan_player_v2._library",return_value=self.library),\
             patch("food_plan_player_v2._approved",return_value={"yellow":self.plan}):
            report=gate.inspect(self.c,env)
        self.assertEqual(report["linked_pilots"],1)
        self.assertEqual(report["published_plans"],1)
        self.assertEqual(report["status"],"plan_content_review_required")
        printed=json.dumps(report)
        self.assertNotIn("anamarkovic",printed)
        self.assertNotIn("Panquecas",printed)
        self.assertNotIn("Bebe",printed)


if __name__ == "__main__":
    unittest.main()
