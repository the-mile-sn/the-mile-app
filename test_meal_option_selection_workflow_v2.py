"""Individual meal-choice workflow: draft, publish, clear and fail-closed checks."""
import unittest
from unittest.mock import patch

import test_app
import meal_option_selection_v2 as choices

Client=test_app.Client


class MealChoicePublicationTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        result=self.admin.request("/api/v2/athletes","POST",{
            "name":"Jogador Escolha","username":"escolhas","password":"pass-secure-1234",
            "sex":"M","weight_kg":75
        })
        self.assertEqual(result["status"],201,result)
        self.aid=result["body"]["athlete"]["id"]
        self.base=f"/api/v2/athletes/{self.aid}/meal-options"
        self.profile=f"/api/v2/athletes/{self.aid}/profile"
        self.row={"date":"2026-11-12","meal":"breakfast","event_id":""}
        self.source={"status":"ok","color":"yellow","draft_id":"published-plan-id",
                     "options":[{"option_ref":"ref-option-a"},{"option_ref":"ref-option-b"}]}

    def enable(self):
        response=self.admin.request(self.profile,"PUT",{
            "name":"Jogador Escolha","sex":"M","weight_kg":75,
            "height_cm":None,"profile_notes":"",
            "meal_option_selection_enabled":True
        })
        self.assertEqual(response["status"],200,response)

    def test_default_off_does_not_allow_stage_or_publish(self):
        response=self.admin.request(self.base,"PUT",{**self.row,"option_index":2})
        self.assertEqual(response["status"],400,response)
        self.assertEqual(response["body"]["error"],"selection_disabled")
        self.assertFalse(self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]["enabled"])

    def test_draft_not_visible_as_published_change_then_clear(self):
        self.enable()
        with patch.object(choices,"current_source",return_value=self.source):
            saved=self.admin.request(self.base,"PUT",{**self.row,"option_index":2})
            self.assertEqual(saved["status"],200,saved)
            data=self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]
            self.assertEqual(len(data["drafts"]),1)
            self.assertEqual(data["published"],[])
            self.assertEqual(data["drafts"][0]["option_index"],2)
            self.assertEqual(choices.published_for_player(self.database(),self.aid,"2026-11-12","2026-11-12"),[])
            published=self.admin.request(self.base,"POST",{**self.row,"action":"publish"})
            self.assertEqual(published["status"],200,published)
            data=self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]
            self.assertEqual(len(data["drafts"]),0)
            self.assertEqual(data["published"][0]["option_ref"],"ref-option-b")
            self.assertEqual(data["published"][0]["source_color"],"yellow")

            # Replacing the published option never changes the live record
            # until the explicit publish action.
            self.admin.request(self.base,"PUT",{**self.row,"option_index":1})
            data=self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]
            self.assertEqual(data["drafts"][0]["option_index"],1)
            self.assertEqual(data["published"][0]["option_index"],2)

            # Clearing is staged and then published separately.
            self.admin.request(self.base,"PUT",{**self.row,"option_index":None})
            data=self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]
            self.assertEqual(data["drafts"][0]["action"],"clear")
            self.assertEqual(len(data["published"]),1)
            self.assertEqual(self.admin.request(self.base,"POST",{**self.row,"action":"publish"})["status"],200)
            cleared=self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]
            self.assertEqual(cleared["drafts"],[])
            self.assertEqual(cleared["published"],[])

    def database(self):
        # Connection returned solely for read-only check; closed via context
        # in caller not essential under sqlite's in-memory test fixture.
        return test_app.app.connect()

    def test_reordered_option_is_never_published_silently(self):
        self.enable()
        with patch.object(choices,"current_source",return_value=self.source):
            self.assertEqual(self.admin.request(self.base,"PUT",{**self.row,"option_index":1})["status"],200)
        shifted={**self.source,"options":self.source["options"][::-1]}
        with patch.object(choices,"current_source",return_value=shifted):
            rejected=self.admin.request(self.base,"POST",{**self.row,"action":"publish"})
        self.assertEqual(rejected["status"],400,rejected)
        self.assertEqual(rejected["body"]["error"],"option_stale")
        data=self.admin.request(self.base+"?start=2026-11-12&end=2026-11-12")["body"]
        self.assertEqual(data["published"],[])

    def test_invalid_index_and_roles_fail_closed(self):
        self.enable()
        for invalid in (True,0,-1,31,"2",1.5):
            self.assertEqual(self.admin.request(self.base,"PUT",{**self.row,"option_index":invalid})["status"],400)
        for bad in ({"date":"2026-02-31","meal":"breakfast","event_id":""},
                    {"date":"2026-11-12","meal":"pre_training","event_id":""},
                    {"date":"2026-11-12","meal":"snack","event_id":"event"}):
            self.assertEqual(self.admin.request(self.base,"PUT",{**bad,"option_index":1})["status"],400)
        anonymous=Client()
        self.assertEqual(anonymous.request(self.base+"?start=2026-11-12&end=2026-11-12")["status"],401)
        player=Client()
        self.assertEqual(player.request("/api/login","POST",{"identifier":"escolhas","password":"pass-secure-1234"})["status"],200)
        player.request("/api/me")
        self.assertEqual(player.request(self.base,"PUT",{**self.row,"option_index":1})["status"],403)
        self.assertEqual(player.request(self.base,"POST",{**self.row,"action":"publish"})["status"],403)


if __name__=="__main__":
    unittest.main()
