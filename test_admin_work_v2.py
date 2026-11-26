"""Regression checks for private events and tasks, including role and CSRF boundaries."""
import sqlite3
import unittest
from unittest.mock import patch

import admin_work_v2 as work


class InternalWorkStorageTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, role TEXT, active INTEGER)")
        self.db.executemany("INSERT INTO users VALUES (?,?,?,?)", [
            ("a1", "Admin A", "admin", 1),
            ("a2", "Admin B", "admin", 1),
            ("p1", "Jogador", "player", 1),
        ])
        import appointments_catalog_v2, appointments_availability_v2, appointments_bookings_v2
        import appointments_checkout_v2, appointments_shopify_bridge_v2
        for module in (appointments_catalog_v2, appointments_availability_v2, appointments_bookings_v2,
                       appointments_checkout_v2, appointments_shopify_bridge_v2):
            module.initialize(self.db)
        work.initialize(self.db)
        work.initialize(self.db)  # repeatable migration

    def tearDown(self):
        self.db.close()

    def event(self, **extra):
        return {
            "date": "2026-11-25", "start": "09:00", "end": "10:00",
            "kind": "meeting", "title": "Reunião de equipa",
            "participants": "Admin A; Admin B", "description": "Organização semanal",
            "responsible_id": "a1", **extra
        }

    def task(self, **extra):
        return {"title": "Preparar plano", "description": "Plano do cliente",
                "due_date": "2026-11-25", "responsible_id": "a1", **extra}

    def test_event_crud_no_booking_side_effects_and_versioning(self):
        created = work.create_event(self.db, self.event(), "a1")
        self.assertEqual(created["version"], 1)
        self.assertEqual(created["responsible_name"], "Admin A")
        second = work.create_event(self.db, self.event(start="09:30", end="10:30"), "a1")
        self.assertNotEqual(created["id"], second["id"])
        self.assertEqual(len(work.list_events(self.db, "2026-11-25", "2026-11-25")["events"]), 2)
        changed = work.update_event(self.db, created["id"], {
            **self.event(title="Reunião alterada", responsible_id="a2"), "version": 1
        }, "a1")
        self.assertEqual(changed["version"], 2)
        self.assertEqual(changed["responsible_name"], "Admin B")
        with self.assertRaisesRegex(ValueError, "stale_record"):
            work.update_event(self.db, created["id"], {**self.event(), "version": 1}, "a1")
        with self.assertRaisesRegex(ValueError, "stale_record"):
            work.delete_event(self.db, created["id"], {"version": 1})
        self.assertTrue(work.delete_event(self.db, created["id"], {"version": 2})["ok"])
        self.assertEqual(len(work.list_events(self.db, "2026-11-25", "2026-11-25")["events"]), 1)

    def test_event_validation_and_admin_only_responsibles(self):
        for payload in (
            self.event(date="2026-02-30"), self.event(start="24:30"),
            self.event(start="12:00", end="11:00"),
            self.event(title=" "), self.event(kind="match"),
            self.event(responsible_id="p1"), self.event(participants="x" * 241),
        ):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                work.create_event(self.db, payload, "a1")
        with self.assertRaises(ValueError):
            work.list_events(self.db, "2026-01-01", "2026-06-01")

    def test_task_due_state_owner_and_stale_guard(self):
        created = work.create_task(self.db, self.task(), "a1")
        self.assertEqual(created["status"], "open")
        self.assertIsNone(created["completed_at"])
        self.assertEqual(len(work.list_tasks(self.db, "open", "2026-11-25")["tasks"]), 1)
        done = work.update_task(self.db, created["id"], {
            **self.task(status="done", responsible_id="a2"), "version": 1
        }, "a1")
        self.assertEqual(done["status"], "done")
        self.assertEqual(done["responsible_name"], "Admin B")
        self.assertIsNotNone(done["completed_at"])
        self.assertEqual(work.list_tasks(self.db, "open")["tasks"], [])
        reopened = work.update_task(self.db, created["id"], {
            **self.task(due_date=None), "version": 2
        }, "a1")
        self.assertEqual(reopened["status"], "open")
        self.assertIsNone(reopened["completed_at"])
        self.assertIsNone(reopened["due_date"])
        with self.assertRaisesRegex(ValueError, "stale_record"):
            work.delete_task(self.db, created["id"], {"version": 2})
        self.assertTrue(work.delete_task(self.db, created["id"], {"version": 3})["ok"])
        with self.assertRaises(LookupError):
            work.delete_task(self.db, created["id"], {"version": 3})

    def test_task_validation(self):
        for payload in (
            self.task(status="blocked"), self.task(title=""),
            self.task(due_date="25/11/2026"),
            self.task(responsible_id="p1"),
        ):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                work.create_task(self.db, payload, "a1")


class InternalWorkHttpTests(unittest.TestCase):
    def setUp(self):
        import test_app as fixtures
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.base = "/api/v2/admin/work"

    def test_private_api_and_csrf(self):
        import app
        import test_app as fixtures
        with patch.object(app, "SITE_ROLE", "admin"):
            self.assertEqual(fixtures.Client().request(self.base + "/tasks")["status"], 401)
            self.assertEqual(self.admin.request(self.base + "/admins")["status"], 200)
            payload = {"title": "Rever avaliação", "due_date": "2026-11-25"}
            self.assertEqual(self.admin.request(self.base + "/tasks", "POST", payload, csrf=False)["status"], 403)
            created = self.admin.request(self.base + "/tasks", "POST", payload)
            self.assertEqual(created["status"], 201, created)
            result = self.admin.request(self.base + "/tasks?status=open")
            self.assertEqual(result["status"], 200, result)
            self.assertTrue(any(t["id"] == created["body"]["task"]["id"] for t in result["body"]["tasks"]))
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.admin.request(self.base + "/tasks")["status"], 404)
            self.assertEqual(fixtures.Client().request("/admin-work.js")["status"], 404)
            self.assertEqual(fixtures.Client().request("/admin-work.css")["status"], 404)

    def test_event_api_and_non_booking_isolation(self):
        import app
        with patch.object(app, "SITE_ROLE", "admin"):
            before = self.admin.request("/api/v2/admin/appointments/bookings?from=2026-11-25&to=2026-11-25")
            self.assertEqual(before["status"], 200, before)
            payload = {"title": "Reunião", "date": "2026-11-25",
                       "start": "09:00", "end": "10:00", "kind": "meeting"}
            created = self.admin.request(self.base + "/events", "POST", payload)
            self.assertEqual(created["status"], 201, created)
            listed = self.admin.request(self.base + "/events?from=2026-11-25&to=2026-11-25")
            self.assertEqual(listed["status"], 200, listed)
            self.assertEqual(len(listed["body"]["events"]), 1)
            after = self.admin.request("/api/v2/admin/appointments/bookings?from=2026-11-25&to=2026-11-25")
            self.assertEqual(after["status"], 200, after)
            self.assertEqual(before["body"]["bookings"], after["body"]["bookings"])


if __name__ == "__main__":
    unittest.main()
