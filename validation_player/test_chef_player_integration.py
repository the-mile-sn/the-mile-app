"""Chef access contract on the live player release branch.

Does not depend on the administrative user-management code. Both services
access the same users, athlete and Chef collaboration database tables.
"""
import re
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

    def test_dish_photo_matches_player_matte_removal_without_mutating_original(self):
        """Chef sees the Player Menus cutout, with original storage and access intact."""
        import io
        from PIL import Image

        opaque=Image.new("RGB",(24,24),(9,9,11))
        for x in range(5,19):
            for y in range(5,19):
                opaque.putpixel((x,y),(240,100,75))
        raw=io.BytesIO()
        opaque.save(raw,format="WEBP",lossless=True)
        source=raw.getvalue()

        with app.connect() as c:
            c.execute("""INSERT INTO v2_dish_library
                (id,category,name_pt,name_en,image_filename,active)
                VALUES('mattephoto01','Carne branca','Prato teste','','mattephoto01.webp',1)""")
            c.execute("""INSERT INTO v2_weekly_menus
                (athlete_id,menu_date,meal,kind,value,dish_id)
                VALUES(?,'2026-11-20','lunch','dish','Prato teste','mattephoto01')""",(self.a,))
            app.store_dish_image(c,"mattephoto01.webp",source)

        with patch.object(app,"SITE_ROLE","player"):
            photo=self.chef.request("/api/v2/chef/dish-photo/mattephoto01")
            self.assertEqual(photo["status"],200,photo)
            self.assertEqual(photo["headers"]["Content-Type"],"image/webp")
            self.assertEqual(photo["body"],app.player_menu_photo(source))
            self.assertEqual(self.chef.request("/api/v2/chef/dish-photo/notassigned01")["status"],404)
            self.assertEqual(Client().request("/api/v2/chef/dish-photo/mattephoto01")["status"],401)

        with Image.open(io.BytesIO(photo["body"])) as processed:
            rgba=processed.convert("RGBA")
            self.assertEqual(rgba.getpixel((0,0))[3],0)
            self.assertEqual(rgba.getpixel((12,12))[3],255)
        with app.connect() as c:
            self.assertEqual(app.read_dish_image(c,"mattephoto01.webp"),source)

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

    def test_chef_language_is_independent_of_linked_player_and_initial_default(self):
        with app.connect() as c:
            c.execute("""INSERT INTO users(id,name,email,username,role,password,active)
                VALUES(?,?,?,?,?,?,1)""",("linked-player-test","Player","linked-player@test.invalid",
                "linkedplayer","player",app.password_hash("player-secret-pass-123")))
            c.execute("INSERT INTO v2_player_links(athlete_id,user_id,linked_at) VALUES(?,?,?)",
                      (self.a,"linked-player-test",1))
            import player_language_v2
            player_language_v2.set_language(c,"linked-player-test","pt")
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.chef.request("/api/v2/chef/me")["body"]["chef"]["language"],"en")
            self.assertEqual(self.chef.request("/api/v2/chef/preferences","PUT",{"language":"pt"})["status"],200)
            with app.connect() as c:
                c.execute("UPDATE v2_chef_links SET language='en' WHERE user_id='chef-only-test'")
                player_language_v2.set_language(c,"linked-player-test","en")
            self.assertEqual(self.chef.request("/api/v2/chef/me")["body"]["chef"]["language"],"pt")
            self.assertEqual(self.chef.request("/api/v2/chef/preferences","PUT",{"language":"en"})["status"],200)
        with app.connect() as c:
            self.assertEqual(player_language_v2.get(c,"linked-player-test"),"en")
            self.assertEqual(c.execute("SELECT language FROM v2_chef_links WHERE user_id='chef-only-test'").fetchone()["language"],"en")

    def test_chat_routes_are_off_until_migration_and_feature_gate(self):
        """No chat API leaks or creates schema in default deployed configuration."""
        import os
        with patch.dict(os.environ,{"MILE_CHAT_API_ENABLED":"0"}):
            with patch.object(app,"SITE_ROLE","player"):
                self.assertEqual(self.chef.request("/api/v2/chef/chat")["status"],404)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages","POST",
                    {"body":"Olá","client_key":"disabled"})["status"],404)
                self.assertEqual(Client().request("/api/v2/chef/chat")["status"],401)
        with app.connect() as c:
            row=c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='v2_chat_messages'").fetchone()
            self.assertIsNone(row)

    def test_chat_http_flow_with_opt_in_disposable_test_schema(self):
        """Real WSGI request tests, no Render schema or credentials."""
        import os
        import chat_messaging_v2 as domain
        with app.connect() as c:
            domain.initialize(c)
            domain.initialize_privacy_acknowledgements(c)
        with patch.dict(os.environ,{"MILE_CHAT_API_ENABLED":"1"}):
            with patch.object(app,"SITE_ROLE","player"):
                empty=self.chef.request("/api/v2/chef/chat")
                self.assertEqual(empty["status"],200,empty)
                self.assertIsNone(empty["body"]["conversation"])
                self.assertFalse(empty["body"]["privacy_notice"]["acknowledged"])
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages")["status"],403)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages","POST",
                    {"body":"Mensagem","client_key":"before-ack"})["status"],403)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/privacy-ack","POST",
                    {"version":domain.CHEF_PRIVACY_NOTICE_VERSION},csrf=False)["status"],403)
                ack=self.chef.request("/api/v2/chef/chat/privacy-ack","POST",
                    {"version":domain.CHEF_PRIVACY_NOTICE_VERSION})
                self.assertEqual(ack["status"],200,ack)
                self.assertTrue(ack["body"]["privacy_notice"]["acknowledged"])
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages")["body"]["messages"],[])
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages","POST",
                    {"body":"Mensagem","client_key":"csrf-a"},csrf=False)["status"],403)
                first=self.chef.request("/api/v2/chef/chat/messages","POST",
                    {"body":"Olá, The Mile","client_key":"chef-test-msg"})
                self.assertEqual(first["status"],201,first)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages","POST",
                    {"body":"Outra","client_key":"chef-test-msg"})["status"],200)
                self.assertEqual(len(self.chef.request("/api/v2/chef/chat/messages")["body"]["messages"]),1)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/read","POST",
                    {"message_id":"wrong"})["status"],400)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/read","POST",
                    {"message_id":first["body"]["message"]["id"]})["status"],200)
                self.assertEqual(self.chef.request("/api/v2/chef/chat/messages?limit=101")["status"],400)
                self.assertEqual(Client().request("/api/v2/chef/chat")["status"],401)

    def test_chef_chat_prototype_assets_are_reachable_and_role_scoped(self):
        """The shipped Chef HTML must never reference a CSS/JS asset that returns 404.

        Regression for 21/11: the prototype files existed but were omitted from
        app.py's explicit static registry, causing a full-width unstyled button
        and a click that never opened the dialog.
        """
        with patch.object(app,"SITE_ROLE","player"):
            html=self.chef.request("/chef")
            self.assertEqual(html["status"],200)
            page=html["body"].decode("utf-8")
            for stem,expected_mime,marker in (
                ("/chef-chat-demo.css","text/css",b".chef-chat-trigger"),
                ("/chef-chat-demo.js","javascript",b"dialog.showModal()"),
            ):
                # Read the exact version shipped in the HTML: a CSS/JS cache
                # bump must never break the HTTP route regression check.
                references=re.findall(re.escape(stem)+r"\?v=\d+",page)
                self.assertEqual(len(references),1,(stem,references))
                path=references[0]
                result=self.chef.request(path)
                self.assertEqual(result["status"],200,(path,result["status"]))
                self.assertIn(expected_mime,result["headers"]["Content-Type"])
                self.assertIn(marker,result["body"])
        with patch.object(app,"SITE_ROLE","admin"):
            self.assertEqual(self.chef.request("/chef-chat-demo.css")["status"],404)
            self.assertEqual(self.chef.request("/chef-chat-demo.js")["status"],404)

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
