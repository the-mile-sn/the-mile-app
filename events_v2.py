"""Training and match calendar events for The Mile v2 test environment.

Sessions are deliberately coarse: morning before lunch, afternoon before dinner.
Event sources and per-event manual overrides are retained independently.
"""
import secrets
from datetime import date

KINDS = {"training", "match", "gym", "travel", "other"}
SESSIONS = {"morning", "afternoon"}
MAX_EVENTS = 500

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_calendar_events (
      id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
      event_date TEXT NOT NULL, kind TEXT NOT NULL,
      session TEXT NOT NULL, title TEXT NOT NULL,
      created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
      pre_override TEXT NOT NULL DEFAULT 'auto',
      post_override TEXT NOT NULL DEFAULT 'auto',
      created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS v2_events_athlete_date ON v2_calendar_events(athlete_id,event_date)")

def validate_event(event_date, kind, session, title):
    try:
        if not isinstance(event_date,str) or date.fromisoformat(event_date).isoformat()!=event_date:
            raise ValueError()
    except (ValueError,TypeError):
        raise ValueError("invalid_date")
    if kind not in KINDS or session not in SESSIONS:
        raise ValueError("invalid_event")
    if not isinstance(title,str) or not (1<=len(title.strip())<=100):
        raise ValueError("invalid_title")
    return event_date,kind,session,title.strip()

def list_events(c,athlete_id,start,end):
    try:
        a=date.fromisoformat(start); b=date.fromisoformat(end)
        if a>b or (b-a).days>62: raise ValueError()
    except (TypeError,ValueError):
        raise ValueError("invalid_range")
    rows=c.execute("""SELECT id,event_date,kind,session,title,pre_override,post_override
      FROM v2_calendar_events WHERE athlete_id=? AND event_date>=? AND event_date<=?
      ORDER BY event_date, CASE session WHEN 'morning' THEN 0 ELSE 1 END, created_at""",
      (athlete_id,start,end)).fetchall()
    return [dict(r) for r in rows]

def create_event(c,athlete_id,payload,actor):
    from time import time
    values=validate_event(payload.get("event_date"),payload.get("kind"),payload.get("session"),payload.get("title"))
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?",(athlete_id,)).fetchone():
        return None
    n=c.execute("SELECT COUNT(*) AS n FROM v2_calendar_events WHERE athlete_id=?",(athlete_id,)).fetchone()["n"]
    if n>=MAX_EVENTS: raise ValueError("too_many_events")
    identifier=secrets.token_hex(16); now=int(time())
    c.execute("""INSERT INTO v2_calendar_events
      (id,athlete_id,event_date,kind,session,title,created_by,updated_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)""",(identifier,athlete_id,*values,actor,actor,now,now))
    return {"id":identifier,"event_date":values[0],"kind":values[1],"session":values[2],"title":values[3],"pre_override":"auto","post_override":"auto"}

def update_event(c,athlete_id,event_id,payload,actor,allow_nutrition_changes):
    from time import time
    row=c.execute("SELECT * FROM v2_calendar_events WHERE id=? AND athlete_id=?",(event_id,athlete_id)).fetchone()
    if not row: return None
    values=validate_event(payload.get("event_date",row["event_date"]),payload.get("kind",row["kind"]),payload.get("session",row["session"]),payload.get("title",row["title"]))
    pre=row["pre_override"]; post=row["post_override"]
    if allow_nutrition_changes:
        pre=payload.get("pre_override",pre);post=payload.get("post_override",post)
        if pre not in ("auto","off","on") or post not in ("auto","off","on"):
            raise ValueError("invalid_override")
    c.execute("""UPDATE v2_calendar_events SET event_date=?,kind=?,session=?,title=?,
       pre_override=?,post_override=?,updated_by=?,updated_at=? WHERE id=? AND athlete_id=?""",
       (*values,pre,post,actor,int(time()),event_id,athlete_id))
    return {"id":event_id,"event_date":values[0],"kind":values[1],"session":values[2],"title":values[3],"pre_override":pre,"post_override":post}

def delete_event(c, athlete_id, event_id):
    row = c.execute("SELECT 1 FROM v2_calendar_events WHERE id=? AND athlete_id=?",
                    (event_id, athlete_id)).fetchone()
    if row is None:
        return False
    c.execute("DELETE FROM v2_calendar_events WHERE id=? AND athlete_id=?",
              (event_id, athlete_id))
    return True
