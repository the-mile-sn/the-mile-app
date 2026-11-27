"""Contract tests for the inactive, read-only player color preview.

The admin preview and the future player feed must use the same pure resolver.
No real player access, database changes or live API activation.
"""
import unittest
from prescription_effective_v2 import resolve_day

class PlayerPreviewParityTests(unittest.TestCase):
    def setUp(self):
        self.matches=[{"id":"game","match_date":"2026-11-08"}]
        self.model={"breakfast":"blue","lunch":"blue","snack":None,"dinner":"blue","supper":None}
        self.variants={("MD+1","medium","breakfast"):"yellow",("MD+1","medium","dinner"):"yellow",
                       ("MD+2","medium","lunch"):"green"}
        self.responses=[{"match_id":"game","revisions":[{"effective_date":"2026-10-28","scenario":"medium"}]}]
    def effective(self,day,classification,manual=None):
        return resolve_day(day,classification,self.model,manual or {},self.variants,self.matches,
                           self.responses,"2026-10-28")
    def test_md1_player_colors_match_admin_preview(self):
        admin=self.effective("2026-11-09","MD+1")
        player={meal:item["color"] for meal,item in admin.items()}
        self.assertEqual(player,{"breakfast":"yellow","lunch":"blue","snack":None,
                                 "dinner":"yellow","supper":None})
    def test_md2_uses_separate_scenario_cells(self):
        colors=self.effective("2026-11-10","MD+2")
        self.assertEqual(colors["lunch"]["color"],"green")
        self.assertEqual(colors["breakfast"]["color"],"blue")
    def test_manual_override_is_shared_by_both_previews(self):
        manual={("2026-11-09","breakfast"):"green"}
        colors=self.effective("2026-11-09","MD+1",manual)
        self.assertEqual(colors["breakfast"]["color"],"green")
        self.assertEqual(colors["breakfast"]["source"],"manual")
    def test_no_response_falls_back_to_base(self):
        self.responses=[]
        self.assertEqual(self.effective("2026-11-09","MD+1")["dinner"]["color"],"blue")
    def test_preview_does_not_mutate_input(self):
        original=dict(self.model)
        self.effective("2026-11-09","MD+1")
        self.assertEqual(original,self.model)

if __name__=="__main__":
    unittest.main()
