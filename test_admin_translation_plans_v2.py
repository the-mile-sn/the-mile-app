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
                     "display_name":"Arroz branco cozido","alternative_to":0,
                     "display_quantity":"50 g"},
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

    def test_approved_title_pattern_is_bound_for_postgres(self):
        """PostgreSQL psycopg rejects bare % in raw SQL string literals."""
        import app_translation_plans_v2 as plan_reviews

        class Cursor:
            def fetchall(self):
                return []

        class GuardConnection:
            def execute(self, sql, params=()):
                self.sql = sql.replace("?", "%s")
                self.params = params
                if "LIKE %s" not in self.sql:
                    raise AssertionError("LIKE pattern must be parameterized")
                if any(fragment in self.sql for fragment in
                       ("meals/%/", "LIKE 'meals/", "%/options/%")):
                    raise AssertionError("Literal SQL percent breaks psycopg")
                return Cursor()

        guarded = GuardConnection()
        self.assertEqual(plan_reviews._approved_titles(guarded), {})
        self.assertEqual(guarded.params, ("meals/%/options/%/title",))

    def test_only_authorized_admin_can_inspect_and_no_snapshot_is_exported(self):
        with patch.dict(os.environ,FLAG):
            item=self.index()
            ref=item["publication_ref"]
            self.assertEqual(len(ref),64)
            self.assertEqual(item["player_label"],"Atleta de teste")
            self.assertNotIn("snapshot_json",str(item))
            self.assertNotIn("private-athlete-001",str(item))
            self.assertEqual(item["field_count"],7)
            self.assertEqual(item["linked_food_count"],1)
            audit=self.call()["body"]["reuse_audit"]
            self.assertEqual(audit["linked_food_references"],1)
            self.assertEqual(audit["alternative_overrides"],1)
            self.assertEqual(audit["individual_notes"],1)
            self.assertEqual(audit["option_title_occurrences"],1)
            self.assertEqual(audit["distinct_option_titles"],1)
            self.assertNotIn("Atleta de teste",str(audit))
            self.assertNotIn("Tomar 2 vezes",str(audit))
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
            self.assertEqual(fields[3]["field_kind"],"alternative_override")
            self.assertIn("Alternativa personalizada",fields[3]["field_label"])
            self.assertIsNone(fields[3]["suggestion"])
            self.assertFalse(fields[0]["sensitive"])
            self.assertNotIn("NOTA INTERNA",str(answer))
            self.assertNotIn("private-athlete-001",str(answer))
            self.assertFalse(answer["body"].get("csv_export"))
            self.assertEqual(Client().request(ROOT)["status"],401)
            self.assertEqual(Client().request(ROOT+"/fields?publication_ref="+ref)["status"],401)
            with patch.object(app,"SITE_ROLE","player"):
                self.assertEqual(self.call()["status"],404)
            with patch.object(app,"SITE_ROLE","chef"):
                self.assertEqual(self.call()["status"],404)
        with patch.dict(os.environ,{"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"0"}):
            self.assertEqual(self.call()["status"],404)

    def test_final_coverage_audit_reconciles_all_statuses(self):
        with patch.dict(os.environ, FLAG):
            audit=self.call()["body"]["reuse_audit"]
            totals=audit["coverage_totals"]
            kinds=audit["coverage_by_kind"]
            self.assertEqual(totals["missing"],7)
            self.assertEqual(totals["approved"],0)
            self.assertEqual(kinds["option_title"]["missing"],1)
            self.assertEqual(kinds["individual_note"]["missing"],1)
            self.assertEqual(kinds["display_quantity"]["missing"],3)
            self.assertEqual(sum(totals.values()),audit["visible_text_fields"])
            self.assertEqual(sum(sum(v.values()) for v in kinds.values()),
                             audit["visible_text_fields"])
            ref=self.index()["publication_ref"]
            title=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(self.propose(ref,title,"Option 1")["status"],201)
            self.assertEqual(self.call()["body"]["reuse_audit"][
                "coverage_totals"]["pending"],1)
            pending=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(self.approve(ref,pending)["status"],200)
            updated=self.call()["body"]["reuse_audit"]["coverage_totals"]
            self.assertEqual(updated["approved"],1)
            self.assertEqual(updated["missing"],6)

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


    def test_exact_approved_title_suggestion_never_creates_a_proposal(self):
        with patch.dict(os.environ,FLAG):
            ref=self.index()["publication_ref"]
            title=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(self.propose(ref,title,"Option 1")["status"],201)
            approved=self.fields(ref)["body"]["fields"][0]
            self.assertEqual(self.approve(ref,approved)["status"],200)
            second=json.loads(self.original)
            second["id"]="plan-second"
            second["player_name"]="Outro atleta"
            with app.connect() as c:
                c.execute("""INSERT INTO v2_food_plan_editor_publications
                    (draft_id,athlete_id,plan_type,snapshot_json,published_at,state)
                    VALUES(?,?,?,?,?,?)""",("plan-second","private-athlete-002",
                    "Plano azul",json.dumps(second,ensure_ascii=False),101,"published"))
                c.commit()
            response=self.call()
            self.assertEqual(response["status"],200,response)
            audit=response["body"]["reuse_audit"]
            self.assertEqual(audit["published_versions"],2)
            self.assertEqual(audit["repeated_option_title_occurrences"],1)
            self.assertEqual(audit["distinct_option_titles"],1)
            self.assertEqual(audit["approved_title_suggestions"],1)
            self.assertNotIn("Outro atleta",str(audit))
            second_ref=next(p["publication_ref"] for p in response["body"]["items"]
                if p["player_label"]=="Outro atleta")
            fields=self.fields(second_ref)["body"]["fields"]
            new_title=fields[0]
            self.assertEqual(new_title["status"],"missing")
            self.assertEqual(new_title["suggestion"],{
                "text":"Option 1","origin":"approved_exact_title","requires_review":True})
            self.assertIsNone(fields[1]["suggestion"])
            self.assertIsNone(fields[3]["suggestion"])
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                     v2_content_translations WHERE entity_kind='plan'""").fetchone()[0],1)
            self.assertEqual(self.propose(second_ref,new_title,
                new_title["suggestion"]["text"])["status"],201)
            self.assertEqual(self.fields(second_ref)["body"]["fields"][0]["status"],
                             "pending")

    def test_conservative_unit_suggestion_preserves_numbers_and_is_not_saved(self):
        with patch.dict(os.environ,FLAG):
            modified=json.loads(self.original)
            modified["meals"][0]["options"][0]["foods"][2][
                "display_quantity"]="2 un / 120 g"
            with app.connect() as c:
                c.execute("""UPDATE v2_food_plan_editor_publications
                    SET snapshot_json=? WHERE draft_id=?""",
                    (json.dumps(modified,ensure_ascii=False),self.draft_id))
                c.commit()
            ref=self.index()["publication_ref"]
            audit=self.call()["body"]["reuse_audit"]
            self.assertEqual(audit["simple_unit_suggestions"],1)
            quantity=next(f for f in self.fields(ref)["body"]["fields"]
                if f["field_path"]=="meals/0/options/0/foods/2/display_quantity")
            self.assertEqual(quantity["suggestion"],{
                "text":"2 units / 120 g","origin":"simple_unit_rule","requires_review":True})
            self.assertEqual(quantity["status"],"missing")
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                   v2_content_translations WHERE entity_kind='plan'""").fetchone()[0],0)
            self.assertEqual(self.propose(ref,quantity,"2 units / 120 g")["status"],201)
            self.assertEqual(self.propose(ref,quantity,"2 units / 120 mg")["status"],400)


    def _add_publication(self, index, *, meal_name=None, title=None):
        copy=json.loads(self.original)
        copy["id"]="shared-"+str(index)
        copy["player_name"]="Fictício "+str(index)
        if meal_name is not None:
            copy["meals"][0]["name"]=meal_name
        if title is not None:
            copy["meals"][0]["options"][0]["title"]=title
        with app.connect() as c:
            c.execute("""INSERT INTO v2_food_plan_editor_publications
                (draft_id,athlete_id,plan_type,snapshot_json,published_at,state)
                VALUES(?,?,?,?,?,?)""",("shared-"+str(index),"fictitious-"+str(index),
                "Plano azul",json.dumps(copy,ensure_ascii=False),100+index,"published"))
            c.commit()
        return copy

    def _common(self):
        return self.call(ROOT+"/common")

    def test_common_preview_is_contextual_and_excludes_private_fields(self):
        with patch.dict(os.environ,FLAG):
            self._add_publication(2)
            self._add_publication(3,meal_name="Almoço")
            self._add_publication(4,title="Outra refeição")
            result=self._common()
            self.assertEqual(result["status"],200,result)
            groups=result["body"]["items"]
            titles=[g for g in groups if g["field_kind"]=="option_title"]
            original=next(g for g in titles if g["source_text"]=="Opção 1"
                          and g["meal_context"]=="Pequeno almoço")
            self.assertEqual(original["missing_count"],2)
            self.assertEqual(original["occurrences"],2)
            self.assertEqual(next(g for g in titles if g["source_text"]=="Opção 1"
                and g["meal_context"]=="Almoço")["missing_count"],1)
            self.assertNotIn("Atleta de teste",str(result))
            self.assertNotIn("Tomar 2 vezes",str(result))
            self.assertNotIn("Arroz branco cozido",str(result))
            self.assertNotIn("private-athlete",str(result))
            self.assertTrue(all(g["field_kind"]=="option_title" for g in groups))
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                     v2_content_translations WHERE entity_kind='plan'""").fetchone()[0],0)

    def test_shared_review_requires_ack_and_preserves_snapshots_with_audit(self):
        with patch.dict(os.environ,FLAG):
            self._add_publication(2)
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="option_title")
            body={
                "group_id":group["group_id"],"source_hash":group["source_hash"],
                "expected_group_hash":group["expected_group_hash"],
                "translated_text":"Option 1","acknowledged":True
            }
            denied=self.call(ROOT+"/common/approve","POST",{**body,"acknowledged":False})
            self.assertEqual(denied["status"],400,denied)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",body,csrf=False)["status"],403)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",{
                **body,"translated_text":"Option 2"})["status"],400)
            result=self.call(ROOT+"/common/approve","POST",body)
            self.assertEqual(result["status"],200,result)
            self.assertEqual(result["body"]["approved"],2)
            self.assertEqual(result["body"]["remaining"],0)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",body)["status"],409)
            self.assertFalse(any(x["field_kind"]=="option_title" for x
                             in self._common()["body"]["items"]))
            with app.connect() as c:
                approved=c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan' AND status='approved'""").fetchone()[0]
                self.assertEqual(approved,2)
                actions=[r["action"] for r in c.execute("""
                    SELECT action FROM v2_content_translation_history
                    WHERE entity_kind='plan' ORDER BY action""").fetchall()]
                self.assertEqual(actions,["approved","approved","submitted","submitted"])
                snapshot=c.execute("""SELECT snapshot_json FROM
                    v2_food_plan_editor_publications WHERE draft_id=?""",
                    (self.draft_id,)).fetchone()["snapshot_json"]
                self.assertEqual(snapshot,self.original)
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                     WHERE field_path LIKE ?""",("%/notes/%",)).fetchone()[0],0)


    def test_screened_consumption_note_csv_can_be_imported_and_approved(self):
        """Normal plan notes use staged CSV; dosing notes stay in private review."""
        with patch.dict(os.environ, FLAG):
            amended=json.loads(self.original)
            amended["meals"][0]["options"][0]["notes"]=[
                "Podes aquecer o pão antes de adicionar o queijo.",
                "Tomar 2 vezes durante o dia"]
            with app.connect() as c:
                c.execute("""UPDATE v2_food_plan_editor_publications
                    SET snapshot_json=? WHERE draft_id=?""",
                    (json.dumps(amended,ensure_ascii=False),self.draft_id))
                c.commit()
            response=self._common()
            self.assertEqual(response["status"],200,response)
            groups=response["body"]["items"]
            note=next(g for g in groups if g["field_kind"]=="individual_note")
            self.assertEqual(note["source_text"],
                             "Podes aquecer o pão antes de adicionar o queijo.")
            self.assertTrue(note["plan_note_candidate"])
            self.assertTrue(note["csv_eligible"])
            self.assertNotIn("Tomar 2 vezes",str(response))
            self.assertNotIn("Atleta de teste",str(response))
            original_snapshot=json.dumps(amended,ensure_ascii=False)
            translated="You can toast the bread before adding the cheese."
            staged=self.call(ROOT+"/common/import","POST",{
                "rows":[self._csv_row(note,translated)]})
            self.assertEqual(staged["status"],201,staged)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                  v2_content_translations WHERE entity_kind='plan'
                  AND field_path LIKE ?""",("%/notes/%",)).fetchone()[0],0)
            current=next(g for g in self._common()["body"]["items"]
                         if g["group_id"]==note["group_id"])
            approved=self.call(ROOT+"/common/approve","POST",{
                "group_id":current["group_id"],
                "source_hash":current["source_hash"],
                "expected_group_hash":current["expected_group_hash"],
                "translated_text":translated,"acknowledged":True})
            self.assertEqual(approved["status"],200,approved)
            with app.connect() as c:
                row=c.execute("""SELECT translated_text,status FROM
                    v2_content_translations WHERE entity_kind='plan'
                    AND field_path='meals/0/options/0/notes/0'""").fetchone()
                self.assertEqual(row["status"],"approved")
                self.assertEqual(row["translated_text"],translated)
                snapshot=c.execute("""SELECT snapshot_json FROM
                     v2_food_plan_editor_publications WHERE draft_id=?""",
                     (self.draft_id,)).fetchone()["snapshot_json"]
                self.assertEqual(snapshot,original_snapshot)

    def _csv_row(self, group, english):
        return {"group_id":group["group_id"],
                "source_hash":group["source_hash"],
                "expected_group_hash":group["expected_group_hash"],
                "expected_stage_hash":group["expected_stage_hash"],
                "translated_text":english}

    def test_simple_unit_suggestions_agree_with_singular_and_plural(self):
        import app_translation_plans_v2 as plan_reviews
        self.assertEqual(plan_reviews._quantity_hint("1 un"), "1 unit")
        self.assertEqual(plan_reviews._quantity_hint("2 un"), "2 units")
        self.assertEqual(plan_reviews._quantity_hint("1 un / 120 g"),
                         "1 unit / 120 g")


    def test_single_title_csv_is_version_bound_and_manual_reviewed(self):
        """Unique option titles can use the existing staged CSV import route.

        Nothing touches free notes, supplements or original snapshots.
        """
        with patch.dict(os.environ,FLAG):
            preview=self._common()
            self.assertEqual(preview["status"],200,preview)
            title=next(g for g in preview["body"]["items"]
                       if g["field_kind"]=="option_title")
            self.assertEqual(title["missing_count"],1)
            self.assertTrue(title["single_title_candidate"])
            self.assertTrue(title["csv_eligible"])
            self.assertEqual(title["source_text"],"Opção 1")
            self.assertEqual(self.call(ROOT+"/common/import","POST",{
                "rows":[self._csv_row(title,"Option 1")]}
            )["status"],201)
            reloaded=next(g for g in self._common()["body"]["items"]
                          if g["group_id"]==title["group_id"])
            self.assertEqual(reloaded["imported_status"],"pending")
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan'""").fetchone()[0],0)
            approved=self.call(ROOT+"/common/approve","POST",{
                "group_id":reloaded["group_id"],"source_hash":reloaded["source_hash"],
                "expected_group_hash":reloaded["expected_group_hash"],
                "translated_text":reloaded["imported_text"],"acknowledged":True})
            self.assertEqual(approved["status"],200,approved)
            self.assertEqual(approved["body"]["approved"],1)
            with app.connect() as c:
                row=c.execute("""SELECT status FROM v2_content_translations
                    WHERE entity_kind='plan' AND field_path='meals/0/options/0/title'
                """).fetchone()
                self.assertEqual(row["status"],"approved")
                self.assertEqual(c.execute("""SELECT snapshot_json FROM
                    v2_food_plan_editor_publications WHERE draft_id=?""",
                    (self.draft_id,)).fetchone()["snapshot_json"],self.original)

    def test_single_title_export_excludes_obvious_clinical_or_personal_labels(self):
        with patch.dict(os.environ,FLAG):
            self.assertEqual(self._common()["body"]["items"][0]["csv_eligible"],True)
            for title in ("Alergia ao leite", "Plano do jogador Lucas",
                          "Contactar teste@example.com",
                          "https://exemplo.com/instrucoes", "Medicação 5 mg"):
                edited=json.loads(self.original)
                edited["meals"][0]["options"][0]["title"]=title
                with app.connect() as c:
                    c.execute("""UPDATE v2_food_plan_editor_publications
                        SET snapshot_json=? WHERE draft_id=?""",
                        (json.dumps(edited,ensure_ascii=False),self.draft_id))
                    c.commit()
                result=self._common()
                self.assertEqual(result["status"],200,result)
                candidate=next(x for x in result["body"]["items"]
                               if x["field_kind"]=="option_title")
                self.assertFalse(candidate["single_title_candidate"],title)
                self.assertFalse(candidate["csv_eligible"],title)
                self.assertNotIn("Tomar 2 vezes",str(result))
                self.assertNotIn("private-athlete",str(result))
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan_common'""").fetchone()[0],0)

    def test_common_csv_import_is_private_staged_and_not_approved(self):
        with patch.dict(os.environ,FLAG):
            self._add_publication(2)
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="option_title")
            self.assertTrue(group["csv_eligible"])
            self.assertEqual(group["expected_stage_hash"],"")
            row=self._csv_row(group,"Option 1")
            self.assertEqual(self.call(ROOT+"/common/import","POST",
                {"rows":[row]},csrf=False)["status"],403)
            self.assertEqual(Client().request(ROOT+"/common")["status"],401)
            self.assertEqual(Client().request(ROOT+"/common/import","POST",
                {"rows":[row]})["status"],401)
            result=self.call(ROOT+"/common/import","POST",{"rows":[row]})
            self.assertEqual(result["status"],201,result)
            self.assertEqual(result["body"]["imported"],1)
            self.assertEqual(result["body"]["approved"],0)
            state=next(x for x in self._common()["body"]["items"]
                       if x["group_id"]==group["group_id"])
            self.assertEqual(state["imported_status"],"pending")
            self.assertEqual(state["imported_text"],"Option 1")
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan'""").fetchone()[0],0)
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan_common' AND status='pending'""").fetchone()[0],1)
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translation_history
                    WHERE entity_kind='plan_common' AND action='submitted'""").fetchone()[0],1)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",{
                "group_id":group["group_id"],"source_hash":group["source_hash"],
                "expected_group_hash":group["expected_group_hash"],
                "translated_text":"Option 2","acknowledged":True})["status"],409)
            result=self.call(ROOT+"/common/approve","POST",{
                "group_id":group["group_id"],"source_hash":group["source_hash"],
                "expected_group_hash":group["expected_group_hash"],
                "translated_text":"Option 1","acknowledged":True})
            self.assertEqual(result["status"],200,result)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                   WHERE entity_kind='plan' AND status='approved'""").fetchone()[0],2)
                self.assertEqual(c.execute("""SELECT status FROM v2_content_translations
                   WHERE entity_kind='plan_common'""").fetchone()["status"],"approved")
                self.assertEqual(c.execute("""SELECT snapshot_json FROM
                   v2_food_plan_editor_publications WHERE draft_id=?""",
                   (self.draft_id,)).fetchone()["snapshot_json"],self.original)

    def test_common_csv_import_prevents_stale_or_clinical_changes(self):
        with patch.dict(os.environ,FLAG):
            self._add_publication(2)
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="option_title")
            row=self._csv_row(group,"Option 1")
            for invalid in (
                {**row,"source_hash":"a"*64},
                {**row,"expected_group_hash":"f"*64},
                {**row,"translated_text":"Option 2"},
                {**row,"expected_stage_hash":"c"*64},
                {**row,"extra":"test"},
            ):
                self.assertNotEqual(self.call(ROOT+"/common/import","POST",
                    {"rows":[invalid]})["status"],201)
            self.assertEqual(self.call(ROOT+"/common/import","POST",
                {"rows":[row,row]})["status"],400)
            self.assertEqual(self.call(ROOT+"/common/import","POST",
                {"rows":[row for _ in range(101)]})["status"],400)
            self.assertEqual(self.call(ROOT+"/common/import","POST",
                {"rows":[row]})["status"],201)
            approved_staged=next(x for x in self._common()["body"]["items"]
                if x["group_id"]==group["group_id"])
            self.assertEqual(self.call(ROOT+"/common/import","POST",{
                "rows":[self._csv_row(approved_staged,"Option 1")]}
                )["body"]["unchanged"],1)
            self.assertEqual(self.call(ROOT+"/common/import","POST",{
                "rows":[row]})["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan_common'""").fetchone()[0],1)
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                    WHERE entity_kind='plan'""").fetchone()[0],0)
            # Clinical notes are not eligible for importing into common memory.
            self.assertEqual(self.call(ROOT+"/common/import","POST",{"rows":[{
                **row,"group_id":"a"*64}]})["status"],409)
            with patch.object(app,"SITE_ROLE","player"):
                self.assertEqual(self.call(ROOT+"/common/import","POST",
                    {"rows":[row]})["status"],404)

    def test_common_csv_stage_revision_never_overwrites_approved(self):
        with patch.dict(os.environ,FLAG):
            self._add_publication(2)
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="option_title")
            first=self._csv_row(group,"Option 1")
            self.assertEqual(self.call(ROOT+"/common/import","POST",
                {"rows":[first]})["status"],201)
            current=next(x for x in self._common()["body"]["items"]
                if x["group_id"]==group["group_id"])
            revised=self._csv_row(current,"Option 1 revised")
            self.assertEqual(self.call(ROOT+"/common/import","POST",
                {"rows":[revised]})["status"],201)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",{
                "group_id":group["group_id"],"source_hash":group["source_hash"],
                "expected_group_hash":group["expected_group_hash"],
                "translated_text":"Option 1 revised","acknowledged":True})["status"],200)
            # Add another matching publication so this previously approved
            # common memory becomes relevant to a new version.
            self._add_publication(3)
            newer=next(x for x in self._common()["body"]["items"]
                if x["group_id"]==group["group_id"])
            self.assertEqual(newer["imported_status"],"approved")
            self.assertEqual(self.call(ROOT+"/common/import","POST",{
                "rows":[self._csv_row(newer,"Option 1")]})["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT translated_text FROM
                    v2_content_translations WHERE entity_kind='plan_common'
                    """).fetchone()["translated_text"],"Option 1 revised")

    def test_common_approval_caps_each_transaction_at_100(self):
        with patch.dict(os.environ,FLAG):
            # 102 identical title occurrences, but only up to 100 are
            # submitted and approved in a single, audited transaction.
            for number in range(2,103):
                self._add_publication(number)
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="option_title")
            self.assertEqual(group["missing_count"],102)
            def body(g):
                return {"group_id":g["group_id"],"source_hash":g["source_hash"],
                        "expected_group_hash":g["expected_group_hash"],
                        "translated_text":"Option 1","acknowledged":True}
            first=self.call(ROOT+"/common/approve","POST",body(group))
            self.assertEqual(first["status"],200,first)
            self.assertEqual(first["body"]["approved"],100)
            self.assertEqual(first["body"]["remaining"],2)
            refreshed=next(g for g in self._common()["body"]["items"]
                           if g["field_kind"]=="option_title")
            self.assertEqual(refreshed["missing_count"],2)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",body(group))["status"],409)
            second=self.call(ROOT+"/common/approve","POST",body(refreshed))
            self.assertEqual(second["status"],200,second)
            self.assertEqual(second["body"]["approved"],2)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM
                    v2_content_translations WHERE entity_kind='plan'
                    AND status='approved'""").fetchone()[0],102)

    def test_common_preview_conflict_does_not_approve_stale_group(self):
        with patch.dict(os.environ,FLAG):
            self._add_publication(2)
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="option_title")
            updated=json.loads(self.original)
            updated["meals"][0]["options"][0]["title"]="Outra opção"
            with app.connect() as c:
                c.execute("""UPDATE v2_food_plan_editor_publications
                    SET snapshot_json=? WHERE draft_id=?""",
                    (json.dumps(updated,ensure_ascii=False),self.draft_id))
                c.commit()
            body={
                "group_id":group["group_id"],"source_hash":group["source_hash"],
                "expected_group_hash":group["expected_group_hash"],
                "translated_text":"Option 1","acknowledged":True}
            self.assertEqual(self.call(ROOT+"/common/approve","POST",body)["status"],409)
            with app.connect() as c:
                self.assertEqual(c.execute("""SELECT COUNT(*) FROM v2_content_translations
                      WHERE entity_kind='plan'""").fetchone()[0],0)

    def test_common_unit_rule_and_pending_cannot_be_overwritten(self):
        with patch.dict(os.environ,FLAG):
            updated=json.loads(self.original)
            updated["meals"][0]["options"][0]["foods"][0]["display_quantity"]="2 un / 120 g"
            with app.connect() as c:
                c.execute("""UPDATE v2_food_plan_editor_publications
                    SET snapshot_json=? WHERE draft_id=?""",
                    (json.dumps(updated,ensure_ascii=False),self.draft_id))
                c.commit()
            ref=self.index()["publication_ref"]
            row=next(f for f in self.fields(ref)["body"]["fields"]
                     if f["field_path"]=="meals/0/options/0/foods/0/display_quantity")
            self.assertEqual(self.propose(ref,row,"2 units / 120 g")["status"],201)
            groups=self._common()["body"]["items"]
            self.assertFalse(any(g["field_kind"]=="display_quantity" for g in groups))
            # Another publication has the identical unit but is still missing.
            duplicate=json.loads(json.dumps(updated))
            duplicate["id"]="shared-2"
            with app.connect() as c:
                c.execute("""INSERT INTO v2_food_plan_editor_publications
                     (draft_id,athlete_id,plan_type,snapshot_json,published_at,state)
                     VALUES(?,?,?,?,?,?)""",("shared-2","private-test-2","Plano azul",
                      json.dumps(duplicate,ensure_ascii=False),101,"published"))
                c.commit()
            group=next(g for g in self._common()["body"]["items"]
                       if g["field_kind"]=="display_quantity")
            self.assertEqual(group["missing_count"],1)
            self.assertEqual(group["pending_count"],1)
            self.assertEqual(group["suggestion"]["text"],"2 units / 120 g")
            body={"group_id":group["group_id"],"source_hash":group["source_hash"],
                  "expected_group_hash":group["expected_group_hash"],
                  "translated_text":"2 units / 120 g","acknowledged":True}
            self.assertEqual(self.call(ROOT+"/common/approve","POST",{
                **body,"translated_text":"2 units / 120 mg"})["status"],400)
            self.assertEqual(self.call(ROOT+"/common/approve","POST",body)["status"],200)
            with app.connect() as c:
                statuses=[r["status"] for r in c.execute("""
                    SELECT status FROM v2_content_translations
                    WHERE entity_kind='plan' ORDER BY status""").fetchall()]
                self.assertEqual(statuses,["approved","pending"])

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
