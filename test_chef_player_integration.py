"""Chef access contract on the live player release branch.

Does not depend on the administrative user-management code. Both services
access the same users, athlete and Chef collaboration database tables.
"""
import unittest
from unittest.mock import patch
from datetime import date,timedelta
import test_app

app=test_app.app
Client=test_app.Client


class ChefPlayerReleaseTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        with app.connect() as c:
            import microcycles_v2
            self.a=microcycles_v2.create_athlete(c,"Jogador Chef A")["id"]
            self.b=microcycles_v2.create_athlete(c,"Jogador Chef B")["id"]
            c.execute("""INSERT INTO users
                (id,name,email,username,role,password,active)
                VALUES(?,?,?,?,?,?,1)""",(
                "chef-only-test","Chef Teste","chef-only@accounts.internal.invalid",
                "chefonline","chef",app.password_hash("chef-secret-pass-123")
            ))
            admin_id=c.execute("SELECT id FROM users WHERE role='admin' LIMIT 1").fetchone()["id"]
            c.execute("""INSERT INTO v2_chef_links
                (user_id,athlete_id,language,linked_at,created_by)
                VALUES(?,?,?,?,?)""",("chef-only-test",self.a,"en",1,admin_id))
        self.chef=Client()
        with patch.object(app,"SITE_ROLE","player"):
            response=self.chef.request("/api/login","POST",{
                "identifier":"chefonline","password":"chef-secret-pass-123"
            })
        self.assertEqual(response["status"],200,response)
        self.assertEqual(self.chef.request("/api/me")["body"]["user"]["role"],"chef")
        self.chef.request("/api/me")

    def test_role_scoping_is_enforced_in_player_service(self):
        with patch.object(app,"SITE_ROLE","player"):
            me=self.chef.request("/api/v2/chef/me")
            self.assertEqual(me["status"],200,me)
            self.assertEqual(me["body"]["player"]["id"],self.a)
            self.assertEqual(self.chef.request("/api/v2/player/me")["status"],403)
            self.assertEqual(self.chef.request("/api/documents")["status"],403)
            self.assertEqual(self.chef.request("/api/players")["status"],404)
            self.assertEqual(self.chef.request("/api/v2/athletes")["status"],404)
            self.assertEqual(self.chef.request("/chef")["status"],200)
            self.assertEqual(self.chef.request("/chef.js")["status"],200)
            self.assertEqual(self.chef.request("/api/v2/chef/preferences","PUT",{"language":"pt"},csrf=False)["status"],403)
            self.assertEqual(self.chef.request("/api/v2/chef/preferences","PUT",{"language":"pt"})["status"],200)
            self.assertEqual(self.chef.request("/api/v2/chef/me")["body"]["chef"]["language"],"pt")

    def test_menu_changes_and_executions_share_canonical_schedule(self):
        day=(date.today()+timedelta(days=5)).isoformat()
        with patch.object(app,"SITE_ROLE","player"):
            saved=self.chef.request("/api/v2/chef/menus","PUT",{
                "athlete_id":self.b,
                "menu_date":day,"meal":"lunch",
                "kind":"category","value":"Carne branca"})
            self.assertEqual(saved["status"],200,saved)
            own=self.chef.request("/api/v2/chef/menus?start="+day+"&end="+day)
            self.assertEqual(own["status"],200)
            self.assertEqual(own["body"]["menus"][0]["value"],"Carne branca")
            served=self.chef.request("/api/v2/chef/menu-executions","POST",{
                "menu_date":day,"meal":"lunch","state":"chef_off","note":"Folga"})
            self.assertEqual(served["status"],201,served)
            execs=self.chef.request("/api/v2/chef/menu-executions?start="+day+"&end="+day)
            self.assertEqual(execs["body"]["executions"][0]["state"],"chef_off")
            self.assertEqual(own["body"]["menus"][0]["value"],"Carne branca")
        with app.connect() as c:
            self.assertEqual(c.execute(
                "SELECT COUNT(*) AS n FROM v2_weekly_menus WHERE athlete_id=?",(self.b,)).fetchone()["n"],0)
            self.assertEqual(c.execute(
                "SELECT COUNT(*) AS n FROM v2_chef_menu_audit WHERE actor_id='chef-only-test'").fetchone()["n"],1)

    def test_nonapproved_suggestion_never_changes_player_menu(self):
        day=(date.today()+timedelta(days=4)).isoformat()
        with patch.object(app,"SITE_ROLE","player"):
            proposed=self.chef.request("/api/v2/chef/menu-proposals","POST",{
                "menu_date":day,"meal":"dinner","name":"Prato próprio do chef","note":"Teste"})
            self.assertEqual(proposed["status"],201,proposed)
            self.assertEqual(self.chef.request(
                "/api/v2/chef/menus?start="+day+"&end="+day)["body"]["menus"],[])
        with app.connect() as c:
            row=c.execute(
                "SELECT status FROM v2_chef_menu_audit WHERE action='dish_proposal'"
            ).fetchone()
            self.assertEqual(row["status"],"pending_validation")


    def test_chef_reads_the_same_published_quantities_as_linked_player(self):
        """Published Planos are shared for consultation, never client-selectable or editable by Chef."""
        import json
        def plan(aid, owner, grams):
            option={"foods":[{"id":"bread","grams":grams,
                              "display_quantity":"2 fatias de pão"}],
                    "notes":["Preparação conforme plano"]}
            return {"plan_type":"Plano amarelo","athlete_id":aid,
                    "player_id":owner,"meals":[
                        {"name":"Pequeno almoço / lanche","options":[option]},
                        {"name":"Almoço / jantar","options":[option]}]}
        with app.connect() as c:
            for uid, username, athlete in (
                    ("linked-player-a","chefplayera",self.a),
                    ("linked-player-b","chefplayerb",self.b)):
                c.execute("""INSERT INTO users
                    (id,name,email,username,role,password,active)
                    VALUES(?,?,?,?,?,?,1)""",
                    (uid,username,username+"@accounts.internal.invalid",username,
                     "player",app.password_hash("player-secret-pass-123")))
                c.execute("INSERT INTO v2_player_links (user_id,athlete_id,linked_at) VALUES(?,?,?)",
                          (uid,athlete,123456))
            c.execute("""INSERT INTO v2_food_library
                (id,display_name,variant,edible_fraction,kcal,protein_g,
                 carbs_g,fat_g,active) VALUES(?,?,?,?,?,?,?,?,?)""",
                ("bread","Pão","plain",1,250,10,50,2,1))
            for draft_id,aid,owner,grams,state in (
                    ("published-a",self.a,"linked-player-a",80,"published"),
                    ("draft-a",self.a,"linked-player-a",500,"draft"),
                    ("published-b",self.b,"linked-player-b",120,"published")):
                content=plan(aid,owner,grams)
                c.execute("""INSERT INTO v2_food_plan_editor_publications
                    (draft_id,athlete_id,plan_type,snapshot_json,published_at,state)
                    VALUES(?,?,?,?,?,?)""",
                    (draft_id,aid,"Plano amarelo",json.dumps(content),123456,state))
        player=Client()
        with patch.object(app,"SITE_ROLE","player"):
            login=player.request("/api/login","POST",
                {"identifier":"chefplayera","password":"player-secret-pass-123"})
            self.assertEqual(login["status"],200,login)
            player.request("/api/me")
            from_player=player.request("/api/v2/player/plans")
            from_chef=self.chef.request("/api/v2/chef/plans?athlete_id="+self.b)
            self.assertEqual(from_player["status"],200,from_player)
            self.assertEqual(from_chef["status"],200,from_chef)
            self.assertEqual(from_chef["body"]["options_by_color"],
                             from_player["body"]["options_by_color"])
            by_slot=from_chef["body"]["options_by_color"]["yellow"]
            for slot in ("breakfast","snack","lunch","dinner"):
                self.assertEqual(len(by_slot[slot]),1,slot)
                self.assertEqual(by_slot[slot][0]["items"][0]["quantity"],
                                 "2 fatias de pão")
                self.assertEqual(by_slot[slot][0]["totals"]["kcal"],200)
                self.assertEqual(by_slot[slot][0]["source_draft_id"],"published-a")
            self.assertEqual(self.chef.request("/api/v2/player/plans")["status"],403)
            self.assertEqual(self.chef.request("/api/v2/chef/plans","PUT",
                                               {"athlete_id":self.b})["status"],403)
        with app.connect() as c:
            self.assertEqual(c.execute(
                "SELECT state FROM v2_food_plan_editor_publications "
                "WHERE draft_id='published-a'").fetchone()["state"],"published")


if __name__=="__main__":
    unittest.main()
