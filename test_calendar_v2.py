"""Regression tests for the isolated v2 calendar classifier."""
import unittest
from calendar_v2 import classify_calendar_day, classify_range


class CalendarV2Tests(unittest.TestCase):
    def test_match_day(self):
        self.assertEqual(classify_calendar_day("2026-11-08", ["2026-11-08"])["classification"], "MD")

    def test_before_and_after(self):
        matches = ["2026-11-08"]
        self.assertEqual(classify_calendar_day("2026-11-07", matches)["classification"], "MD-1")
        self.assertEqual(classify_calendar_day("2026-11-02", matches)["classification"], "MD-6")
        self.assertEqual(classify_calendar_day("2026-11-09", matches)["classification"], "MD+1")
        self.assertEqual(classify_calendar_day("2026-11-10", matches)["classification"], "MD+2")

    def test_outside_window_unassigned(self):
        self.assertIsNone(classify_calendar_day("2026-11-01", ["2026-11-08"])["classification"])
        self.assertIsNone(classify_calendar_day("2026-11-11", ["2026-11-08"])["classification"])

    def test_match_day_wins_even_during_another_preparation(self):
        result = classify_calendar_day("2026-10-25", ["2026-10-25", "2026-10-28"])
        self.assertEqual(result["classification"], "MD")
        self.assertFalse(result["needs_review"])

    def test_normal_seven_day_week(self):
        matches = ["2026-10-25", "2026-11-01"]
        days = classify_range("2026-10-25", "2026-11-01", matches)
        self.assertEqual([d["classification"] for d in days],
                         ["MD", "MD+1", "MD-5", "MD-4", "MD-3",
                          "MD-2", "MD-1", "MD"])
        self.assertFalse(any(d["needs_review"] for d in days))

    def test_three_day_gap_uses_combined_types(self):
        matches = ["2026-10-25", "2026-10-28"]
        days = classify_range("2026-10-25", "2026-10-28", matches)
        self.assertEqual([d["classification"] for d in days],
                         ["MD", "MD+1/-2", "MD+2/-1", "MD"])

    def test_four_day_gap_uses_combined_types(self):
        matches = ["2026-10-25", "2026-10-29"]
        days = classify_range("2026-10-25", "2026-10-29", matches)
        self.assertEqual([d["classification"] for d in days],
                         ["MD", "MD+1/-3", "MD+2/-2", "MD-1", "MD"])

    def test_unmatched_combination_uses_priority_rules(self):
        matches = ["2026-10-25", "2026-10-30"]
        days = classify_range("2026-10-25", "2026-10-30", matches)
        self.assertEqual([d["classification"] for d in days],
                         ["MD", "MD+1", "MD-3", "MD-2", "MD-1", "MD"])

    def test_day_range(self):
        result = classify_range("2026-11-07", "2026-11-09", ["2026-11-08"])
        self.assertEqual([day["classification"] for day in result], ["MD-1", "MD", "MD+1"])

    def test_invalid_dates_and_range(self):
        with self.assertRaises(ValueError):
            classify_calendar_day("08-11-2026", [])
        with self.assertRaises(ValueError):
            classify_range("2026-11-09", "2026-11-08", [])


if __name__ == "__main__":
    unittest.main()
