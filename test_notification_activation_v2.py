"""Synthetic activation tests. Never use a real push endpoint or database."""
import base64
import sqlite3
import unittest
from notification_activation_v2 import initialize,state,acknowledge,activate,deactivate


def key(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


class ActivationTests(unittest.TestCase):
    device="a"*32
    other="b"*32
    subscription={"endpoint":"https://fcm.googleapis.com/fcm/send/synthetic",
                  "keys":{"p256dh":key(b"\x04"+b"x"*64),"auth":key(b"y"*16)}}

    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.execute("CREATE TABLE users(id TEXT PRIMARY KEY)")
        self.c.executemany("INSERT INTO users VALUES(?)",[("p",),("chef",)])
        self.c.execute("CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires BIGINT)")
        self.c.executemany("INSERT INTO sessions VALUES(?,?,?)",[("p-session","p",1000),("chef-session","chef",1000)])
        initialize(self.c)
        initialize(self.c)

    def tearDown(self):
        self.c.close()

    def current(self,user="p",device=None):
        return state(self.c,user_id=user,device=device or self.device,session_token=user+"-session",now=100)

    def enable(self,user="p",device=None,subscription=None):
        activate(self.c,user_id=user,device=device or self.device,
                 subscription=subscription if subscription is not None else self.subscription,session_token=user+"-session",now=100)

    def test_dismissal_never_subscribes_and_is_account_specific(self):
        self.assertEqual(self.current(),{"prompted":False,"active":False})
        acknowledge(self.c,user_id="p",now=99)
        self.assertEqual(self.current(),{"prompted":True,"active":False})
        self.assertEqual(self.current("chef"),{"prompted":False,"active":False})

    def test_explicit_activation_after_dismissal(self):
        acknowledge(self.c,user_id="p",now=99)
        self.enable()
        self.assertEqual(self.current(),{"prompted":True,"active":True})
        self.assertEqual(self.current(device=self.other),{"prompted":True,"active":False})

    def test_disable_preserves_prompt_preference_and_scope(self):
        self.enable()
        deactivate(self.c,user_id="chef",device=self.device)
        self.assertTrue(self.current()["active"])
        deactivate(self.c,user_id="p",device=self.device)
        self.assertEqual(self.current(),{"prompted":True,"active":False})

    def test_explicit_account_reassociation(self):
        self.enable()
        self.enable("chef",self.other)
        self.assertFalse(self.current()["active"])
        self.assertTrue(self.current("chef",self.other)["active"])

    def test_session_rotation_and_logout(self):
        self.enable()
        self.c.execute("UPDATE sessions SET token='p-renewed' WHERE token='p-session'")
        self.assertFalse(self.current()["active"])
        self.assertTrue(state(self.c,user_id="p",device=self.device,session_token="p-renewed",now=100)["active"])
        self.c.execute("DELETE FROM sessions WHERE token='p-renewed'")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_notification_devices").fetchone()[0],0)
        self.assertEqual(self.current(),{"prompted":True,"active":False})

    def test_expired_and_other_account_session_rejected(self):
        self.enable()
        self.assertFalse(state(self.c,user_id="p",device=self.device,session_token="p-session",now=1000)["active"])
        self.c.execute("UPDATE sessions SET expires=99 WHERE token='p-session'")
        with self.assertRaises(ValueError):
            self.enable()
        with self.assertRaises(ValueError):
            activate(self.c,user_id="p",device=self.device,subscription=self.subscription,
                     session_token="chef-session",now=100)

    def test_reject_invalid_endpoint_and_key_without_altering_state(self):
        for endpoint in ("http://fcm.googleapis.com/path","https://127.0.0.1/path",
                         "https://fcm.googleapis.com.evil.example/path",
                         "https://user@web.push.apple.com/path"):
            with self.assertRaises(ValueError):
                self.enable(subscription={**self.subscription,"endpoint":endpoint})
        with self.assertRaises(ValueError):
            self.enable(subscription={**self.subscription,"keys":{"p256dh":"bad","auth":"bad"}})
        self.assertFalse(self.current()["active"])

if __name__=="__main__":
    unittest.main()
