"""Clientes de consulta (fase 1): perfil central, ligação às marcações, sem tocar no resto."""
import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import test_app as fixtures


class ConsultClientsTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.appt = "/api/v2/admin/appointments"
        self.base = "/api/v2/admin/consult-clients"
        cat = self.admin.request(self.appt + "/catalog")["body"]
        self.service = next(s for s in cat["services"] if s["duration_minutes"] == 45)
        prof = self.admin.request(self.appt + "/professionals", "POST", {
            "name": "Prof Consulta", "email": "prof-consulta@test.invalid", "active": True,
            "presencial_enabled": True, "online_enabled": True,
            "service_ids": [self.service["id"]]})
        self.assertEqual(prof["status"], 201, prof)
        self.pid = prof["body"]["id"]
        self.day = (datetime.now(ZoneInfo("Europe/Lisbon")).date() + timedelta(days=3)).isoformat()
        self.admin.request(self.appt + "/availability", "POST", {
            "professional_id": self.pid, "date": self.day, "start": "09:00", "end": "13:00"})

    def book(self, start, email, name="Cliente Teste"):
        r = self.admin.request(self.appt + "/bookings", "POST", {
            "professional_id": self.pid, "service_id": self.service["id"], "mode": "online",
            "date": self.day, "start": start, "customer_name": name,
            "customer_email": email, "customer_phone": "912345678"})
        self.assertEqual(r["status"], 201, r)
        return r["body"]["id"]

    def req(self, suffix="", method="GET", payload=None):
        return self.admin.request(self.base + suffix, method, payload)

    def test_auto_link_creates_pending_profile_once_and_reuses_it(self):
        self.book("09:00", "Ana@Example.pt", "Ana Silva")
        self.book("10:00", "ana@example.pt", "Ana Silva")
        listed = self.req()
        self.assertEqual(listed["status"], 200, listed)
        clients = listed["body"]["clients"]
        self.assertEqual(len(clients), 1)
        self.assertEqual(clients[0]["status"], "pending")
        self.assertEqual(clients[0]["email"], "ana@example.pt")
        self.assertEqual(clients[0]["bookings_count"], 2)
        # Repetir não duplica.
        again = self.req()["body"]["clients"]
        self.assertEqual(len(again), 1)
        detail = self.req("/" + clients[0]["id"])
        self.assertEqual(detail["status"], 200, detail)
        self.assertEqual(len(detail["body"]["bookings"]), 2)

    def test_guardian_email_links_to_existing_profile(self):
        created = self.req("", "POST", {"name": "Tomás Silva", "birth_date": "2011-03-12",
                                        "guardian_name": "Marta Silva", "guardian_email": "marta@example.pt",
                                        "guardian_relation": "Mãe"})
        self.assertEqual(created["status"], 201, created)
        self.book("09:00", "marta@example.pt", "Marta Silva")
        clients = self.req()["body"]["clients"]
        self.assertEqual(len(clients), 1)
        self.assertEqual(clients[0]["name"], "Tomás Silva")
        self.assertEqual(clients[0]["bookings_count"], 1)

    def test_ambiguous_email_stays_unassigned_until_linked_manually(self):
        a = self.req("", "POST", {"name": "Filho A", "guardian_email": "pai@example.pt"})["body"]["id"]
        self.req("", "POST", {"name": "Filho B", "guardian_email": "pai@example.pt"})
        booking = self.book("09:00", "pai@example.pt", "Pai")
        listed = self.req()["body"]
        self.assertEqual(listed["unassigned"], 1)
        queue = self.req("/unassigned")["body"]["bookings"]
        self.assertEqual([b["id"] for b in queue], [booking])
        linked = self.req("/link", "POST", {"kind": "manual", "booking_id": booking, "client_id": a})
        self.assertEqual(linked["status"], 200, linked)
        self.assertEqual(self.req()["body"]["unassigned"], 0)
        self.assertEqual(self.req("/" + a)["body"]["bookings_count"], 1)

    def test_update_versioning_validation_and_audit(self):
        cid = self.req("", "POST", {"name": "Rui Costa", "email": "rui@example.pt"})["body"]["id"]
        detail = self.req("/" + cid)["body"]
        bad = self.req("/" + cid, "PUT", {"version": detail["version"], "height_cm": 20})
        self.assertEqual(bad["status"], 400)
        ok = self.req("/" + cid, "PUT", {"version": detail["version"], "height_cm": "178,5",
                                         "sex": "M", "arm_point_cm": 17.5, "thigh_point_cm": 24,
                                         "ethnicity": "african",
                                         "active_professional_id": self.pid})
        self.assertEqual(ok["status"], 200, ok)
        stale = self.req("/" + cid, "PUT", {"version": detail["version"], "phone": "1"})
        self.assertEqual(stale["status"], 409)
        after = self.req("/" + cid)["body"]
        self.assertEqual(after["height_cm"], 178.5)
        self.assertEqual(after["ethnicity"], "african")
        self.assertIn("updated", [e["action"] for e in after["events"]])
        asian = self.req("/" + cid, "PUT", {"version": after["version"], "ethnicity": "asian"})
        self.assertEqual(asian["status"], 200, asian)
        after = self.req("/" + cid)["body"]
        self.assertEqual(after["ethnicity"], "asian")
        bad_ethnic = self.req("/" + cid, "PUT", {"version": after["version"], "ethnicity": "x"})
        self.assertEqual(bad_ethnic["status"], 400)
        unknown = self.req("/" + cid, "PUT", {"version": after["version"], "active_professional_id": "x"})
        self.assertEqual(unknown["status"], 400)

    def test_merge_moves_bookings_and_archives_source(self):
        self.book("09:00", "dup1@example.pt", "Duplicado")
        self.book("10:00", "dup2@example.pt", "Duplicado")
        clients = {c["email"]: c for c in self.req()["body"]["clients"]}
        source, target = clients["dup2@example.pt"], clients["dup1@example.pt"]
        merged = self.req("/" + source["id"] + "/merge", "POST", {"target_id": target["id"]})
        self.assertEqual(merged["status"], 200, merged)
        self.assertEqual(merged["body"]["moved"], 1)
        remaining = self.req()["body"]["clients"]
        self.assertEqual([c["id"] for c in remaining], [target["id"]])
        self.assertEqual(remaining[0]["bookings_count"], 2)

    def test_confirm_and_archive(self):
        cid = self.req("", "POST", {"name": "Joana"})["body"]["id"]
        v = self.req("/" + cid)["body"]["version"]
        r = self.req("/" + cid + "/archive", "POST", {"version": v})
        self.assertEqual(r["status"], 200, r)
        self.assertEqual(self.req()["body"]["clients"], [])
        self.assertEqual(len(self.req("?status=archived")["body"]["clients"]), 1)

    def test_active_nutritionist_from_first_booking_and_birthdays(self):
        self.book("09:00", "rita@example.pt", "Rita Sousa")
        client = self.req()["body"]["clients"][0]
        detail = self.req("/" + client["id"])["body"]
        self.assertEqual(detail["client"]["active_professional_id"] if "client" in detail else detail["active_professional_id"], self.pid)
        # Escolha manual não é substituída por marcações seguintes.
        other = self.admin.request(self.appt + "/professionals", "POST", {
            "name": "Outra Prof", "email": "outra@test.invalid", "active": True,
            "presencial_enabled": True, "online_enabled": True, "service_ids": [self.service["id"]]})["body"]["id"]
        version = detail["client"]["version"] if "client" in detail else detail["version"]
        today = datetime.now(ZoneInfo("Europe/Lisbon")).date()
        born = today.replace(year=today.year - 30) if not (today.month == 2 and today.day == 29) else today.replace(year=today.year - 28)
        upd = self.req("/" + client["id"], "PUT", {"version": version, "active_professional_id": other,
                                                   "birth_date": born.isoformat()})
        self.assertEqual(upd["status"], 200, upd)
        self.book("10:00", "rita@example.pt", "Rita Sousa")
        self.req()
        detail = self.req("/" + client["id"])["body"]
        self.assertEqual(detail["client"]["active_professional_id"] if "client" in detail else detail["active_professional_id"], other)
        b = self.req("/birthdays?date=" + today.isoformat())
        self.assertEqual(b["status"], 200, b)
        self.assertEqual([x["name"] for x in b["body"]["birthdays"]], ["Rita Sousa"])
        self.assertEqual(self.req("/birthdays?date=nope")["status"], 400)
        tomorrow = (today + timedelta(days=1)).isoformat()
        self.assertEqual(self.req("/birthdays?date=" + tomorrow)["body"]["birthdays"], [])

    def test_requires_session(self):
        self.assertEqual(fixtures.Client().request(self.base)["status"], 401)


