"""The Mile v2: isolated athlete microcycle model (no writes to legacy tables)."""
import json
import re
import secrets
import time

TYPES = (
    "MD", "MD-1", "MD-2", "MD-3", "MD-4", "MD-5", "MD-6", "MD+1", "MD+2",
    "Off", "Off (+1)", "Off (+2)", "MD+1/-2", "MD+2/-1",
    "MD+1/-3", "MD+2/-2", "Geral", "Inj", "Off-season", "Pre-season",
)
MEALS = ("breakfast", "lunch", "snack", "dinner", "supper")
COLORS = ("orange", "yellow", "blue", "green", "vp")


def _table_columns(c, table):
    """Read table metadata in PostgreSQL and SQLite without changing data."""
    if hasattr(c, 'conn'):
        rows = c.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema=current_schema() AND table_name=?", (table,)
        ).fetchall()
        return {row['column_name'] for row in rows}
    return {row['name'] for row in c.execute('PRAGMA table_info(' + table + ')').fetchall()}


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS v2_athletes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS v2_microcycle_rows (
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        classification TEXT NOT NULL,
        configured INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (athlete_id, classification)
    );
    CREATE TABLE IF NOT EXISTS v2_microcycle_cells (
        athlete_id TEXT NOT NULL,
        classification TEXT NOT NULL,
        meal TEXT NOT NULL,
        color TEXT,
        PRIMARY KEY (athlete_id, classification, meal),
        FOREIGN KEY (athlete_id, classification)
            REFERENCES v2_microcycle_rows(athlete_id, classification)
    );
    CREATE TABLE IF NOT EXISTS v2_match_events (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        match_date TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE(athlete_id, match_date)
    );
    CREATE TABLE IF NOT EXISTS v2_microcycle_audit (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        classification TEXT NOT NULL,
        meal TEXT NOT NULL,
        previous_color TEXT,
        new_color TEXT,
        created_at BIGINT NOT NULL
    );
    """)
    columns = _table_columns(c, "v2_match_events")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_dish_library (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        name_pt TEXT NOT NULL,
        name_en TEXT,
        image_filename TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_weekly_menus (
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        menu_date TEXT NOT NULL,
        meal TEXT NOT NULL CHECK(meal IN ('lunch','dinner')),
        kind TEXT NOT NULL CHECK(kind IN ('category','dish')),
        value TEXT NOT NULL,
        dish_id TEXT REFERENCES v2_dish_library(id),
        PRIMARY KEY (athlete_id, menu_date, meal)
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_player_links (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        athlete_id TEXT NOT NULL UNIQUE REFERENCES v2_athletes(id),
        linked_at BIGINT NOT NULL
    )""")
    athlete_columns = _table_columns(c, "v2_athletes")
    if "weight_kg" not in athlete_columns:
        c.execute("ALTER TABLE v2_athletes ADD COLUMN weight_kg REAL")
    for name, definition in (("height_cm","REAL"),("profile_notes","TEXT"),("sex","TEXT"),("field_position","TEXT"),("arm_point","REAL"),("thigh_point","REAL"),("followup_plan","TEXT"),("followup_renewal_date","TEXT"),("archived_at","BIGINT"),("archived_by","TEXT")):
        if name not in athlete_columns:
            c.execute("ALTER TABLE v2_athletes ADD COLUMN "+name+" "+definition)
    if "match_time" not in columns:
        c.execute("ALTER TABLE v2_match_events ADD COLUMN match_time TEXT")
    if "dish_id" not in _table_columns(c, "v2_weekly_menus"):
        # Upgrade existing menus without rewriting their kind, name or history.
        c.execute("ALTER TABLE v2_weekly_menus ADD COLUMN dish_id TEXT REFERENCES v2_dish_library(id)")
        # Backfill ONLY unambiguous exact names, once at schema upgrade. Rows
        # with duplicate/missing names deliberately remain unlinked for review.
        c.execute("""
            UPDATE v2_weekly_menus SET dish_id=(
                SELECT d.id FROM v2_dish_library d
                WHERE d.name_pt=v2_weekly_menus.value
            ) WHERE kind='dish' AND dish_id IS NULL
            AND (SELECT COUNT(*) FROM v2_dish_library d
                 WHERE d.name_pt=v2_weekly_menus.value)=1
        """)
    c.execute("CREATE INDEX IF NOT EXISTS v2_weekly_menus_dish_id_idx ON v2_weekly_menus(dish_id)")


