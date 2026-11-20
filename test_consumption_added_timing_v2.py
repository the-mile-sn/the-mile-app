"""Player-added intra-match timing: immutable prescription, validated catalogue and totals."""
import sqlite3
import unittest
from pathlib import Path

import consumption_records_v2 as records
import consumption_timing_v2 as timing
import consumption_nutrition_v2 as nutrition

ROOT=Path(__file__).resolve().parent
APP=(ROOT/"app.py").read_text(encoding="utf-8")
JS=(ROOT/"static/jogador-v2.js").read_text(encoding="utf-8")
GUIDE=(ROOT/"docs/GUIA_VISUAL_APP_JOGADORES.md").read_text(encoding="utf-8")


class AddedTimingTests(unittest.TestCase):
    def setUp(self):
        self.connection=sqlite3.connect(":memory:")
        self.connection.row_factory=sqlite3.Row
        records.initialize(self.connection)
        self.published=[
            {"option_ref":"published-1","foods":[
                {"id":"gel","grams":70,"timing":"warmup"},
                {"id":"drink","grams":300,"timing":"half_time"},
            ]}
        ]
        self.library={"gel":{"id":"gel","active":1,"kcal":300.0,"protein_g":0.,
                              "carbs_g":75.0,"fat_g":0.},
                      "drink":{"id":"drink","active":1,"kcal":50.0,"protein_g":0.,
                                "carbs_g":12.5,"fat_g":0.}}

    def tearDown(self):
        self.connection.close()

    def test_unprescribed_timing_has_empty_library_only_option(self):
        selected=timing.validate_added_timing(
            self.connection,"athlete","2026-11-21","game-1","second_half",self.published)
        self.assertEqual(selected["option_ref"],"player-added:second_half")
        self.assertEqual(selected["foods"],[])
        self.assertNotIn("second_half",repr(self.published[0]["foods"]))
        self.assertEqual(self.published[0]["foods"][0]["grams"],70)

    def test_reject_prescribed_or_unknown_timing(self):
        for label,why in [("warmup","timing_is_prescribed"),
                          ("half_time","timing_is_prescribed"),
                          ("text-from-user","invalid_timing")]:
            with self.subTest(label=label), self.assertRaisesRegex(ValueError,why):
                timing.validate_added_timing(self.connection,"athlete","2026-11-21","game-1",label,self.published)

    def test_record_additional_food_and_aggregate_once(self):
        option=timing.validate_added_timing(self.connection,"athlete","2026-11-21","game-1","second_half",self.published)
        calculated=nutrition.calculate(option,self.library,"partial",[],[{"id":"drink","grams":200}])
        self.assertAlmostEqual(calculated["nutrition"]["kcal"],100)
        timing.save_timing(self.connection,athlete_id="athlete",meal_date="2026-11-21",
            event_id="game-1",timing="second_half",status="partial",
            option_ref=option["option_ref"],source_draft_id="draft",
            prescription={"origin":"player_added","timing":"second_half","option":option},
            consumed_foods=calculated["foods"],nutrition=calculated["nutrition"])
        daily=records.read_range(self.connection,"athlete","2026-11-21","2026-11-21")
        self.assertEqual(len(daily),1)
        self.assertEqual(daily[0]["nutrition"]["kcal"],100)
        self.assertTrue(daily[0]["timing_records"][0]["consumed_foods"][0]["additional"])
        self.assertEqual(daily[0]["timing_records"][0]["prescription"]["origin"],"player_added")

    def test_duplicate_timing_requires_edit_or_undo(self):
        option=timing.additional_timing_option(self.published,"second_half")
        totals=nutrition.calculate(option,self.library,"partial",[],[{"id":"drink","grams":100}])
        timing.save_timing(self.connection,athlete_id="athlete",meal_date="2026-11-21",
            event_id="game-1",timing="second_half",status="partial",
            option_ref=option["option_ref"],source_draft_id="draft",
            prescription={"origin":"player_added","option":option},
            consumed_foods=totals["foods"],nutrition=totals["nutrition"])
        selected=timing.validate_added_timing(self.connection,"athlete","2026-11-21","game-1","second_half",self.published)
        self.assertEqual(selected["option_ref"],option["option_ref"])
        # A saved prescribed record cannot be overwritten as player-added.
        timing.save_timing(self.connection,athlete_id="athlete",meal_date="2026-11-21",
            event_id="game-1",timing="first_half",status="all",
            option_ref="published-1",source_draft_id="draft",
            prescription={"option":{"foods":[]}},
            consumed_foods=[],nutrition={"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0})
        with self.assertRaisesRegex(ValueError,"timing_already_registered"):
            timing.validate_added_timing(self.connection,"athlete","2026-11-21","game-1",
                                         "first_half",self.published)

    def test_legacy_protection_and_no_other_athlete_leak(self):
        self.assertFalse(timing.has_legacy(self.connection,"athlete","2026-11-21","game-1"))
        self.assertIsNone(timing.existing_timing(self.connection,"different","2026-11-21","game-1","second_half"))

    def test_one_step_inline_jogo_form_and_empty_preview(self):
        css=(ROOT/"static/jogador-v2.css").read_text(encoding="utf-8")
        block=JS.split("const choices=Object.entries(periTimingLabels)",1)[1].split("return true;",1)[0]
        self.assertIn("intra-add-moment-group",block)
        self.assertIn("addButton.textContent='⊕ Adicionar'",block)
        self.assertIn("picker.append(label,selector,editorHost)",block)
        self.assertIn("trigger.setAttribute('aria-haspopup','listbox')",block)
        self.assertIn("menu.setAttribute('role','listbox')",block)
        self.assertIn("trigger.setAttribute('aria-expanded','false')",block)
        self.assertIn("option.setAttribute('role','option')",block)
        self.assertIn("trigger.onclick=()=>menu.hidden?openOptions():closeOptions()",block)
        self.assertIn("menu.hidden=true;trigger.setAttribute('aria-expanded','false')",block)
        self.assertIn("closeOptions();",block)
        self.assertIn("if(changed)showEditor().catch(error)",block)
        self.assertIn("event.key==='Escape'",block)
        self.assertIn("event.key==='ArrowDown'",block)
        self.assertIn("event.key==='ArrowUp'",block)
        self.assertIn("event.key==='Home'",block)
        self.assertIn("event.key==='End'",block)
        self.assertNotIn("createElement('select')",block)
        self.assertNotIn("const select=document.createElement('select')",block)
        self.assertIn(".intra-timing-select-trigger",css)
        self.assertIn(".intra-timing-option-list[hidden]",css)
        self.assertIn("background:var(--consumption-editor-surface,#E1E1E5)",css)
        self.assertIn("Intra-jogo — acréscimo livre",GUIDE)
        self.assertIn("dropdown próprio The Mile",GUIDE)
        self.assertIn("showEditor().catch(error)",block)
        self.assertNotIn("Escolher alimentos",block)
        self.assertNotIn("intra-add-moment-start",block)
        self.assertIn("onCancel=null",JS)
        self.assertIn("if(typeof onCancel==='function')onCancel()",JS)
        self.assertIn("if(extraTiming)removeAll.hidden=!checks.length",JS)
        self.assertIn("if(!extraFoods.length)return",JS)
        self.assertIn("progress.hidden=!extraFoods.length",JS)
        self.assertIn("if(extraTiming)save.disabled=true",JS)
        self.assertIn("extraTiming?Math.round(actual)+' kcal'",JS)
        self.assertIn(".intra-add-moment-trigger[hidden]",css)
        self.assertIn(".intra-add-moment-editor-host>.consumption-editor",css)
        self.assertIn("sem etapa «Escolher alimentos»",GUIDE)

    def test_player_contract_reuses_editor_and_restores_only_game(self):
        self.assertIn("let pendingIntraMatchExpansion=null;",JS)
        self.assertIn("match?.open)pendingIntraMatchExpansion",JS)
        self.assertIn("section.open=true;pendingIntraMatchExpansion=null",JS)
        self.assertIn("extraTiming)qs.set('extra_timing','1')",JS)
        self.assertIn("if(extraTiming)body.extra_timing=true",JS)
        self.assertIn("refreshAfterConsumption(group,meal,eventId)",JS)
        self.assertIn("refreshAfterConsumption(host,mealKey,eventId)",JS)
        self.assertIn("intra-add-moment-trigger",JS)
        self.assertIn("origin.textContent='Adicionado pelo jogador'",JS)
        self.assertIn("prescription['origin']='player_added'",APP)
        self.assertIn("Intra-jogo — acréscimo livre de momento e alimentos",GUIDE)


if __name__=="__main__":
    unittest.main()
