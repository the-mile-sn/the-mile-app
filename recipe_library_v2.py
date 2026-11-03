"""The Mile V2: standalone, admin-managed culinary recipe catalogue.

No player-facing reads, nutrition calculations, plan edits or publication side effects.
All writes are isolated to v2_recipe_* tables. Shared images use namespaced keys.
"""
import json
import re
import secrets
import time

RECIPE_TYPES = ("standard", "adaptable")
RECIPE_STATUSES = ("draft", "published")
_IDENTIFIER = re.compile(r"^[a-f0-9]{24}$")


def initialize(c):
    """Additive, idempotent schema; compatible with SQLite and PostgreSQL."""
    c.execute("""CREATE TABLE IF NOT EXISTS v2_recipe_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at BIGINT NOT NULL
    )""")
    c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS v2_recipe_categories_name
        ON v2_recipe_categories(name)""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_recipe_library (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES v2_recipe_categories(id),
        name TEXT NOT NULL,
        recipe_type TEXT NOT NULL CHECK(recipe_type IN ('standard','adaptable')),
        status TEXT NOT NULL CHECK(status IN ('draft','published')),
        servings INTEGER NOT NULL DEFAULT 1,
        sections_json TEXT NOT NULL DEFAULT '[]',
        steps_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        photo_key TEXT,
        source_document TEXT NOT NULL DEFAULT '',
        source_page INTEGER,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    )""")
    c.execute("""CREATE INDEX IF NOT EXISTS v2_recipe_library_category_status
        ON v2_recipe_library(category_id,status)""")


def _text(value, limit, required=False):
    if not isinstance(value, str):
        raise ValueError("invalid_recipe")
    result = value.strip()
    if len(result) > limit or (required and not result):
        raise ValueError("invalid_recipe")
    return result


def list_categories(c):
    return [dict(r) for r in c.execute(
        "SELECT id,name FROM v2_recipe_categories ORDER BY name"
    ).fetchall()]


def create_category(c, name):
    name = _text(name, 90, required=True)
    for existing in list_categories(c):
        if existing["name"].casefold() == name.casefold():
            return existing
    category_id = secrets.token_hex(12)
    c.execute(
        "INSERT INTO v2_recipe_categories(id,name,created_at) VALUES(?,?,?)",
        (category_id, name, int(time.time()))
    )
    c.commit()
    return {"id": category_id, "name": name}


def _id(value, seen):
    if isinstance(value, str) and _IDENTIFIER.fullmatch(value):
        result = value
    else:
        result = secrets.token_hex(12)
    if result in seen:
        raise ValueError("duplicate_recipe_item_id")
    seen.add(result)
    return result


def _sections(raw):
    if not isinstance(raw, list) or len(raw) > 20:
        raise ValueError("invalid_recipe")
    seen = set()
    result = []
    for section in raw:
        if not isinstance(section, dict):
            raise ValueError("invalid_recipe")
        section_id = _id(section.get("id"), seen)
        title = _text(section.get("title", ""), 100)
        ingredients = section.get("ingredients", [])
        if not isinstance(ingredients, list) or len(ingredients) > 45:
            raise ValueError("invalid_recipe")
        cleaned = []
        for ingredient in ingredients:
            if not isinstance(ingredient, dict):
                raise ValueError("invalid_recipe")
            name = _text(ingredient.get("name", ""), 180)
            quantity = _text(ingredient.get("quantity", ""), 45)
            unit = _text(ingredient.get("unit", ""), 45)
            if not name and (quantity or unit):
                raise ValueError("invalid_recipe")
            if not name:
                continue
            cleaned.append({
                "id": _id(ingredient.get("id"), seen),
                "name": name,
                "quantity": quantity,
                "unit": unit
            })
        result.append({"id": section_id, "title": title, "ingredients": cleaned})
    return result


def _steps(raw):
    if not isinstance(raw, list) or len(raw) > 60:
        raise ValueError("invalid_recipe")
    return [_text(step, 2000) for step in raw if _text(step, 2000)]


def _validated(c, payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_recipe")
    name = _text(payload.get("name", ""), 180, required=True)
    category_id = _text(payload.get("category_id", ""), 80, required=True)
    if not c.execute("SELECT id FROM v2_recipe_categories WHERE id=?", (category_id,)).fetchone():
        raise ValueError("invalid_recipe_category")
    recipe_type = payload.get("recipe_type", "standard")
    status = payload.get("status", "draft")
    if recipe_type not in RECIPE_TYPES or status not in RECIPE_STATUSES:
        raise ValueError("invalid_recipe")
    servings = payload.get("servings", 1)
    if isinstance(servings, bool) or not isinstance(servings, int) or not 1 <= servings <= 100:
        raise ValueError("invalid_recipe")
    sections = _sections(payload.get("sections", []))
    steps = _steps(payload.get("steps", []))
    notes = _text(payload.get("notes", ""), 6000)
    if status == "published" and (not any(section["ingredients"] for section in sections) or not steps):
        raise ValueError("incomplete_recipe")
    return (category_id, name, recipe_type, status, servings,
            json.dumps(sections, ensure_ascii=False), json.dumps(steps, ensure_ascii=False), notes)


def list_recipes(c):
    rows = c.execute("""SELECT r.id,r.name,r.category_id,c.name AS category,
        r.recipe_type,r.status,r.servings,r.photo_key,r.updated_at
        FROM v2_recipe_library r
        JOIN v2_recipe_categories c ON c.id=r.category_id
        ORDER BY c.name,r.name""").fetchall()
    return [dict(row) for row in rows]


def get_recipe(c, recipe_id):
    row = c.execute("""SELECT r.*,c.name AS category
        FROM v2_recipe_library r
        JOIN v2_recipe_categories c ON c.id=r.category_id
        WHERE r.id=?""", (recipe_id,)).fetchone()
    if not row:
        return None
    result = dict(row)
    result["sections"] = json.loads(result.pop("sections_json"))
    result["steps"] = json.loads(result.pop("steps_json"))
    return result


def create_recipe(c, payload):
    fields = _validated(c, payload)
    recipe_id = secrets.token_hex(12)
    now = int(time.time())
    c.execute("""INSERT INTO v2_recipe_library
        (id,category_id,name,recipe_type,status,servings,sections_json,steps_json,notes,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (recipe_id, *fields, now, now))
    c.commit()
    return get_recipe(c, recipe_id)


