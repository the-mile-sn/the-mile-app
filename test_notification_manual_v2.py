"""Manual send preparation tests, synthetic SQLite only."""
from datetime import timedelta
import unittest
import test_notification_sources_v2 as fixtures
from notification_manual_v2 import prepare, record_manual, recipient_locale


class ManualNotificationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.SourceTests()
        self.fixture.setUp()
        self.c = self.fixture.c
        self.now = self.fixture.now
        self.c.executescript("""
            CREATE TABLE v2_player_language_preferences(user_id TEXT PRIMARY KEY,language TEXT);
            CREATE TABLE v2_player_language_defaults(user_id TEXT PRIMARY KEY,language TEXT);
            CREATE TABLE v2_chef_language_preferences(user_id TEXT PRIMARY KEY,language TEXT);
            ALTER TABLE v2_chef_links ADD COLUMN language TEXT DEFAULT 'pt';
            INSERT INTO v2_player_language_defaults VALUES ('p','en');
            INSERT INTO v2_player_language_preferences VALUES ('p','pt');
            INSERT INTO v2_chef_language_preferences VALUES ('chef','en');
        """)

    def tearDown(self):
        self.fixture.tearDown()

    def prepare_game(self, selections=None):
        return prepare(self.c,authorised_athlete_ids=["a"],kind="game",now=self.now,
                       selections=selections if selections is not None else [
                           {"recipient_id":"p","target_id":"latest"}])

    def test_language_preference_overrides_default(self):
        self.assertEqual(recipient_locale(self.c,"p"),"pt-PT")
        self.c.execute("DELETE FROM v2_player_language_preferences WHERE user_id='p'")
        self.assertEqual(recipient_locale(self.c,"p"),"en-GB")
        self.assertEqual(recipient_locale(self.c,"chef"),"en-GB")

    def test_game_revalidated_at_confirmation(self):
        self.assertEqual(self.prepare_game()[0]["title"],"Formulário de jogo")
        self.c.execute("INSERT INTO v2_post_match_responses VALUES ('a','latest')")
        with self.assertRaisesRegex(ValueError,"selection_no_longer_eligible"):
            self.prepare_game()

    def test_scope_and_old_match_rejected(self):
        for selected in ({"recipient_id":"q","target_id":"latest"},
                         {"recipient_id":"p","target_id":"old"}):
            with self.assertRaises(ValueError):
                self.prepare_game([selected])

    def test_custom_copy_per_locale(self):
        rows=prepare(self.c,authorised_athlete_ids=["a"],kind="custom",now=self.now,
            selections=[{"recipient_id":"p"},{"recipient_id":"chef"}],
            custom_copy={"pt-PT":{"title":"Olá","body":"Mensagem"},
                         "en-GB":{"title":"Hello","body":"Message"}})
        self.assertEqual([r["title"] for r in rows],["Olá","Hello"])
        with self.assertRaisesRegex(ValueError,"missing_custom_language"):
            prepare(self.c,authorised_athlete_ids=["a"],kind="custom",now=self.now,
                selections=[{"recipient_id":"chef"}],
                custom_copy={"pt-PT":{"title":"Olá","body":"Mensagem"}})

    def test_record_and_weight_cooldown(self):
        args=dict(sender_id="admin",authorised_athlete_ids=["a"],kind="weight",
                  selections=[{"recipient_id":"p"}],now=self.now)
        result=record_manual(self.c,request_id="req1",**args)
        self.assertFalse(result["push_attempted"])
        self.assertEqual(len(result["recorded_ids"]),1)
        with self.assertRaisesRegex(ValueError,"request_already_recorded"):
            record_manual(self.c,request_id="req1",**args)
        with self.assertRaisesRegex(ValueError,"selection_no_longer_eligible"):
            record_manual(self.c,request_id="req2",**args)
        args["now"]=self.now+timedelta(days=3)
        self.assertEqual(len(record_manual(self.c,request_id="req3",**args)["recorded_ids"]),1)

    def test_non_admin_cannot_record(self):
        with self.assertRaises(PermissionError):
            record_manual(self.c,sender_id="p",request_id="r",
                authorised_athlete_ids=["a"],kind="weight",now=self.now,
                selections=[{"recipient_id":"p"}])

if __name__ == "__main__":
    unittest.main()
