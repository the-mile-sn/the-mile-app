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
    for name, definition in (("height_cm","REAL"),("profile_notes","TEXT"),("sex","TEXT"),("field_position","TEXT"),("arm_point","REAL"),("thigh_point","REAL")):
        if name not in athlete_columns:
            c.execute("ALTER TABLE v2_athletes ADD COLUMN "+name+" "+definition)
    if "match_time" not in columns:
        c.execute("ALTER TABLE v2_match_events ADD COLUMN match_time TEXT")


def list_athletes(c):
    rows = c.execute("SELECT id,name,weight_kg FROM v2_athletes ORDER BY name").fetchall()
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
    athlete = c.execute("SELECT a.id,a.name,a.weight_kg,a.height_cm,a.profile_notes,a.field_position,a.arm_point,a.thigh_point,u.sex FROM v2_athletes a LEFT JOIN v2_player_links l ON l.athlete_id=a.id LEFT JOIN users u ON u.id=l.user_id WHERE a.id=?", (athlete_id,)).fetchone()
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
    return [dict(row) for row in c.execute(
        "SELECT menu_date,meal,kind,value FROM v2_weekly_menus WHERE athlete_id=? AND menu_date BETWEEN ? AND ? ORDER BY menu_date,meal",
        (athlete_id, begin.isoformat(), finish.isoformat())).fetchall()]


def save_menu(c, athlete_id, menu_date, meal, kind, value):
    from calendar_v2 import parse_day
    day = parse_day(menu_date).isoformat()
    if meal not in ("lunch","dinner") or kind not in ("category","dish") or not isinstance(value,str) or not 1 <= len(value.strip()) <= 200:
        raise ValueError("invalid_menu")
    if kind == "category" and value.strip() not in ("Carne branca", "Carne vermelha", "Peixe magro", "Peixe gordo", "Livre", "Pós-jogo", "Mix"):
        raise ValueError("invalid_menu_category")
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?", (athlete_id,)).fetchone():
        return None
    c.execute("""INSERT INTO v2_weekly_menus(athlete_id,menu_date,meal,kind,value)
                 VALUES(?,?,?,?,?) ON CONFLICT(athlete_id,menu_date,meal)
                 DO UPDATE SET kind=excluded.kind,value=excluded.value""",
              (athlete_id,day,meal,kind,value.strip()))
    c.commit()
    return {"menu_date":day,"meal":meal,"kind":kind,"value":value.strip()}


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


def update_athlete_profile(c, athlete_id, name, weight, height, notes, sex=None, field_position=None, arm_point=None, thigh_point=None):
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
    c.commit()
    return {"id":athlete_id,"name":name.strip(),"weight_kg":weight,"height_cm":height,"profile_notes":notes.strip(),"sex":sex,"field_position":field_position or None,"arm_point":arm_point,"thigh_point":thigh_point}
