"""Backward-compatible, non-destructive menu dish ID migration tests."""
import sqlite3
import unittest
from datetime import date, timedelta

import microcycles_v2 as menus


class MenuDishIdTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        menus.initialize(self.c)
        self.c.execute("INSERT INTO v2_athletes (id,name,created_at) VALUES ('a1','Teste',1)")
        self.add_dish("d1", "Frango original")
        self.add_dish("d2", "Outra receita")
        self.c.commit()

    def tearDown(self):
        self.c.close()

    def add_dish(self, dish_id, name):
        self.c.execute(
            "INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename) VALUES (?,?,?,?,?)",
            (dish_id,"Carne branca",name,"",dish_id+".webp")
        )

    def day(self):
        return menus.list_menus(self.c,"a1","2026-11-03","2026-11-03")

    def test_name_only_legacy_writes_link_unique_id_without_breaking_contract(self):
        item=menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango original")
        self.assertEqual(item["dish_id"],"d1")
        self.assertEqual(self.day()[0]["value"],"Frango original")
        self.assertEqual(self.day()[0]["dish_id"],"d1")

    def test_renaming_dish_does_not_break_existing_link(self):
        menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango original","d1")
        self.c.execute("UPDATE v2_dish_library SET name_pt='Frango renomeado' WHERE id='d1'")
        self.assertEqual(self.day()[0]["value"],"Frango renomeado")
        self.assertEqual(self.day()[0]["dish_id"],"d1")
        raw=self.c.execute("SELECT value FROM v2_weekly_menus").fetchone()["value"]
        self.assertEqual(raw,"Frango original")  # no destructive rewrite

    def test_duplicate_names_never_choose_arbitrary_id(self):
        self.add_dish("d3","Frango original")
        item=menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango original")
        self.assertIsNone(item["dish_id"])
        self.assertEqual(self.day()[0]["value"],"Frango original")
        audit=menus.menu_dish_id_audit(self.c)
        self.assertEqual(audit["unresolved_names"][0]["reason"],"ambiguous")
        explicit=menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango original","d3")
        self.assertEqual(explicit["dish_id"],"d3")

    def test_unmatched_legacy_text_still_supported(self):
        menus.save_menu(self.c,"a1","2026-11-03","dinner","dish","Prato manual antigo")
        self.assertIsNone(self.day()[0]["dish_id"])
        self.assertEqual(self.day()[0]["value"],"Prato manual antigo")
        self.assertEqual(menus.menu_dish_id_audit(self.c)["unresolved_names"][0]["reason"],"unmatched")

    def test_invalid_explicit_id_is_rejected_and_cannot_use_another_name(self):
        with self.assertRaisesRegex(ValueError,"invalid_menu_dish"):
            menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango original","missing")
        self.assertEqual(self.day(),[])
        item=menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Nome incorreto","d2")
        self.assertEqual(item["value"],"Outra receita")
        self.assertEqual(item["dish_id"],"d2")

    def test_category_write_clears_old_dish_id(self):
        menus.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango original","d1")
        item=menus.save_menu(self.c,"a1","2026-11-03","lunch","category","Livre")
        self.assertIsNone(item["dish_id"])
        self.assertEqual(self.day()[0]["value"],"Livre")
        with self.assertRaisesRegex(ValueError,"invalid_menu_dish"):
            menus.save_menu(self.c,"a1","2026-11-03","dinner","category","Livre","d1")

    def test_legacy_schema_backfill_uses_only_unique_names_and_runs_once(self):
        c=sqlite3.connect(":memory:")
        c.row_factory=sqlite3.Row
        c.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY,name TEXT,created_at INTEGER)")
        c.execute("INSERT INTO v2_athletes VALUES('a1','Teste',1)")
        c.execute("CREATE TABLE v2_dish_library (id TEXT PRIMARY KEY,category TEXT,name_pt TEXT,name_en TEXT,image_filename TEXT,active INTEGER DEFAULT 1)")
        c.execute("INSERT INTO v2_dish_library VALUES('d1','Carne branca','Único','','1.webp',1)")
        c.execute("INSERT INTO v2_dish_library VALUES('d2','Peixe','Repetido','','2.webp',1)")
        c.execute("INSERT INTO v2_dish_library VALUES('d3','Peixe','Repetido','','3.webp',1)")
        c.execute("CREATE TABLE v2_weekly_menus (athlete_id TEXT,menu_date TEXT,meal TEXT,kind TEXT,value TEXT,PRIMARY KEY(athlete_id,menu_date,meal))")
        for meal,value in [("lunch","Único"),("dinner","Repetido")]:
            c.execute("INSERT INTO v2_weekly_menus VALUES(?,?,?,?,?)",("a1","2026-11-03",meal,"dish",value))
        menus.initialize(c)
        got=c.execute("SELECT meal,value,dish_id FROM v2_weekly_menus ORDER BY meal").fetchall()
        by_meal={x["meal"]:dict(x) for x in got}
        self.assertIsNone(by_meal["dinner"]["dish_id"])
        self.assertEqual(by_meal["lunch"]["dish_id"],"d1")
        # Rerunning startup never reassigns legacy unresolved references.
        c.execute("UPDATE v2_dish_library SET name_pt='Alterado' WHERE id='d3'")
        menus.initialize(c)
        self.assertIsNone(c.execute("SELECT dish_id FROM v2_weekly_menus WHERE meal='dinner'").fetchone()[0])
        c.close()


    def test_history_is_scoped_to_athlete_and_past_days_remain_unchanged(self):
        previous=(date.today()-timedelta(days=3)).isoformat()
        future=(date.today()+timedelta(days=3)).isoformat()
        menus.save_menu(self.c,"a1",previous,"lunch","dish","Frango original","d1")
        # Past history must not disappear when someone later edits that slot.
        menus.save_menu(self.c,"a1",previous,"lunch","dish","Outra receita","d2")
        stored=menus.list_menu_history(self.c,"a1")
        row=next(d for d in stored["days"] if d["date"]==previous)
        self.assertEqual(row["lunch"],"Frango original")
        self.assertEqual(menus.list_menus(self.c,"a1",previous,previous)[0]["dish_id"],"d2")
        self.assertEqual(menus.last_menu_dish_use(self.c,"a1","d1",future),previous)
        self.c.execute("INSERT INTO v2_athletes (id,name,created_at) VALUES ('a2','Outro jogador',2)")
        self.assertEqual(menus.list_menu_history(self.c,"a2")["days"],[])
        self.assertIsNone(menus.last_menu_dish_use(self.c,"a2","d1",future))

    def test_scheduled_future_changes_reuse_one_history_row(self):
        future=(date.today()+timedelta(days=7)).isoformat()
        menus.save_menu(self.c,"a1",future,"dinner","dish","Frango original","d1")
        menus.save_menu(self.c,"a1",future,"dinner","dish","Outra receita","d2")
        count=self.c.execute("SELECT COUNT(*) FROM v2_menu_history WHERE athlete_id='a1' AND menu_date=? AND meal='dinner'",(future,)).fetchone()[0]
        self.assertEqual(count,1)
        record=self.c.execute("SELECT dish_id FROM v2_menu_history WHERE athlete_id='a1' AND menu_date=? AND meal='dinner'",(future,)).fetchone()
        self.assertEqual(record["dish_id"],"d2")
        self.assertFalse(any(day["date"]==future for day in menus.list_menu_history(self.c,"a1")["days"]))

    def test_repeated_schema_initialization_preserves_original_snapshot(self):
        previous=(date.today()-timedelta(days=5)).isoformat()
        menus.save_menu(self.c,"a1",previous,"dinner","dish","Frango original","d1")
        menus.save_menu(self.c,"a1",previous,"dinner","dish","Outra receita","d2")
        menus.initialize(self.c)
        latest=self.c.execute("SELECT value,dish_id FROM v2_menu_history WHERE athlete_id='a1' AND menu_date=?",(previous,)).fetchone()
        self.assertEqual((latest["value"],latest["dish_id"]),("Frango original","d1"))

    def test_history_one_row_per_date_with_both_meals(self):
        previous=(date.today()-timedelta(days=1)).isoformat()
        menus.save_menu(self.c,"a1",previous,"lunch","category","Carne branca")
        menus.save_menu(self.c,"a1",previous,"dinner","dish","Frango original","d1")
        record=menus.list_menu_history(self.c,"a1")["days"][0]
        self.assertEqual(record["date"],previous)
        self.assertEqual(record["lunch"],"Carne branca")
        self.assertEqual(record["dinner"],"Frango original")


if __name__=="__main__":
    unittest.main()
