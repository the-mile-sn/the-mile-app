"""Formulário pré-consulta: link, página pública via app proxy assinado e respostas."""
import hashlib
import hmac
import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import urlencode, urlparse, parse_qs
from zoneinfo import ZoneInfo

import app
import test_app as fixtures

SECRET = "the-mile-form-test-secret-do-not-use-live"
SHOP = "the-mile-sports-nutrition.myshopify.com"
CONFIG = {"MILE_SHOPIFY_APP_SECRET": SECRET, "MILE_SHOPIFY_SHOP_DOMAIN": SHOP}
PROXY = "/api/v2/shopify/app-proxy/formulario"

FREQ_ALL = {k: "d1_2" for k in ("soup", "vegetables", "fruit", "legumes", "fish", "fatty_fish", "red_meat",
                                  "dairy", "nuts", "eating_out", "fried", "sweets")}
ANSWERS = {
    "for_whom": "self", "birth_date": "1996-03-02", "sex": "F", "height_cm": "165", "weight_kg": 61.5,
    "weighs_daily": "no", "allergies": "Marisco", "medication": "", "previous_nutrition": "no",
    "goals": ["weight_loss", "other"], "goals_other": "Dormir melhor", "smoking": "no", "sleep_hours": "7",
    "sleep_quality": "3", "cycle": "regular", "activity": "d3_4", "sports": ["running"],
    "diet_pattern": "omnivore", "shopping": "me", "supermarkets": ["lidl", "continente"], "cooking": "me",
    "weighs_food": "never", "water": "1_2", "urine_color": "3", "coffee": "1_2", "alcohol": "2",
    "frequency": FREQ_ALL, "meal_drinks": ["water"], "motivation": "8",
    "meals": {"breakfast": {"time": "08:30", "text": "Pão com fiambre", "qty": "2 fatias"}, "lunch": {"time": "", "text": ""}},
    "protein_portion": "120", "carb_portion": "150", "supplements": ["none"], "athlete": "no",
    "consent": True,
}


class ConsultFormsTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict("os.environ", CONFIG)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        appt = "/api/v2/admin/appointments"
        cat = self.admin.request(appt + "/catalog")["body"]
        service = next(s for s in cat["services"] if s["duration_minutes"] == 45)
        prof = self.admin.request(appt + "/professionals", "POST", {
            "name": "Juliana Teste", "email": "prof-form@test.invalid", "active": True,
            "presencial_enabled": True, "online_enabled": True, "service_ids": [service["id"]]})
        pid = prof["body"]["id"]
        day = (datetime.now(ZoneInfo("Europe/Lisbon")).date() + timedelta(days=3)).isoformat()
        self.admin.request(appt + "/availability", "POST",
                           {"professional_id": pid, "date": day, "start": "09:00", "end": "13:00"})
        r = self.admin.request(appt + "/bookings", "POST", {
            "professional_id": pid, "service_id": service["id"], "mode": "presencial", "date": day,
            "start": "10:00", "customer_name": "Marta Silva", "customer_email": "marta@example.pt"})
        self.booking = r["body"]["id"]
        ws = self.admin.request("/api/v2/admin/consultations")["body"]
        self.client_id = ws["upcoming"][0]["client_id"]
        self.public = fixtures.Client()

    def signed(self, **extra):
        query = {"shop": SHOP, "path_prefix": "/apps/the-mile-booking",
                 "timestamp": str(int(time.time())), "logged_in_customer_id": ""}
        query.update(extra)
        material = "".join(sorted(k + "=" + str(v) for k, v in query.items())).encode()
        query["signature"] = hmac.new(SECRET.encode(), material, hashlib.sha256).hexdigest()
        return urlencode(query)

    def link(self):
        r = self.admin.request(f"/api/v2/admin/consultations/clients/{self.client_id}/form", "POST", {})
        self.assertEqual(r["status"], 200, r)
        return r["body"]["form"]

    def call(self, sub, token, method="GET", body=None):
        return self.public.request(PROXY + sub + "?" + self.signed(t=token), method, body, csrf=False)

    def test_link_is_stable_and_public_page_needs_signature(self):
        form = self.link()
        self.assertEqual(form["status"], "pending")
        self.assertTrue(form["link"].startswith("https://themile.pt/apps/the-mile-booking/formulario?t="))
        self.assertEqual(self.link()["link"], form["link"])
        token = parse_qs(urlparse(form["link"]).query)["t"][0]
        unsigned = self.public.request(PROXY + "/dados?t=" + token, csrf=False)
        self.assertEqual(unsigned["status"], 403)
        page = self.public.request(PROXY + "?" + self.signed(t=token), csrf=False)
        self.assertEqual(page["status"], 200)
        self.assertIn(b"formulario.js", page["body"])
        self.assertEqual(page["headers"].get("X-Robots-Tag"), "noindex, nofollow")
        self.assertEqual(self.public.request(PROXY + ".js", csrf=False)["status"], 200)
        view = self.call("/dados", token)
        self.assertEqual(view["status"], 200, view)
        self.assertEqual(view["body"]["first_name"], "Marta")
        self.assertEqual(view["body"]["booking"]["professional"], "Juliana Teste")
        self.assertNotIn("email", str(view["body"]["booking"]))
        self.assertEqual(self.call("/dados", "x" * 43)["status"], 404)

    def test_save_submit_and_profile_fill(self):
        token = parse_qs(urlparse(self.link()["link"]).query)["t"][0]
        draft = self.call("/guardar", token, "POST", {"answers": {"for_whom": "self"}, "step": 1})
        self.assertEqual(draft["status"], 200, draft)
        self.assertIn("birth_date", draft["body"]["missing"])
        for bad in ({"height_cm": 400}, {"birth_date": "2099-01-01"}, {"sex": "X"}, {"nope": 1},
                    {"frequency": {"soup": "x5"}}, {"goals": ["x"]}, {"goals": "weight_loss"},
                    {"meals": {"lunch": {"time": "25:00"}}}):
            self.assertEqual(self.call("/guardar", token, "POST", {"answers": bad})["status"], 400, bad)
        early = self.call("/enviar", token, "POST", {"answers": {"for_whom": "self"}})
        self.assertEqual(early["status"], 400)
        sent = self.call("/enviar", token, "POST", {"answers": ANSWERS, "step": 7})
        self.assertEqual(sent["status"], 200, sent)
        detail = self.admin.request(f"/api/v2/admin/consultations/bookings/manual/{self.booking}")["body"]
        form = detail["form"]
        self.assertEqual(form["status"], "submitted")
        self.assertEqual(form["answers"]["height_cm"], 165)
        self.assertEqual([c["label"] for c in form["care"]], ["Alergias"])
        rows = {r.get("key"): r.get("value") for sec in form["sections"] for r in sec["rows"]}
        self.assertEqual(rows["goals"], "Emagrecimento · Outra: Dormir melhor")
        self.assertEqual(rows["supermarkets"], "Continente · Lidl")
        self.assertEqual(rows["frequency.soup"], "Às vezes (1–2 dias)")
        self.assertNotIn("supplements_info", rows)
        with_sup = dict(ANSWERS, supplements=["creatine", "other"], supplements_other="Magnésio",
                        supplements_info={"creatine": {"brand": "Marca X", "dose": "5 g", "when": "antes do treino"}})
        self.assertEqual(self.call("/enviar", token, "POST", {"answers": with_sup})["status"], 200)
        bad_sup = dict(with_sup, supplements_info={"none": {"brand": "x"}})
        self.assertEqual(self.call("/guardar", token, "POST", {"answers": bad_sup})["status"], 400)
        form2 = self.admin.request(f"/api/v2/admin/consultations/bookings/manual/{self.booking}")["body"]["form"]
        rows2 = {r.get("key"): (r.get("label"), r.get("value")) for sec in form2["sections"] for r in sec["rows"]}
        self.assertEqual(rows2["supplements_info.creatine"], ("Creatina", "Marca X · 5 g · antes do treino"))
        self.assertEqual(rows2["supplements_info.other"], ("Magnésio", "—"))
        # Frequências: têm de estar todas respondidas.
        partial = dict(ANSWERS, frequency={"soup": "never"})
        self.assertEqual(self.call("/enviar", token, "POST", {"answers": partial})["status"], 400)
        titles = [s["title"] for s in form["sections"]]
        self.assertIn("Saúde feminina", titles)
        self.assertNotIn("Hábitos em dia de jogo/competição", titles)
        meals = next(r for s in form["sections"] for r in s["rows"] if r["type"] == "meals")
        self.assertEqual([m["key"] for m in meals["items"]], ["breakfast"])
        profile = self.admin.request(f"/api/v2/admin/consult-clients/{self.client_id}")["body"]
        self.assertEqual((profile["birth_date"], profile["sex"], profile["height_cm"]), ("1996-03-02", "F", 165))
        self.assertIn("form_submitted", [e["action"] for e in profile["events"]])
        # Não substitui o que a equipa já registou.
        self.admin.request(f"/api/v2/admin/consult-clients/{self.client_id}", "PUT",
                           {"version": profile["version"], "height_cm": 170})
        again = dict(ANSWERS, height_cm=160)
        self.assertEqual(self.call("/enviar", token, "POST", {"answers": again})["status"], 200)
        profile = self.admin.request(f"/api/v2/admin/consult-clients/{self.client_id}")["body"]
        self.assertEqual(profile["height_cm"], 170)
        # Depois de enviado, não se pode retirar o consentimento.
        no_consent = dict(ANSWERS)
        no_consent.pop("consent")
        self.assertEqual(self.call("/guardar", token, "POST", {"answers": no_consent})["status"], 400)

    def test_expired_link(self):
        token = parse_qs(urlparse(self.link()["link"]).query)["t"][0]
        with app.connect() as c:
            c.execute("UPDATE consult_forms SET expires_at=1")
        self.assertEqual(self.call("/dados", token)["status"], 404)
        self.link()  # reabrir pelo backoffice renova o prazo
        self.assertEqual(self.call("/dados", token)["status"], 200)


