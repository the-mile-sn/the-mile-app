"""Single-day, single-meal color exceptions for the v2 microcycle calendar.

Only the selected athlete/date/meal is affected. Removing the exception
restores the model's classification-based color without altering the model.
"""
from datetime import date
import time

from microcycles_v2 import MEALS, COLORS

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_day_meal_colors (
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        meal_date TEXT NOT NULL,
        meal TEXT NOT NULL,
        color TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (athlete_id, meal_date, meal)
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS v2_day_colors_lookup ON v2_day_meal_colors(athlete_id,meal_date)")

def list_colors(c, athlete_id, start, end):
    try:
        first=date.fromisoformat(start);last=date.fromisoformat(end)
        if start!=first.isoformat() or end!=last.isoformat() or last<first or (last-first).days>62:
            raise ValueError()
    except (TypeError, ValueError):
        raise ValueError("invalid_range")
    rows=c.execute("""SELECT meal_date,meal,color FROM v2_day_meal_colors
         WHERE athlete_id=? AND meal_date>=? AND meal_date<=?
         ORDER BY meal_date,meal""",(athlete_id,start,end)).fetchall()
    return [dict(r) for r in rows]

def set_color(c, athlete_id, meal_date, meal, color, actor):
    try:
        parsed=date.fromisoformat(meal_date)
        if meal_date!=parsed.isoformat():raise ValueError()
    except (ValueError,TypeError):
        raise ValueError("invalid_date")
    if meal not in MEALS or color not in (*COLORS,None):
        raise ValueError("invalid_color")
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?",(athlete_id,)).fetchone():
        return None
    c.execute("""DELETE FROM v2_day_meal_colors
        WHERE athlete_id=? AND meal_date=? AND meal=?""",(athlete_id,meal_date,meal))
    if color is not None:
        c.execute("""INSERT INTO v2_day_meal_colors
            (athlete_id,meal_date,meal,color,created_by,updated_at)
            VALUES(?,?,?,?,?,?)""",
            (athlete_id,meal_date,meal,color,actor,int(time.time())))
    return {"meal_date":meal_date,"meal":meal,"color":color}
