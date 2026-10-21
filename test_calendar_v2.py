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

    def test_overlapping_matches_needs_review(self):
        result = classify_calendar_day("2026-11-08", ["2026-11-08", "2026-11-10"])
        self.assertTrue(result["needs_review"])
        self.assertIsNone(result["classification"])
        self.assertEqual({item["classification"] for item in result["candidates"]}, {"MD", "MD-2"})

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