if __name__ == "__main__":
    unittest.main()


class ConsultFormPortionPhotosTests(ConsultFormsTests):
    def test_portion_photos_need_valid_link(self):
        import base64
        with app.connect() as c:
            c.execute("INSERT INTO v2_visual_portion_images(sha256,data_base64) VALUES('abc',?)",
                      (base64.b64encode(b"RIFFfakewebp").decode(),))
            c.execute("""INSERT INTO v2_visual_portions(id,source_row,category,total_g,image_sha256,active,created_at,updated_at)
                VALUES('aaaaaaaaaaaaaaaaaaaaaaaa',1,'Carne / Peixe',120,'abc',1,1,1),
                      ('bbbbbbbbbbbbbbbbbbbbbbbb',2,'Massa',120,'abc',1,1,1)""")
        token = parse_qs(urlparse(self.link()["link"]).query)["t"][0]
        view = self.call("/dados", token)["body"]
        self.assertEqual(view["portions"]["protein_portion"], {"120": "aaaaaaaaaaaaaaaaaaaaaaaa"})
        ok = self.public.request(PROXY + "/porcao?" + self.signed(t=token, id="aaaaaaaaaaaaaaaaaaaaaaaa"), csrf=False)
        self.assertEqual((ok["status"], ok["headers"]["Content-Type"]), (200, "image/webp"))
        other = self.public.request(PROXY + "/porcao?" + self.signed(t=token, id="bbbbbbbbbbbbbbbbbbbbbbbb"), csrf=False)
        self.assertEqual(other["status"], 404)
        no_token = self.public.request(PROXY + "/porcao?" + self.signed(t="x" * 43, id="aaaaaaaaaaaaaaaaaaaaaaaa"), csrf=False)
        self.assertEqual(no_token["status"], 404)


class AnamnesisTests(ConsultFormsTests):
    def test_team_fills_and_edits_anamnesis(self):
        base = f"/api/v2/admin/consultations/clients/{self.client_id}/anamnesis"
        view = self.admin.request(base)
        self.assertEqual(view["status"], 200, view)
        self.assertIsNone(view["body"]["form"])
        self.assertTrue(view["body"]["steps"])
        saved = self.admin.request(base, "PUT", {"answers": {"sex": "M", "medication": "Ferro", "goals": ["health"]}})
        self.assertEqual(saved["status"], 200, saved)
        form = saved["body"]["form"]
        self.assertEqual(form["status"], "pending")
        self.assertEqual(sorted(form["team_fields"]), ["goals", "medication", "sex"])
        self.assertEqual([c["label"] for c in form["care"]], ["Medicação"])
        rows = [r for s in form["sections"] for r in s["rows"] if r["type"] == "text"]
        self.assertTrue(all(r.get("team") for r in rows))
        self.assertEqual(self.admin.request(base, "PUT", {"answers": {"sex": "X"}})["status"], 400)
        profile = self.admin.request(f"/api/v2/admin/consult-clients/{self.client_id}")["body"]
        self.assertEqual(profile["sex"], "M")
