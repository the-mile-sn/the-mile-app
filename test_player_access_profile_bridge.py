"""Regression tests for V2 self-only profile and manual-only access rules."""
import io
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from PIL import Image

import test_app as fixtures
import app
import microcycles_v2


def image_bytes(color):
    image=Image.new("RGB",(28,28),color)
    buffer=io.BytesIO()
    image.save(buffer,format="PNG")
    return buffer.getvalue()


class PlayerProfileBridgeTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.fixture.setUp()
        self.admin=self.fixture.admin
        self.accounts=[]
        for i, username in enumerate(("playerone","playertwo")):
            created=self.admin.request("/api/v2/athletes","POST",{"name":"Jogador "+str(i+1)})
            self.assertEqual(created["status"],201,created)
            athlete_id=created["body"]["athlete"]["id"]
            access=self.admin.request(
                "/api/v2/athletes/"+athlete_id+"/access",
                "POST",{"username":username,"password":"player-password-123"})
            self.assertEqual(access["status"],201,access)
            self.accounts.append((athlete_id,access["body"]["access"]["id"],username))

    def login(self, username):
        player=fixtures.Client()
        result=player.request(
            "/api/login","POST",{"identifier":username,"password":"player-password-123"})
        self.assertEqual(result["status"],200,result)
        self.assertEqual(player.request("/api/me")["status"],200)
        return player

    def test_profile_reads_only_linked_v2_followup_and_private_photo(self):
        aid,uid,username=self.accounts[0]
        other_aid,other_uid,other_username=self.accounts[1]
        photo=image_bytes((12,75,170))
        with app.connect() as c:
            c.execute("UPDATE v2_athletes SET followup_plan=?,followup_renewal_date=? WHERE id=?",
                      ("Pro","2027-07-15",aid))
            c.execute("UPDATE users SET photo=?,photo_mime=?,plan_name=?,renewal_date=? WHERE id=?",
                      (photo,"image/png","Elite","2020-02-01",uid))
            c.commit()
        player=self.login(username)
        private=player.request("/api/v2/player/me")
        self.assertEqual(private["status"],200,private)
        details=private["body"]["player"]
        self.assertEqual(details["id"],aid)
        self.assertEqual(details["followup_plan"],"Pro")
        self.assertEqual(details["followup_renewal_date"],"2027-07-15")
        self.assertNotIn("password",details)
        self.assertNotIn("photo",details)
        self.assertTrue(player.request("/api/me")["body"]["user"]["has_photo"])
        own=player.request("/api/v2/player/profile-photo")
        self.assertEqual(own["status"],200,own)
        self.assertEqual(own["body"],photo)
        self.assertEqual(own["headers"]["Content-Type"],"image/png")
        self.assertEqual(own["headers"]["Cache-Control"],"no-store")
        other=self.login(other_username)
        self.assertFalse(other.request("/api/me")["body"]["user"]["has_photo"])
        self.assertEqual(other.request("/api/v2/player/profile-photo")["status"],404)
        self.assertEqual(other.request("/api/players/"+uid+"/photo")["status"],403)
        self.assertIsNone(other.request("/api/v2/player/me")["body"]["player"]["followup_plan"])
        self.assertIsNone(other.request("/api/v2/player/me")["body"]["player"]["followup_renewal_date"])

    def test_historical_dates_do_not_expire_account_or_documents(self):
        aid,uid,username=self.accounts[0]
        with app.connect() as c:
            c.execute("UPDATE users SET renewal_date=?,access_until=? WHERE id=?",
                      ("2020-01-01","2020-01-15",uid))
            c.execute("UPDATE v2_athletes SET followup_plan=?,followup_renewal_date=? WHERE id=?",
                      ("Elite","2021-01-15",aid))
            c.commit()
        player=self.login(username)
        self.assertFalse(player.request("/api/me")["body"]["user"]["access_expired"])
        self.assertEqual(player.request("/api/v2/player/me")["status"],200)
        self.assertEqual(player.request("/api/v2/player/plans")["status"],200)
        self.assertEqual(player.request("/api/documents")["status"],200)
        pdf=self.admin.request("/api/documents?player="+uid+"&folder=nutrition&title=Plano.pdf","POST",fixtures.PDF)
        self.assertEqual(pdf["status"],201,pdf)
        own=player.request("/api/documents/"+pdf["body"]["id"])
        self.assertEqual(own["status"],200,own)
        self.assertEqual(own["body"],fixtures.PDF)
        self.assertEqual(self.login(self.accounts[1][2]).request("/api/documents/"+pdf["body"]["id"])["status"],403)
        with app.connect() as c:
            c.execute("UPDATE users SET renewal_date=?,access_until=? WHERE id=?",
                      ("invalid-date","invalid-date",uid))
            c.commit()
        self.assertEqual(player.request("/api/documents")["status"],200)

    def test_manual_block_immediately_revokes_session_and_can_reactivate(self):
        aid,uid,username=self.accounts[0]
        player=self.login(username)
        change=self.admin.request("/api/v2/athletes/"+aid+"/access","PUT",{"active":False})
        self.assertEqual(change["status"],200,change)
        with app.connect() as c:
            row=c.execute("SELECT active FROM users WHERE id=?",(uid,)).fetchone()
            self.assertFalse(row["active"])
            count=c.execute("SELECT count(*) FROM sessions WHERE user_id=?",(uid,)).fetchone()[0]
            self.assertEqual(count,0)
        self.assertEqual(player.request("/api/v2/player/me")["status"],401)
        self.assertEqual(player.request("/api/v2/player/profile-photo")["status"],401)
        self.assertEqual(player.request("/api/documents")["status"],401)
        self.assertEqual(self.admin.request("/api/v2/athletes/"+aid+"/access","PUT",{"active":True})["status"],200)
        self.assertEqual(player.request("/api/documents")["status"],401)
        self.assertEqual(self.login(username).request("/api/documents")["status"],200)

    def test_renewal_scheduler_and_legacy_extension_are_disabled(self):
        aid,uid,username=self.accounts[0]
        with app.connect() as c:
            renewal=(date.today()+timedelta(days=7)).isoformat()
            c.execute("UPDATE users SET renewal_date=?,access_until=? WHERE id=?",
                      (renewal,"2020-01-15",uid))
            c.commit()
            before=c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]
            with patch.object(app,"send_player_push") as push:
                self.assertEqual(app.create_due_renewal_notifications(c),0)
                push.assert_not_called()
            after=c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]
            self.assertEqual(after,before)
        with patch("threading.Thread") as thread:
            self.assertIsNone(app.start_renewal_notification_scheduler())
            thread.assert_not_called()
        old=self.admin.request("/api/players/"+uid+"/access-extension","POST",{"days":7})
        self.assertEqual(old["status"],409,old)
        with app.connect() as c:
            row=c.execute("SELECT renewal_date,access_until FROM users WHERE id=?",(uid,)).fetchone()
            self.assertEqual(row["renewal_date"],renewal)
            self.assertEqual(row["access_until"],"2020-01-15")

    def test_editing_legacy_dates_does_not_log_out_an_active_player(self):
        athlete_id, uid, username = self.accounts[0]
        with app.connect() as c:
            c.execute("UPDATE users SET access_until=? WHERE id=?", ("2020-01-15", uid))
            c.commit()
        player = self.login(username)
        result = self.admin.request("/api/players/" + uid, "PUT", {
            "name": "Jogador Teste",
            "username": username,
            "birth_date": "2001-01-01",
            "sex": "M",
            "height": 178,
            "weight": 77,
            "plan_name": "Pro",
            "renewal_date": "2027-01-01",
            "access_until": "2028-01-01",
            "menus_enabled": False,
            "anthropometry_enabled": False,
        })
        self.assertEqual(result["status"], 200, result)
        self.assertEqual(player.request("/api/v2/player/me")["status"], 200)
        with app.connect() as c:
            row = c.execute("SELECT renewal_date, access_until FROM users WHERE id=?", (uid,)).fetchone()
            self.assertEqual(row["renewal_date"], "2027-01-01")
            self.assertEqual(row["access_until"], "2028-01-01")


    def test_followup_fields_initialize_idempotently_without_data_loss(self):
        aid,uid,_=self.accounts[0]
        with app.connect() as c:
            c.execute("UPDATE v2_athletes SET followup_plan=?,followup_renewal_date=? WHERE id=?",
                      ("Elite","2028-06-20",aid))
            c.commit()
            microcycles_v2.initialize(c)
            microcycles_v2.initialize(c)
            data=c.execute("SELECT followup_plan,followup_renewal_date FROM v2_athletes WHERE id=?",(aid,)).fetchone()
            self.assertEqual(data["followup_plan"],"Elite")
            self.assertEqual(data["followup_renewal_date"],"2028-06-20")


if __name__=="__main__":
    unittest.main()
