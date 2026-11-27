"""The Mile: chef menu collaboration, immutable audit and meal execution.

Never changes nutritional prescriptions. The menu table remains canonical.
Unvalidated dish suggestions do not appear in the player's planned menu.
"""
import secrets
import time
from datetime import date
from calendar_v2 import parse_day

MEALS = ("lunch", "dinner")
STATES = ("served_planned", "served_changed", "ate_out", "chef_off")
CATEGORIES = ("Carne branca", "Carne vermelha", "Peixe magro", "Peixe gordo",
              "Livre", "Pós-jogo", "Mix", "CT", "Estágio")


def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_menu_history (
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        menu_date TEXT NOT NULL,
        meal TEXT NOT NULL CHECK(meal IN ('lunch','dinner')),
        kind TEXT NOT NULL,value TEXT NOT NULL,dish_id TEXT,
        saved_at BIGINT NOT NULL,
        PRIMARY KEY(athlete_id,menu_date,meal)
    )""")
    c.execute("""INSERT INTO v2_menu_history
        (athlete_id,menu_date,meal,kind,value,dish_id,saved_at)
        SELECT athlete_id,menu_date,meal,kind,value,dish_id,?
        FROM v2_weekly_menus WHERE 1=1
        ON CONFLICT(athlete_id,menu_date,meal) DO NOTHING""",(int(time.time()),))
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chef_menu_audit (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        menu_date TEXT NOT NULL,
        meal TEXT NOT NULL,
        actor_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        previous_kind TEXT,
        previous_value TEXT,
        previous_dish_id TEXT,
        new_kind TEXT,
        new_value TEXT,
        new_dish_id TEXT,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        resolved_by TEXT REFERENCES users(id),
        resolved_at BIGINT
    )""")
    c.execute("""CREATE INDEX IF NOT EXISTS chef_menu_audit_player_time
        ON v2_chef_menu_audit(athlete_id,created_at DESC,id DESC)""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chef_meal_execution (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        menu_date TEXT NOT NULL,
        meal TEXT NOT NULL,
        actor_id TEXT NOT NULL REFERENCES users(id),
        state TEXT NOT NULL CHECK(state IN ('served_planned','served_changed','ate_out','chef_off')),
        planned_kind TEXT,
        planned_value TEXT,
        planned_dish_id TEXT,
        served_description TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL
    )""")
    c.execute("""CREATE INDEX IF NOT EXISTS chef_meal_exec_player_day
        ON v2_chef_meal_execution(athlete_id,menu_date,meal,created_at DESC,id DESC)""")


def _menu(c, athlete_id, day, meal):
    row = c.execute("""SELECT kind,value,dish_id FROM v2_weekly_menus
        WHERE athlete_id=? AND menu_date=? AND meal=?""",
        (athlete_id,day,meal)).fetchone()
    return dict(row) if row else None


def _validate_day(meal_date, meal, past_allowed=False, today=None):
    """today: the user's own calendar day (device clock), when known."""
    day = parse_day(meal_date).isoformat()
    if meal not in MEALS:
        raise ValueError("invalid_meal")
    if not past_allowed and day < (today or date.today()).isoformat():
        raise ValueError("past_menu_locked")
    return day


def _validate_note(value, limit=500):
    if not isinstance(value,str) or len(value)>limit:
        raise ValueError("invalid_note")
    return value.strip()


