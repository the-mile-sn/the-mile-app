"""SQLite integration tests for isolated consumption persistence. No production data."""
import sqlite3
import unittest
import consumption_records_v2 as records
import consumption_nutrition_v2 as nutrition

LIB = {"rice": {"id":"rice","active":1,"variant":"plain","kcal":100,"protein_g":2,"carbs_g":20,"fat_g":1},
       "potato": {"id":"potato","active":1,"variant":"plain","kcal":80,"protein_g":1,"carbs_g":18,"fat_g":0}}
OPTION = {"foods": [{"id":"rice","grams":100},{"id":"potato","grams":150,"alternative_to":0}]}

class ConsumptionPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        records.initialize(self.db)

    def tearDown(self):
        self.db.close()

    def save(self, athlete, status, edits=None):
        calculated = nutrition.calculate(OPTION, LIB, status, edits)
        records.save_record(self.db, athlete_id=athlete, meal_date='2026-11-11',
            meal_key='lunch', event_id='', status=status, option_ref='published-ref',
            source_draft_id='published-draft', prescription={'option': OPTION},
            consumed_foods=calculated['foods'], nutrition=calculated['nutrition'])

    def test_save_and_read_partial_equivalent(self):
        self.save('athlete-a','partial',[
            {'index':0,'consumed':False,'grams':100},
            {'index':1,'consumed':True,'grams':75}])
        saved=records.read_range(self.db,'athlete-a','2026-11-11','2026-11-11')
        self.assertEqual(len(saved),1)
        self.assertEqual(saved[0]['consumed_foods'][0]['option_index'],1)
        self.assertAlmostEqual(saved[0]['nutrition']['kcal'],55)

    def test_reediting_replaces_only_matching_meal(self):
        self.save('athlete-a','all')
        self.save('athlete-a','none')
        rows=records.read_range(self.db,'athlete-a','2026-11-11','2026-11-11')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['status'],'none')
        self.assertEqual(rows[0]['nutrition']['kcal'],0)

    def test_published_meal_with_informational_supplement_roundtrip(self):
        option={"foods":[{"id":"rice","grams":100},{"kind":"supplement","label":"Vitamina D"}]}
        calculated=nutrition.calculate(option,LIB,"all")
        records.save_record(self.db,athlete_id="athlete-a",meal_date="2026-11-11",
            meal_key="breakfast",event_id="",status="all",option_ref="supplement-ref",
            source_draft_id="published-draft",prescription={"option":option},
            consumed_foods=calculated["foods"],nutrition=calculated["nutrition"])
        saved=records.read_range(self.db,"athlete-a","2026-11-11","2026-11-11")
        self.assertEqual(len(saved),1)
        self.assertEqual(saved[0]["nutrition"]["kcal"],100)
        self.assertEqual([f["id"] for f in saved[0]["consumed_foods"]],["rice"])
        self.assertEqual(saved[0]["prescription"]["option"]["foods"][1]["kind"],"supplement")

    def test_athlete_isolation(self):
        self.save('athlete-a','all')
        self.assertEqual(records.read_range(self.db,'athlete-b','2026-11-11','2026-11-11'),[])

    def test_invalid_date_range(self):
        with self.assertRaises(ValueError):
            records.read_range(self.db,'athlete-a','2026-11-12','2026-11-11')

if __name__=='__main__':
    unittest.main()
