"""Regression tests for published Planos delivered to player accounts.

Only in-memory fixtures. Never write to any actual athlete's database.
"""
import json
import sqlite3
import unittest

import food_plan_player_v2 as player


def f(fid,grams,**extra):
    return {"id":fid,"grams":grams,**extra}


def meal(name,*options):
    return {"name":name,"options":list(options)}


def opt(*foods,notes=None,title=""):
    fs=list(foods)
    n=notes or []
    return {"title":title,"foods":fs,"notes":n,
            "order":[{"type":"food","index":i} for i in range(len(fs))]+
                    [{"type":"note","index":i} for i in range(len(n))]}


def plan(kind,meals,athlete="a1",account="u1"):
    return {"plan_type":kind,"athlete_id":athlete,"player_id":account,
            "meals":meals}


class PlayerPlanPublicationTests(unittest.TestCase):
    def setUp(self):
        c=sqlite3.connect(":memory:")
        c.row_factory=sqlite3.Row
        self.c=c
        c.executescript("""
            CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,archived_at TEXT);
            CREATE TABLE v2_player_links(athlete_id TEXT,user_id TEXT);
            CREATE TABLE v2_food_plan_editor_publications(
                draft_id TEXT PRIMARY KEY,athlete_id TEXT,plan_type TEXT,
                snapshot_json TEXT,published_at INTEGER,state TEXT);
            CREATE TABLE v2_food_library(
                id TEXT PRIMARY KEY,display_name TEXT,variant TEXT,
                edible_fraction REAL,kcal REAL,protein_g REAL,
                carbs_g REAL,fat_g REAL,active INTEGER);
            CREATE TABLE v2_match_peri_overrides(
                athlete_id TEXT,match_id TEXT,phase TEXT,state TEXT);
            INSERT INTO v2_athletes VALUES('a1',NULL),('a2',NULL);
            INSERT INTO v2_player_links VALUES('a1','u1'),('a2','u2');
            INSERT INTO v2_food_library VALUES
                ('bread','Pão','plain',1.0,250,10,50,2,1),
                ('fruit','Fruta','gross',0.8,100,2,20,1,1);
        """)

    def add(self,value,ident="id1",state="published"):
        self.c.execute(
            "INSERT INTO v2_food_plan_editor_publications VALUES (?,?,?,?,?,?)",
            (ident,value["athlete_id"],value["plan_type"],json.dumps(value),
             100,state))

    def test_not_published_is_not_sent_to_player(self):
        self.add(plan("Plano amarelo",[meal("Pequeno almoço",
                                          opt(f("bread",80)))]),state="transitional")
        data=player.player_plans(self.c,"a1")
        self.assertEqual(data["options_by_color"]["yellow"]["breakfast"],[])

    def test_shared_breakfast_snack_and_fractions(self):
        self.add(plan("Plano amarelo",[meal("Pequeno almoço / lanche",
                                          opt(f("bread",80),f("fruit",100)))]))
        data=player.player_plans(self.c,"a1")["options_by_color"]["yellow"]
        self.assertEqual(data["breakfast"][0]["totals"]["kcal"],280)
        self.assertEqual(data["snack"][0]["totals"]["kcal"],280)
        self.assertEqual(data["dinner"],[])

    def test_alternatives_average_instead_of_sum(self):
        self.add(plan("Plano azul",[meal("Almoço / jantar",
                                       opt(f("bread",80),f("fruit",100,alternative_to=0)))]))
        options=player.player_plans(self.c,"a1")["options_by_color"]["blue"]
        self.assertAlmostEqual(options["lunch"][0]["totals"]["kcal"],140)
        self.assertEqual(options["lunch"],options["dinner"])
        self.assertIn("ou ",options["lunch"][0]["items"][1]["text"])

    def test_display_quantity_and_notes_are_preserved(self):
        self.add(plan("Plano verde",[meal("Jantar",
                                        opt(f("bread",80,display_quantity="2 fatias",
                                              display_name="Pão de mistura"),
                                            notes=["Nota do chef"]))]))
        item=player.player_plans(self.c,"a1")["options_by_color"]["green"]["dinner"][0]
        self.assertEqual(item["items"][0]["quantity"],"2 fatias")
        self.assertEqual(item["items"][0]["name"],"Pão de mistura")
        self.assertEqual(item["items"][1]["text"],"Nota do chef")
        self.assertEqual(item["totals"]["kcal"],200)

    def test_change_visible_only_after_approved_snapshot_updates(self):
        original=plan("Plano amarelo",[meal("Pequeno almoço",opt(f("bread",80)))])
        self.add(original)
        first=player.player_plans(self.c,"a1")["options_by_color"]["yellow"]["breakfast"][0]
        self.assertEqual(first["totals"]["kcal"],200)
        new=plan("Plano amarelo",[meal("Pequeno almoço",opt(f("bread",120)))])
        self.c.execute("UPDATE v2_food_plan_editor_publications SET snapshot_json=?",
                       (json.dumps(new),))
        second=player.player_plans(self.c,"a1")["options_by_color"]["yellow"]["breakfast"][0]
        self.assertEqual(second["totals"]["kcal"],300)

    def test_account_mismatch_cannot_leak_other_athlete(self):
        self.add(plan("Plano amarelo",[meal("Pequeno almoço",opt(f("bread",80)))],
                      athlete="a1",account="u2"))
        data=player.player_plans(self.c,"a1")
        self.assertEqual(data["options_by_color"]["yellow"]["breakfast"],[])

    def test_training_pre_and_post_options_are_distinct(self):
        self.add(plan("Plano Peri-treino",[
            meal("Pré-treino",opt(f("bread",80))),
            meal("Pós-treino",opt(f("fruit",100)))]),"peri")
        data=player.player_plans(self.c,"a1")["peri_plans"]["training"]
        self.assertEqual(data["options"]["pre"][0]["totals"]["kcal"],200)
        self.assertEqual(data["options"]["post"][0]["totals"]["kcal"],80)

    def test_actual_training_event_phases_and_override(self):
        self.add(plan("Plano Peri-treino",[
            meal("Pré-treino",opt(f("bread",80))),
            meal("Pós treino",opt(f("fruit",100)))]),"peri")
        event={"id":"t1","kind":"training","event_date":"2026-11-06",
               "session":"morning","pre_override":"off","post_override":"auto"}
        rows=player.player_peri_days(self.c,"a1","2026-11-06","2026-11-06",
                                    events=[event],matches=[])
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["phase"],"post")
        self.assertEqual(rows[0]["options"][0]["totals"]["kcal"],80)

    def test_match_intra_maps_to_existing_match_card_without_double_counting(self):
        self.add(plan("Plano Peri-jogo",[
            meal("Intra-jogo",opt(f("bread",80)))]),"peri")
        day="2026-11-06"
        event={"id":"event1","kind":"match","event_date":day,"session":"morning"}
        match={"id":"official1","match_date":day,"match_time":"10:00"}
        results=player.player_peri_days(self.c,"a1",day,day,
                                       events=[event],matches=[match])
        self.assertEqual(len(results),1)
        self.assertEqual(results[0]["event_id"],"event1")
        self.assertEqual(results[0]["phase"],"pre")
        self.assertEqual(results[0]["title"],"Intra-jogo")

    def test_match_override_off_blocks_intra(self):
        self.add(plan("Plano Peri-jogo",[
            meal("Intra-jogo",opt(f("bread",80)))]),"peri")
        self.c.execute(
            "INSERT INTO v2_match_peri_overrides VALUES ('a1','match1','pre','off')")
        rows=player.player_peri_days(
            self.c,"a1","2026-11-06","2026-11-06",events=[],
            matches=[{"id":"match1","match_date":"2026-11-06","match_time":"10:00"}])
        self.assertEqual(rows,[])

    def test_missing_food_blocks_broken_published_option(self):
        self.add(plan("Plano amarelo",[meal("Pequeno almoço",
                                          opt(f("not-in-library",80)))]))
        data=player.player_plans(self.c,"a1")["options_by_color"]["yellow"]
        self.assertEqual(data["breakfast"],[])

    def test_older_snapshot_with_user_id_only_resolves_canonical_athlete(self):
        value=plan("Plano amarelo",[meal("Pequeno almoço",opt(f("bread",80)))])
        del value["athlete_id"]
        self.c.execute(
            "INSERT INTO v2_food_plan_editor_publications VALUES (?,?,?,?,?,?)",
            ("old","a1","Plano amarelo",json.dumps(value),100,"published"))
        data=player.player_plans(self.c,"a1")["options_by_color"]["yellow"]
        self.assertEqual(data["breakfast"][0]["totals"]["kcal"],200)
        audit=player.audit_published_options(self.c)
        self.assertEqual(audit["published_plans"],1)
        self.assertEqual(audit["bad_options"],0)

    def tearDown(self):
        self.c.close()


if __name__=="__main__":
    unittest.main()
