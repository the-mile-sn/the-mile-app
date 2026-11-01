"""Regression tests: renewal dates are informational, manual activation remains authoritative."""
import unittest
from datetime import date, timedelta
from unittest.mock import patch

import app
import test_app as fixture_module


class RenewalAccessRegression(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_module.PortalTest(methodName="test_deactivation_revokes_session")
        self.fixture.setUp()
        self.admin = self.fixture.admin
        created = self.admin.request(
            "/api/v2/athletes", "POST",
            {"name": "Jogador Teste", "username": "renovacaoteste",
             "password": "player-password-123", "sex": "M", "weight_kg": 75}
        )
        self.assertEqual(created["status"], 201, created)
        self.athlete = created["body"]["athlete"]["id"]
        with app.connect() as c:
            self.uid = c.execute(
                "SELECT user_id FROM v2_player_links WHERE athlete_id=?",
                (self.athlete,)
            ).fetchone()["user_id"]

    def _login(self):
        p = fixture_module.Client()
        r = p.request(
            "/api/login", "POST",
            {"identifier": "renovacaoteste", "password": "player-password-123"}
        )
        self.assertEqual(r["status"], 200, r)
        p.request("/api/me")
        return p

    def test_expired_legacy_dates_never_block_documents_or_overview(self):
        with app.connect() as c:
            c.execute(
                "UPDATE users SET renewal_date=?,access_until=? WHERE id=?",
                ("2020-01-01", "2020-01-15", self.uid)
            )
            c.commit()
        p = self._login()
        self.assertFalse(p.request("/api/me")["body"]["user"]["access_expired"])
        self.assertEqual(p.request("/api/documents")["status"], 200)
        upload = self.admin.request(
            "/api/documents?player=" + self.uid + "&folder=nutrition&title=Plan.pdf",
            "POST", fixture_module.PDF
        )
        self.assertEqual(upload["status"], 201, upload)
        self.assertEqual(
            p.request("/api/documents/" + upload["body"]["id"])["body"], PDF
        )
        overview = self.admin.request("/api/v2/admin/players-overview")
        row = next(x for x in overview["body"]["players"] if x["id"] == self.athlete)
        self.assertEqual(row["access_status"], "active")
        self.assertEqual(p.request("/api/documents/" + upload["body"]["id"], "DELETE")["status"], 403)

    def test_manual_block_revokes_session_and_reactivation_restores_login(self):
        p = self._login()
        block = self.admin.request(
            "/api/v2/athletes/" + self.athlete + "/access",
            "PUT", {"active": False}
        )
        self.assertEqual(block["status"], 200, block)
        self.assertEqual(p.request("/api/documents")["status"], 401)
        with app.connect() as c:
            self.assertEqual(
                c.execute("SELECT count(*) FROM sessions WHERE user_id=?", (self.uid,)).fetchone()[0],
                0
            )
        self.assertEqual(self.admin.request(
            "/api/v2/athletes/" + self.athlete + "/access",
            "PUT", {"active": True}
        )["status"], 200)
        self.assertEqual(self._login().request("/api/documents")["status"], 200)

    def test_renewal_notifications_scheduler_and_extension_are_disabled(self):
        with app.connect() as c:
            old = (date.today() + timedelta(days=7)).isoformat()
            c.execute(
                "UPDATE users SET renewal_date=?,access_until=? WHERE id=?",
                (old, "2020-01-15", self.uid)
            )
            c.commit()
            before = c.execute("SELECT count(*) FROM notifications").fetchone()[0]
            with patch.object(app, "send_player_push") as send:
                self.assertEqual(app.create_due_renewal_notifications(c), 0)
                send.assert_not_called()
            self.assertEqual(c.execute("SELECT count(*) FROM notifications").fetchone()[0], before)
        self.assertIsNone(app.start_renewal_notification_scheduler())
        extension = self.admin.request(
            "/api/players/" + self.uid + "/access-extension", "POST", {"days": 7}
        )
        self.assertEqual(extension["status"], 409)
        with app.connect() as c:
            row = c.execute(
                "SELECT renewal_date,access_until FROM users WHERE id=?", (self.uid,)
            ).fetchone()
            self.assertEqual(row["renewal_date"], old)
            self.assertEqual(row["access_until"], "2020-01-15")


if __name__ == "__main__":
    unittest.main()
