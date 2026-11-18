"""Chef foundation regression tests: accounts, authorization, SQLite migration."""
import sqlite3
import unittest
from unittest.mock import patch

import chef_accounts_v2
import test_app

Client = test_app.Client
app = test_app.app


class ChefAccountApiTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.first = self._player("Jogador A", "jogadora")
        self.second = self._player("Jogador B", "jogadorb")

    def _player(self, name, username):
        response = self.admin.request("/api/v2/athletes", "POST", {
            "name": name, "username": username,
            "password": "player-password-123", "sex": "M", "weight_kg": 75
        })
        self.assertEqual(response["status"], 201, response)
        return response["body"]["athlete"]["id"]

    def _chef(self, username="chefteste", athlete_id=None):
        response = self.admin.request("/api/v2/admin/chefs", "POST", {
            "name": "Chef Teste", "username": username, "password": "chef-password-123",
            "athlete_id": athlete_id or self.first, "language": "en"
        })
        self.assertEqual(response["status"], 201, response)
        chef = Client()
        self.assertEqual(chef.request("/api/login", "POST", {
            "identifier": username, "password": "chef-password-123"
        })["status"], 200)
        self.assertEqual(chef.request("/api/me")["body"]["user"]["role"], "chef")
        return chef, response["body"]["chef"]["id"]

    def test_creation_uses_same_users_and_sessions_but_separate_links(self):
        chef, chef_id = self._chef()
        with app.connect() as c:
            user = c.execute("SELECT role FROM users WHERE id=?", (chef_id,)).fetchone()
            self.assertEqual(user["role"], "chef")
            self.assertIsNone(c.execute(
                "SELECT 1 FROM v2_player_links WHERE user_id=?", (chef_id,)
            ).fetchone())
            self.assertEqual(c.execute(
                "SELECT athlete_id,language FROM v2_chef_links WHERE user_id=?", (chef_id,)
            ).fetchone()["athlete_id"], self.first)
        result = chef.request("/api/v2/chef/me")
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["body"]["player"]["id"], self.first)
        self.assertEqual(result["body"]["chef"]["language"], "en")

    def test_cross_player_and_admin_boundaries(self):
        chef, _ = self._chef()
        self.assertEqual(chef.request("/api/v2/chef/menus?start=2026-11-16&end=2026-11-22")["status"], 200)
        self.assertEqual(chef.request("/api/v2/chef/plans")["status"], 200)
        self.assertEqual(chef.request("/api/v2/athletes")["status"], 403)
        self.assertEqual(chef.request("/api/v2/player/me")["status"], 403)
        self.assertEqual(chef.request("/api/v2/admin/chefs")["status"], 403)
        self.assertEqual(chef.request("/api/players")["status"], 403)
        self.assertEqual(chef.request("/api/v2/chef/menus?start=not-date&end=2026-11-22")["status"], 400)
        # A client-supplied athlete_id cannot override the session association.
        response = chef.request(
            "/api/v2/chef/menus?start=2026-11-16&end=2026-11-22&athlete_id=" + self.second
        )
        self.assertEqual(response["status"], 200)
        self.assertEqual(response["body"]["menus"], [])

    def test_admin_and_player_cannot_use_chef_api(self):
        self.assertEqual(self.admin.request("/api/v2/chef/me")["status"], 403)
        player = Client()
        self.assertEqual(player.request("/api/login", "POST", {
            "identifier": "jogadora", "password": "player-password-123"
        })["status"], 200)
        player.request("/api/me")
        self.assertEqual(player.request("/api/v2/chef/me")["status"], 403)

    def test_validation_and_duplicate_credentials(self):
        self._chef()
        invalid = self.admin.request("/api/v2/admin/chefs", "POST", {
            "name": "C", "username": "chefteste", "password": "short",
            "athlete_id": self.second, "language": "es"
        })
        self.assertEqual(invalid["status"], 400)
        duplicate = self.admin.request("/api/v2/admin/chefs", "POST", {
            "name": "Outro Chef", "username": "chefteste", "password": "chef-password-123",
            "athlete_id": self.second, "language": "pt"
        })
        self.assertEqual(duplicate["status"], 409)
        self.assertEqual(len(self.admin.request("/api/v2/admin/chefs")["body"]["chefs"]), 1)

    def test_deactivation_revokes_session_and_archived_athlete_is_not_visible(self):
        chef, chef_id = self._chef()
        result = self.admin.request("/api/v2/admin/chefs/" + chef_id, "PUT", {"active": False})
        self.assertEqual(result["status"], 200)
        self.assertEqual(chef.request("/api/v2/chef/me")["status"], 401)
        self.assertEqual(Client().request("/api/login", "POST", {
            "identifier": "chefteste", "password": "chef-password-123"
        })["status"], 401)
        # Archiving must also block any currently active chef without modifying its record.
        second, _ = self._chef("chefsegundo")
        self.assertEqual(self.admin.request(
            "/api/v2/athletes/" + self.first + "/archive", "POST", {"confirmation": "ARQUIVAR"}
        )["status"], 200)
        self.assertEqual(second.request("/api/v2/chef/me")["status"], 403)

    def test_player_site_accepts_chef_but_admin_site_denies_it(self):
        chef, _ = self._chef()
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(chef.request("/api/v2/chef/me")["status"], 200)
            self.assertEqual(chef.request("/api/v2/admin/chefs")["status"], 404)
        with patch.object(app, "SITE_ROLE", "admin"):
            self.assertEqual(chef.request("/api/v2/chef/me")["status"], 404)


class SQLiteRoleMigrationTests(unittest.TestCase):
    def test_upgrade_preserves_player_sessions_and_existing_indices(self):
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        c.executescript("""
            CREATE TABLE users(
                id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin','player')), password TEXT
            );
            CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id));
            CREATE TABLE v2_player_links(user_id TEXT PRIMARY KEY REFERENCES users(id), athlete_id TEXT UNIQUE);
            CREATE INDEX users_name_test ON users(name);
            INSERT INTO users(id,name,email,role) VALUES('u','Jogador','p@x','player');
            INSERT INTO sessions VALUES('session','u');
            INSERT INTO v2_player_links VALUES('u','athlete');
        """)
        try:
            chef_accounts_v2.enable_role(c)
            chef_accounts_v2.enable_role(c)  # idempotent
            self.assertEqual(c.execute("SELECT count(*) FROM sessions").fetchone()[0], 1)
            self.assertEqual(c.execute("SELECT count(*) FROM v2_player_links").fetchone()[0], 1)
            self.assertTrue(c.execute(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name='users_name_test'"
            ).fetchone())
            c.execute("INSERT INTO users(id,name,email,role) VALUES('chef','Chef','c@x','chef')")
            self.assertEqual(c.execute("PRAGMA foreign_key_check").fetchall(), [])
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO users(id,name,email,role) VALUES('no','No','n@x','unknown')")
        finally:
            c.close()


if __name__ == "__main__":
    unittest.main()
