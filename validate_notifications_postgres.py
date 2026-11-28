"""Disposable PostgreSQL notification integration check; synthetic records only."""
import base64
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
import unittest

import psycopg
from psycopg.rows import dict_row
import content_translations_v2 as translations
import notification_activation_v2 as activation
import notification_store_v2 as store
import notification_capture_v2 as capture
import notification_admin_preview_v2 as admin
import notification_manual_v2 as manual
import notification_dispatch_v2 as dispatch
import notification_inbox_v2 as inbox
from notification_templates_v2 import TEMPLATES
import chef_collaboration_v2 as chef

class Connection:
    """Match the application's qmark-to-PostgreSQL adapter."""
    def __init__(self, conn):
        self.conn=conn
    def execute(self, sql, params=()):
        return self.conn.execute(sql.replace("?", "%s"), params if params else None)
    def commit(self):
        self.conn.commit()

def connect():
    if os.environ.get("DATABASE_URL"):
        raise RuntimeError("Production database configuration forbidden")
    socket=Path(os.environ["MILE_VALIDATION_SOCKET"]).resolve()
    if not str(socket).startswith("/tmp/mile-notify-pg-") or socket.name!="socket":
        raise RuntimeError("Only disposable local Unix socket allowed")
    return Connection(psycopg.connect(host=str(socket),dbname="mile_notification_validation",
                                      user="postgres",row_factory=dict_row))

