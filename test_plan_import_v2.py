"""Regression tests for the isolated, unpublished PDF plan draft importer."""
import unittest
import sqlite3
import json
from unittest.mock import patch
import plan_import_v2


class FakePage:
    def __init__(self, text):
        self.text = text

    def extract_text(self, extraction_mode=None):
        return self.text


class FakeReader:
    pages = [
        FakePage("Resumo do plano alimentar\nPrincipal\nIntermédia"),
        FakePage("""
Pequeno almoço / Lanche
Opção 1         464 34,8 43,0 13,6
- Pão com ovos mexidos
60 g Pão  154 4,8 28,8 1,2
Numa taça juntar e mexer:
Ceia
Opção 1         405 34,8 49,7 4,9
1 un YoPro Danone  179 30,4 11,5 0,3
"""),
        FakePage("""
Almoço / Jantar
- Opção 1         771 46,9 83,7 22,9
130 g Carne ou peixe 173 33,4 0,0 4,3
"""),
    ]


class PlanImportTests(unittest.TestCase):
    def test_group_mapping_and_review_lines(self):
        with patch.object(plan_import_v2, "PdfReader", return_value=FakeReader()):
            plan = plan_import_v2.extract_plan(b"%PDF-test")
        self.assertEqual([group["meals"] for group in plan["groups"]],
                         [["breakfast", "snack"], ["supper"], ["lunch", "dinner"]])
        self.assertEqual(plan["groups"][0]["options"][0]["totals"]["kcal"], "464")
        self.assertIn("Numa taça juntar e mexer:", plan["groups"][0]["options"][0]["lines"])
        self.assertGreater(len(plan["warnings"]), 0)

    def test_food_nutrients_and_instruction(self):
        food = plan_import_v2.structure_line("2 un / 110 g Ovo 158 13,8 0,0 11,4")
        self.assertEqual(food["kind"], "food")
        self.assertEqual(food["quantity"], "2 un / 110 g")
        self.assertEqual(food["name"], "Ovo")
        self.assertEqual(food["nutrients"]["protein_g"], "13,8")
        instruction = plan_import_v2.structure_line("Numa taça juntar, mexer e levar ao frigorífico por 6h:")
        self.assertEqual(instruction["kind"], "instruction")

    def test_color_allowlist(self):
        self.assertNotIn("purple", plan_import_v2.ALLOWED_COLORS)



class DeleteImportedOptionTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY)")
        self.db.execute("INSERT INTO v2_athletes (id) VALUES ('player-a'), ('player-b')")
        plan_import_v2.initialize(self.db)
        self.original = {
            "groups": [
                {"heading": "Almoço/Jantar", "meals": ["lunch", "dinner"], "options": [
                    {"number": 1, "title": "A", "items": [{"kind": "food", "quantity": "100 g", "name": "A"}]},
                    {"number": 2, "title": "B", "items": [{"kind": "food", "quantity": "200 g", "name": "B"}]},
                    {"number": 3, "title": "C", "items": [{"kind": "food", "quantity": "300 g", "name": "C"}]}
                ]},
                {"heading": "Ceia", "meals": ["supper"], "options": [{"number": 1, "title": "Ceia", "items": []}]}
            ],
            "warnings": [], "pages": 1
        }
        for draft_id, athlete, status in [("draft-a", "player-a", "draft"), ("draft-b", "player-b", "draft"), ("validated", "player-a", "validated")]:
            self.db.execute(
                "INSERT INTO v2_plan_imports(id,athlete_id,color,filename,status,extracted_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (draft_id, athlete, "green", "plan.pdf", status, json.dumps(self.original), 1),
            )
        self.db.execute(
            "INSERT INTO v2_plan_publications(id,athlete_id,color,source_import_id,snapshot_json,published_at,published_by) VALUES(?,?,?,?,?,?,?)",
            ("publication", "player-a", "green", "validated", json.dumps(self.original), 10, "admin")
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_deletes_only_selected_option_and_renumbers_remaining(self):
        result = plan_import_v2.delete_option(self.db, "player-a", "draft-a", 0, 1)
        opts = result["extracted"]["groups"][0]["options"]
        self.assertEqual([(o["number"], o["title"]) for o in opts], [(1, "A"), (2, "C")])
        self.assertEqual(len(result["extracted"]["groups"][1]["options"]), 1)
        self.assertEqual(len(plan_import_v2.get_draft(self.db, "player-b", "draft-b")["extracted"]["groups"][0]["options"]), 3)
        self.assertEqual(len(plan_import_v2.get_draft(self.db, "player-a", "validated")["extracted"]["groups"][0]["options"]), 3)
        published = json.loads(self.db.execute("SELECT snapshot_json FROM v2_plan_publications WHERE id='publication'").fetchone()[0])
        self.assertEqual(len(published["groups"][0]["options"]), 3)

    def test_removes_group_only_when_last_option_is_deleted(self):
        plan_import_v2.delete_option(self.db, "player-a", "draft-a", 1, 0)
        groups = plan_import_v2.get_draft(self.db, "player-a", "draft-a")["extracted"]["groups"]
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["heading"], "Almoço/Jantar")

    def test_rejects_wrong_athlete_validated_and_invalid_indices(self):
        self.assertIsNone(plan_import_v2.delete_option(self.db, "player-b", "draft-a", 0, 0))
        with self.assertRaises(ValueError):
            plan_import_v2.delete_option(self.db, "player-a", "validated", 0, 0)
        for group_index, option_index in [(-1, 0), (0, -1), (0, 3), (10, 0), (True, 0), (0, False)]:
            with self.assertRaises(ValueError):
                plan_import_v2.delete_option(self.db, "player-a", "draft-a", group_index, option_index)

    def test_last_option_may_leave_empty_draft_without_publication(self):
        for _ in range(3):
            plan_import_v2.delete_option(self.db, "player-a", "draft-a", 0, 0)
        plan_import_v2.delete_option(self.db, "player-a", "draft-a", 0, 0)
        result = plan_import_v2.get_draft(self.db, "player-a", "draft-a")
        self.assertEqual(result["extracted"]["groups"], [])
        with self.assertRaises(ValueError):
            plan_import_v2.set_review_status(self.db, "player-a", "draft-a", "approve")


if __name__ == "__main__":
    unittest.main()
