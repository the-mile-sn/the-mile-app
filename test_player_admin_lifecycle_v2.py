"""Admin player lifecycle: credentials and reversible archiving."""
import unittest
import test_app
Client=test_app.Client
app=test_app.app

class PlayerLifecycleTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
    def create_player(self,name="Jogador Teste",username="jogadornovo"):
        response=self.admin.request("/api/v2/athletes","POST",{
            "name":name,"username":username,"password":"initial-player-pass-123","sex":"M","weight_kg":75
        })
        self.assertEqual(response["status"],201,response)
        return response["body"]["athlete"]["id"]

    def test_password_reset_revokes_sessions_and_checks_scope(self):
        aid=self.create_player()
        session=Client()
        self.assertEqual(session.request("/api/login","POST",{"identifier":"jogadornovo","password":"initial-player-pass-123"})["status"],200)
        session.request("/api/me")
        path="/api/v2/athletes/"+aid+"/password-reset"
        self.assertEqual(session.request(path,"POST",{"password":"new-player-password-123"})["status"],403)
        self.assertEqual(self.admin.request(path,"POST",{"password":"short"})["status"],400)
        self.assertEqual(self.admin.request(path,"POST",{"password":"new-player-password-123"})["status"],200)
        self.assertEqual(session.request("/api/documents")["status"],401)
        self.assertEqual(Client().request("/api/login","POST",{"identifier":"jogadornovo","password":"initial-player-pass-123"})["status"],401)
        self.assertEqual(Client().request("/api/login","POST",{"identifier":"jogadornovo","password":"new-player-password-123"})["status"],200)

    def test_initial_language_is_admin_only_and_never_overwrites_player_choice(self):
        aid=self.create_player()
        profile='/api/v2/athletes/'+aid+'/profile'
        route='/api/v2/athletes/'+aid+'/initial-language'
        self.assertEqual(self.admin.request(profile)['body']['details']['initial_language'],'pt')
        self.assertEqual(self.admin.request(route)['body']['language'],'pt')
        self.assertEqual(self.admin.request(route,'PUT',{'language':'en'})['status'],200)
        self.assertEqual(self.admin.request(profile)['body']['details']['initial_language'],'en')
        self.assertEqual(self.admin.request(route,'PUT',{'language':'EN'})['status'],400)
        self.assertEqual(self.admin.request(route,'PUT',{'language':'es'})['status'],400)
        self.assertEqual(self.admin.request(route,'PUT',{'language':'pt'},csrf=False)['status'],403)
        self.assertEqual(self.admin.request(route)['body']['language'],'en')
        with app.connect() as c:
            uid=c.execute('SELECT user_id FROM v2_player_links WHERE athlete_id=?',(aid,)).fetchone()['user_id']
            # Emulate a prior explicit player preference created by the player app.
            c.execute("""CREATE TABLE IF NOT EXISTS v2_player_language_preferences(
                user_id TEXT PRIMARY KEY,language TEXT NOT NULL)""")
            c.execute('INSERT INTO v2_player_language_preferences VALUES(?,?)',(uid,'en'))
            c.commit()
        self.assertEqual(self.admin.request(route,'PUT',{'language':'pt'})['status'],200)
        # Admin changes only the initial default, not the player's selected value.
        with app.connect() as c:
            self.assertEqual(c.execute(
                'SELECT language FROM v2_player_language_preferences WHERE user_id=?',(uid,)
            ).fetchone()['language'],'en')
        self.assertEqual(self.admin.request(route)['body']['language'],'pt')
        player=Client()
        self.assertEqual(player.request('/api/login','POST',{
            'identifier':'jogadornovo','password':'initial-player-pass-123'
        })['status'],200)
        player.request('/api/me')
        self.assertEqual(player.request(route,'PUT',{'language':'en'})['status'],403)
        self.assertEqual(player.request(route)['status'],403)
        self.assertEqual(Client().request(route)['status'],401)

    def test_archive_preserves_history_and_explicit_restore_does_not_reactivate(self):
        aid=self.create_player()
        with app.connect() as c:
            link=c.execute("SELECT user_id FROM v2_player_links WHERE athlete_id=?",(aid,)).fetchone()
            uid=link["user_id"]
        original=Client()
        self.assertEqual(original.request("/api/login","POST",{"identifier":"jogadornovo","password":"initial-player-pass-123"})["status"],200)
        original.request("/api/me")
        route="/api/v2/athletes/"+aid+"/archive"
        self.assertEqual(self.admin.request(route,"POST",{"confirmation":"no"})["status"],400)
        self.assertEqual(self.admin.request(route,"POST",{"confirmation":"ARQUIVAR"})["status"],200)
        self.assertEqual(original.request("/api/documents")["status"],401)
        self.assertFalse(any(x["id"]==aid for x in self.admin.request("/api/v2/admin/players-overview")["body"]["players"]))
        self.assertFalse(any(x["id"]==aid for x in self.admin.request("/api/v2/athletes")["body"]["athletes"]))
        archived=self.admin.request("/api/v2/admin/archived-players")["body"]["players"]
        self.assertTrue(any(x["id"]==aid for x in archived))
        self.assertEqual(self.admin.request("/api/v2/athletes/"+aid+"/restore","POST",{})["status"],200)
        with app.connect() as c:
            self.assertEqual(c.execute("SELECT active FROM users WHERE id=?",(uid,)).fetchone()["active"],0)
            self.assertIsNone(c.execute("SELECT archived_at FROM v2_athletes WHERE id=?",(aid,)).fetchone()["archived_at"])
        self.assertTrue(any(x["id"]==aid for x in self.admin.request("/api/v2/admin/players-overview")["body"]["players"]))
        self.assertEqual(Client().request("/api/login","POST",{"identifier":"jogadornovo","password":"initial-player-pass-123"})["status"],401)

if __name__=="__main__":unittest.main()
