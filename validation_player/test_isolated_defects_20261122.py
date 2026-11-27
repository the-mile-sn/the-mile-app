"""Regression tests for two isolated defects (audit 22/11/2026).

1. Legacy player deletion with notifications/push subscriptions.
2. Supplement library image MIME type.
"""
import base64
import importlib
import io
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone


class IsolatedDefectsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['MILE_DATA_DIR'] = self.tmp.name
        os.environ['MILE_SITE_ROLE'] = 'both'
        os.environ.pop('DATABASE_URL', None)
        sys.modules.pop('app', None)
        self.app = importlib.import_module('app')
        self.app.initialize()
        now = int(time.time())
        with self.app.connect() as c:
            c.execute("INSERT INTO users(id,name,email,role,password,active) VALUES('adm','Admin','adm@example.invalid','admin','x',1)")
            c.execute("INSERT INTO sessions VALUES(?,?,?,?)", (self.app.digest('admin-token'), 'adm', 'csrf-a', now + 3600))

    def tearDown(self):
        sys.modules.pop('app', None)
        self.tmp.cleanup()

    def call(self, method, path, token='admin-token', csrf='csrf-a', body=None, query=''):
        raw = json.dumps(body).encode() if body is not None else b''
        out = {}
        env = {'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': query,
               'HTTP_COOKIE': 'mile_session=' + token, 'HTTP_X_CSRF_TOKEN': csrf,
               'CONTENT_LENGTH': str(len(raw)), 'wsgi.input': io.BytesIO(raw)}
        data = b''.join(self.app.application(env, lambda status, headers: out.update(status=status, headers=dict(headers))))
        return int(out['status'][:3]), out['headers'], data

    def add_player(self, uid, username):
        with self.app.connect() as c:
            c.execute("INSERT INTO users(id,name,email,username,role,password,active,sex) VALUES(?,?,?,?,?,?,?,?)",
                      (uid, 'Player', username + '@players.themile.local', username, 'player', 'x', 1, 'M'))

    @staticmethod
    def make_athlete(c, name):
        # The two services' create_athlete signatures differ; accept either.
        import microcycles_v2
        try:
            return microcycles_v2.create_athlete(c, name, weight_kg=70)['id']
        except TypeError:
            return microcycles_v2.create_athlete(c, name)['id']

    # 1 -------------------------------------------------------------------
    def test_delete_legacy_player_with_notifications_and_push(self):
        self.add_player('p1', 'playerone')
        with self.app.connect() as c:
            c.execute("INSERT INTO notifications(id,user_id,title,message,category,created) VALUES('n1','p1','t','m','manual',1)")
            c.execute("INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created) VALUES('https://push.invalid/x','p1','k','a',1)")
        status, _, body = self.call('DELETE', '/api/players/p1')
        self.assertEqual(status, 200, body)
        with self.app.connect() as c:
            self.assertIsNone(c.execute("SELECT 1 FROM users WHERE id='p1'").fetchone())
            self.assertIsNone(c.execute("SELECT 1 FROM notifications WHERE user_id='p1'").fetchone())
            self.assertIsNone(c.execute("SELECT 1 FROM push_subscriptions WHERE user_id='p1'").fetchone())

    def test_delete_refuses_player_linked_to_v2_athlete_and_keeps_link(self):
        self.add_player('p2', 'playertwo')
        with self.app.connect() as c:
            aid = self.make_athlete(c, 'Player Two')
            c.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES('p2',?,1)", (aid,))
        status, _, body = self.call('DELETE', '/api/players/p2')
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(body)['error'], 'player_linked')
        with self.app.connect() as c:
            self.assertIsNotNone(c.execute("SELECT 1 FROM users WHERE id='p2'").fetchone())
            self.assertIsNotNone(c.execute("SELECT 1 FROM v2_player_links WHERE user_id='p2'").fetchone())

    # 2 -------------------------------------------------------------------
    def test_supplement_image_mime_type(self):
        png = b'\x89PNG\r\n\x1a\n' + b'\0' * 16
        jpeg = b'\xff\xd8\xff\xe0' + b'\0' * 16
        webp = b'RIFF\0\0\0\0WEBP' + b'\0' * 8
        original = self.app.supplements_v2.library_image
        try:
            for blob, mime in ((png, 'image/png'), (jpeg, 'image/jpeg'), (webp, 'image/webp')):
                self.app.supplements_v2.library_image = lambda c, ident, b=blob: base64.b64encode(b).decode()
                status, headers, data = self.call('GET', '/api/v2/supplement-library/abc123/image')
                self.assertEqual(status, 200)
                self.assertEqual(headers['Content-Type'], mime)
                self.assertEqual(data, blob)
        finally:
            self.app.supplements_v2.library_image = original
