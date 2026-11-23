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

    def test_internal_translation_readiness_requires_admin_and_flag(self):
        first=self.players[0]
        path="/api/v2/admin/translation-readiness"
        self.assertEqual(self.admin.request(path)["status"],404)
        with patch.dict(app.os.environ,{"MILE_APP_TRANSLATION_DIAGNOSTIC":"1"}):
            self.assertEqual(first.request(path)["status"],403)
            self.assertEqual(fixtures.Client().request(path)["status"],401)
            data=self.admin.request(path)
            self.assertEqual(data["status"],200,data)
            self.assertEqual(data["body"],{
                "available":False,"approved_count":0,"kinds":{}})
            with app.connect() as c:
                c.execute("""CREATE TABLE IF NOT EXISTS v2_content_translations (
                    entity_kind TEXT,entity_id TEXT,field_path TEXT,
                    language TEXT,source_hash TEXT,translated_text TEXT,
                    status TEXT)""")
                c.execute("""INSERT INTO v2_content_translations
                    VALUES ('food','test-id','display_name','en',
                    'mock-hash','Private sample','approved')""")
                c.commit()
            response=self.admin.request(path)
            self.assertEqual(response["status"],200,response)
            self.assertEqual(response["body"]["approved_count"],1)
            self.assertEqual(response["body"]["kinds"],{"food":1})
            self.assertNotIn("Private sample",str(response))

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
                        {"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"1",
                         "MILE_APP_TRANSLATIONS_ENABLED":"0"}):
            self.assertEqual(first.request("/api/v2/player/preferences")["body"],
                             {"language":"pt","enabled":False})
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"en"})["status"],404)
        with patch.dict(app.os.environ,
                        {"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"1",
                         "MILE_APP_TRANSLATIONS_ENABLED":"1"}), \
             patch("app_content_i18n_v2.translation_store_available",
                   return_value=False):
            self.assertEqual(first.request("/api/v2/player/preferences")["body"],
                             {"language":"pt","enabled":False})
            self.assertEqual(first.request("/api/v2/player/preferences",
                "PUT",{"language":"en"})["status"],404)
        with patch.dict(app.os.environ,
                        {"MILE_PLAYER_LANGUAGE_SELECTION_ENABLED":"1",
                         "MILE_APP_TRANSLATIONS_ENABLED":"1"}), \
             patch("app_content_i18n_v2.translation_store_available",
                   return_value=True):
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
