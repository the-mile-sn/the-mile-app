"""Chef foundation regression tests: accounts, authorization, SQLite migration."""
import sqlite3
import unittest
from unittest.mock import patch
from datetime import date, timedelta

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

    def test_initial_language_is_account_scoped_and_does_not_replace_chef_choice(self):
        chef, chef_id=self._chef()
        path="/api/v2/admin/chefs/"+chef_id+"/initial-language"
        player_path="/api/v2/athletes/"+self.first+"/initial-language"
        self.assertEqual(self.admin.request(path)["body"]["language"],"en")
        self.assertEqual(self.admin.request(player_path,"PUT",{"language":"pt"})["status"],200)
        self.assertEqual(chef.request("/api/v2/chef/me")["body"]["chef"]["language"],"en")
        self.assertEqual(self.admin.request(path,"PUT",{"language":"pt"},csrf=False)["status"],403)
        self.assertEqual(chef.request(path,"PUT",{"language":"pt"})["status"],403)
        self.assertEqual(self.admin.request(path,"PUT",{"language":"es"})["status"],400)
        self.assertEqual(self.admin.request(path,"PUT",{"language":"pt"})["status"],200)
        self.assertEqual(chef.request("/api/v2/chef/me")["body"]["chef"]["language"],"pt")
        self.assertEqual(chef.request("/api/v2/chef/preferences","PUT",{"language":"en"})["status"],200)
        self.assertEqual(self.admin.request(path,"PUT",{"language":"pt"})["status"],200)
        self.assertEqual(self.admin.request(player_path)["body"]["language"],"pt")
        self.assertEqual(chef.request("/api/v2/chef/me")["body"]["chef"]["language"],"en")
        self.assertEqual(self.admin.request(player_path,"PUT",{"language":"en"})["status"],200)
        self.assertEqual(self.admin.request(path)["body"]["language"],"pt")
        account=next(x for x in self.admin.request("/api/v2/admin/chefs")["body"]["chefs"] if x["id"]==chef_id)
        self.assertEqual((account["initial_language"],account["language"]),("pt","en"))
        self.assertEqual(self.admin.request("/api/v2/admin/chefs/missing/initial-language")["status"],404)

    def test_archive_chef_is_reversible_and_does_not_grant_access_on_restore(self):
        chef, chef_id = self._chef()
        path = "/api/v2/admin/chefs/" + chef_id
        self.assertEqual(self.admin.request(path + "/archive", "POST", {})["status"], 400)
        self.assertEqual(chef.request(path + "/archive", "POST", {"confirmation": "ARQUIVAR"})["status"], 403)
        result = self.admin.request(path + "/archive", "POST", {"confirmation": "ARQUIVAR"})
        self.assertEqual(result["status"], 200, result)
        self.assertEqual(self.admin.request(path + "/archive", "POST", {"confirmation": "ARQUIVAR"})["status"], 409)
        listed = self.admin.request("/api/v2/admin/chefs")["body"]
        self.assertFalse(any(item["id"] == chef_id for item in listed["chefs"]))
        self.assertTrue(any(item["id"] == chef_id for item in listed["archived_chefs"]))
        self.assertEqual(chef.request("/api/v2/chef/me")["status"], 401)
        self.assertEqual(self.admin.request(path, "PUT", {"active": True})["status"], 404)
        with app.connect() as db:
            self.assertIsNotNone(db.execute(
                "SELECT archived_at FROM v2_chef_links WHERE user_id=?", (chef_id,)
            ).fetchone()["archived_at"])
        self.assertEqual(self.admin.request(path + "/restore", "POST", {})["status"], 200)
        self.assertEqual(self.admin.request(path + "/restore", "POST", {})["status"], 409)
        restored = self.admin.request("/api/v2/admin/chefs")["body"]
        account = next(item for item in restored["chefs"] if item["id"] == chef_id)
        self.assertEqual(account["active"], 0)
        self.assertFalse(any(item["id"] == chef_id for item in restored["archived_chefs"]))
        self.assertEqual(Client().request("/api/login", "POST", {
            "identifier": "chefteste", "password": "chef-password-123"
        })["status"], 401)

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

    def test_chef_is_denied_all_legacy_document_access(self):
        chef, _ = self._chef()
        self.assertEqual(chef.request("/api/documents")["status"], 403)
        self.assertEqual(chef.request("/api/notifications")["status"], 403)
        self.assertEqual(chef.request("/api/v2/player/plans")["status"], 403)
        self.assertEqual(chef.request("/api/v2/chef/preferences", "PUT", {"language": "en"})["status"], 200)
        self.assertEqual(chef.request("/api/v2/chef/preferences", "PUT", {"language": "es"})["status"], 400)
        self.assertEqual(chef.request("/api/v2/chef/me")["body"]["chef"]["language"], "en")

    def test_menu_edit_is_audited_and_cannot_change_another_player(self):
        chef, chef_id = self._chef()
        day=(date.today()+timedelta(days=5)).isoformat()
        # Admin schedules an initial approved category.
        prior=self.admin.request("/api/v2/athletes/"+self.first+"/menus","PUT",{
            "menu_date":day,"meal":"lunch","kind":"category","value":"Carne branca"})
        self.assertEqual(prior["status"],200,prior)
        with app.connect() as c:
            c.execute("""INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename,active)
                         VALUES(?,?,?,?,?,1)""",
                ("dish-1111","Carne branca","Frango grelhado","Grilled chicken","x.webp"))
        update=chef.request("/api/v2/chef/menus","PUT",{
            "athlete_id":self.second,"menu_date":day,"meal":"lunch",
            "kind":"dish","value":"Frango grelhado","dish_id":"dish-1111"})
        self.assertEqual(update["status"],200,update)
        self.assertTrue(update["body"]["menu"]["changed"])
        with app.connect() as c:
            own=c.execute("""SELECT value,dish_id FROM v2_weekly_menus
                WHERE athlete_id=? AND menu_date=? AND meal='lunch'""",(self.first,day)).fetchone()
            other=c.execute("""SELECT id FROM v2_weekly_menus
                WHERE athlete_id=?""",(self.second,)).fetchone() if False else c.execute(
                    "SELECT COUNT(*) AS count FROM v2_weekly_menus WHERE athlete_id=?",(self.second,)).fetchone()
            log=c.execute("""SELECT previous_value,new_value,status,actor_id
                FROM v2_chef_menu_audit WHERE athlete_id=? AND actor_id=?
                ORDER BY created_at DESC,id DESC""",(self.first,chef_id)).fetchone()
        self.assertEqual(own["value"],"Frango grelhado")
        self.assertEqual(other["count"],0)
        self.assertEqual(log["previous_value"],"Carne branca")
        self.assertEqual(log["new_value"],"Frango grelhado")
        self.assertEqual(log["status"],"pending_review")
        self.assertEqual(chef.request("/api/v2/chef/menus?start="+day+"&end="+day)["body"]["menus"][0]["value"],"Frango grelhado")
        self.assertEqual(chef.request("/api/v2/chef/menus","PUT",{
            "menu_date":day,"meal":"dinner","kind":"text","value":"Não aprovado"})["status"],400)

    def test_proposal_requires_admin_validation_and_keeps_planned_menu(self):
        chef,_=self._chef()
        day=(date.today()+timedelta(days=4)).isoformat()
        original=self.admin.request("/api/v2/athletes/"+self.first+"/menus","PUT",{
            "menu_date":day,"meal":"dinner","kind":"category","value":"Peixe magro"})
        self.assertEqual(original["status"],200)
        proposal=chef.request("/api/v2/chef/menu-proposals","POST",{
            "menu_date":day,"meal":"dinner","name":"Peixe especial do Chef","note":"Sugestão"})
        self.assertEqual(proposal["status"],201,proposal)
        before=chef.request("/api/v2/chef/menus?start="+day+"&end="+day)["body"]["menus"]
        self.assertEqual(before[0]["value"],"Peixe magro")
        log=self.admin.request("/api/v2/admin/chef-activity")["body"]["activity"]
        waiting=next(e for e in log if e["action"]=="dish_proposal")
        self.assertEqual(waiting["status"],"pending_validation")
        self.assertEqual(self.admin.request("/api/v2/admin/chef-reviews","POST",{
            "id":waiting["id"],"decision":"approved","dish_id":"missing"})["status"],400)
        with app.connect() as c:
            c.execute("""INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename,active)
                         VALUES(?,?,?,?,?,1)""",
                ("dish-2222","Peixe magro","Pescada no forno","Baked hake","y.webp"))
        approved=self.admin.request("/api/v2/admin/chef-reviews","POST",{
            "id":waiting["id"],"decision":"approved","dish_id":"dish-2222"})
        self.assertEqual(approved["status"],200,approved)
        after=chef.request("/api/v2/chef/menus?start="+day+"&end="+day)["body"]["menus"]
        self.assertEqual(after[0]["value"],"Pescada no forno")
        self.assertEqual(self.admin.request("/api/v2/admin/chef-reviews","POST",{
            "id":waiting["id"],"decision":"approved","dish_id":"dish-2222"})["status"],400)

    def test_execution_preserves_planning_and_is_not_consumption(self):
        chef,_=self._chef()
        day=(date.today()+timedelta(days=3)).isoformat()
        self.admin.request("/api/v2/athletes/"+self.first+"/menus","PUT",{
            "menu_date":day,"meal":"lunch","kind":"category","value":"Carne branca"})
        self.assertEqual(chef.request("/api/v2/chef/menu-executions","POST",{
            "menu_date":day,"meal":"lunch","state":"served_changed",
            "served_description":"","note":""})["status"],400)
        result=chef.request("/api/v2/chef/menu-executions","POST",{
            "menu_date":day,"meal":"lunch","state":"served_changed",
            "served_description":"Peixe com batata","note":"Alteração ao almoço"})
        self.assertEqual(result["status"],201,result)
        now=chef.request("/api/v2/chef/menu-executions?start="+day+"&end="+day)
        self.assertEqual(now["status"],200)
        self.assertEqual(now["body"]["executions"][0]["state"],"served_changed")
        self.assertEqual(now["body"]["executions"][0]["planned_value"],"Carne branca")
        planned=chef.request("/api/v2/chef/menus?start="+day+"&end="+day)["body"]["menus"]
        self.assertEqual(planned[0]["value"],"Carne branca")
        # A later 'chef off' report retains the scheduled meal.
        self.assertEqual(chef.request("/api/v2/chef/menu-executions","POST",{
            "menu_date":day,"meal":"lunch","state":"chef_off","note":"Folga"})["status"],201)
        self.assertEqual(chef.request("/api/v2/chef/menus?start="+day+"&end="+day)["body"]["menus"][0]["value"],"Carne branca")
        history=self.admin.request("/api/v2/admin/chef-activity")["body"]["activity"]
        self.assertEqual(len([x for x in history if x["event_type"]=="execution"]),2)

    def test_admin_audit_review_and_chef_password_reset(self):
        chef,chef_id=self._chef()
        day=(date.today()+timedelta(days=6)).isoformat()
        self.assertEqual(self.admin.request("/api/v2/athletes/"+self.first+"/menus","PUT",{
            "menu_date":day,"meal":"dinner","kind":"category","value":"Peixe magro"})["status"],200)
        with app.connect() as c:
            event=c.execute("""SELECT actor_id,status FROM v2_chef_menu_audit
                WHERE athlete_id=? AND menu_date=? AND meal='dinner'""",
                (self.first,day)).fetchone()
            self.assertEqual(event["status"],"recorded")
        self.assertEqual(self.admin.request("/api/v2/admin/chefs/"+chef_id+"/password-reset","POST",{
            "password":"new-chef-password-123"})["status"],200)
        self.assertEqual(chef.request("/api/v2/chef/me")["status"],401)
        signed=Client()
        self.assertEqual(signed.request("/api/login","POST",{
            "identifier":"chefteste","password":"new-chef-password-123"})["status"],200)
        signed.request("/api/me")
        self.assertEqual(signed.request("/api/v2/chef/me")["status"],200)

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
            self.assertEqual(chef.request("/api/v2/admin/chefs")["status"], 403)
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
