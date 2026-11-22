"""WSGI regression tests for private, version-bound Planos translations.

Uses only disposable SQLite. Never connects to real athletes or Render data.
"""
import hashlib
import json
import os
import unittest
from unittest.mock import patch

import test_app
import content_translations_v2 as translations

app=test_app.app
Client=test_app.Client
ROOT="/api/v2/admin/i18n/plans"
FLAG={"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"1","MILE_APP_TRANSLATIONS_ENABLED":"0"}


class PlanTranslationsTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.draft_id="plan-testing-draft"
        self.plan={
            "id":self.draft_id,"athlete_id":"private-athlete-001",
            "player_name":"Atleta de teste","name":"Atleta de teste - Plano azul",
            "plan_type":"Plano azul",
            "meals":[{"name":"Pequeno almoço","options":[{
                "title":"Opção 1",
                "notes":["Tomar 2 vezes durante o dia"],
                "foods":[
                    {"kind":"food","id":"food-plan-test","grams":100,
                     "display_name":"Arroz branco","display_quantity":"100 g"},
                    {"kind":"food","id":"food-plan-test","grams":50,
                     "display_name":"Arroz branco cozido","display_quantity":"50 g"},
                    {"kind":"supplement","id":"","grams":None,
                     "label":"Creatina 5 g","display_quantity":"5 g"}],
                "order":[{"type":"note","index":0},
                         {"type":"food","index":0},
                         {"type":"food","index":1},
                         {"type":"food","index":2}]
            }]}]
        }
        with app.connect() as c:
            translations.initialize(c)
            c.execute("""CREATE TABLE IF NOT EXISTS v2_food_plan_editor_publications (
                draft_id TEXT PRIMARY KEY,athlete_id TEXT NOT NULL,
                plan_type TEXT NOT NULL,snapshot_json TEXT NOT NULL,
                published_at BIGINT NOT NULL,state TEXT NOT NULL)""")
            c.execute("""INSERT INTO v2_food_library(
                id,source_key,base_name,display_name,category,notes,variant,
                edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at)
                VALUES('food-plan-test',NULL,'Arroz','Arroz branco','Cereais',
                 'NOTA INTERNA','plain',1,130,2.7,28,0.3,1,1,1)""")
            self.original=json.dumps(self.plan,ensure_ascii=False)
            c.execute("""INSERT INTO v2_food_plan_editor_publications(
                draft_id,athlete_id,plan_type,snapshot_json,published_at,state)
                VALUES(?,?,?,?,?,?)""",(self.draft_id,"private-athlete-001",
                 "Plano azul",self.original,100,"published"))
            c.commit()

    def call(self,path=ROOT,method="GET",body=None,**kw):
        return self.admin.request(path,method,body,**kw)

    def index(self):
        answer=self.call()
        self.assertEqual(answer["status"],200,answer)
        self.assertEqual(answer["body"]["total"],1,answer)
        return answer["body"]["items"][0]

    def fields(self,ref):
        return self.call(ROOT+"/fields?publication_ref="+ref)

    def propose(self,ref,row,text,**kw):
        return self.call(ROOT+"/propose","POST",{
            "publication_ref":ref,"field_path":row["field_path"],
            "expected_source_hash":row["source_hash"],"translated_text":text
        },**kw)

    def approve(self,ref,row,**kw):
        return self.call(ROOT+"/approve","POST",{
            "publication_ref":ref,"field_path":row["field_path"],
            "expected_source_hash":row["source_hash"],
            "expected_candidate_hash":row["candidate_hash"]
        },**kw)

    def test_only_authorized_admin_can_inspect_and_no_snapshot_is_exported(self):
        with patch.dict(os.environ,FLAG):
            item=self.index()
            ref=item["publication_ref"]
            self.assertEqual(len(ref),64)
            self.assertEqual(item["player_label"],"Atleta de teste")
            self.assertNotIn("snapshot_json",str(item))
            self.assertNotIn("private-athlete-001",str(item))
            self.assertEqual(item["field_count"],7)
            self.assertEqual(item["linked_food_count"],2)
            answer=self.fields(ref)
            self.assertEqual(answer["status"],200,answer)
            fields=answer["body"]["fields"]
            self.assertEqual([f["field_path"] for f in fields],[
                "meals/0/options/0/title",
                "meals/0/options/0/notes/0",
                "meals/0/options/0/foods/0/display_quantity",
                "meals/0/options/0/foods/1/display_name",
                "meals/0/options/0/foods/1/display_quantity",
                "meals/0/options/0/foods/2/label",
                "meals/0/options/0/foods/2/display_quantity"
            ])
            self.assertTrue(fields[1]["sensitive"])
            self.assertFalse(fields[0]["sensitive"])
            self.assertNotIn("NOTA INTERNA",str(answer))
            self.assertNotIn("private-athlete-001",str(answer))
            self.assertFalse(answer["body"].get("csv_export"))
            self.assertEqual(Client().request(ROOT)["status"],401)
            self.assertEqual(Client().request(ROOT+"/fields?publication_ref="+ref)["status"],401)
            with patch.object(app,"SITE_ROLE","player"):
                self.assertEqual(self.call()["status"],404)
        with patch.dict(os.environ,{"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"0"}):
            self.assertEqual(self.call()["status"],404)

    def test_proposal_approval_audit_and_original_plan_unchanged(self):
        with patch.dict(os.environ,FLAG):
            ref=self.index()["publication_ref"]
            row=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(self.propose(ref,row,"Option 1")["status"],201)
            pending=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(pending["status"],"pending")
            self.assertEqual(self.approve(ref,pending,csrf=False)["status"],403)
            self.assertEqual(self.approve(ref,pending)["status"],200)
            approved=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(approved["status"],"approved")
            hist=self.call(ROOT+"/history?publication_ref="+ref+
                "&field_path=meals%2F0%2Foptions%2F0%2Ftitle")
            self.assertEqual(hist["status"],200,hist)
            self.assertEqual([e["action"] for e in hist["body"]["history"]],
                             ["approved","submitted"])
            self.assertEqual(self.index()["statuses"]["approved"],1)
            with app.connect() as c:
                snapshot=c.execute("""SELECT snapshot_json FROM
                      v2_food_plan_editor_publications WHERE draft_id=?""",
                      (self.draft_id,)).fetchone()["snapshot_json"]
                self.assertEqual(snapshot,self.original)
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations "
                 "WHERE entity_kind='plan'").fetchone()[0],1)

    def test_numeric_change_and_nonvisible_paths_rejected(self):
        with patch.dict(os.environ,FLAG):
            ref=self.index()["publication_ref"]
            fields=self.fields(ref)["body"]["fields"]
            quantity=next(f for f in fields if f["field_path"].endswith("display_quantity"))
            self.assertEqual(self.propose(ref,quantity,"200 g")["status"],400)
            self.assertEqual(self.propose(ref,quantity,"100 mg")["status"],400)
            self.assertEqual(self.propose(ref,quantity,"100 g")["status"],201)
            missing=self.call(ROOT+"/propose","POST",{
                "publication_ref":ref,"field_path":"meals/0/options/0/foods/0/grams",
                "expected_source_hash":quantity["source_hash"],
                "translated_text":"100 g"})
            self.assertEqual(missing["status"],400)
            body={
                "publication_ref":ref,"field_path":quantity["field_path"],
                "expected_source_hash":quantity["source_hash"],
                "translated_text":"100 g","athlete_id":"forged"}
            self.assertEqual(self.call(ROOT+"/propose","POST",body)["status"],400)

    def test_republish_invalidates_old_version_without_affecting_audit(self):
        with patch.dict(os.environ,FLAG):
            ref=self.index()["publication_ref"]
            row=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(self.propose(ref,row,"Option 1")["status"],201)
            updated=json.loads(self.original)
            updated["meals"][0]["options"][0]["title"]="Opção 2"
            with app.connect() as c:
                c.execute("""UPDATE v2_food_plan_editor_publications
                    SET snapshot_json=? WHERE draft_id=?""",
                    (json.dumps(updated,ensure_ascii=False),self.draft_id))
                c.commit()
            self.assertEqual(self.approve(ref,{
                **row,"candidate_hash":hashlib.sha256(b"Option 1").hexdigest()})["status"],409)
            newref=self.index()["publication_ref"]
            self.assertNotEqual(ref,newref)
            newfields=self.fields(newref)["body"]["fields"]
            self.assertEqual(newfields[0]["source_text"],"Opção 2")
            self.assertEqual(newfields[0]["status"],"missing")
            with app.connect() as c:
                old=c.execute("""SELECT status FROM v2_content_translations
                    WHERE entity_kind='plan'""").fetchone()
                self.assertEqual(old["status"],"pending")

if __name__=="__main__":
    unittest.main()
