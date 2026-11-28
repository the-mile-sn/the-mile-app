"""Fake transport tests. No network and no real accounts."""
import sqlite3
import unittest
from unittest.mock import patch
import os
import time
from notification_store_v2 import initialize
from notification_activation_v2 import initialize as init_devices
from notification_dispatch_v2 import dispatch, confirmation_digest, lock_manual


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute('PRAGMA foreign_keys=ON')
        self.c.execute("CREATE TABLE users(id TEXT PRIMARY KEY,active INTEGER)")
        self.c.executemany("INSERT INTO users VALUES(?,1)",[("p",),("q",),("admin",)])
        self.c.execute('CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires BIGINT)')
        self.c.execute('INSERT INTO sessions VALUES(?,?,?)',('p-session','p',int(time.time())+3600))
        initialize(self.c)
        init_devices(self.c)
        self.c.executemany("""INSERT INTO v2_manual_notifications
            (id,request_id,recipient_id,sender_id,kind,language,title,body,created_at)
            VALUES(?,?,?,'admin','custom','pt-PT','Private title','Private body',100)""",
            [("n1","r1","p"),("n2","r2","q")])
        self.c.execute("""INSERT INTO v2_notification_devices
            (device_id,user_id,session_token,endpoint,p256dh,auth,created_at)
            VALUES('dev','p','p-session','https://fcm.googleapis.com/fcm/send/fake','fake','fake',100)""")
        self.c.commit()
        self.env=patch.dict(os.environ,{"MILE_NOTIFICATIONS_TEST_RECIPIENT_IDS":"p"})
        self.env.start()
        self.calls=[]

    def tearDown(self):
        self.env.stop()
        self.c.close()

    def status(self,nid):
        return self.c.execute("SELECT push_status FROM v2_manual_notifications WHERE id=?",(nid,)).fetchone()[0]

    def send(self,sub,payload):
        self.calls.append(payload)
        return "accepted"

    def test_opaque_payload_and_no_repeat(self):
        self.assertEqual(dispatch(self.c,["n1","n2"],self.send),{"n1":"accepted"})
        self.assertEqual(self.calls,[{"version":2,"id":"n1","language":"pt-PT"}])
        self.assertEqual(self.status("n2"),"not_attempted")
        self.assertEqual(dispatch(self.c,["n1"],self.send),{})
        self.assertEqual(len(self.calls),1)

    def test_template_payload(self):
        for kind in ("game","weight","birthday","document","assessment","menu"):
            with self.subTest(kind=kind):
                self.c.execute("UPDATE v2_manual_notifications SET kind=?,title='Template title',body='Template body',push_status='not_attempted' WHERE id='n1'",(kind,))
                self.c.commit()
                self.assertEqual(dispatch(self.c,["n1"],self.send),{"n1":"accepted"})
                self.assertEqual(self.calls[-1],{"version":2,"id":"n1","language":"pt-PT","kind":kind,"title":"Template title","body":"Template body"})

    def test_no_subscription_preserves_notification(self):
        self.c.execute("DELETE FROM v2_notification_devices")
        self.c.commit()
        self.assertEqual(dispatch(self.c,["n1"],self.send),{"n1":"not_subscribed"})
        self.assertEqual(self.status("n1"),"not_subscribed")
        self.assertEqual(self.calls,[])

    def test_expired_session_cannot_receive_push(self):
        self.c.execute("UPDATE sessions SET expires=0 WHERE token='p-session'")
        self.c.commit()
        self.assertEqual(dispatch(self.c,["n1"],self.send),{"n1":"not_subscribed"})
        self.assertEqual(self.calls,[])

    def test_logged_out_session_cannot_receive_push(self):
        self.c.execute("DELETE FROM sessions WHERE token='p-session'")
        self.c.commit()
        self.assertEqual(dispatch(self.c,["n1"],self.send),{"n1":"not_subscribed"})
        self.assertEqual(self.calls,[])

    def test_gateway_failure_no_retry(self):
        def fail(sub,payload):
            raise RuntimeError("test")
        self.assertEqual(dispatch(self.c,["n1"],fail),{"n1":"unknown"})
        self.assertEqual(dispatch(self.c,["n1"],self.send),{})
        self.assertEqual(self.calls,[])

    def test_deadline_stops_dispatch(self):
        self.assertEqual(dispatch(self.c,["n1"],self.send,deadline_seconds=0),{"n1":"not_attempted"})
        self.assertEqual(self.status("n1"),"not_attempted")

    def test_confirmation_digest(self):
        a={"recipient_id":"p","title":"A"}
        b={"recipient_id":"q","title":"B"}
        self.assertEqual(confirmation_digest([a,b]),confirmation_digest([b,a]))
        self.assertNotEqual(confirmation_digest([a,b]),confirmation_digest([a,{**b,"title":"C"}]))

    def test_lock_has_no_history_side_effect(self):
        lock_manual(self.c)
        self.assertEqual(self.status("n1"),"not_attempted")

if __name__=="__main__":
    unittest.main()