if __name__ == "__main__":
    unittest.main()


class EthnicityMigrationTest(unittest.TestCase):
    """Bases antigas (antes e depois do #440) passam a ter só a coluna ``ethnicity``."""

    OLD = """CREATE TABLE consult_clients (id TEXT PRIMARY KEY, org_id TEXT NOT NULL,
        name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        birth_date TEXT NOT NULL DEFAULT '', sex TEXT NOT NULL DEFAULT '', height_cm REAL,
        status TEXT NOT NULL DEFAULT 'pending', active_professional_id TEXT,
        guardian_name TEXT NOT NULL DEFAULT '', guardian_email TEXT NOT NULL DEFAULT '',
        guardian_phone TEXT NOT NULL DEFAULT '', guardian_relation TEXT NOT NULL DEFAULT '',
        arm_point_cm REAL, thigh_point_cm REAL,
        ethnic_adjustment TEXT NOT NULL DEFAULT 'none' CHECK(ethnic_adjustment IN ('none','african')),
        notes TEXT NOT NULL DEFAULT '', merged_into TEXT, version INTEGER NOT NULL DEFAULT 1,
        created_by TEXT, updated_by TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)"""

    def _db(self, with_new_column):
        import sqlite3
        import consult_clients_v2 as cc
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        c.execute(self.OLD)
        c.execute("""CREATE TABLE consult_client_bookings (org_id TEXT, booking_kind TEXT,
            booking_id TEXT, client_id TEXT REFERENCES consult_clients(id), linked_by TEXT,
            linked_at BIGINT, PRIMARY KEY(org_id,booking_kind,booking_id))""")
        if with_new_column:
            c.execute("ALTER TABLE consult_clients ADD COLUMN ethnicity TEXT NOT NULL DEFAULT 'none'")
        c.execute("""INSERT INTO consult_clients(id,org_id,name,ethnic_adjustment,created_at,updated_at)
            VALUES('a','o','A','african',1,1),('b','o','B','none',1,1),('c','o','C','none',1,1)""")
        if with_new_column:
            c.execute("UPDATE consult_clients SET ethnicity='african' WHERE id='a'")
            c.execute("UPDATE consult_clients SET ethnicity='asian' WHERE id='c'")
        c.execute("INSERT INTO consult_client_bookings VALUES('o','manual','x','a','auto',1)")
        cc.initialize(c)
        cc.initialize(c)  # repetível
        return c

    def test_before_440(self):
        c = self._db(False)
        cols = [r["name"] for r in c.execute("PRAGMA table_info(consult_clients)")]
        self.assertNotIn("ethnic_adjustment", cols)
        self.assertEqual({r["id"]: r["ethnicity"] for r in c.execute("SELECT id,ethnicity FROM consult_clients")},
                         {"a": "african", "b": "none", "c": "none"})
        self.assertEqual(c.execute("SELECT COUNT(*) FROM consult_client_bookings").fetchone()[0], 1)

    def test_after_440(self):
        c = self._db(True)
        cols = [r["name"] for r in c.execute("PRAGMA table_info(consult_clients)")]
        self.assertNotIn("ethnic_adjustment", cols)
        self.assertEqual({r["id"]: r["ethnicity"] for r in c.execute("SELECT id,ethnicity FROM consult_clients")},
                         {"a": "african", "b": "none", "c": "asian"})
