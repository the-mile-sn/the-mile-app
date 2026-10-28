"""Focused regression tests for the inactive scenario resolver."""
import unittest
from prescription_effective_v2 import resolve_day, revisions_from_audit
from datetime import datetime, timezone

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

    def test_historical_colors_stay_consistent(self):
        self.assertEqual(self.resolve(today="2026-11-10")["lunch"]["color"],"yellow")

    def test_future_submission_does_not_apply_yet(self):
        self.assertEqual(self.resolve(today="2026-11-08")["lunch"]["color"],"blue")

    def test_high_uses_base(self):
        high=[{"match_id":"match-A","scenario":"high","submitted_date":"2026-11-09"}]
        self.assertEqual(self.resolve(responses=high)["lunch"]["color"],"blue")

    def test_edit_on_md2_preserves_md1_and_updates_md2(self):
        self.cells[("MD+2/-2","medium","lunch")]="green"
        revised=[{"match_id":"match-A","revisions":[
            {"effective_date":"2026-11-09","scenario":"low"},
            {"effective_date":"2026-11-10","scenario":"medium"}]}]
        self.assertEqual(self.resolve(responses=revised,today="2026-11-10")["lunch"]["color"],"yellow")
        self.assertEqual(self.resolve(day="2026-11-10",classification="MD+2/-2",
                                      responses=revised,today="2026-11-10")["lunch"]["color"],"green")

    def test_late_original_response_only_affects_md2(self):
        self.cells[("MD+2/-2","low","lunch")]="green"
        late=[{"match_id":"match-A","scenario":"low","submitted_date":"2026-11-10"}]
        self.assertEqual(self.resolve(responses=late,today="2026-11-10")["lunch"]["color"],"blue")
        self.assertEqual(self.resolve(day="2026-11-10",classification="MD+2/-2",
                                      responses=late,today="2026-11-10")["lunch"]["color"],"green")

    def test_only_nearest_preceding_match_controls(self):
        # A response linked to an older match must not override a newer match.
        self.matches=[{"id":"A","match_date":"2026-11-08"},
                      {"id":"B","match_date":"2026-11-09"}]
        result=self.resolve(day="2026-11-10",classification="MD+1/-3",
                            responses=[{"match_id":"A","scenario":"low","submitted_date":"2026-11-09"}],
                            today="2026-11-10")
        self.assertEqual(result["lunch"]["color"],"blue")

    def test_missing_match_keeps_baseline(self):
        self.matches=[]
        self.assertEqual(self.resolve()["lunch"]["color"],"blue")

    def test_audit_revisions_keep_first_submission_and_edits(self):
        timestamp=lambda value:int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp())
        response={"id":"r1","match_id":"match-A","scenario":"medium","created_at":timestamp("2026-11-09T10:00:00")}
        audit=[
            {"id":"a1","record_type":"post_match","record_id":"r1","created_at":timestamp("2026-11-09T10:00:00"),"new_json":'{"match_id":"match-A","scenario":"low"}'},
            {"id":"a2","record_type":"post_match","record_id":"r1","created_at":timestamp("2026-11-10T10:00:00"),"new_json":'{"match_id":"match-A","scenario":"medium"}'}]
        revisions=revisions_from_audit(response,audit)
        self.assertEqual([r["scenario"] for r in revisions],["low","medium"])
        self.cells[("MD+2/-2","medium","lunch")]="green"
        payload=[{"match_id":"match-A","revisions":revisions}]
        self.assertEqual(self.resolve(responses=payload,today="2026-11-10")["lunch"]["color"],"yellow")
        self.assertEqual(self.resolve(day="2026-11-10",classification="MD+2/-2",responses=payload,today="2026-11-10")["lunch"]["color"],"green")

    def test_same_day_second_edit_takes_priority(self):
        revisions=[{"effective_date":"2026-11-09","scenario":"medium"},
                   {"effective_date":"2026-11-09","scenario":"low"}]
        result=self.resolve(responses=[{"match_id":"match-A","revisions":revisions}])
        self.assertEqual(result["lunch"]["color"],"yellow")

    def test_portugal_local_day_near_midnight(self):
        timestamp=int(datetime(2026,10,28,0,30,tzinfo=timezone.utc).timestamp())
        response={"id":"r1","match_id":"match-A","scenario":"low","created_at":timestamp}
        revisions=revisions_from_audit(response,[])
        self.assertEqual(revisions[0]["effective_date"],"2026-10-28")

    def test_unrelated_match_response_ignored(self):
        other=[{"match_id":"match-B","scenario":"low","submitted_date":"2026-11-09"}]
        self.assertEqual(self.resolve(responses=other)["lunch"]["color"],"blue")

if __name__=="__main__":unittest.main()
