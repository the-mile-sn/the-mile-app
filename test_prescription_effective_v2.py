"""Focused regression tests for the inactive scenario resolver."""
import unittest
from prescription_effective_v2 import resolve_day

class EffectiveColorTests(unittest.TestCase):
    def setUp(self):
        self.base={"breakfast":"green","lunch":"blue","snack":None,"dinner":"orange","supper":None}
        self.matches=[{"id":"match-A","match_date":"2026-11-08"},{"id":"match-B","match_date":"2026-11-12"}]
        self.cells={("MD+1/-3","low","lunch"):"yellow",("MD+1/-3","low","dinner"):"green"}
        self.response=[{"match_id":"match-A","scenario":"low","submitted_date":"2026-11-09"}]

    def resolve(self,day="2026-11-09",classification="MD+1/-3",overrides=None,responses=None,today="2026-11-09"):
        return resolve_day(day,classification,self.base,overrides or {},self.cells,self.matches,
                           self.response if responses is None else responses,today)

    def test_scenario_changes_only_specified_cells(self):
        result=self.resolve()
        self.assertEqual(result["lunch"]["color"],"yellow")
        self.assertEqual(result["dinner"]["color"],"green")
        self.assertEqual(result["breakfast"]["color"],"green")

    def test_manual_override_wins_even_none(self):
        result=self.resolve(overrides={("2026-11-09","lunch"):"orange",("2026-11-09","dinner"):"none"})
        self.assertEqual(result["lunch"]["color"],"orange")
        self.assertEqual(result["lunch"]["source"],"manual")
        self.assertIsNone(result["dinner"]["color"])

    def test_no_response_keeps_base(self):
        self.assertEqual(self.resolve(responses=[])["lunch"]["color"],"blue")

    def test_late_submission_does_not_change_previous_day(self):
        responses=[{"match_id":"match-A","scenario":"low","submitted_date":"2026-11-10"}]
        self.assertEqual(self.resolve(responses=responses)["lunch"]["color"],"blue")
        self.assertEqual(self.resolve(day="2026-11-10",classification="MD+2/-2",responses=responses)["lunch"]["color"],"blue")

    def test_past_days_unchanged(self):
        self.assertEqual(self.resolve(today="2026-11-10")["lunch"]["color"],"blue")

    def test_high_uses_base(self):
        high=[{"match_id":"match-A","scenario":"high","submitted_date":"2026-11-09"}]
        self.assertEqual(self.resolve(responses=high)["lunch"]["color"],"blue")

    def test_unrelated_match_response_ignored(self):
        other=[{"match_id":"match-B","scenario":"low","submitted_date":"2026-11-09"}]
        self.assertEqual(self.resolve(responses=other)["lunch"]["color"],"blue")

if __name__=="__main__":unittest.main()
