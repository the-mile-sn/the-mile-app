"""Chef past-day lock follows the user's own day when the app sends it (22/11/2026).

chef_collaboration_v2.py is shared with the player service (branch main) and
must stay identical in both branches.
"""
import unittest
from datetime import date, timedelta

import chef_collaboration_v2


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
