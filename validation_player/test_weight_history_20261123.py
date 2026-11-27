"""Read-only fasting-weight history for the player's Peso em jejum screen (23/11/2026).

The screen shows Semana (7 days) and Mês (30 days). Recording still goes through
/api/v2/player/weight; this endpoint never writes and only returns the linked
player's own entries.
"""
import importlib
import io
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone

UTC_NOON = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)


def fixed_clock(moment):
    class Fixed(datetime):
        @classmethod
        def now(cls, tz=None):
            return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)
    return Fixed


class WeightHistoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['MILE_DATA_DIR'] = self.tmp.name
        os.environ['MILE_SITE_ROLE'] = 'both'
        os.environ.pop('DATABASE_URL', None)
        sys.modules.pop('app', None)
        self.app = importlib.import_module('app')
        self.app.initialize()
        self.original_datetime = self.app.datetime
        self.app.datetime = fixed_clock(UTC_NOON)
        import microcycles_v2
        now = int(time.time())
        with self.app.connect() as c:
            for uid, name in (('p1', 'playerone'), ('p2', 'playertwo')):
                c.execute("INSERT INTO users(id,name,email,username,role,password,active,sex) VALUES(?,?,?,?,'player','x',1,'M')",
                          (uid, name, name + '@players.themile.local', name))
            self.a1 = microcycles_v2.create_athlete(c, 'Player One')['id']
            self.a2 = microcycles_v2.create_athlete(c, 'Player Two')['id']
            c.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES('p1',?,1)", (self.a1,))
            c.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES('p2',?,1)", (self.a2,))
            c.execute("INSERT INTO sessions VALUES(?,?,?,?)", (self.app.digest('tok'), 'p1', 'csrf', now + 3600))
            rows = [(self.a1, '2026-10-20', 77.5), (self.a1, '2026-10-25', 77.4), (self.a1, '2026-11-17', 76.7),
                    (self.a1, '2026-11-22', 76.7), (self.a1, '2026-11-23', 76.4), (self.a2, '2026-11-23', 81.0)]
            for i, (aid, day, kg) in enumerate(rows):
                c.execute("INSERT INTO v2_daily_weighins(id,athlete_id,weigh_date,weight_kg,menstruating,created_at,updated_at) VALUES(?,?,?,?,NULL,1,1)",
                          ('w%d' % i, aid, day, kg))
            c.commit()

    def tearDown(self):
        self.app.datetime = self.original_datetime
        sys.modules.pop('app', None)
        self.tmp.cleanup()

    def call(self, query, cookie='mile_session=tok', method='GET'):
        env = {'REQUEST_METHOD': method, 'PATH_INFO': '/api/v2/player/weight-history', 'QUERY_STRING': query,
               'HTTP_COOKIE': cookie, 'HTTP_X_CSRF_TOKEN': 'csrf', 'CONTENT_LENGTH': '0', 'wsgi.input': io.BytesIO(b'')}
        out = {}
        data = b''.join(self.app.application(env, lambda status, headers: out.update(status=status)))
        return int(out['status'][:3]), json.loads(data or b'{}')

    def test_week_and_month_return_only_own_entries_in_range(self):
        status, body = self.call('end=2026-11-23&days=7')
        self.assertEqual(status, 200)
        self.assertEqual([e['weigh_date'] for e in body['entries']], ['2026-11-17', '2026-11-22', '2026-11-23'])
        self.assertEqual(body['entries'][-1]['weight_kg'], 76.4)
        status, body = self.call('end=2026-11-23&days=30')
        self.assertEqual([e['weigh_date'] for e in body['entries']], ['2026-10-25', '2026-11-17', '2026-11-22', '2026-11-23'])

    def test_rejects_invalid_or_future_ranges_and_anonymous_reads(self):
        self.assertEqual(self.call('end=2026-11-23&days=0')[0], 400)
        self.assertEqual(self.call('end=2026-11-23&days=401')[0], 400)
        self.assertEqual(self.call('end=23/11/2026&days=7')[0], 400)
        self.assertEqual(self.call('end=2026-11-26&days=7')[0], 400)
        self.assertEqual(self.call('end=2026-11-23&days=7', cookie='')[0], 401)
        self.assertEqual(self.call('end=2026-11-23&days=7', method='POST')[0] in (404, 405), True)

    def test_reading_never_writes(self):
        with self.app.connect() as c:
            before = c.execute("SELECT COUNT(*) AS n FROM v2_daily_weighins").fetchone()['n']
        self.call('end=2026-11-23&days=30')
        with self.app.connect() as c:
            after = c.execute("SELECT COUNT(*) AS n FROM v2_daily_weighins").fetchone()['n']
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
