"""Private administrator photo: self-only reads/writes and safe image handling."""
import base64
import io
import unittest
from unittest.mock import patch

from PIL import Image

import test_app as fixtures
import app


def sample_photo(color=(53, 91, 166), mime="image/jpeg"):
    picture = Image.new("RGB", (46, 40), color)
    raw = io.BytesIO()
    if mime == "image/jpeg":
        exif = Image.Exif()
        exif[0x010E] = "PRIVATE_CAMERA_DESCRIPTION"
        picture.save(raw, format="JPEG", exif=exif)
    else:
        picture.save(raw, format="PNG")
    return "data:" + mime + ";base64," + base64.b64encode(raw.getvalue()).decode()


class AdminPrivatePhotoTest(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin

    def second_admin(self):
        with app.connect() as c:
            uid = c.execute(
                "SELECT id FROM users WHERE email=?", ("raquelgomes@themile.pt",)
            ).fetchone()["id"]
            link = app.activation(c, uid)
        client = fixtures.Client()
        self.assertEqual(client.activate(link)["status"], 200)
        return client

    def player(self):
        created = self.admin.request(
            "/api/v2/athletes", "POST",
            {"name": "Jogador Imagem", "username": "jogadorimagem",
             "password": "player-password-123", "sex": "M", "weight_kg": 76}
        )
        self.assertEqual(created["status"], 201, created)
        player = fixtures.Client()
        login = player.request(
            "/api/login", "POST",
            {"identifier": "jogadorimagem", "password": "player-password-123"}
        )
        self.assertEqual(login["status"], 200, login)
        player.request("/api/me")
        return player

    def test_upload_read_replace_and_remove_own_photo(self):
        endpoint = "/api/admin/me/photo"
        self.assertFalse(self.admin.request("/api/me")["body"]["user"]["has_photo"])
        self.assertEqual(self.admin.request(endpoint)["status"], 404)
        first = self.admin.request(
            endpoint, "PUT", {"photo": sample_photo()}
        )
        self.assertEqual(first["status"], 200, first)
        self.assertTrue(first["body"]["has_photo"])
        photo = self.admin.request(endpoint)
        self.assertEqual(photo["status"], 200, photo)
        self.assertEqual(photo["headers"]["Content-Type"], "image/webp")
        self.assertEqual(photo["headers"]["Cache-Control"], "no-store")
        self.assertEqual(photo["body"][:4], b"RIFF")
        self.assertEqual(photo["body"][8:12], b"WEBP")
        self.assertNotIn(b"PRIVATE_CAMERA_DESCRIPTION", photo["body"])
        self.assertTrue(self.admin.request("/api/me")["body"]["user"]["has_photo"])
        new = self.admin.request(
            endpoint, "PUT", {"photo": sample_photo((12, 203, 100), "image/png")}
        )
        self.assertEqual(new["status"], 200, new)
        self.assertNotEqual(self.admin.request(endpoint)["body"], photo["body"])
        removed = self.admin.request(endpoint, "DELETE")
        self.assertEqual(removed["status"], 200, removed)
        self.assertFalse(removed["body"]["has_photo"])
        self.assertFalse(self.admin.request("/api/me")["body"]["user"]["has_photo"])
        self.assertEqual(self.admin.request(endpoint)["status"], 404)

    def test_cannot_read_or_modify_another_admin_photo(self):
        endpoint = "/api/admin/me/photo"
        self.assertEqual(
            self.admin.request(endpoint, "PUT", {"photo": sample_photo()})["status"], 200
        )
        original = self.admin.request(endpoint)["body"]
        other = self.second_admin()
        self.assertEqual(other.request(endpoint)["status"], 404)
        self.assertFalse(other.request("/api/me")["body"]["user"]["has_photo"])
        self.assertEqual(
            other.request(endpoint, "PUT", {"photo": sample_photo((190, 40, 20))})["status"],
            200
        )
        self.assertNotEqual(other.request(endpoint)["body"], original)
        self.assertEqual(self.admin.request(endpoint)["body"], original)
        self.assertEqual(other.request(endpoint, "DELETE")["status"], 200)
        self.assertEqual(self.admin.request(endpoint)["body"], original)
        admins = self.admin.request("/api/admins")
        self.assertEqual(admins["status"], 200)
        for row in admins["body"]["admins"]:
            self.assertNotIn("photo", row)
            self.assertNotIn("photo_mime", row)

    def test_anonymous_and_player_access_are_denied(self):
        endpoint = "/api/admin/me/photo"
        anonymous = fixtures.Client()
        self.assertEqual(anonymous.request(endpoint)["status"], 401)
        self.assertEqual(
            anonymous.request(endpoint, "PUT", {"photo": sample_photo()})["status"], 401
        )
        self.assertEqual(anonymous.request(endpoint, "DELETE")["status"], 401)
        player = self.player()
        self.assertEqual(player.request(endpoint)["status"], 403)
        self.assertEqual(
            player.request(endpoint, "PUT", {"photo": sample_photo()})["status"], 403
        )
        self.assertEqual(player.request(endpoint, "DELETE")["status"], 403)
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.admin.request(endpoint)["status"], 401)

    def test_csrf_and_invalid_upload_does_not_overwrite_photo(self):
        endpoint = "/api/admin/me/photo"
        original = sample_photo()
        self.assertEqual(
            self.admin.request(endpoint, "PUT", {"photo": original})["status"], 200
        )
        stored = self.admin.request(endpoint)["body"]
        self.assertEqual(
            self.admin.request(endpoint, "PUT", {"photo": original}, csrf=False)["status"],
            403
        )
        png = sample_photo((0, 123, 200), "image/png")
        invalid = (
            "data:image/jpeg;base64," + png.split(",", 1)[1],
            "data:image/png;base64,ZXJyb3I=",
            "data:image/gif;base64,ZXJyb3I=",
            "",
        )
        for value in invalid:
            with self.subTest(value=value[:34]):
                response = self.admin.request(endpoint, "PUT", {"photo": value})
                self.assertEqual(response["status"], 400, response)
                self.assertEqual(self.admin.request(endpoint)["body"], stored)

    def test_no_schema_change_and_no_player_photo_mutation(self):
        before = self.admin.request("/api/me")["body"]["user"]["id"]
        self.assertEqual(
            self.admin.request(
                "/api/admin/me/photo", "PUT", {"photo": sample_photo()}
            )["status"], 200
        )
        with app.connect() as c:
            own = c.execute(
                "SELECT role,photo,photo_mime FROM users WHERE id=?", (before,)
            ).fetchone()
            self.assertEqual(own["role"], "admin")
            self.assertEqual(own["photo_mime"], "image/webp")
            self.assertIsNotNone(own["photo"])
            self.assertEqual(
                c.execute("SELECT COUNT(*) FROM users WHERE role='player' AND photo IS NOT NULL").fetchone()[0], 0
            )


if __name__ == "__main__":
    unittest.main()
