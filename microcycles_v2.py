"""The Mile v2: isolated athlete microcycle model (no writes to legacy tables)."""
import json
import secrets
import time

TYPES = (
    "MD", "MD-1", "MD-2", "MD-3", "MD-4", "MD-5", "MD-6", "MD+1", "MD+2",
    "Off", "Off (+1)", "Off (+2)", "MD+1/-2", "MD+2/-1",
    "MD+1/-3", "MD+2/-2", "Geral", "Inj", "Off-season", "Pre-season",
)
MEALS = ("breakfast", "lunch", "snack", "dinner", "supper")
COLORS = ("orange", "yellow", "blue", "green", "vp")


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


def list_athletes(c):
    rows = c.execute("SELECT id,name FROM v2_athletes ORDER BY name").fetchall()
    return [dict(r) for r in rows]


def create_athlete(c, name):
    name = str(name).strip()
    if not 2 <= len(name) <= 120:
        raise ValueError("invalid_athlete_name")
    athlete_id = secrets.token_hex(16)
    c.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES(?,?,?)",
              (athlete_id, name, int(time.time())))
    for classification in TYPES:
        c.execute("INSERT INTO v2_microcycle_rows(athlete_id,classification,configured) VALUES(?,?,0)",
                  (athlete_id, classification))
    c.commit()
    return {"id": athlete_id, "name": name}


def get_model(c, athlete_id):
    athlete = c.execute("SELECT id,name FROM v2_athletes WHERE id=?", (athlete_id,)).fetchone()
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
