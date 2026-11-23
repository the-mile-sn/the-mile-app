"""Self-only language preference, inert until enabled and never a UI change."""
import unittest
from unittest.mock import patch

import test_app as fixtures
import app


class PlayerLanguageSecurityTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.fixture.setUp()
        self.admin=self.fixture.admin
        self.players=[]
        for name in ("languageone","languagetwo"):
            created=self.admin.request("/api/v2/athletes","POST",{"name":"Teste idioma "+name})
            self.assertEqual(created["status"],201,created)
            athlete_id=created["body"]["athlete"]["id"]
            access=self.admin.request("/api/v2/athletes/"+athlete_id+"/access",
                "POST",{"username":name,"password":"password-for-language-123"})
            self.assertEqual(access["status"],201,access)
            user=fixtures.Client()
            login=user.request("/api/login","POST",
                {"identifier":name,"password":"password-for-language-123"})
            self.assertEqual(login["status"],200,login)
            self.assertEqual(user.request("/api/me")["status"],200)
            self.players.append(user)

    def tearDown(self):
        self.fixture.tearDown()

    def test_preference_is_self_only_default_pt_and_release_gated(self):
        first,second=self.players
        with patch.dict(app.os.environ,
                        {"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"0"}):
            self.assertEqual(first.request("/api/v2/player/preferences")["body"],
                             {"language":"pt","enabled":False})
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"en"})["status"],404)
            self.assertEqual(first.request("/api/v2/player/me")["body"]
                             ["player"]["language"],"pt")
        with patch.dict(app.os.environ,
                        {"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"1"}):
            self.assertEqual(first.request("/api/v2/player/preferences")["body"],
                             {"language":"pt","enabled":True})
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"en"},csrf=False)["status"],403)
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"fr"})["status"],400)
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"en","athlete_id":"other"})["status"],400)
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"en"})["body"]["language"],"en")
            self.assertEqual(first.request("/api/v2/player/me")["body"]
                             ["player"]["language"],"pt",
                             "No English UI until translations are readable")
            with patch.dict(app.os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}), \
                 patch("app_content_i18n_v2.translation_store_available",
                       return_value=True):
                self.assertEqual(first.request("/api/v2/player/me")["body"]
                                 ["player"]["language"],"en")
            self.assertEqual(second.request("/api/v2/player/preferences")["body"]
                             ["language"],"pt")
            with app.connect() as c:
                self.assertEqual(c.execute(
                    "SELECT COUNT(*) AS n FROM v2_player_language_preferences"
                    ).fetchone()["n"],1)
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"pt"})["status"],200)
            self.assertEqual(first.request("/api/v2/player/preferences")["body"]
                             ["language"],"pt")
            self.assertEqual(fixtures.Client().request(
                "/api/v2/player/preferences")["status"],401)
            self.assertEqual(self.admin.request(
                "/api/v2/player/preferences")["status"],403)


if __name__ == "__main__":
    unittest.main()
