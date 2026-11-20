"""Focused read-only contracts for timing-scoped player consumption."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parent
APP=(ROOT/"app.py").read_text(encoding="utf-8")
JS=(ROOT/"static/jogador-v2.js").read_text(encoding="utf-8")
CSS=(ROOT/"static/jogador-v2.css").read_text(encoding="utf-8")
GUIDE=(ROOT/"docs/GUIA_VISUAL_APP_JOGADORES.md").read_text(encoding="utf-8")


class TimingConsumptionUiContract(unittest.TestCase):
    def test_actions_lives_in_each_prescribed_timing_group(self):
        self.assertIn('group.dataset.timing=timing;',JS)
        self.assertIn('function appendIntraTimingConsumption(card,item,previous,date,meal,eventId)',JS)
        self.assertIn("if(item.selection_phase==='intra_match'&&appendIntraTimingConsumption(",JS)
        self.assertIn("actions.append(edit,quick);group.append(actions,feedback);",JS)
        self.assertIn("group.append(makeRecordedConsumptionTags(",JS)
        self.assertIn("const current=previous?.timing_records||[];",JS)

    def test_editor_save_preview_undo_are_timing_scoped(self):
        self.assertIn("qs.set('timing',timing)",JS)
        self.assertIn("if(timing)body.timing=timing;",JS)
        self.assertIn("...(timing?{timing}:{})",JS)
        self.assertIn("parent?.timing_records?.find(x=>x.timing===timing)",JS)
        self.assertIn("preferredOptionRef&&data.options.some",JS)
        self.assertIn("option_ref:option.option_ref,status:'all'",JS)

    def test_no_duplicate_daily_calories_or_silent_migration(self):
        self.assertIn("consumption_timing_v2.merge_range(",(ROOT/"consumption_records_v2.py").read_text())
        self.assertIn("consumption_timing_v2.has_timings(",APP)
        self.assertIn("consumption_timing_v2.save_timing(",APP)
        self.assertIn("consumption_timing_v2.delete_timing(",APP)
        self.assertIn("if(previous&&!previous.timing_records?.length){",JS)
        self.assertIn("consumo anterior de Jogo",JS)

    def test_existing_light_card_theme_and_controls_preserved(self):
        self.assertIn("background:#F2F2F4!important;color:#22232A!important",CSS)
        self.assertIn("--consumption-editor-surface:#E1E1E5",CSS)
        self.assertIn(".match-intra-card .peri-timing-group > .consumption-editor",CSS)
        self.assertIn("Intra-jogo — registo independente por timing (20/11)",GUIDE)


if __name__=="__main__":
    unittest.main()