class PostgreSQLTests(unittest.TestCase):
    def setUp(self):
        self.c=connect()
        # A new isolated schema per test; no shared schema or production database.
        import secrets
        self.schema="validation_"+secrets.token_hex(8)
        self.c.execute("CREATE SCHEMA "+self.schema)
        self.c.execute("SET search_path TO "+self.schema)
        self.c.execute("""
            CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER,
                menus_enabled INTEGER DEFAULT 1,anthropometry_enabled INTEGER DEFAULT 0,birth_date TEXT);
            CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires BIGINT);
            CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,archived_at BIGINT);
            CREATE TABLE v2_player_links(user_id TEXT PRIMARY KEY,athlete_id TEXT);
            CREATE TABLE v2_chef_links(user_id TEXT PRIMARY KEY,athlete_id TEXT,archived_at BIGINT,language TEXT);
            CREATE TABLE v2_player_language_preferences(user_id TEXT PRIMARY KEY,language TEXT);
            CREATE TABLE v2_player_language_defaults(user_id TEXT PRIMARY KEY,language TEXT);
            CREATE TABLE v2_chef_language_preferences(user_id TEXT PRIMARY KEY,language TEXT);
            CREATE TABLE v2_weekly_menus(athlete_id TEXT,menu_date TEXT,meal TEXT,kind TEXT,value TEXT,dish_id TEXT,
                PRIMARY KEY(athlete_id,menu_date,meal));
            CREATE TABLE v2_dish_library(id TEXT PRIMARY KEY,name_pt TEXT,active INTEGER);
            CREATE TABLE documents(id TEXT PRIMARY KEY,user_id TEXT,folder TEXT,title TEXT,data BYTEA);
            CREATE TABLE v2_body_assessments(id TEXT PRIMARY KEY,athlete_id TEXT,assessed_on TEXT,
                measurements TEXT,averages TEXT,formula_note TEXT,status TEXT);
            CREATE TABLE v2_match_events(id TEXT PRIMARY KEY,athlete_id TEXT,match_date TEXT);
            CREATE TABLE v2_daily_weighins(id TEXT PRIMARY KEY,athlete_id TEXT,weigh_date TEXT,weight_kg REAL);
            CREATE TABLE v2_post_match_responses(id TEXT PRIMARY KEY,athlete_id TEXT,match_id TEXT);
            INSERT INTO users(id,name,role,active) VALUES ('p','Test Player','player',1),
                ('chef','Test Chef','chef',1),('admin','Test Admin','admin',1);
            INSERT INTO v2_athletes VALUES ('a',NULL);
            INSERT INTO v2_player_links VALUES ('p','a');
            INSERT INTO v2_chef_links VALUES ('chef','a',NULL,'en');
            INSERT INTO v2_dish_library VALUES ('d','Synthetic dish',1);
        """)
        self.now=datetime.now(timezone.utc).replace(microsecond=0)
        self.c.execute("INSERT INTO sessions VALUES(?,?,?)",("chef-session","chef",int(time.time())+3600))
        for initializer in (store.initialize,activation.initialize,translations.initialize,chef.initialize):
            initializer(self.c)
            initializer(self.c)
        self.c.commit()

    def tearDown(self):
        self.c.conn.rollback()
        self.c.execute("DROP SCHEMA "+self.schema+" CASCADE")
        self.c.commit()
        self.c.conn.close()

    def test_menu_translation_dispatch_read_and_session(self):
        day=self.now.date().isoformat()
        with patch.dict(os.environ,{"MILE_NOTIFICATIONS_CAPTURE":"1"}), patch.object(capture.time,"time",return_value=self.now.timestamp()):
            chef.save_menu(self.c,"a","chef",day,"lunch","category","Carne branca",today=self.now.date())
        candidates=admin.preview(self.c,authorised_athlete_ids=["a"],kind="menu",now=self.now)["items"]
        self.assertEqual({i["recipient_id"] for i in candidates},{"p","chef"})
        selection=[{k:i[k] for k in ("recipient_id","target_id","version")} for i in candidates]
        args=dict(authorised_athlete_ids=["a"],kind="menu",selections=selection,now=self.now,menu_change="new")
        with self.assertRaisesRegex(ValueError,"requires_review"):
            manual.prepare(self.c,**args)
        for field,pt,en in zip(("title","body"),TEMPLATES["menu_new"]["pt-PT"],TEMPLATES["menu_new"]["en-GB"]):
            kw=dict(entity_kind="notification",entity_id="menu_new",field_path=field,source_text=pt)
            translations.submit(self.c,**kw,translated_text=en,actor_id="admin")
            translations.approve(self.c,**kw,reviewer_id="admin")
        rows=manual.prepare(self.c,**args)
        self.assertEqual({r["language"] for r in rows},{"pt-PT","en-GB"})
        digest=dispatch.confirmation_digest(rows)
        dispatch.lock_manual(self.c)
        sent=manual.record_manual(self.c,**args,sender_id="admin",request_id="synthetic-request",expected_digest=digest)
        self.c.commit()
        p=inbox.inbox(self.c,"p")[0]
        ch=inbox.inbox(self.c,"chef")[0]
        def key(raw):
            return base64.urlsafe_b64encode(raw).decode().rstrip("=")
        activation.activate(self.c,user_id="chef",device="a"*32,session_token="chef-session",now=int(time.time()),
            subscription={"endpoint":"https://fcm.googleapis.com/fcm/send/synthetic","keys":{"p256dh":key(bytes([4])+b"x"*64),"auth":key(b"y"*16)}})
        self.c.execute("UPDATE sessions SET token='renewed' WHERE token='chef-session'")
        self.c.commit()
        self.assertTrue(activation.state(self.c,user_id="chef",device="a"*32,session_token="renewed",now=int(time.time()))["active"])
        calls=[]
        def fake(sub,payload):
            calls.append(payload)
            return "accepted"
        with patch.dict(os.environ,{"MILE_NOTIFICATIONS_TEST_RECIPIENT_IDS":"p,chef"}):
            self.assertEqual(dispatch.dispatch(self.c,sent["recorded_ids"],fake),{p["id"]:"not_subscribed",ch["id"]:"accepted"})
            self.assertEqual(dispatch.dispatch(self.c,sent["recorded_ids"],fake),{})
        self.assertEqual(calls,[{"version":2,"id":ch["id"],"language":"en-GB",
                                 "kind":"menu","title":"New menu","body":"A new menu is available to view."}])
        self.assertIsNone(inbox.open_notification(self.c,recipient_id="p",notification_id=ch["id"],now=101))
        self.assertIsNone(inbox.inbox(self.c,"chef")[0]["read_at"])
        item=inbox.open_notification(self.c,recipient_id="chef",notification_id=ch["id"],now=102)
        self.assertEqual(item["read_at"],102)
        self.assertEqual(inbox.destination(self.c,user={"id":"chef","role":"chef"},item=item)["kind"],"menu")
        self.c.execute("DELETE FROM sessions WHERE token='renewed'")
        self.assertFalse(activation.state(self.c,user_id="chef",device="a"*32,session_token="renewed",now=103)["active"])
        self.assertTrue(activation.state(self.c,user_id="chef",device="a"*32,session_token="renewed",now=103)["prompted"])

    def test_edit_bilingual_template_and_future_send(self):
        from notification_templates_v2 import editable_template, save_template, render_template
        old=editable_template(self.c,"weight")
        data={"id":"weight","revision":old["revision"],
              "pt":{"title":"Peso","body":"Regista o teu peso hoje."},
              "en":{"title":"Weight","body":"Record your weight today."}}
        before=inbox.inbox(self.c,"p")
        save_template(self.c,actor_id="admin",payload=data)
        self.assertEqual(render_template("weight","pt-PT",c=self.c),("Peso","Regista o teu peso hoje."))
        self.assertEqual(render_template("weight","en-GB",c=self.c),("Weight","Record your weight today."))
        rows=manual.prepare(self.c,authorised_athlete_ids=["a"],kind="weight",
            selections=[{"recipient_id":"p"}],now=self.now)
        self.assertEqual((rows[0]["title"],rows[0]["body"]),("Peso","Regista o teu peso hoje."))
        self.assertEqual(inbox.inbox(self.c,"p"),before)
        with self.assertRaisesRegex(ValueError,"template_changed"):
            save_template(self.c,actor_id="admin",payload=data)
        with self.assertRaises(PermissionError):
            save_template(self.c,actor_id="p",payload=data)

    def test_capture_savepoint_does_not_abort_primary_write(self):
        with patch.dict(os.environ,{"MILE_NOTIFICATIONS_CAPTURE":"1"}), patch.object(capture.time,"time",return_value=self.now.timestamp()):
            self.c.execute("INSERT INTO documents VALUES(?,?,?,?,?)",("doc","p","nutrition","Synthetic",b"pdf"))
            result=capture.safe(self.c,lambda:self.c.execute("SELECT missing_column FROM documents"))
            self.assertIsNone(result)
            capture.after(self.c,{},lambda:capture.document(self.c,"doc"))
            self.c.commit()
        self.assertIsNotNone(self.c.execute("SELECT id FROM documents WHERE id='doc'").fetchone())
        data=admin.preview(self.c,authorised_athlete_ids=["a"],kind="document",now=self.now)
        self.assertEqual(len(data["items"]),1)
        self.assertEqual(data["items"][0]["change_kind"],"new")

    def test_latest_game_weight_and_stale_confirmation(self):
        yesterday=(self.now.date()-timedelta(days=1)).isoformat()
        self.c.execute("INSERT INTO v2_match_events VALUES(?,?,?)",("match","a",yesterday))
        game=admin.preview(self.c,authorised_athlete_ids=["a"],kind="game",now=self.now)["items"]
        self.assertEqual(game[0]["target_id"],"match")
        weight=admin.preview(self.c,authorised_athlete_ids=["a"],kind="weight",now=self.now)["items"]
        self.assertEqual(len(weight),1)
        self.c.execute("INSERT INTO v2_post_match_responses VALUES(?,?,?)",("answer","a","match"))
        self.assertEqual(admin.preview(self.c,authorised_athlete_ids=["a"],kind="game",now=self.now)["items"],[])
        self.c.execute("INSERT INTO v2_daily_weighins VALUES(?,?,?,?)",("w","a",yesterday,75))
        self.assertEqual(admin.preview(self.c,authorised_athlete_ids=["a"],kind="weight",now=self.now)["items"],[])
        args=dict(authorised_athlete_ids=["a"],kind="custom",selections=[{"recipient_id":"p"}],now=self.now,
                  custom_copy={"pt-PT":{"title":"Aviso","body":"Mensagem"},"en-GB":{"title":"Notice","body":"Message"}})
        digest=dispatch.confirmation_digest(manual.prepare(self.c,**args))
        self.c.execute("INSERT INTO v2_player_language_preferences VALUES ('p','en')")
        with self.assertRaisesRegex(ValueError,"confirmation_changed"):
            manual.record_manual(self.c,**args,sender_id="admin",request_id="stale",expected_digest=digest)
        self.assertEqual(inbox.inbox(self.c,"p"),[])

if __name__=="__main__":
    unittest.main(verbosity=2)
