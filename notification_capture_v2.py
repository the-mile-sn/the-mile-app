"""Opt-in publication observation; never sends or commits.

Capture before and after an ordinary approved mutation. Savepoints isolate
notification metadata errors from the original content transaction. No schema
creation, startup hooks, scheduler or historical backfill.
"""
import logging
import os
import time
from datetime import date,timedelta
from notification_sources_v2 import document_version,assessment_version,weekly_menu_snapshot
from notification_store_v2 import record_content_change

def enabled():
    return os.environ.get("MILE_NOTIFICATIONS_CAPTURE")=="1"

def safe(c,fn):
    if not enabled():
        return None
    c.execute("SAVEPOINT mile_notification_capture")
    try:
        value=fn()
    except Exception:
        c.execute("ROLLBACK TO SAVEPOINT mile_notification_capture")
        c.execute("RELEASE SAVEPOINT mile_notification_capture")
        logging.warning("Optional notification content capture unavailable")
        return None
    c.execute("RELEASE SAVEPOINT mile_notification_capture")
    return value

def document(c,did):
    row=c.execute("""SELECT d.id,d.user_id,d.folder,d.title,d.data
        FROM documents d JOIN users u ON u.id=d.user_id
        JOIN v2_player_links l ON l.user_id=u.id
        JOIN v2_athletes a ON a.id=l.athlete_id
        WHERE d.id=? AND a.archived_at IS NULL AND u.role='player' AND u.active=1
        AND (d.folder IN ('nutrition','other') OR (d.folder='menus' AND u.menus_enabled=1)
        OR (d.folder='anthropometry' AND u.anthropometry_enabled=1))""",(did,)).fetchone()
    if not row:return {}
    return {(row["user_id"],"document",row["id"]):document_version(row)}

def assessment(c,aid,assessed_on):
    row=c.execute("""SELECT id,assessed_on,measurements,averages,formula_note
        FROM v2_body_assessments WHERE athlete_id=? AND assessed_on=? AND status='published'""",
        (aid,assessed_on)).fetchone()
    if not row:return {}
    users=c.execute("""SELECT u.id FROM v2_player_links l JOIN users u ON u.id=l.user_id
        JOIN v2_athletes a ON a.id=l.athlete_id
        WHERE a.id=? AND a.archived_at IS NULL AND u.role='player' AND u.active=1""",(aid,)).fetchall()
    version=assessment_version(row)
    return {(u["id"],"assessment",row["id"]):version for u in users}

def menu(c,aid,days):
    weeks=set()
    for value in days:
        d=date.fromisoformat(value)
        weeks.add(d-timedelta(days=d.weekday()))
    result={}
    for week in sorted(weeks):
        snap=weekly_menu_snapshot(c,athlete_id=aid,week_start=week,authorised_athlete_ids=[aid])
        if snap:
            for recipient in snap["recipients"]:
                result[(recipient["recipient_id"],"menu",snap["target_id"])]=snap["version"]
    return result

def before(c,fn):
    return safe(c,fn)

def after(c,previous,fn):
    if previous is None:
        return
    def capture():
        current=fn()
        for (uid,kind,target),version in current.items():
            old=previous.get((uid,kind,target))
            if old==version:continue
            record_content_change(c,recipient_id=uid,kind=kind,target_id=target,
                                  previous_version=old,current_version=version,
                                  changed_at=int(time.time()))
    safe(c,capture)