def list_athletes(c):
    rows = c.execute("SELECT id,name,weight_kg FROM v2_athletes WHERE archived_at IS NULL ORDER BY name").fetchall()
    return [dict(r) for r in rows]


def create_athlete(c, name, commit=True, weight_kg=None):
    name = str(name).strip()
    if not 2 <= len(name) <= 120:
        raise ValueError("invalid_athlete_name")
    try:
        weight = float(str(weight_kg).replace(",", "."))
    except (TypeError, ValueError):
        raise ValueError("invalid_initial_weight")
    if not 20 <= weight <= 250 or weight != weight or weight in (float("inf"), float("-inf")):
        raise ValueError("invalid_initial_weight")
    athlete_id = secrets.token_hex(16)
    c.execute("INSERT INTO v2_athletes(id,name,created_at,weight_kg) VALUES(?,?,?,?)",
              (athlete_id, name, int(time.time()), weight))
    for classification in TYPES:
        c.execute("INSERT INTO v2_microcycle_rows(athlete_id,classification,configured) VALUES(?,?,0)",
                  (athlete_id, classification))
    if commit: c.commit()
    return {"id": athlete_id, "name": name}


def get_model(c, athlete_id):
    athlete = c.execute("SELECT a.id,a.name,a.weight_kg,a.height_cm,a.profile_notes,a.field_position,a.arm_point,a.thigh_point,a.archived_at,u.sex FROM v2_athletes a LEFT JOIN v2_player_links l ON l.athlete_id=a.id LEFT JOIN users u ON u.id=l.user_id WHERE a.id=?", (athlete_id,)).fetchone()
    if not athlete:
        return None
    configured = c.execute(
        "SELECT classification,configured FROM v2_microcycle_rows WHERE athlete_id=?",
        (athlete_id,)).fetchall()
    cells = c.execute(
        "SELECT classification,meal,color FROM v2_microcycle_cells WHERE athlete_id=?",
        (athlete_id,)).fetchall()
    configured_lookup = {r["classification"]: bool(r["configured"]) for r in configured}
    cell_lookup = {(r["classification"], r["meal"]): r["color"] for r in cells}
    return {"athlete": dict(athlete), "classifications": [
        {"name": t, "configured": configured_lookup.get(t, False),
         "meals": {meal: cell_lookup.get((t, meal)) for meal in MEALS}}
        for t in TYPES], "colors": list(COLORS), "meals": list(MEALS)}


def update_cell(c, athlete_id, classification, meal, color, actor_id):
    if classification not in TYPES or meal not in MEALS or color not in (*COLORS, None):
        raise ValueError("invalid_model_cell")
    row = c.execute("SELECT configured FROM v2_microcycle_rows WHERE athlete_id=? AND classification=?",
                    (athlete_id, classification)).fetchone()
    if not row:
        return False
    prior = c.execute("SELECT color FROM v2_microcycle_cells WHERE athlete_id=? AND classification=? AND meal=?",
                      (athlete_id, classification, meal)).fetchone()
    old_color = prior["color"] if prior else None
    c.execute("DELETE FROM v2_microcycle_cells WHERE athlete_id=? AND classification=? AND meal=?",
              (athlete_id, classification, meal))
    c.execute("INSERT INTO v2_microcycle_cells(athlete_id,classification,meal,color) VALUES(?,?,?,?)",
              (athlete_id, classification, meal, color))
    c.execute("UPDATE v2_microcycle_rows SET configured=1 WHERE athlete_id=? AND classification=?",
              (athlete_id, classification))
    c.execute("""INSERT INTO v2_microcycle_audit
                (id,athlete_id,actor_id,classification,meal,previous_color,new_color,created_at)
                VALUES(?,?,?,?,?,?,?,?)""",
              (secrets.token_hex(16), athlete_id, actor_id, classification, meal, old_color, color, int(time.time())))
    c.commit()
    return True

def list_matches(c, athlete_id):
    return [dict(r) for r in c.execute("SELECT id,match_date,match_time FROM v2_match_events WHERE athlete_id=? ORDER BY match_date", (athlete_id,)).fetchall()]