def update_recipe(c, recipe_id, payload):
    if not c.execute("SELECT id FROM v2_recipe_library WHERE id=?", (recipe_id,)).fetchone():
        return None
    fields = _validated(c, payload)
    c.execute("""UPDATE v2_recipe_library SET
        category_id=?,name=?,recipe_type=?,status=?,servings=?,sections_json=?,steps_json=?,notes=?,updated_at=?
        WHERE id=?""", (*fields, int(time.time()), recipe_id))
    c.commit()
    return get_recipe(c, recipe_id)


def delete_recipe(c, recipe_id):
    """Delete only this recipe and its namespaced image, in one transaction."""
    if not isinstance(recipe_id, str) or not _IDENTIFIER.fullmatch(recipe_id):
        return False
    row = c.execute("SELECT photo_key FROM v2_recipe_library WHERE id=?", (recipe_id,)).fetchone()
    if row is None:
        return False
    c.execute("DELETE FROM v2_recipe_library WHERE id=?", (recipe_id,))
    # Guard against removing any shared dish image if data is malformed.
    own_photo = photo_key(recipe_id)
    if row["photo_key"] == own_photo:
        c.execute("DELETE FROM v2_shared_images WHERE image_key=?", (own_photo,))
    c.commit()
    return True


def photo_key(recipe_id):
    if not isinstance(recipe_id, str) or not _IDENTIFIER.fullmatch(recipe_id):
        raise ValueError("invalid_recipe")
    return "recipe-" + recipe_id + ".webp"


def set_photo(c, recipe_id):
    if not c.execute("SELECT id FROM v2_recipe_library WHERE id=?", (recipe_id,)).fetchone():
        return None
    key = photo_key(recipe_id)
    c.execute("UPDATE v2_recipe_library SET photo_key=?,updated_at=? WHERE id=?",
              (key, int(time.time()), recipe_id))
    c.commit()
    return key
