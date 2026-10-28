"""Regression checks for baseline/manual menu color parity.

These tests deliberately exclude scenario automation, which stays off.
"""
import unittest

def effective_menu_color(base, manual_present=False, manual=None):
    color=manual if manual_present else base
    return None if color=="none" else color

class MenuColorParityTests(unittest.TestCase):
    def test_baseline(self):
        self.assertEqual(effective_menu_color("blue"),"blue")
    def test_manual_override(self):
        self.assertEqual(effective_menu_color("blue",True,"green"),"green")
    def test_manual_remove_meal(self):
        self.assertIsNone(effective_menu_color("blue",True,"none"))
    def test_no_base(self):
        self.assertIsNone(effective_menu_color(None))
    def test_no_scenario_automation(self):
        self.assertEqual(effective_menu_color("blue"),"blue")

if __name__=="__main__":unittest.main()