def valid_match_time(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str) or not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", value):
        raise ValueError("invalid_match_time")
    return value


def add_match(c, athlete_id, match_date, match_time=None):
    from calendar_v2 import parse_day
    day = parse_day(match_date).isoformat()
    hour = valid_match_time(match_time)
    if not c.execute("SELECT id FROM v2_athletes WHERE id=?", (athlete_id,)).fetchone():
        return None
    if c.execute("SELECT 1 FROM v2_match_events WHERE athlete_id=? AND match_date=?", (athlete_id, day)).fetchone():
        raise ValueError("duplicate_match")
    match_id = secrets.token_hex(16)
    c.execute("INSERT INTO v2_match_events(id,athlete_id,match_date,created_at,match_time) VALUES(?,?,?,?,?)", (match_id, athlete_id, day, int(time.time()), hour))
    c.commit()
    return {"id": match_id, "match_date": day, "match_time": hour}


def delete_match(c, athlete_id, match_id):
    if not c.execute("SELECT 1 FROM v2_match_events WHERE athlete_id=? AND id=?", (athlete_id, match_id)).fetchone():
        return False
    c.execute("DELETE FROM v2_match_events WHERE athlete_id=? AND id=?", (athlete_id, match_id))
    c.commit()
    return True


def update_match(c, athlete_id, match_id, match_date, match_time=None):
    from calendar_v2 import parse_day
    day = parse_day(match_date).isoformat()
    hour = valid_match_time(match_time)
    current = c.execute("SELECT id FROM v2_match_events WHERE athlete_id=? AND id=?", (athlete_id, match_id)).fetchone()
    if not current:
        return None
    duplicate = c.execute("SELECT id FROM v2_match_events WHERE athlete_id=? AND match_date=? AND id<>?", (athlete_id, day, match_id)).fetchone()
    if duplicate:
        raise ValueError("duplicate_match")
    c.execute("UPDATE v2_match_events SET match_date=?,match_time=? WHERE id=? AND athlete_id=?", (day,hour,match_id,athlete_id))
    c.commit()
    return {"id": match_id, "match_date": day, "match_time": hour}


def update_athlete_weight(c, athlete_id, weight):
    if weight is None or weight == "":
        value = None
    else:
        try:
            value = float(weight)
        except (TypeError, ValueError):
            raise ValueError("invalid_weight")
        if not 20 <= value <= 250:
            raise ValueError("invalid_weight")
    row = c.execute("UPDATE v2_athletes SET weight_kg=? WHERE id=?", (value, athlete_id))
    if row.rowcount != 1:
        return None
    c.commit()
    return value


def list_menus(c, athlete_id, start, end):
    from calendar_v2 import parse_day
    begin, finish = parse_day(start), parse_day(end)
    if finish < begin or (finish-begin).days > 62:
        raise ValueError("invalid_range")
    # The ID is authoritative after a dish is renamed. Keep the existing
    # 'value' API contract for both the Backoffice and the player app.
    return [dict(row) for row in c.execute(
        """SELECT m.menu_date,m.meal,m.kind,
               CASE WHEN m.kind='dish' AND d.id IS NOT NULL
                    THEN d.name_pt ELSE m.value END AS value,
               CASE WHEN m.kind='dish' THEN m.dish_id ELSE NULL END AS dish_id
           FROM v2_weekly_menus m
           LEFT JOIN v2_dish_library d ON m.kind='dish' AND d.id=m.dish_id
           WHERE m.athlete_id=? AND m.menu_date BETWEEN ? AND ?
           ORDER BY m.menu_date,m.meal""",
        (athlete_id, begin.isoformat(), finish.isoformat())).fetchall()]


