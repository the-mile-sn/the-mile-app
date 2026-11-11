"""Visual portion opt-in defaults to OFF and is independent per athlete."""
import pathlib
import sqlite3
import unittest

import microcycles_v2


class AthleteVisualPortionsTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        microcycles_v2.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def test_flag_defaults_off_for_historical_and_new_athletes(self):
        self.c.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES('a','Jogador A',1)")
        self.c.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES('b','Jogador B',1)")
        a=self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='a'").fetchone()
        b=self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='b'").fetchone()
        self.assertEqual(a[0],0)
        self.assertEqual(b[0],0)
        self.c.execute("UPDATE v2_athletes SET visual_portions_enabled=1 WHERE id='a'")
        self.assertEqual(self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='a'").fetchone()[0],1)
        self.assertEqual(self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='b'").fetchone()[0],0)
        microcycles_v2.initialize(self.c)
        self.assertEqual(self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='a'").fetchone()[0],1)

    def test_profile_contract_and_checkbox(self):
        source=pathlib.Path("app.py").read_text()
        dashboard=pathlib.Path("static/admin-dashboard.js").read_text()
        self.assertIn("visual_portions_enabled=body.get(",source)
        self.assertIn("if not isinstance(visual_portions_enabled,bool)",source)
        self.assertIn("'visual_portions_enabled':bool(details['visual_portions_enabled'])",source)
        self.assertIn("dataset.playerProfileField=\"visual_portions_enabled\"",dashboard)
        self.assertIn("visual_portions_enabled:profilePanel.querySelector",dashboard)


if __name__=="__main__":
    unittest.main()
