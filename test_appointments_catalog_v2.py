"""Phase 2 appointment service/professional CRUD with tenant and session boundaries."""
import unittest
from unittest.mock import patch

import test_app as fixtures
import app
import appointments_catalog_v2 as catalogue


def service(name="Avaliação de composição corporal", people=None):
    return {
        "name": name,
        "category": "Avaliações",
        "duration_minutes": 55,
        "active": True,
        "formats": {
            "presencial": {"enabled": True, "price_cents": 3500,
                           "shopify_product_id": "", "shopify_variant_id": ""},
            "online": {"enabled": False, "price_cents": 0,
                       "shopify_product_id": "", "shopify_variant_id": ""},
        },
        "professional_ids": people or [],
    }


def professional(name="Profissional de Teste", email="teste@exemplo.pt", services=None):
    return {"name": name, "email": email, "active": True,
            "presencial_enabled": True, "online_enabled": True,
            "service_ids": services or []}


class AppointmentsCatalogTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.base = "/api/v2/admin/appointments"

    def catalog(self):
        response = self.admin.request(self.base + "/catalog")
        self.assertEqual(response["status"], 200, response)
        return response["body"]

    def test_initial_shopify_catalogue_is_seeded_once(self):
        data = self.catalog()
        self.assertEqual(data["organization"]["id"], "the-mile")
        self.assertEqual(data["organization"]["timezone"], "Europe/Lisbon")
        self.assertEqual(len(data["services"]), 4)
        self.assertEqual(data["professionals"], [])
        by_name = {s["name"]: s for s in data["services"]}
        first = by_name["Consulta de Wellness (Primeira)"]
        follow = by_name["Consulta de Wellness (Seguimento)"]
        self.assertEqual(first["duration_minutes"], 90)
        self.assertEqual(follow["duration_minutes"], 45)
        self.assertEqual(first["formats"]["presencial"]["price_cents"], 7000)
        self.assertEqual(first["formats"]["online"]["price_cents"], 6000)
        self.assertEqual(first["formats"]["presencial"]["shopify_product_id"],
                         "gid://shopify/Product/7272959344710")
        self.assertEqual(first["formats"]["presencial"]["shopify_variant_id"],
                         "gid://shopify/ProductVariant/40997362794566")

        # A redeploy/reinitialize never overwrites a team's internal catalogue edits.
        first["active"] = False
        updated = self.admin.request(self.base + "/services/" + first["id"], "PUT", first)
        self.assertEqual(updated["status"], 200, updated)
        with app.connect() as c:
            catalogue.initialize(c)
        after = {s["id"]: s for s in self.catalog()["services"]}
        self.assertFalse(after[first["id"]]["active"])

    def test_crud_and_relationships_are_bidirectional(self):
        created = self.admin.request(self.base + "/professionals", "POST",
                                     professional())
        self.assertEqual(created["status"], 201, created)
        pid = created["body"]["id"]
        item = service(people=[pid])
        created = self.admin.request(self.base + "/services", "POST", item)
        self.assertEqual(created["status"], 201, created)
        sid = created["body"]["id"]
        data = self.catalog()
        srv = next(s for s in data["services"] if s["id"] == sid)
        prof = next(p for p in data["professionals"] if p["id"] == pid)
        self.assertEqual(srv["professional_ids"], [pid])
        self.assertEqual(prof["service_ids"], [sid])
        self.assertEqual(srv["formats"]["presencial"]["price_cents"], 3500)
        self.assertFalse(srv["formats"]["online"]["enabled"])
        self.assertEqual(srv["duration_minutes"], 55)

        changed = professional(name="Novo Nome", email="novo@exemplo.pt",
                               services=[sid])
        changed["online_enabled"] = False
        self.assertEqual(self.admin.request(self.base + "/professionals/" + pid, "PUT",
                                            changed)["status"], 200)
        prof = next(p for p in self.catalog()["professionals"] if p["id"] == pid)
        self.assertEqual(prof["name"], "Novo Nome")
        self.assertFalse(prof["online_enabled"])
        self.assertEqual(prof["service_ids"], [sid])
        item["active"] = False
        item["professional_ids"] = []
        self.assertEqual(self.admin.request(self.base + "/services/" + sid, "PUT",
                                            item)["status"], 200)
        data = self.catalog()
        self.assertFalse(next(s for s in data["services"] if s["id"] == sid)["active"])
        self.assertEqual(next(p for p in data["professionals"] if p["id"] == pid)["service_ids"], [])

    def test_invalid_values_do_not_modify_database(self):
        bad = service(name="Teste Falha")
        bad["duration_minutes"] = 10
        response = self.admin.request(self.base + "/services", "POST", bad)
        self.assertEqual(response["status"], 400)
        self.assertEqual(response["body"]["error"], "invalid_duration")
        bad = service(name="Teste Falha")
        bad["formats"]["presencial"]["price_cents"] = -1
        self.assertEqual(self.admin.request(self.base + "/services", "POST", bad)["status"], 400)
        bad = service(name="Teste Falha")
        bad["professional_ids"] = ["nao-existe"]
        self.assertEqual(self.admin.request(self.base + "/services", "POST", bad)["status"], 400)
        bad = service(name="Teste Falha")
        bad["formats"]["online"]["shopify_variant_id"] = "gid://shopify/ProductVariant/12"
        self.assertEqual(self.admin.request(self.base + "/services", "POST", bad)["status"], 400)
        self.assertFalse(any(s["name"] == "Teste Falha" for s in self.catalog()["services"]))

    def test_duplicate_service_names_and_professional_emails(self):
        self.assertEqual(self.admin.request(self.base + "/services", "POST",
                                            service(name="Exame Nutricional"))["status"], 201)
        self.assertEqual(self.admin.request(self.base + "/services", "POST",
                                            service(name="exame nutricional"))["status"], 400)
        self.assertEqual(self.admin.request(self.base + "/professionals", "POST",
                                            professional())["status"], 201)
        self.assertEqual(self.admin.request(self.base + "/professionals", "POST",
                                            professional(name="Outra pessoa", email="TESTE@EXEMPLO.PT"))["status"], 400)

    def test_tenant_references_cannot_cross_organizations(self):
        with app.connect() as c:
            c.execute("INSERT INTO appt_organizations(id,name,timezone) VALUES(?,?,?)",
                      ("external", "Clinica Teste", "Europe/Lisbon"))
            outsider = catalogue.save_professional(
                c, professional(name="Externo", email="externo@example.pt"), org_id="external")
        bad = service(name="Serviço misturado", people=[outsider])
        response = self.admin.request(self.base + "/services", "POST", bad)
        self.assertEqual(response["status"], 400)
        self.assertEqual(response["body"]["error"], "invalid_professionals")
        spoofed = professional(name="Internal", email="internal@example.pt")
        spoofed["org_id"] = "external"
        response = self.admin.request(self.base + "/professionals", "POST", spoofed)
        self.assertEqual(response["status"], 201)
        self.assertNotIn(outsider, [p["id"] for p in self.catalog()["professionals"]])
        self.assertIn(response["body"]["id"], [p["id"] for p in self.catalog()["professionals"]])

    def test_security_no_public_write_no_player_access_csrf(self):
        self.assertEqual(fixtures.Client().request(self.base + "/catalog")["status"], 401)
        self.assertEqual(fixtures.Client().request(self.base + "/services", "POST",
                                                  service())["status"], 401)
        self.assertEqual(self.admin.request(self.base + "/services", "POST",
                                            service(), csrf=False)["status"], 403)
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.admin.request(self.base + "/catalog")["status"], 404)
            self.assertEqual(fixtures.Client().request(self.base + "/catalog")["status"], 404)
        self.assertEqual(self.admin.request(self.base + "/services/not-an-id", "PUT",
                                            service())["status"], 404)
        self.assertEqual(self.admin.request(self.base + "/professionals/not-an-id", "PUT",
                                            professional())["status"], 404)


if __name__ == "__main__":
    unittest.main()