def resolve_menu_dish(c, kind, value, dish_id=None):
    """Return (display name, stable ID), never guessing between duplicates.

    Older clients still send names. The chooser may instead submit dish_id;
    its current name then wins over any stale client-provided display value.
    """
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 200:
        raise ValueError("invalid_menu")
    if kind != "dish":
        if dish_id is not None:
            raise ValueError("invalid_menu_dish")
        return value.strip(), None
    if dish_id is not None:
        if not isinstance(dish_id, str) or not 1 <= len(dish_id) <= 100:
            raise ValueError("invalid_menu_dish")
        row = c.execute(
            "SELECT id,name_pt FROM v2_dish_library WHERE id=?", (dish_id,)
        ).fetchone()
        if row is None:
            raise ValueError("invalid_menu_dish")
        return row["name_pt"], row["id"]
    rows = c.execute(
        "SELECT id FROM v2_dish_library WHERE name_pt=? LIMIT 2", (value.strip(),)
    ).fetchall()
    return value.strip(), rows[0]["id"] if len(rows) == 1 else None


def menu_dish_id_audit(c):
    """Admin-only diagnostics: no athlete identifiers or private details."""
    total_row = c.execute(
        """SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN dish_id IS NOT NULL THEN 1 ELSE 0 END),0) AS linked
           FROM v2_weekly_menus WHERE kind='dish'"""
    ).fetchone()
    unresolved = c.execute(
        """SELECT value AS name,COUNT(*) AS assignments
           FROM v2_weekly_menus WHERE kind='dish' AND dish_id IS NULL
           GROUP BY value ORDER BY assignments DESC,value LIMIT 100"""
    ).fetchall()
    names = []
    for row in unresolved:
        matches = c.execute(
            "SELECT COUNT(*) AS n FROM v2_dish_library WHERE name_pt=?", (row["name"],)
        ).fetchone()["n"]
        names.append({"name": row["name"], "assignments": row["assignments"],
                      "reason": "ambiguous" if matches > 1 else "unmatched"})
    return {"total": total_row["total"], "linked": total_row["linked"],
            "unresolved": total_row["total"] - total_row["linked"],
            "unresolved_names": names}


def save_menu(c, athlete_id, menu_date, meal, kind, value, dish_id=None):
    from calendar_v2 import parse_day
    day = parse_day(menu_date).isoformat()
    if meal not in ("lunch","dinner") or kind not in ("category","dish"):
        raise ValueError("invalid_menu")
    value, dish_id = resolve_menu_dish(c, kind, value, dish_id)
    if kind == "category" and value not in ("Carne branca", "Carne vermelha", "Peixe magro", "Peixe gordo", "Livre", "Pós-jogo", "Mix"):
        raise ValueError("invalid_menu_category")
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?", (athlete_id,)).fetchone():
        return None
    c.execute("""INSERT INTO v2_weekly_menus(athlete_id,menu_date,meal,kind,value,dish_id)
                 VALUES(?,?,?,?,?,?) ON CONFLICT(athlete_id,menu_date,meal)
                 DO UPDATE SET kind=excluded.kind,value=excluded.value,dish_id=excluded.dish_id""",
              (athlete_id,day,meal,kind,value,dish_id))
    c.commit()
    return {"menu_date":day,"meal":meal,"kind":kind,"value":value,"dish_id":dish_id}


def delete_menu(c, athlete_id, menu_date, meal):
    from calendar_v2 import parse_day
    day=parse_day(menu_date).isoformat()
    if meal not in ("lunch","dinner"):
        raise ValueError("invalid_menu")
    result=c.execute("DELETE FROM v2_weekly_menus WHERE athlete_id=? AND menu_date=? AND meal=?",(athlete_id,day,meal))
    c.commit()
    return result.rowcount > 0


def import_dish_catalog(c, catalog_rows):
    for row in catalog_rows:
        c.execute("""INSERT INTO v2_dish_library (id,category,name_pt,name_en,image_filename)
          VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          category=excluded.category,name_pt=excluded.name_pt,name_en=excluded.name_en,
          image_filename=excluded.image_filename""",
          (row["id"],row["category"],row["name_pt"],row.get("name_en",""),row["image_filename"]))
    c.commit()


