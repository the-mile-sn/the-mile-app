import pathlib
import unittest

SOURCE=(pathlib.Path(__file__).parent/"app.py").read_text()

class PlayerSexSourceTests(unittest.TestCase):
    def test_session_loads_linked_user_fields(self):
        self.assertIn("SELECT u.*,s.csrf FROM sessions s JOIN users u",SOURCE)

    def test_weight_write_reads_users_sex(self):
        start=SOURCE.index("if selected>current.isoformat():raise Problem(400,'future_weight_date')")
        end=SOURCE.index("before=c.execute(\"SELECT * FROM v2_daily_weighins",start)
        body=SOURCE[start:end]
        self.assertIn("user['sex']",body)
        self.assertNotIn("SELECT sex FROM v2_athletes",body)
        self.assertIn("if not is_f:menstruating=None",body)

    def test_weight_writes_still_link_to_athlete_id(self):
        self.assertIn("WHERE athlete_id=? AND weigh_date=?",SOURCE)
        self.assertIn("if not is_f:menstruating=None",SOURCE)

if __name__=="__main__":
    unittest.main()
