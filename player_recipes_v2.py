"""Read-only, session-scoped recipe queries for the player app.

The backoffice owns recipe editing, publication, and dish/recipe associations.
This module never changes those records. Category access and assigned-menu
access are separate, deliberate authorisation paths.
"""
import json
import re


RECIPE_ID = re.compile(r"^[a-f0-9]{24}$")


def library_for_athlete(c, athlete_id):
    """Independent library: only published recipes in allowed categories."""
    rows = c.execute("""SELECT r.id,r.name,r.category_id,cat.name AS category,
                               r.servings,r.updated_at,r.photo_key
        FROM v2_recipe_library r
        JOIN v2_recipe_categories cat ON cat.id=r.category_id
        JOIN v2_athlete_recipe_category_access access
          ON access.category_id=r.category_id
        WHERE access.athlete_id=? AND r.status='published'
        ORDER BY cat.name,r.name""", (athlete_id,)).fetchall()
    return [{**{key: row[key] for key in
                ("id", "name", "category_id", "category", "servings", "updated_at")},
             "has_photo": bool(row["photo_key"])} for row in rows]


def _menu_dish_access_sql():
    # An unresolved legacy name is usable only when it uniquely identifies
    # one dish. Never guess between two dishes with the same name.
    return """m.kind='dish' AND
       (m.dish_id=d.id OR
        (m.dish_id IS NULL AND m.value=d.name_pt AND
         (SELECT COUNT(*) FROM v2_dish_library exact
          WHERE exact.name_pt=m.value)=1))"""


def dish_assigned_to_athlete(c, athlete_id, dish_id):
    row = c.execute("""SELECT 1 FROM v2_weekly_menus m
        JOIN v2_dish_library d ON d.id=? AND d.active=1
        WHERE m.athlete_id=? AND """+_menu_dish_access_sql()+""" LIMIT 1""",
        (dish_id, athlete_id)).fetchone()
    return bool(row)


def dish_recipe_counts(c, athlete_id):
    """Counts only published recipes on dishes in this athlete's menus."""
    rows = c.execute("""SELECT l.dish_id,COUNT(DISTINCT l.recipe_id) AS n
        FROM v2_dish_recipe_links l
        JOIN v2_recipe_library r ON r.id=l.recipe_id AND r.status='published'
        JOIN v2_dish_library d ON d.id=l.dish_id AND d.active=1
        JOIN v2_weekly_menus m ON m.athlete_id=? AND """+_menu_dish_access_sql()+"""
        GROUP BY l.dish_id""", (athlete_id,)).fetchall()
    return {row["dish_id"]: row["n"] for row in rows}


def published_for_dish(c, athlete_id, dish_id):
    """Return None for a dish not in the player's menu, [] for no recipes."""
    if not isinstance(dish_id, str) or not 4 <= len(dish_id) <= 60:
        return None
    if not dish_assigned_to_athlete(c, athlete_id, dish_id):
        return None
    rows = c.execute("""SELECT r.id,r.name,r.servings,r.updated_at,r.photo_key
        FROM v2_dish_recipe_links l
        JOIN v2_recipe_library r ON r.id=l.recipe_id AND r.status='published'
        WHERE l.dish_id=? ORDER BY l.position,l.recipe_id""", (dish_id,)).fetchall()
    return [{**{key: row[key] for key in ("id","name","servings","updated_at")},
             "has_photo": bool(row["photo_key"])} for row in rows]


def recipe_for_athlete(c, athlete_id, recipe_id):
    """A published recipe is visible via an allowed category OR an assigned dish.

    The latter does not grant access to the entire recipe category.
    """
    if not isinstance(recipe_id, str) or not RECIPE_ID.fullmatch(recipe_id):
        return None
    row = c.execute("""SELECT r.id,r.name,r.category_id,cat.name AS category,
                              r.servings,r.sections_json,r.steps_json,r.notes,
                              r.photo_key,r.updated_at
        FROM v2_recipe_library r
        JOIN v2_recipe_categories cat ON cat.id=r.category_id
        WHERE r.id=? AND r.status='published'
        AND (EXISTS (
          SELECT 1 FROM v2_athlete_recipe_category_access access
          WHERE access.athlete_id=? AND access.category_id=r.category_id
        ) OR EXISTS (
          SELECT 1 FROM v2_dish_recipe_links l
          JOIN v2_dish_library d ON d.id=l.dish_id AND d.active=1
          JOIN v2_weekly_menus m ON m.athlete_id=? AND """+_menu_dish_access_sql()+"""
          WHERE l.recipe_id=r.id
        ))""", (recipe_id, athlete_id, athlete_id)).fetchone()
    if not row:
        return None
    recipe = {key: row[key] for key in
              ("id", "name", "category_id", "category", "servings", "notes", "updated_at")}
    recipe["sections"] = json.loads(row["sections_json"])
    recipe["steps"] = json.loads(row["steps_json"])
    recipe["photo_key"] = row["photo_key"]
    return recipe