def page_dish_library(c, query="", category="", page=1, page_size=25):
    """Return only requested dish rows; leave full catalogue for menu selectors."""
    conditions, params = ["active=1"], []
    if query:
        conditions.append("(LOWER(name_pt) LIKE ? OR LOWER(name_en) LIKE ? OR LOWER(category) LIKE ?)")
        params.extend(["%"+query.lower()+"%"]*3)
    if category:
        conditions.append("category=?")
        params.append(category)
    where = " WHERE " + " AND ".join(conditions)
    total = c.execute("SELECT COUNT(*) AS total FROM v2_dish_library" + where,
                      tuple(params)).fetchone()["total"]
    pages = max(1, (total+page_size-1)//page_size)
    page = max(1, min(page,pages))
    rows = c.execute(
        "SELECT id,category,name_pt,name_en,image_filename,active FROM v2_dish_library"
        + where + " ORDER BY category,name_pt,id LIMIT ? OFFSET ?",
        tuple(params + [page_size,(page-1)*page_size])
    ).fetchall()
    categories = [row["category"] for row in c.execute(
        "SELECT DISTINCT category FROM v2_dish_library WHERE active=1 ORDER BY category").fetchall()]
    return {"dishes":[dict(r) for r in rows], "page":page,
            "page_size":page_size, "pages":pages, "total":total, "categories":categories}


def list_dish_library(c):
    return [dict(row) for row in c.execute(
       "SELECT id,category,name_pt,name_en,image_filename,active FROM v2_dish_library ORDER BY category,name_pt").fetchall()]


def update_dish(c, dish_id, name_pt, name_en, category, active):
    if not all(isinstance(v,str) for v in (name_pt,name_en,category)) or not 1 <= len(name_pt.strip()) <= 200 or not 1 <= len(category.strip()) <= 100 or len(name_en)>200 or not isinstance(active,bool):
        raise ValueError("invalid_dish")
    result=c.execute("UPDATE v2_dish_library SET name_pt=?,name_en=?,category=?,active=? WHERE id=?",
        (name_pt.strip(),name_en.strip(),category.strip(),int(active),dish_id))
    c.commit()
    return bool(result.rowcount)


def create_dish(c, name_pt, name_en, category, image_filename):
    if not all(isinstance(v,str) for v in (name_pt,name_en,category)) or not 1 <= len(name_pt.strip()) <= 200 or not 1 <= len(category.strip()) <= 100 or len(name_en)>200:
        raise ValueError("invalid_dish")
    dish_id=secrets.token_hex(12)
    c.execute("INSERT INTO v2_dish_library (id,category,name_pt,name_en,image_filename) VALUES(?,?,?,?,?)",
        (dish_id,category.strip(),name_pt.strip(),name_en.strip(),image_filename))
    c.commit()
    return dish_id


def update_athlete_profile(c, athlete_id, name, weight, height, notes, sex=None, field_position=None, arm_point=None, thigh_point=None, commit=True):
    if not isinstance(name,str) or not 2 <= len(name.strip()) <= 120:
        raise ValueError("invalid_athlete_profile")
    def numeric(value, lower, upper):
        if value in (None,""): return None
        try: amount=float(value)
        except (ValueError,TypeError): raise ValueError("invalid_athlete_profile")
        if not lower<=amount<=upper: raise ValueError("invalid_athlete_profile")
        return amount
    weight=numeric(weight,20,250)
    height=numeric(height,100,230)
    if not isinstance(notes,str) or len(notes)>3000: raise ValueError("invalid_athlete_profile")
    if sex not in (None,"M","F"):raise ValueError("invalid_athlete_profile")
    field_position = str(field_position or "").strip().upper()
    if len(field_position)>32: raise ValueError("invalid_athlete_profile")
    arm_point=numeric(arm_point,0,100)
    thigh_point=numeric(thigh_point,0,150)
    row=c.execute("UPDATE v2_athletes SET name=?,weight_kg=?,height_cm=?,profile_notes=?,field_position=?,arm_point=?,thigh_point=? WHERE id=?",
       (name.strip(),weight,height,notes.strip(),field_position or None,arm_point,thigh_point,athlete_id))
    if not row.rowcount: return None
    # Keep the linked login identity in sync with the single athlete profile.
    # Do not change user ids, usernames, passwords or account access.
    c.execute("UPDATE users SET name=?,sex=? WHERE id IN (SELECT user_id FROM v2_player_links WHERE athlete_id=?) AND role='player'",
       (name.strip(),sex,athlete_id))
    if commit: c.commit()
    return {"id":athlete_id,"name":name.strip(),"weight_kg":weight,"height_cm":height,"profile_notes":notes.strip(),"sex":sex,"field_position":field_position or None,"arm_point":arm_point,"thigh_point":thigh_point}
