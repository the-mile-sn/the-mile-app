import pathlib
import unittest

SOURCE=(pathlib.Path(__file__).parent/"app.py").read_text()

class PlayerSexSourceTests(unittest.TestCase):
    def test_session_loads_linked_user_fields(self):
        self.assertIn("SELECT u.*,s.csrf FROM sessions s JOIN users u",SOURCE)

    def test_player_profile_exposes_linked_user_sex(self):
        start=SOURCE.index("if path == '/api/v2/player/me' and method == 'GET':")
        end=SOURCE.index("if path == '/api/v2/player/reference-weights'",start)
        body=SOURCE[start:end]
        self.assertIn("player['sex']=user['sex']",body)
        self.assertIn("JOIN v2_athletes a ON a.id=l.athlete_id",body)
        self.assertIn("WHERE l.user_id=?",body)

    def test_player_weight_ui_consumes_profile_sex(self):
        js=(pathlib.Path(__file__).parent/"static"/"jogador-v2.js").read_text()
        self.assertIn('me=r.player',js)
        self.assertIn('String(me?.sex||"").toUpperCase()==="F"',js)
        self.assertIn('Menstruação (opcional)',js)

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
