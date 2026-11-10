import sqlite3
import unittest
import food_library_v2


class FoodLibrarySearchTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        food_library_v2.initialize(self.c)
        rows = [
            ("a", "Bebida de aveia", "Alpro Aveia", "Bebidas", "Sem açúcar", 1),
            ("b", "Pão integral", "Pão integral", "Cereais", "Rico em fibra", 1),
            ("c", "Creatina amostra arquivada", "Creatina", "Suplementos", "Apenas teste", 0),
        ]
        for ident, display, base, category, notes, active in rows:
            self.c.execute(
                "INSERT INTO v2_food_library "
                "(id,source_key,base_name,display_name,category,notes,variant,edible_fraction,"
                "reference_g,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (ident, None, base, display, category, notes, "plain", 1,
                 100, 100, 1, 10, 1, active, 1, 1)
            )
        self.c.commit()

    def tearDown(self):
        self.c.close()

    def test_search_by_visible_name(self):
        result = food_library_v2.page_foods(self.c, "pão")
        self.assertEqual([v["id"] for v in result["foods"]], ["b"])

    def test_search_by_base_name(self):
        result = food_library_v2.page_foods(self.c, "alpro")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["foods"][0]["id"], "a")

    def test_search_by_notes(self):
        result = food_library_v2.page_foods(self.c, "açúcar")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["foods"][0]["id"], "a")

    def test_inactive_foods_not_returned(self):
        self.assertEqual(food_library_v2.page_foods(self.c, "creatina")["total"], 0)
        self.assertEqual(food_library_v2.list_foods(self.c, "creatina"), [])

    def test_category_filter_preserved(self):
        self.assertEqual(food_library_v2.page_foods(self.c, "alpro", "Cereais")["total"], 0)
        self.assertEqual(food_library_v2.page_foods(self.c, "alpro", "Bebidas")["total"], 1)

    def test_non_paged_lookup_consistent(self):
        result = food_library_v2.list_foods(self.c, "alpro")
        self.assertEqual([v["id"] for v in result], ["a"])

    def test_pagination_unchanged(self):
        result = food_library_v2.page_foods(self.c, page=1, page_size=1)
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["pages"], 2)


if __name__ == "__main__":
    unittest.main()
