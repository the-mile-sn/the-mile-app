"""Published choices in the player app are dated, opt-in, and fail-safe."""
import json
import unittest

import meal_option_selection_v2 as choice
from test_food_plan_player_v2 import (
    PlayerPlanPublicationTests, f, meal, opt, plan,
)
import food_plan_player_v2 as player


class PlayerMealChoiceTests(unittest.TestCase):
    def setUp(self):
        self.fixture=PlayerPlanPublicationTests()
        self.fixture.setUp()
        self.c=self.fixture.c
        self.c.execute(
            "ALTER TABLE v2_athletes ADD COLUMN meal_option_selection_enabled "
            "INTEGER NOT NULL DEFAULT 0")
        choice.initialize(self.c)
        self.first=opt(f("bread",80),title="Primeira")
        self.second=opt(f("fruit",100),title="Segunda")
        self.fixture.add(plan("Plano amarelo",[
            meal("Pequeno almoço",self.first,self.second)]))
        self.options=player.player_plans(self.c,"a1")["options_by_color"]["yellow"]["breakfast"]

    def tearDown(self):
        self.fixture.tearDown()

    def publish(self,athlete="a1",index=2,source_color="yellow",
                source_id="id1",option=None,day="2026-11-12",key="breakfast",event=""):
        reference=option or self.options[index-1]
        self.c.execute(
            "INSERT INTO v2_meal_choice_publications "
            "(athlete_id,meal_date,meal_key,event_id,option_index,option_ref,"
            "source_draft_id,source_color,published_by,published_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (athlete,day,key,event,index,reference["option_ref"],
             source_id,source_color,"admin",100))
        self.c.commit()

    def test_disabled_players_never_get_any_selections(self):
        self.publish()
        self.assertEqual(choice.published_for_player(self.c,"a1",
                         "2026-11-12","2026-11-12"),[])
        self.assertEqual(len(self.options),2)

    def test_approved_match_does_not_influence_unrelated_athlete_or_day(self):
        self.c.execute("UPDATE v2_athletes SET meal_option_selection_enabled=1 WHERE id='a1'")
        self.publish()
        self.assertEqual(choice.published_for_player(self.c,"a2",
                         "2026-11-12","2026-11-12"),[])
        self.assertEqual(choice.published_for_player(self.c,"a1",
                         "2026-11-13","2026-11-13"),[])
        visible=choice.published_for_player(self.c,"a1",
                         "2026-11-12","2026-11-12")
        self.assertEqual(len(visible),1)
        selected=choice.visible_options(self.options,visible[0],"yellow")
        self.assertEqual(len(selected),1)
        self.assertEqual(selected[0]["title"],"Segunda")
        self.assertEqual(selected[0]["number"],2)

    def test_stale_option_order_color_or_source_reverts_to_all(self):
        self.c.execute("UPDATE v2_athletes SET meal_option_selection_enabled=1 WHERE id='a1'")
        self.publish()
        selected=choice.published_for_player(self.c,"a1",
                      "2026-11-12","2026-11-12")[0]
        self.assertEqual(choice.visible_options(self.options,selected,"blue"),self.options)
        self.assertEqual(choice.visible_options(self.options[::-1],selected,"yellow"),self.options[::-1])
        self.assertEqual(choice.visible_options(self.options,dict(selected,source_draft_id="different"),"yellow"),self.options)
        self.assertEqual(choice.visible_options(self.options,dict(selected,option_ref="other"),"yellow"),self.options)
        self.assertEqual(choice.visible_options(self.options,None,"yellow"),self.options)

    def test_option_identity_stays_tied_to_raw_published_food_and_amount(self):
        self.assertEqual(self.options[0]["option_ref"],choice.option_ref(self.first))
        self.assertEqual(self.options[1]["option_ref"],choice.option_ref(self.second))
        self.assertEqual(self.options[0]["source_draft_id"],"id1")
        changed=opt(f("bread",81),title="Primeira")
        self.assertNotEqual(choice.option_ref(changed),self.options[0]["option_ref"])

    def test_peri_phase_has_stable_ref_and_full_phase_key(self):
        self.fixture.add(plan("Plano Peri-treino",[
            meal("Pré-treino",self.first,self.second)]),ident="peri")
        event={"id":"train-1","kind":"training","event_date":"2026-11-12",
               "session":"morning"}
        results=player.player_peri_days(self.c,"a1","2026-11-12","2026-11-12",
                            events=[event],matches=[])
        self.assertEqual(len(results),1)
        self.assertEqual(results[0]["selection_phase"],"pre_training")
        self.assertEqual(results[0]["options"][1]["source_draft_id"],"peri")
        self.assertEqual(results[0]["options"][1]["option_ref"],choice.option_ref(self.second))
        row={"option_index":2,"option_ref":choice.option_ref(self.second),
             "source_draft_id":"peri","source_color":None}
        self.assertEqual(len(choice.visible_options(results[0]["options"],row,None)),1)


if __name__=="__main__":
    unittest.main()