def _audit(c, athlete_id, day, meal, actor_id, action, before, after,
           status, note=""):
    c.execute("""INSERT INTO v2_chef_menu_audit
        (id,athlete_id,menu_date,meal,actor_id,action,
         previous_kind,previous_value,previous_dish_id,
         new_kind,new_value,new_dish_id,status,note,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (secrets.token_hex(16),athlete_id,day,meal,actor_id,action,
         before.get("kind") if before else None,
         before.get("value") if before else None,
         before.get("dish_id") if before else None,
         after.get("kind") if after else None,
         after.get("value") if after else None,
         after.get("dish_id") if after else None,
         status,note,int(time.time())))


def _resolve_menu_dish(c, kind, value, dish_id=None):
    if not isinstance(value,str) or not 1<=len(value.strip())<=200:
        raise ValueError("invalid_menu")
    value=value.strip()
    if kind!="dish":
        if dish_id is not None: raise ValueError("invalid_menu_dish")
        return value,None
    if dish_id is not None:
        if not isinstance(dish_id,str) or not 1<=len(dish_id)<=100:
            raise ValueError("invalid_menu_dish")
        row=c.execute("SELECT id,name_pt FROM v2_dish_library WHERE id=?",
                      (dish_id,)).fetchone()
        if not row: raise ValueError("invalid_menu_dish")
        return row["name_pt"],row["id"]
    rows=c.execute("SELECT id FROM v2_dish_library WHERE name_pt=? LIMIT 2",
                   (value,)).fetchall()
    return value,rows[0]["id"] if len(rows)==1 else None


def _record_menu_history(c, athlete_id, day, meal, kind, value, dish_id):
    today=date.today().isoformat()
    c.execute("""INSERT INTO v2_menu_history
      (athlete_id,menu_date,meal,kind,value,dish_id,saved_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(athlete_id,menu_date,meal)
      DO UPDATE SET kind=excluded.kind,value=excluded.value,
        dish_id=excluded.dish_id,saved_at=excluded.saved_at
      WHERE excluded.menu_date>=?""",
      (athlete_id,day,meal,kind,value,dish_id,int(time.time()),today))


def save_menu(c, athlete_id, actor_id, menu_date, meal, kind, value, dish_id=None, today=None):
    """Chef can plan approved library dishes/categories only.

    The existing menu table and history are updated in the same transaction
    as our immutable event. Other meals and future days are left untouched.
    """
    day = _validate_day(menu_date,meal,today=today)
    if kind not in ("dish","category"):
        raise ValueError("chef_requires_approved_dish")
    canonical, resolved_id = _resolve_menu_dish(c,kind,value,dish_id)
    if kind=="category" and canonical not in CATEGORIES:
        raise ValueError("invalid_menu_category")
    if kind=="dish":
        if not resolved_id:
            raise ValueError("unapproved_dish")
        approved = c.execute(
            "SELECT id FROM v2_dish_library WHERE id=? AND active=1",
            (resolved_id,)).fetchone()
        if not approved:
            raise ValueError("unapproved_dish")
    previous=_menu(c,athlete_id,day,meal)
    updated={"kind":kind,"value":canonical,"dish_id":resolved_id}
    if previous==updated:
        return {"menu_date":day,"meal":meal,**updated,"changed":False}
    import notification_capture_v2 as capture
    before_notification=capture.before(c,lambda:capture.menu(c,athlete_id,[day]))
    c.execute("""INSERT INTO v2_weekly_menus(athlete_id,menu_date,meal,kind,value,dish_id)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(athlete_id,menu_date,meal) DO UPDATE SET
        kind=excluded.kind,value=excluded.value,dish_id=excluded.dish_id""",
        (athlete_id,day,meal,kind,canonical,resolved_id))
    _record_menu_history(c,athlete_id,day,meal,kind,canonical,resolved_id)
    _audit(c,athlete_id,day,meal,actor_id,"plan_updated",previous,updated,"pending_review")
    capture.after(c,before_notification,lambda:capture.menu(c,athlete_id,[day]))
    c.commit()
    return {"menu_date":day,"meal":meal,**updated,"changed":True}


def record_admin_menu(c, athlete_id, actor_id, menu_date, meal, previous, current, action="plan_updated"):
    """Called after a successful admin edit, before committing the operation."""
    day=_validate_day(menu_date,meal,past_allowed=True)
    if previous == current:
        return
    _audit(c,athlete_id,day,meal,actor_id,action,previous,current,"recorded")


def propose_dish(c, athlete_id, actor_id, menu_date, meal, dish_name, note="", today=None):
    day=_validate_day(menu_date,meal,today=today)
    if not isinstance(dish_name,str) or not 2<=len(dish_name.strip())<=200:
        raise ValueError("invalid_dish_proposal")
    note=_validate_note(note)
    before=_menu(c,athlete_id,day,meal)
    proposed={"kind":"proposal","value":dish_name.strip(),"dish_id":None}
    _audit(c,athlete_id,day,meal,actor_id,"dish_proposal",before,proposed,
           "pending_validation",note)
    c.commit()
    return {"pending_validation":True,"menu_date":day,"meal":meal}


def record_execution(c, athlete_id, actor_id, menu_date, meal, state,
                     served_description="", note=""):
    day=_validate_day(menu_date,meal,past_allowed=True)
    if state not in STATES:
        raise ValueError("invalid_execution_state")
    if not isinstance(served_description,str) or len(served_description)>500:
        raise ValueError("invalid_served_description")
    served_description=served_description.strip()
    note=_validate_note(note)
    if state=="served_changed" and len(served_description)<2:
        raise ValueError("missing_served_description")
    if state!="served_changed" and served_description:
        raise ValueError("unexpected_served_description")
    planned=_menu(c,athlete_id,day,meal)
    # A served-as-planned confirmation requires a specific planned meal.
    if state=="served_planned" and not planned:
        raise ValueError("no_planned_menu")
    c.execute("""INSERT INTO v2_chef_meal_execution
        (id,athlete_id,menu_date,meal,actor_id,state,
         planned_kind,planned_value,planned_dish_id,served_description,note,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (secrets.token_hex(16),athlete_id,day,meal,actor_id,state,
         planned.get("kind") if planned else None,
         planned.get("value") if planned else None,
         planned.get("dish_id") if planned else None,
         served_description,note,int(time.time())))
    c.commit()
    return {"menu_date":day,"meal":meal,"state":state}


def list_menus(c, athlete_id, start, end):
    first,last=parse_day(start).isoformat(),parse_day(end).isoformat()
    if last<first or (parse_day(last)-parse_day(first)).days>62:
        raise ValueError("invalid_menu_range")
    return [dict(row) for row in c.execute("""SELECT m.menu_date,m.meal,m.kind,
        CASE WHEN m.kind='dish' AND d.id IS NOT NULL
             THEN d.name_pt ELSE m.value END AS value,
        CASE WHEN m.kind='dish' THEN m.dish_id ELSE NULL END AS dish_id
        FROM v2_weekly_menus m
        LEFT JOIN v2_dish_library d ON m.kind='dish' AND d.id=m.dish_id
        WHERE m.athlete_id=? AND m.menu_date BETWEEN ? AND ?
        ORDER BY m.menu_date,m.meal""",(athlete_id,first,last)).fetchall()]


def executions(c, athlete_id, start, end):
    first,last=parse_day(start).isoformat(),parse_day(end).isoformat()
    if last<first or (parse_day(last)-parse_day(first)).days>62:
        raise ValueError("invalid_execution_range")
    rows=c.execute("""SELECT e.id,e.menu_date,e.meal,e.state,e.served_description,e.note,
            e.planned_value,e.actor_id,e.created_at,u.name AS actor_name
        FROM v2_chef_meal_execution e
        JOIN users u ON u.id=e.actor_id
        WHERE e.athlete_id=? AND e.menu_date BETWEEN ? AND ?
        ORDER BY e.created_at DESC,e.id DESC""",(athlete_id,first,last)).fetchall()
    latest={}
    for row in rows:
        key=(row["menu_date"],row["meal"])
        if key not in latest:
            latest[key]=dict(row)
    return list(latest.values())


def activity(c, athlete_id=None, limit=80):
    if not isinstance(limit,int) or not 1<=limit<=200:
        raise ValueError("invalid_limit")
    if athlete_id:
        where_a,where_e="WHERE h.athlete_id=?","WHERE e.athlete_id=?"
        params_a,params_e=[athlete_id,limit],[athlete_id,limit]
    else:
        where_a,where_e="",""
        params_a,params_e=[limit],[limit]
    menu=[dict(row) for row in c.execute("""SELECT h.*, u.name AS actor_name,
        a.name AS athlete_name FROM v2_chef_menu_audit h
        JOIN users u ON u.id=h.actor_id
        JOIN v2_athletes a ON a.id=h.athlete_id """+where_a+
        " ORDER BY h.created_at DESC,h.id DESC LIMIT ?",tuple(params_a)).fetchall()]
    done=[dict(row) for row in c.execute("""SELECT e.*,u.name AS actor_name,
        a.name AS athlete_name FROM v2_chef_meal_execution e
        JOIN users u ON u.id=e.actor_id
        JOIN v2_athletes a ON a.id=e.athlete_id """+where_e+
        " ORDER BY e.created_at DESC,e.id DESC LIMIT ?",tuple(params_e)).fetchall()]
    for item in menu: item["event_type"]="menu"
    for item in done: item["event_type"]="execution"
    return sorted(menu+done,key=lambda e:(e["created_at"],e["id"]),reverse=True)[:limit]


def review(c, audit_id, admin_id, decision, approved_dish_id=None):
    if decision not in ("reviewed","rejected","approved"):
        raise ValueError("invalid_review")
    row=c.execute("""SELECT * FROM v2_chef_menu_audit WHERE id=?""",(audit_id,)).fetchone()
    if not row:
        raise LookupError("audit_not_found")
    event=dict(row)
    if event["status"] not in ("pending_review","pending_validation"):
        raise ValueError("already_reviewed")
    if event["status"]=="pending_review":
        if decision not in ("reviewed","rejected"):
            raise ValueError("invalid_review")
        # Rejecting is a review decision, not a destructive menu rollback.
        # A nutritionist can adjust the current menu separately if needed.
    else:
        if decision=="reviewed":
            raise ValueError("proposal_needs_decision")
        if decision=="approved":
            dish=c.execute(
                "SELECT id,name_pt FROM v2_dish_library WHERE id=? AND active=1",
                (approved_dish_id,)).fetchone()
            if not dish:
                raise ValueError("approved_dish_required")
            current=_menu(c,event["athlete_id"],event["menu_date"],event["meal"])
            previous={"kind":event["previous_kind"],"value":event["previous_value"],
                      "dish_id":event["previous_dish_id"]} if event["previous_kind"] else None
            if current!=previous:
                raise ValueError("menu_changed_since_proposal")
            after={"kind":"dish","value":dish["name_pt"],"dish_id":dish["id"]}
            import notification_capture_v2 as capture
            before_notification=capture.before(c,lambda:capture.menu(c,event["athlete_id"],[event["menu_date"]]))
            c.execute("""INSERT INTO v2_weekly_menus(athlete_id,menu_date,meal,kind,value,dish_id)
                VALUES(?,?,?,?,?,?)
                ON CONFLICT(athlete_id,menu_date,meal) DO UPDATE SET
                kind=excluded.kind,value=excluded.value,dish_id=excluded.dish_id""",
                (event["athlete_id"],event["menu_date"],event["meal"],
                 "dish",dish["name_pt"],dish["id"]))
            _record_menu_history(c,event["athlete_id"],event["menu_date"],
                         event["meal"],"dish",dish["name_pt"],dish["id"])
            _audit(c,event["athlete_id"],event["menu_date"],event["meal"],
                   admin_id,"proposal_approved",current,after,"recorded")
            capture.after(c,before_notification,lambda:capture.menu(c,event["athlete_id"],[event["menu_date"]]))
    c.execute("""UPDATE v2_chef_menu_audit SET status=?,resolved_by=?,resolved_at=?
        WHERE id=? AND status=?""",
        (decision,admin_id,int(time.time()),audit_id,event["status"]))
    c.commit()
    return {"id":audit_id,"status":decision}
