"""Today" is always the user's own day, from the device clock (decision 22/11/2026).

Players live in several time zones (Dubai, Portugal, Brazil...) and travel.
The app sends its local date (`local_date`); the server accepts it within one
day of UTC. Without it (older app versions), the previous behaviour remains.
"""
import importlib
import io
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import date, datetime, timedelta, timezone

import chef_collaboration_v2

# Dubai (UTC+4) at 01:30 on 23 Nov while UTC is still 22 Nov 21:30.
DUBAI_UTC = datetime(2026, 11, 22, 21, 30, tzinfo=timezone.utc)
# Brazil (UTC-3) at 22:00 on 22 Nov while UTC is already 23 Nov 01:00.
BRAZIL_UTC = datetime(2026, 11, 23, 1, 0, tzinfo=timezone.utc)


def fixed_clock(moment):
    class Fixed(datetime):
        @classmethod
        def now(cls, tz=None):
            return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)
    return Fixed


class UserLocalDayHttpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['MILE_DATA_DIR'] = self.tmp.name
        os.environ['MILE_SITE_ROLE'] = 'both'
        os.environ.pop('DATABASE_URL', None)
        sys.modules.pop('app', None)
        self.app = importlib.import_module('app')
        self.app.initialize()
        import microcycles_v2
        now = int(time.time())
        with self.app.connect() as c:
            c.execute("INSERT INTO users(id,name,email,username,role,password,active,sex) VALUES('p1','P','p1@players.themile.local','playerone','player','x',1,'M')")
            try:
                self.aid = microcycles_v2.create_athlete(c, 'Player One', weight_kg=70)['id']
            except TypeError:
                self.aid = microcycles_v2.create_athlete(c, 'Player One')['id']
            c.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES('p1',?,1)", (self.aid,))
            c.execute("INSERT INTO sessions VALUES(?,?,?,?)", (self.app.digest('tok'), 'p1', 'csrf', now + 3600))
            c.execute("""CREATE TABLE IF NOT EXISTS v2_monitoring_audit(id TEXT PRIMARY KEY, athlete_id TEXT, record_type TEXT,
                         record_id TEXT, actor_id TEXT, prior_json TEXT, new_json TEXT, created_at INTEGER)""")
        self.original_datetime = self.app.datetime

    def tearDown(self):
        self.app.datetime = self.original_datetime
        sys.modules.pop('app', None)
        self.tmp.cleanup()

    def at(self, moment):
        self.app.datetime = fixed_clock(moment)

    def call(self, method, path, body=None, query=''):
        raw = json.dumps(body).encode() if body is not None else b''
        out = {}
        env = {'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': query,
               'HTTP_COOKIE': 'mile_session=tok', 'HTTP_X_CSRF_TOKEN': 'csrf',
               'CONTENT_LENGTH': str(len(raw)), 'wsgi.input': io.BytesIO(raw)}
        data = b''.join(self.app.application(env, lambda status, headers: out.update(status=status)))
        return int(out['status'][:3]), json.loads(data or b'{}')

    # --- helper -------------------------------------------------------------
    def test_local_day_accepted_only_within_one_day_of_utc(self):
        self.at(DUBAI_UTC)
        self.assertEqual(self.app.client_local_day('2026-11-23'), date(2026, 11, 23))
        self.assertEqual(self.app.client_local_day('2026-11-21'), date(2026, 11, 21))
        self.assertIsNone(self.app.client_local_day('2026-11-25'))
        self.assertIsNone(self.app.client_local_day('23/11/2026'))
        self.assertIsNone(self.app.client_local_day(None))

    # --- weight ---------------------------------------------------------------
    def test_weight_dubai_can_record_own_today_after_local_midnight(self):
        self.at(DUBAI_UTC)
        status, body = self.call('POST', '/api/v2/player/weight',
                                 {'date': '2026-11-23', 'weight': '71.0', 'local_date': '2026-11-23'})
        self.assertEqual(status, 200, body)

    def test_weight_brazil_cannot_record_tomorrow_in_the_evening(self):
        self.at(BRAZIL_UTC)
        status, body = self.call('POST', '/api/v2/player/weight',
                                 {'date': '2026-11-23', 'weight': '71.0', 'local_date': '2026-11-22'})
        self.assertEqual((status, body.get('error')), (400, 'future_weight_date'))
        status, body = self.call('POST', '/api/v2/player/weight',
                                 {'date': '2026-11-22', 'weight': '71.0', 'local_date': '2026-11-22'})
        self.assertEqual(status, 200, body)

    def test_weight_without_local_date_keeps_previous_behaviour(self):
        future = (date.today() + timedelta(days=1)).isoformat()
        status, body = self.call('POST', '/api/v2/player/weight', {'date': future, 'weight': '71.0'})
        self.assertEqual((status, body.get('error')), (400, 'future_weight_date'))

    # --- events -------------------------------------------------------------
    def add_training(self, day):
        import events_v2
        with self.app.connect() as c:
            return events_v2.create_event(c, self.aid, {'event_date': day, 'kind': 'training',
                                                        'session': 'morning', 'title': 'Treino'}, 'admin')['id']

    def test_event_brazil_evening_can_still_move_todays_training(self):
        event_id = self.add_training('2026-11-22')
        self.at(BRAZIL_UTC)  # Lisbon/UTC already on the 23rd; the player is on the 22nd.
        status, body = self.call('PUT', '/api/v2/player/events/' + event_id,
                                 {'event_date': '2026-11-22', 'session': 'afternoon', 'local_date': '2026-11-22'})
        self.assertEqual(status, 200, body)

    def test_event_dubai_after_midnight_locks_yesterday(self):
        event_id = self.add_training('2026-11-22')
        self.at(DUBAI_UTC)  # Lisbon still on the 22nd; the player is on the 23rd.
        status, body = self.call('PUT', '/api/v2/player/events/' + event_id,
                                 {'event_date': '2026-11-24', 'session': 'morning', 'local_date': '2026-11-23'})
        self.assertEqual((status, body.get('error')), (400, 'past_event_locked'))
        status, body = self.call('DELETE', '/api/v2/player/events/' + event_id, query='local_date=2026-11-23')
        self.assertEqual((status, body.get('error')), (400, 'past_event_locked'))


class ChefLocalDayTest(unittest.TestCase):
    def test_chef_past_lock_uses_users_day_when_given(self):
        with self.assertRaises(ValueError):
            chef_collaboration_v2._validate_day('2026-11-22', 'lunch', today=date(2026, 11, 23))
        self.assertEqual(chef_collaboration_v2._validate_day('2026-11-22', 'lunch', today=date(2026, 11, 22)), '2026-11-22')

    def test_chef_without_users_day_keeps_server_day(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        with self.assertRaises(ValueError):
            chef_collaboration_v2._validate_day(yesterday, 'lunch')


if __name__ == '__main__':
    unittest.main()
